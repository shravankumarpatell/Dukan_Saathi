"""Unit master, categories, and qty conversion to the product's price/stock unit.

Mirrors frontend/src/lib/uom.js — keep formulas in lockstep.
Rate is always stored per ``product.unit``. A bill line may use another unit;
``to_product_unit`` converts that qty into product.unit so amount = qty × rate.
"""

from __future__ import annotations

import re
from typing import Any, Optional

SQM_TO_SQFT = 10.76391041671
M_TO_FT = 3.280839895
FT_TO_M = 1.0 / M_TO_FT
IN_TO_M = 0.0254
FT_TO_IN = 12.0
KG_TO_G = 1000.0
FT_MM = 304.8

# ── units ────────────────────────────────────────────────────────────────────

UNITS: dict[str, dict] = {
    "piece": {"label": "Piece", "short": "pcs", "kind": "count"},
    "box": {"label": "Box", "short": "box", "kind": "count"},
    "set": {"label": "Set", "short": "set", "kind": "count"},
    "sqft": {"label": "Sq.ft", "short": "sq.ft", "kind": "area"},
    "sqm": {"label": "Sq.m", "short": "sq.m", "kind": "area"},
    "mtr": {"label": "Meter", "short": "m", "kind": "length"},
    "rft": {"label": "Running ft", "short": "rft", "kind": "length"},
    "ft": {"label": "Feet", "short": "ft", "kind": "length"},
    "inch": {"label": "Inch", "short": "in", "kind": "length"},
    "kg": {"label": "Kg", "short": "kg", "kind": "mass"},
    "gm": {"label": "Gram", "short": "g", "kind": "mass"},
    "litre": {"label": "Litre", "short": "L", "kind": "volume"},
    "bag": {"label": "Bag", "short": "bag", "kind": "count"},
    "pack": {"label": "Pack", "short": "pack", "kind": "count"},
    "bundle": {"label": "Bundle", "short": "bundle", "kind": "count"},
    "slab": {"label": "Slab", "short": "slab", "kind": "count"},
    "roll": {"label": "Roll", "short": "roll", "kind": "count"},
    "pair": {"label": "Pair", "short": "pair", "kind": "count"},
}

UNIT_CODES: tuple[str, ...] = tuple(UNITS.keys())
UNIT_CODE_SET = frozenset(UNIT_CODES)

COUNT_PACK = frozenset({"box", "set", "pack", "bundle", "bag", "pair", "slab", "roll"})
COUNT_ATOM = frozenset({"piece"})
COUNT_UNITS = COUNT_PACK | COUNT_ATOM

_ALIASES = {
    "pcs": "piece",
    "pc": "piece",
    "nos": "piece",
    "no": "piece",
    "sft": "sqft",
    "sq.ft": "sqft",
    "sq ft": "sqft",
    "sqfeet": "sqft",
    "sq.m": "sqm",
    "sqmtr": "sqm",
    "m2": "sqm",
    "m²": "sqm",
    "meter": "mtr",
    "metre": "mtr",
    "mtrs": "mtr",
    "m": "mtr",
    "runningfeet": "rft",
    "runningft": "rft",
    "rft.": "rft",
    "feet": "ft",
    "foot": "ft",
    "in": "inch",
    "inches": "inch",
    "kgs": "kg",
    "g": "gm",
    "grams": "gm",
    "ltr": "litre",
    "liter": "litre",
    "l": "litre",
    "bags": "bag",
    "pk": "pack",
    "pkt": "pack",
    "sanitary": "piece",
    "tiles": "box",
    "tile": "box",
}


def normalize_unit_code(raw, default: str = "box") -> str:
    if raw is None or raw == "":
        return default
    t = str(raw).strip().lower().replace("_", " ")
    t = re.sub(r"\s+", " ", t)
    compact = t.replace(" ", "").replace(".", "")
    if t in UNIT_CODE_SET:
        return t
    if compact in UNIT_CODE_SET:
        return compact
    if t in _ALIASES:
        return _ALIASES[t]
    if compact in _ALIASES:
        return _ALIASES[compact]
    return default if default in UNIT_CODE_SET else "box"


def unit_kind(code: str) -> str:
    u = UNITS.get(normalize_unit_code(code, default="piece"))
    return (u or UNITS["piece"])["kind"]


def unit_label(code: str) -> str:
    u = UNITS.get(normalize_unit_code(code, default="piece"))
    return (u or {"label": code})["label"]


def unit_short(code: str) -> str:
    u = UNITS.get(normalize_unit_code(code, default="piece"))
    return (u or {"short": code})["short"]


