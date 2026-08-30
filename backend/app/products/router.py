"""Product API routes — CRUD, bulk import."""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.calc import round2
from app.common.errors import NotFoundError
from app.common.tile_sizes import normalize_tile_size
from app.db import get_session
from app.dependencies import AuthenticatedUser, get_current_user
from app.orm import Product
from app.persist import money, parse_uuid, product_dict, shop_uuid
from app.products.models import (
    BulkImportRequest,
    ProductCreate,
    ProductResponse,
    ProductUpdate,
)
from app.shops.router import _get_or_create_shop

router = APIRouter(prefix="/products", tags=["products"])


def _normalize_unit_fields(data: dict, existing: Optional[dict] = None) -> dict:
    """Tiles keep size + pcs/box; sanitary has no size and pcs/box = 1."""
    unit = data.get("unit")
    if unit is None and existing is not None:
        unit = existing.get("unit", "box")
    if unit == "piece":
        data["unit"] = "piece"
        data["piecesPerBox"] = 1
        data["size"] = ""
    else:
        if "unit" in data or existing is None:
            data["unit"] = "box"
        if "piecesPerBox" in data or existing is None:
            data["piecesPerBox"] = max(
                1,
                int(data.get("piecesPerBox") or (existing or {}).get("piecesPerBox") or 1),
            )
        if "size" in data or existing is None:
            mapped = normalize_tile_size(data.get("size") or "")
            data["size"] = mapped or str(data.get("size") or "").strip()
    return data


def _to_response(product: Product) -> ProductResponse:
    d = product_dict(product)
    return ProductResponse(**d)


def _apply_fields(product: Product, data: dict) -> None:
    mapping = {
        "name": "name",
        "code": "code",
        "company": "company",
        "size": "size",
        "unit": "unit",
        "piecesPerBox": "pieces_per_box",
        "sellPrice": "sell_price",
        "stockQty": "stock_qty",
        "lowStockThreshold": "low_stock_threshold",
    }
    for src, dest in mapping.items():
        if src in data and data[src] is not None:
            setattr(product, dest, data[src])


@router.get("", response_model=List[ProductResponse])
async def list_products(
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all products for the authenticated shop."""
    shop_id = shop_uuid(user.uid)
    rows = (
        await session.execute(select(Product).where(Product.shop_id == shop_id))
    ).scalars().all()
    return [_to_response(p) for p in rows]


@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(
    body: ProductCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a product on the fly — used by the quick-add flow while billing."""
    shop = await _get_or_create_shop(session, user)
    data = body.model_dump()
    _normalize_unit_fields(data)
    product = Product(shop_id=shop.id)
    _apply_fields(product, data)
    session.add(product)
    await session.flush()
    return _to_response(product)


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a single product by ID."""
    shop_id = shop_uuid(user.uid)
    pid = parse_uuid(product_id, "Product")
    product = await session.get(Product, pid)
    if product is None or product.shop_id != shop_id:
        raise NotFoundError("Product", product_id)
    return _to_response(product)


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    body: ProductUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update a product. Only provided fields are changed."""
    shop_id = shop_uuid(user.uid)
    pid = parse_uuid(product_id, "Product")
    product = await session.get(Product, pid)
    if product is None or product.shop_id != shop_id:
        raise NotFoundError("Product", product_id)

    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    existing = product_dict(product)
    _normalize_unit_fields(patch, existing)
    _apply_fields(product, patch)
    await session.flush()
    return _to_response(product)


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    product_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a product."""
    shop_id = shop_uuid(user.uid)
    pid = parse_uuid(product_id, "Product")
    product = await session.get(Product, pid)
    if product is None or product.shop_id != shop_id:
        raise NotFoundError("Product", product_id)
    await session.delete(product)


@router.post("/bulk", response_model=List[ProductResponse], status_code=201)
async def bulk_import(
    body: BulkImportRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Bulk import products — matches existing by code/name, creates new ones otherwise."""
    shop = await _get_or_create_shop(session, user)
    existing_rows = (
        await session.execute(select(Product).where(Product.shop_id == shop.id))
    ).scalars().all()
    existing = {p.id: p for p in existing_rows}
    results = []

    for row in body.rows:
        matched: Optional[Product] = None
        for product in existing.values():
            if row.code and (product.code or "").lower() == row.code.lower():
                matched = product
                break
            if (product.name or "").lower() == row.name.lower():
                matched = product
                break

        if matched:
            new_stock = money(matched.stock_qty) + (row.qty or 0)
            matched.stock_qty = round2(new_stock)
            if row.price > 0:
                matched.sell_price = row.price
            if row.unit in ("box", "piece"):
                patch = {
                    "unit": row.unit,
                    "piecesPerBox": row.piecesPerBox,
                    "size": row.size,
                }
                _normalize_unit_fields(patch, product_dict(matched))
                _apply_fields(matched, patch)
            results.append(matched)
        else:
            new_data = {
                "name": row.name,
                "code": row.code,
                "company": row.company,
                "size": row.size,
                "unit": row.unit if row.unit in ("box", "piece") else "box",
                "piecesPerBox": row.piecesPerBox,
                "sellPrice": row.price,
                "stockQty": row.qty,
                "lowStockThreshold": 10,
            }
            _normalize_unit_fields(new_data)
            product = Product(shop_id=shop.id)
            _apply_fields(product, new_data)
            session.add(product)
            await session.flush()
            existing[product.id] = product
            results.append(product)

    await session.flush()
    return [_to_response(p) for p in results]
