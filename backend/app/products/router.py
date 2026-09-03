"""Product API routes — CRUD, bulk import."""

from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.calc import round2
from app.common.errors import NotFoundError
from app.common.tile_sizes import normalize_tile_size
from app.common.uom import (
    UNIT_CODE_SET,
    category_meta,
    default_allowed_units,
    needs_pack_qty,
    normalize_category,
    normalize_unit_code,
)
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
    """Apply category defaults. Never coerce unknown units down to box|piece."""
    unit_in = data.get("unit")
    if unit_in is None and existing is not None:
        unit_in = existing.get("unit", "box")
    unit = normalize_unit_code(unit_in or "box", default="box")
    if "unit" in data or existing is None:
        data["unit"] = unit

    cat_in = data.get("category")
    if cat_in is None and existing is not None:
        cat_in = existing.get("category")
    cat = normalize_category(cat_in, data.get("unit") or unit)
    if "category" in data or existing is None:
        data["category"] = cat

    merged = {**(existing or {}), **data}
    meta = category_meta(merged.get("category") or cat)

    allowed = data.get("allowedUnits")
    if not allowed:
        if "allowedUnits" in data or existing is None:
            allowed = default_allowed_units(data.get("category") or cat, data.get("unit") or unit)
            data["allowedUnits"] = allowed
    elif isinstance(allowed, list):
        seen = []
        for u in allowed:
            code = normalize_unit_code(u, default=unit)
            if code in UNIT_CODE_SET and code not in seen:
                seen.append(code)
        if (data.get("unit") or unit) not in seen:
            seen.insert(0, data.get("unit") or unit)
        data["allowedUnits"] = seen or default_allowed_units(data.get("category") or cat, data.get("unit") or unit)

    if meta.get("needsPpb") or (data.get("unit") or unit) == "box":
        if "piecesPerBox" in data or existing is None:
            data["piecesPerBox"] = max(
                1,
                int(data.get("piecesPerBox") or (existing or {}).get("piecesPerBox") or 1),
            )
    elif (data.get("unit") or unit) == "piece" and not meta.get("needsPpb"):
        if "piecesPerBox" in data or existing is None:
            data["piecesPerBox"] = 1

    if meta.get("needsSize"):
        if "size" in data or existing is None:
            mapped = normalize_tile_size(data.get("size") or "")
            data["size"] = mapped or str(data.get("size") or "").strip()
    elif not meta.get("needsSize") and (data.get("unit") or unit) == "piece":
        if "size" in data or existing is None:
            data["size"] = ""

    if "packQty" in data or existing is None:
        try:
            pq = float(data.get("packQty") or (existing or {}).get("packQty") or 1)
        except (TypeError, ValueError):
            pq = 1.0
        data["packQty"] = pq if pq > 0 else 1.0
        if not needs_pack_qty(merged) and existing is None and "packQty" not in (data or {}):
            data["packQty"] = 1.0

    return data


def _to_response(product: Product) -> ProductResponse:
    d = product_dict(product)
    if not d.get("allowedUnits"):
        d["allowedUnits"] = default_allowed_units(d.get("category"), d.get("unit"))
    return ProductResponse(**d)


def _apply_fields(product: Product, data: dict) -> None:
    mapping = {
        "name": "name",
        "code": "code",
        "company": "company",
        "size": "size",
        "unit": "unit",
        "category": "category",
        "allowedUnits": "allowed_units",
        "piecesPerBox": "pieces_per_box",
        "packQty": "pack_qty",
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

        unit = normalize_unit_code(row.unit or "box", default="box")
        if matched:
            new_stock = money(matched.stock_qty) + (row.qty or 0)
            matched.stock_qty = round2(new_stock)
            if row.price > 0:
                matched.sell_price = row.price
            patch = {
                "unit": unit,
                "category": row.category,
                "piecesPerBox": row.piecesPerBox,
                "size": row.size,
                "packQty": row.packQty,
            }
            if row.allowedUnits:
                patch["allowedUnits"] = row.allowedUnits
            _normalize_unit_fields(patch, product_dict(matched))
            _apply_fields(matched, patch)
            results.append(matched)
        else:
            new_data = {
                "name": row.name,
                "code": row.code,
                "company": row.company,
                "size": row.size,
                "unit": unit,
                "category": row.category,
                "allowedUnits": row.allowedUnits,
                "piecesPerBox": row.piecesPerBox,
                "packQty": row.packQty,
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