# ── categories ───────────────────────────────────────────────────────────────

CATEGORIES: dict[str, dict] = {
    "tiles": {
        "label": "Tiles",
        "short": "Tiles",
        "suggestedUnits": ["box", "piece", "sqft", "sqm"],
        "defaultUnit": "box",
        "needsSize": True,
        "needsPpb": True,
    },
    "sanitaryware": {
        "label": "Sanitaryware",
        "short": "Sanitary",
        "suggestedUnits": ["piece", "set"],
        "defaultUnit": "piece",
        "needsSize": False,
        "needsPpb": False,
    },
    "plumbing_fittings": {
        "label": "Bathroom & plumbing fittings",
        "short": "Fittings",
        "suggestedUnits": ["piece", "set"],
        "defaultUnit": "piece",
        "needsSize": False,
        "needsPpb": False,
    },
    "bathroom_accessories": {
        "label": "Bathroom accessories",
        "short": "Accessories",
        "suggestedUnits": ["piece", "set"],
        "defaultUnit": "piece",
        "needsSize": False,
        "needsPpb": False,
    },
    "bathtubs_shower": {
        "label": "Bathtubs & shower",
        "short": "Bath",
        "suggestedUnits": ["piece", "set"],
        "defaultUnit": "piece",
        "needsSize": False,
        "needsPpb": False,
    },
    "natural_stone": {
        "label": "Natural stone",
        "short": "Stone",
        "suggestedUnits": ["sqft", "sqm"],
        "defaultUnit": "sqft",
        "needsSize": False,
        "needsPpb": False,
        "needsSlab": True,
    },
    "engineered_stone": {
        "label": "Engineered / artificial stone",
        "short": "Quartz",
        "suggestedUnits": ["sqft", "sqm"],
        "defaultUnit": "sqft",
        "needsSize": False,
        "needsPpb": False,
        "needsSlab": True,
    },
    "kitchen": {
        "label": "Kitchen products",
        "short": "Kitchen",
        "suggestedUnits": ["piece", "set"],
        "defaultUnit": "piece",
        "needsSize": False,
        "needsPpb": False,
    },
    "tile_installation": {
        "label": "Tile installation materials",
        "short": "Install",
        "suggestedUnits": ["bag", "kg", "litre", "piece", "box"],
        "defaultUnit": "bag",
        "needsSize": False,
        "needsPpb": False,
        "needsPack": True,
    },
    "laying_accessories": {
        "label": "Tile laying / construction accessories",
        "short": "Tools",
        "suggestedUnits": ["piece", "box", "pack", "set"],
        "defaultUnit": "piece",
        "needsSize": False,
        "needsPpb": False,
    },
    "flooring_alternatives": {
        "label": "Flooring & wall alternatives",
        "short": "Flooring",
        "suggestedUnits": ["sqft", "box", "piece"],
        "defaultUnit": "box",
        "needsSize": True,
        "needsPpb": True,
    },
    "bathroom_furniture": {
        "label": "Bathroom furniture",
        "short": "Furniture",
        "suggestedUnits": ["piece", "set"],
        "defaultUnit": "piece",
        "needsSize": False,
        "needsPpb": False,
    },
    "water_utility": {
        "label": "Water / utility products",
        "short": "Water",
        "suggestedUnits": ["piece", "set"],
        "defaultUnit": "piece",
        "needsSize": False,
        "needsPpb": False,
    },
    "plumbing_construction": {
        "label": "Plumbing / construction products",
        "short": "Plumbing",
        "suggestedUnits": ["piece", "mtr", "ft", "kg", "box"],
        "defaultUnit": "mtr",
        "needsSize": False,
        "needsPpb": False,
    },
    "hardware": {
        "label": "Hardware / miscellaneous",
        "short": "Hardware",
        "suggestedUnits": ["piece", "box", "pack", "mtr", "kg"],
        "defaultUnit": "piece",
        "needsSize": False,
        "needsPpb": False,
    },
}

CATEGORY_CODES: tuple[str, ...] = tuple(CATEGORIES.keys())
CATEGORY_CODE_SET = frozenset(CATEGORY_CODES)


