"""Indian tile size list + parser.

Mirrors frontend/src/lib/tileSizes.js so smart-entry extraction can map
sheet scribbles like 2*2 / 12*18 / 600x600 onto a closed list that always
includes ft, in, or mm.
"""

from __future__ import annotations
import math
import re
from typing import Optional

TILE_SIZES = [
    # value, mm (w, h), group
    ("8x12 in", (200, 300), "Wall"),
    ("10x15 in", (250, 375), "Wall"),
    ("10x16 in", (250, 400), "Wall"),
    ("10x30 in", (250, 750), "Wall"),
    ("12x18 in", (300, 450), "Wall"),
    ("12x24 in", (300, 600), "Wall"),
    ("12x36 in", (300, 900), "Wall"),
    ("1x1 ft", (300, 300), "Floor"),
    ("16x16 in", (400, 400), "Floor"),
    ("16x32 in", (400, 800), "Floor"),
    ("2x2 ft", (600, 600), "Floor"),
    ("2x4 ft", (600, 1200), "Floor"),
    ("32x32 in", (800, 800), "Floor"),
    ("1x1 m", (1000, 1000), "Floor"),
    ("4x4 ft", (1200, 1200), "Floor"),
    ("6x36 in", (150, 900), "Plank"),
    ("8x40 in", (200, 1000), "Plank"),
    ("8x48 in", (200, 1200), "Plank"),
    ("8x56 in", (200, 1400), "Plank"),
    ("1x4 ft", (300, 1200), "Plank"),
    ("800x1600 mm", (800, 1600), "Slab"),
    ("800x2400 mm", (800, 2400), "Slab"),
    ("4x6 ft", (1200, 1800), "Slab"),
    ("4x8 ft", (1200, 2400), "Slab"),
]

TILE_SIZE_VALUES = [s[0] for s in TILE_SIZES]
TILE_SIZE_PROMPT = ", ".join(TILE_SIZE_VALUES)

FT_MM = 304.8
IN_MM = 25.4

_VALUE_INDEX = {s[0].lower(): s[0] for s in TILE_SIZES}


def _compact(text: str) -> str:
    t = (text or "").lower().replace("×", "x").replace("*", "x").replace("÷", "x")
    return re.sub(r"\s+", "", t)


_ALIAS = {}
for value, mm, _group in TILE_SIZES:
    _ALIAS[_compact(value)] = value
    w, h = mm
    _ALIAS[f"{w}x{h}"] = value
    _ALIAS[f"{h}x{w}"] = value
    _ALIAS[f"{w}x{h}mm"] = value

for alias, value in [
    ("1x1.5ft", "12x18 in"),
    ("1.5x1ft", "12x18 in"),
    ("12x12in", "1x1 ft"),
    ("12x12", "1x1 ft"),
    ("24x24in", "2x2 ft"),
    ("24x24", "2x2 ft"),
    ("24x48in", "2x4 ft"),
    ("24x48", "2x4 ft"),
    ("48x24in", "2x4 ft"),
    ("1x2ft", "12x24 in"),
    ("2x1ft", "12x24 in"),
    ("60x120", "2x4 ft"),
    ("60x120cm", "2x4 ft"),
    ("120x60", "2x4 ft"),
    ("60x60", "2x2 ft"),
    ("60x60cm", "2x2 ft"),
    ("80x160", "800x1600 mm"),
    ("80x160cm", "800x1600 mm"),
    ("160x80", "800x1600 mm"),
]:
    _ALIAS[_compact(alias)] = value


def _parse_unit(text: str) -> Optional[str]:
    t = text.lower()
    if re.search(r"\bmm\b", t):
        return "mm"
    if re.search(r"\bcm\b", t):
        return "cm"
    if re.search(r"\b(in|inch|inches)\b", t) or '"' in t:
        return "in"
    if re.search(r"\b(ft|feet|foot)\b", t) or "'" in t:
        return "ft"
    if re.search(r"\bm\b", t) and not re.search(r"\bmm\b", t):
        return "m"
    return None


def _to_mm(a: float, b: float, unit: str) -> tuple[float, float]:
    if unit == "ft":
        return a * FT_MM, b * FT_MM
    if unit == "in":
        return a * IN_MM, b * IN_MM
    if unit == "cm":
        return a * 10, b * 10
    if unit == "m":
        return a * 1000, b * 1000
    return a, b


def _guess_unit(a: float, b: float) -> str:
    if max(a, b) >= 100:
        return "mm"
    if max(a, b) <= 5:
        return "ft"
    return "in"


def _dims_close(w: float, h: float, tw: float, th: float) -> bool:
    def ok(a: float, t: float) -> bool:
        return abs(a - t) <= max(6.0, t * 0.025)
    return (ok(w, tw) and ok(h, th)) or (ok(w, th) and ok(h, tw))


def _match_mm(w: float, h: float) -> str:
    best = ""
    best_dist = float("inf")
    for value, mm, _g in TILE_SIZES:
        tw, th = mm
        if not _dims_close(w, h, tw, th):
            continue
        dist = min(math.hypot(w - tw, h - th), math.hypot(w - th, h - tw))
        if dist < best_dist:
            best_dist = dist
            best = value
    return best


def normalize_tile_size(raw) -> str:
    """Map a free-text size onto the closed list. Unknown → empty string."""
    if raw is None:
        return ""
    original = str(raw).strip()
    if not original:
        return ""

    compact = _compact(original)
    if compact in _ALIAS:
        return _ALIAS[compact]

    key = original.lower().replace("×", "x")
    key = re.sub(r"\s+", " ", key).strip()
    if key in _VALUE_INDEX:
        return _VALUE_INDEX[key]

    text = original.lower().replace("×", "x")
    text = re.sub(r"[*/]", "x", text)
    text = re.sub(r"\s*by\s*", "x", text)
    nums = re.findall(r"\d+(?:\.\d+)?", text)
    if len(nums) < 2:
        return ""
    a = float(nums[0])
    b = float(nums[1])
    if a <= 0 or b <= 0:
        return ""
    unit = _parse_unit(text) or _guess_unit(a, b)
    w, h = _to_mm(a, b, unit)
    return _match_mm(w, h)
