from typing import Optional, List, Dict
"""Product API routes — CRUD, bulk import."""

from fastapi import APIRouter, Depends
from app.dependencies import get_current_user, AuthenticatedUser
from app.database import get_db
from app.common.errors import NotFoundError, ValidationError
from app.common.calc import round2, today_iso
from app.products.models import (
    ProductCreate, ProductUpdate, ProductResponse,
    BulkImportRequest,
)

router = APIRouter(prefix="/products", tags=["products"])


def _products_ref(shop_id: str):
    return get_db().collection("shops").document(shop_id).collection("products")


def _to_response(doc_id: str, data: dict) -> ProductResponse:
    """Convert a Firestore document to ProductResponse, merging legacy stock fields."""
    # Auto-merge legacy showroom/godown into stockQty for reads
    stock = (data.get("stockQty", 0) or 0) + (data.get("showroomQty", 0) or 0) + (data.get("godownQty", 0) or 0)
    return ProductResponse(id=doc_id, **{
        k: (stock if k == "stockQty" else data.get(k, ProductResponse.model_fields[k].default))
        for k in ProductResponse.model_fields if k != "id"
    })


@router.get("", response_model=List[ProductResponse])
async def list_products(user: AuthenticatedUser = Depends(get_current_user)):
    """List all products for the authenticated shop."""
    docs = _products_ref(user.uid).stream()
    return [_to_response(d.id, d.to_dict()) for d in docs]


@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(
    body: ProductCreate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Create a product on the fly — used by the quick-add flow while billing."""
    data = body.model_dump()
    if data.get("unit") == "piece":
        data["piecesPerBox"] = 1
    else:
        data["unit"] = "box"
        data["piecesPerBox"] = max(1, int(data.get("piecesPerBox") or 1))
    _, doc_ref = _products_ref(user.uid).add(data)
    return _to_response(doc_ref.id, data)


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Get a single product by ID."""
    snap = _products_ref(user.uid).document(product_id).get()
    if not snap.exists:
        raise NotFoundError("Product", product_id)
    return _to_response(snap.id, snap.to_dict())


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    body: ProductUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Update a product. Only provided fields are changed."""
    ref = _products_ref(user.uid).document(product_id)
    snap = ref.get()
    if not snap.exists:
        raise NotFoundError("Product", product_id)

    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if patch.get("unit") == "piece":
        patch["piecesPerBox"] = 1
    elif patch.get("unit") == "box" and "piecesPerBox" in patch:
        patch["piecesPerBox"] = max(1, int(patch["piecesPerBox"] or 1))
    if patch:
        ref.update(patch)

    updated = ref.get().to_dict()
    return _to_response(product_id, updated)


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    product_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete a product."""
    ref = _products_ref(user.uid).document(product_id)
    snap = ref.get()
    if not snap.exists:
        raise NotFoundError("Product", product_id)
    ref.delete()


@router.post("/bulk", response_model=List[ProductResponse], status_code=201)
async def bulk_import(
    body: BulkImportRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Bulk import products — matches existing by code/name, creates new ones otherwise."""
    products_col = _products_ref(user.uid)

    # Fetch existing products for matching
    existing = {d.id: d.to_dict() for d in products_col.stream()}
    results = []

    for row in body.rows:
        # Try to match by code or name (case-insensitive)
        matched_id = None
        matched_data = None
        for pid, pdata in existing.items():
            if row.code and pdata.get("code", "").lower() == row.code.lower():
                matched_id, matched_data = pid, pdata
                break
            if pdata.get("name", "").lower() == row.name.lower():
                matched_id, matched_data = pid, pdata
                break

        if matched_id and matched_data:
            # Update existing: add to stockQty, refresh price if one was given
            current_stock = (
                (matched_data.get("stockQty", 0) or 0)
                + (matched_data.get("godownQty", 0) or 0)
                + (matched_data.get("showroomQty", 0) or 0)
            )
            new_stock = current_stock + (row.qty or 0)
            patch = {"stockQty": round2(new_stock), "godownQty": 0, "showroomQty": 0}
            # Price is optional on supplier sheets — only overwrite when supplied
            if row.price > 0:
                patch["sellPrice"] = row.price
            # Also refresh unit / pcs-per-box when supplied on the row
            if row.unit in ("box", "piece"):
                patch["unit"] = row.unit
                patch["piecesPerBox"] = 1 if row.unit == "piece" else max(1, int(row.piecesPerBox or matched_data.get("piecesPerBox") or 1))
            products_col.document(matched_id).update(patch)
            updated = products_col.document(matched_id).get().to_dict()
            results.append(_to_response(matched_id, updated))
        else:
            # Create new product
            new_data = {
                "name": row.name,
                "code": row.code,
                "company": row.company,
                "size": row.size,
                "unit": row.unit if row.unit in ("box", "piece") else "box",
                "piecesPerBox": 1 if row.unit == "piece" else max(1, int(row.piecesPerBox or 1)),
                "sellPrice": row.price,
                "stockQty": row.qty,
                "lowStockThreshold": 10,
            }
            _, doc_ref = products_col.add(new_data)
            results.append(_to_response(doc_ref.id, new_data))

    return results