def normalize_category(raw, unit: Optional[str] = None) -> str:
    t = str(raw or "").strip().lower().replace(" ", "_").replace("-", "_")
    if t in CATEGORY_CODE_SET:
        return t
    aliases = {
        "tile": "tiles",
        "sanitary": "sanitaryware",
        "fittings": "plumbing_fittings",
        "accessories": "bathroom_accessories",
        "bathtub": "bathtubs_shower",
        "stone": "natural_stone",
        "quartz": "engineered_stone",
        "adhesive": "tile_installation",
        "grout": "tile_installation",
        "spc": "flooring_alternatives",
        "pipe": "plumbing_construction",
        "misc": "hardware",
    }
    if t in aliases:
        return aliases[t]
    u = normalize_unit_code(unit, default="box") if unit else "box"
    return "sanitaryware" if u == "piece" else "tiles"


SLAB_CATEGORIES = frozenset({"natural_stone", "engineered_stone"})


def is_slab_product(product) -> bool:
    """True for natural / engineered stone SKUs billed by remaining sq.ft."""
    if isinstance(product, str):
        raw = product
    elif isinstance(product, dict):
        raw = product.get("category") or ""
    else:
        raw = getattr(product, "category", "") or ""
    if not raw:
        return False
    return normalize_category(raw) in SLAB_CATEGORIES


def category_meta(code: str) -> dict:
    return CATEGORIES.get(normalize_category(code), CATEGORIES["tiles"])


def suggested_units(category: str) -> list[str]:
    return list(category_meta(category)["suggestedUnits"])


def default_allowed_units(category: str, unit: Optional[str] = None) -> list[str]:
    cat = normalize_category(category, unit)
    units = list(CATEGORIES[cat]["suggestedUnits"])
    u = normalize_unit_code(unit, default=CATEGORIES[cat]["defaultUnit"]) if unit else CATEGORIES[cat]["defaultUnit"]
    if u not in units:
        units = [u] + units
    return units


def needs_tile_fields(product: dict) -> bool:
    cat = normalize_category(product.get("category"), product.get("unit"))
    meta = CATEGORIES.get(cat) or CATEGORIES["tiles"]
    if meta.get("needsSize") or meta.get("needsPpb"):
        return True
    return normalize_unit_code(product.get("unit"), default="box") == "box" and cat == "tiles"


def needs_pack_qty(product: dict) -> bool:
    cat = normalize_category(product.get("category"), product.get("unit"))
    if (CATEGORIES.get(cat) or {}).get("needsPack"):
        return True
    u = normalize_unit_code(product.get("unit"), default=category_meta(cat)["defaultUnit"])
    if u in ("box", "piece"):
        return False
    return u in COUNT_PACK


def allowed_units_of(product) -> list[str]:
    raw = _g(product, "allowedUnits", "allowed_units", default=None)
    dest = product_unit(product)
    if isinstance(raw, str):
        import json
        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            raw = None
    if isinstance(raw, (list, tuple)) and raw:
        seen = []
        for u in raw:
            code = normalize_unit_code(u, default=dest)
            if code not in seen:
                seen.append(code)
        return seen
    return default_allowed_units(_g(product, "category"), _g(product, "unit"))


def conversion_product(item, product=None) -> dict:
    """Catalog fields for priced-unit conversion. Line.unit must not overwrite dest."""
    item = item if isinstance(item, dict) else {}
    prod = product if isinstance(product, dict) else {}
    dest = _g(item, "productUnit", "product_unit") or _g(prod, "productUnit", "product_unit", "unit")
    line_u = _g(item, "unit")
    if dest in (None, ""):
        lu = normalize_unit_code(line_u, default="box") if line_u not in (None, "") else "box"
        dest = lu if lu in ("box", "piece") else "box"
    size = _g(item, "size") or _g(prod, "size") or ""
    ppb = _g(item, "piecesPerBox", "pieces_per_box")
    if ppb is None:
        ppb = _g(prod, "piecesPerBox", "pieces_per_box", default=1)
    pq = _g(item, "packQty", "pack_qty")
    if pq is None:
        pq = _g(prod, "packQty", "pack_qty", default=1)
    return {
        "unit": normalize_unit_code(dest, default="box"),
        "size": size,
        "piecesPerBox": ppb,
        "packQty": pq,
        "category": _g(item, "category") or _g(prod, "category") or "",
    }


# ── product field helpers ────────────────────────────────────────────────────

def _g(obj: Any, *keys, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        for k in keys:
            if k in obj and obj[k] is not None:
                return obj[k]
        return default
    for k in keys:
        if hasattr(obj, k):
            v = getattr(obj, k)
            if v is not None:
                return v
    return default


def pieces_per_box(product) -> float:
    n = _g(product, "piecesPerBox", "pieces_per_box", default=1)
    try:
        v = float(n or 1)
    except (TypeError, ValueError):
        v = 1.0
    return v if v > 0 else 1.0


def pack_qty(product) -> float:
    n = _g(product, "packQty", "pack_qty", default=1)
    try:
        v = float(n or 1)
    except (TypeError, ValueError):
        v = 1.0
    return v if v > 0 else 1.0


def product_unit(product, default: str = "box") -> str:
    dest = _g(product, "productUnit", "product_unit", "unit", default=default)
    if dest in (None, ""):
        dest = default
    return normalize_unit_code(dest, default=default)


# ── size → sq.ft (nominal label math: 2x2 ft = 4 sq.ft, not 600mm) ───────────

def sqft_per_piece(product_or_size) -> float:
    if isinstance(product_or_size, str):
        size = product_or_size
    else:
        size = str(_g(product_or_size, "size", default="") or "")
    size = size.strip()
    if not size:
        return 0.0
    text = size.lower().replace("×", "x").replace("*", "x")
    nums = re.findall(r"\d+(?:\.\d+)?", text)
    if len(nums) < 2:
        return 0.0
    a, b = float(nums[0]), float(nums[1])
    if a <= 0 or b <= 0:
        return 0.0
    if re.search(r"\bmm\b", text):
        return (a / FT_MM) * (b / FT_MM)
    if re.search(r"\bcm\b", text):
        return (a / 30.48) * (b / 30.48)
    if re.search(r"\b(m|meter|metre)\b", text) and not re.search(r"\bmm\b", text):
        return a * b * SQM_TO_SQFT
    if re.search(r"\b(in|inch|inches)\b", text) or '"' in text:
        return (a / FT_TO_IN) * (b / FT_TO_IN)
    # default ft (2x2 ft, 1x4 ft, …)
    return a * b


def sqft_per_box(product) -> float:
    spp = sqft_per_piece(product)
    if spp <= 0:
        return 0.0
    return spp * pieces_per_box(product)


def rate_per_sqft(product, rate=None) -> float:
    """Derived ₹/sq.ft from a per-box (or per-piece) rate."""
    spb = sqft_per_box(product) if product_unit(product) == "box" else sqft_per_piece(product)
    if spb <= 0:
        return 0.0
    r = float(rate if rate is not None else (_g(product, "sellPrice", "sell_price", default=0) or 0))
    return r / spb


# ── SI within a kind ─────────────────────────────────────────────────────────

def _to_sqft(unit: str, qty: float) -> float:
    u = normalize_unit_code(unit, default="sqft")
    if u == "sqm":
        return qty * SQM_TO_SQFT
    return qty


def _from_sqft(unit: str, sqft: float) -> float:
    u = normalize_unit_code(unit, default="sqft")
    if u == "sqm":
        return sqft / SQM_TO_SQFT
    return sqft


def _to_meters(unit: str, qty: float) -> float:
    u = normalize_unit_code(unit, default="mtr")
    if u in ("ft", "rft"):
        return qty * FT_TO_M
    if u == "inch":
        return qty * IN_TO_M
    return qty


def _from_meters(unit: str, meters: float) -> float:
    u = normalize_unit_code(unit, default="mtr")
    if u in ("ft", "rft"):
        return meters * M_TO_FT
    if u == "inch":
        return meters / IN_TO_M
    return meters


def _to_kg(unit: str, qty: float) -> float:
    u = normalize_unit_code(unit, default="kg")
    if u == "gm":
        return qty / KG_TO_G
    return qty


def _from_kg(unit: str, kg: float) -> float:
    u = normalize_unit_code(unit, default="kg")
    if u == "gm":
        return kg * KG_TO_G
    return kg


def _count_to_pieces(product, unit: str, qty: float, loose: float = 0.0) -> float:
    u = normalize_unit_code(unit, default="piece")
    ppb = pieces_per_box(product)
    pq = pack_qty(product)
    if u == "piece":
        return qty
    if u == "box":
        return qty * ppb + loose
    if u in COUNT_PACK:
        return qty * pq
    return qty


def _pieces_to_count(product, unit: str, pieces: float) -> float:
    u = normalize_unit_code(unit, default="piece")
    ppb = pieces_per_box(product)
    pq = pack_qty(product)
    if u == "piece":
        return pieces
    if u == "box":
        return pieces / ppb if ppb else pieces
    if u in COUNT_PACK:
        return pieces / pq if pq else pieces
    return pieces


def to_product_unit(product, line_unit, qty, loose_pieces: float = 0.0) -> float:
    """Qty of a bill line, expressed in ``product.unit`` (the priced unit)."""
    qty = float(qty or 0)
    loose = float(loose_pieces or 0)
    dest = product_unit(product, default="box")
    src = normalize_unit_code(line_unit, default="box") if line_unit not in (None, "") else "box"

    if src == dest:
        if src == "box":
            return qty + (loose / pieces_per_box(product) if pieces_per_box(product) else 0)
        return qty

    sk, dk = unit_kind(src), unit_kind(dest)

    if sk == "area" and dk == "area":
        return _from_sqft(dest, _to_sqft(src, qty))
    if sk == "length" and dk == "length":
        return _from_meters(dest, _to_meters(src, qty))
    if sk == "mass" and dk == "mass":
        return _from_kg(dest, _to_kg(src, qty))
    if sk == "volume" and dk == "volume":
        return qty

    if sk == "count" and dk == "count":
        return _pieces_to_count(product, dest, _count_to_pieces(product, src, qty, loose))

    # Area ↔ count (tiles / flooring): piece is the bridge.
    if sk == "area" or dk == "area":
        spp = sqft_per_piece(product)
        if spp <= 0:
            return 0.0
        if sk == "area":
            pieces = _to_sqft(src, qty) / spp
            return _pieces_to_count(product, dest, pieces)
        pieces = _count_to_pieces(product, src, qty, loose)
        return _from_sqft(dest, pieces * spp)

    # Pack (bag/box/…) ↔ mass: 1 pack unit = pack_qty kg
    if (sk == "mass" and src in ("kg", "gm") and dest in COUNT_PACK) or (
        dk == "mass" and dest in ("kg", "gm") and src in COUNT_PACK
    ):
        pq = pack_qty(product)
        if pq <= 0:
            return 0.0
        if sk == "mass":
            kg = _to_kg(src, qty)
            packs = kg / pq
            if dest in ("kg", "gm"):
                return _from_kg(dest, kg)
            return packs
        packs = qty
        kg = packs * pq
        return _from_kg(dest, kg)

    if (sk == "mass" and dk == "count") or (sk == "count" and dk == "mass"):
        pq = pack_qty(product)
        if pq <= 0:
            return 0.0
        if sk == "mass":
            return _to_kg(src, qty) / pq
        return _from_kg(dest, qty * pq)

    return 0.0


def line_price_qty(item, product=None) -> float:
    """Qty in the priced unit. Box lines keep boxes + loose/ppb."""
    fields = conversion_product(item, product)
    unit = _g(item, "unit", default=None)
    qty = float(_g(item, "qty", default=0) or 0)
    loose = float(_g(item, "pieces", default=0) or 0)
    if unit in (None, ""):
        unit = "box"
    return to_product_unit(fields, unit, qty, loose)


def from_product_unit(product, line_unit, qty_in_product_unit) -> float:
    """Inverse of to_product_unit: product.unit qty → line unit."""
    dest_line = normalize_unit_code(line_unit, default="box") if line_unit not in (None, "") else "box"
    src_unit = product_unit(product, default="box")
    flipped = {
        "unit": dest_line,
        "size": _g(product, "size", default="") or "",
        "piecesPerBox": pieces_per_box(product),
        "packQty": pack_qty(product),
    }
    return to_product_unit(flipped, src_unit, qty_in_product_unit, 0.0)


def uses_piece_stock(product) -> bool:
    """Tiles/sanitary-style stock: integer pieces, stockQty in product.unit."""
    u = product_unit(product, default="box")
    return u in ("box", "piece")


def sold_pieces(item, product=None) -> int:
    """Pieces consumed by a line (box / piece / sq.ft). Non-count lines → 0."""
    merged = conversion_product(item, product)
    if isinstance(item, dict):
        merged = {**merged, **{k: item[k] for k in ("size", "piecesPerBox", "pieces_per_box", "packQty", "pack_qty") if k in item}}
    unit = normalize_unit_code(_g(item, "unit", default="box"), default="box")
    qty = float(_g(item, "qty", default=0) or 0)
    loose = float(_g(item, "pieces", default=0) or 0)
    kind = unit_kind(unit)
    if kind == "area":
        spp = sqft_per_piece(merged)
        if spp <= 0:
            return 0
        return int(round(_to_sqft(unit, qty) / spp))
    if unit == "piece":
        return int(round(qty))
    if unit == "box" or unit in (None, ""):
        ppb = pieces_per_box(merged)
        return int(round(qty * ppb + loose))
    if kind == "count":
        return int(round(_count_to_pieces(merged, unit, qty, loose)))
    return 0
