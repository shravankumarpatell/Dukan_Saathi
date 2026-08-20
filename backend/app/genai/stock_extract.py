"""Shared stock-sheet extraction helpers (normalize, PDF text, drop totals)."""

from __future__ import annotations

import base64
import io
import logging
import re
from pathlib import Path
from typing import List, Optional, Sequence

import yaml

from app.common.tile_sizes import normalize_tile_size
from app.genai.config import CONFIG_DIR, PromptConfig, settings
from app.genai.schemas import StockExtractRow

logger = logging.getLogger(__name__)

OPTIMIZED_PROMPT_FILE = "prompts/extraction.optimized.yaml"
SEED_PROMPT_FILE = "prompts/extraction.yaml"

TOTAL_NAME_RE = re.compile(
    r"^\s*(grand\s+total|sub[\s-]*total|total|gst|cgst|sgst|igst|round\s*off|tcs|"
    r"taxable(\s+value)?|amount\s+in\s+words)\b",
    re.IGNORECASE,
)

# Lot/series cells like "14 S-1" / "14 | S-1" on Alfanso-style stock lists.
SERIES_CODE_RE = re.compile(r"(\d{1,4})\s*(S-\d+)\b", re.IGNORECASE)
SERIES_NAME_PREFIX_RE = re.compile(r"^(\d{1,4}\s+S-\d+)\s+(.+)$", re.IGNORECASE)

_KNOWN_BRANDS = (
    "SATYAM CERAMIC",
    "PRIME VISTA",
    "ALFANSO",
    "AVENGER",
    "KAJARIA",
    "SOMANY",
    "NITCO",
    "ORIENT BELL",
    "JOHNSON",
    "RAK CERAMICS",
    "ASIAN GRANITO",
    "SIMPOLO",
)

_MIN_PDF_TEXT = 40
_MAX_PDF_TEXT = 80_000


def load_extraction_prompt(config_dir: Optional[Path] = None) -> PromptConfig:
    """Prefer GEPA-exported YAML when present; otherwise the hand-written seed."""
    base = Path(config_dir) if config_dir is not None else CONFIG_DIR
    optimized = base / OPTIMIZED_PROMPT_FILE
    if optimized.is_file():
        with open(optimized, "r", encoding="utf-8") as f:
            return PromptConfig(**yaml.safe_load(f))
    if config_dir is not None:
        seed = base / SEED_PROMPT_FILE
        with open(seed, "r", encoding="utf-8") as f:
            return PromptConfig(**yaml.safe_load(f))
    return settings.prompt_extraction


def normalize_mime(mime: str) -> str:
    mime = (mime or "").split(";")[0].strip().lower()
    if mime in ("", "application/octet-stream"):
        return "image/jpeg"
    return mime


def mime_from_path(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
    }.get(suffix, "image/jpeg")


def decode_payload(image_base64: str) -> bytes:
    raw = image_base64 or ""
    if raw.startswith("data:") and "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        return base64.b64decode(raw)
    except Exception:
        return b""


def encode_payload(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def collapse_duplicate_name(name: str) -> str:
    """'1852 F 1852 F' / '3303 3303' → single copy."""
    text = " ".join((name or "").split())
    if not text:
        return ""
    parts = text.split()
    n = len(parts)
    if n >= 2 and n % 2 == 0 and parts[: n // 2] == parts[n // 2 :]:
        return " ".join(parts[: n // 2])
    return text


def format_series_code(num: str, series: str) -> str:
    return f"{num.strip()} {series.strip().upper()}"


def split_series_code_from_name(name: str, code: str) -> tuple[str, str]:
    """Move a leading '14 S-1' token from name into code when code is empty."""
    name = collapse_duplicate_name(name)
    code = (code or "").strip()
    match = SERIES_NAME_PREFIX_RE.match(name)
    if not match:
        return name, code
    series = match.group(1)
    rest = match.group(2).strip()
    if not code:
        code = " ".join(series.split())
    return rest, code


def infer_header_company(sheet_text: str) -> str:
    """Brand from letterhead — tables often omit a company column."""
    header = (sheet_text or "")[:3000]
    if not header.strip():
        return ""
    if re.search(r"\bSATYAM CERAMICS?\b", header, re.IGNORECASE):
        return "SATYAM CERAMIC"
    for brand in _KNOWN_BRANDS:
        if re.search(rf"\b{re.escape(brand)}\b", header, re.IGNORECASE):
            return brand
    return ""


def _code_near_name(sheet_text: str, name: str) -> str:
    needle = " ".join((name or "").split())
    if not needle or not sheet_text:
        return ""
    needle_fold = needle.casefold()
    for raw in sheet_text.splitlines():
        line = " ".join(raw.replace("|", " ").split())
        fold = line.casefold()
        idx = fold.find(needle_fold)
        if idx < 0:
            continue
        before = line[:idx]
        after = line[idx + len(needle_fold) :]
        before_hits = list(SERIES_CODE_RE.finditer(before))
        if before_hits:
            hit = before_hits[-1]
            return format_series_code(hit.group(1), hit.group(2))
        after_hits = list(SERIES_CODE_RE.finditer(after))
        if after_hits:
            hit = after_hits[0]
            return format_series_code(hit.group(1), hit.group(2))
    return ""


def enrich_rows_from_sheet_text(
    rows: Sequence[StockExtractRow], sheet_text: str
) -> List[StockExtractRow]:
    """Fill empty company/code from digital PDF text the model often skips."""
    company = infer_header_company(sheet_text)
    out: List[StockExtractRow] = []
    for row in rows:
        item = row.model_copy(deep=True)
        item.name, item.code = split_series_code_from_name(item.name, item.code)
        if not (item.code or "").strip():
            item.code = _code_near_name(sheet_text, item.name)
        if company and not (item.company or "").strip():
            item.company = company
        out.append(item)
    return out


def normalize_row(row: StockExtractRow) -> StockExtractRow:
    row = row.model_copy(deep=True)
    row.name, row.code = split_series_code_from_name(row.name, row.code)
    row.name = collapse_duplicate_name(row.name)
    row.code = (row.code or "").strip()
    row.company = " ".join((row.company or "").split())
    unit = str(row.unit or "").lower()
    if unit in ("piece", "pcs", "pc", "sanitary"):
        row.unit = "piece"
        row.piecesPerBox = 1
        row.size = ""
    else:
        row.unit = "box"
        row.size = normalize_tile_size(row.size) or ""
        try:
            row.piecesPerBox = int(row.piecesPerBox or 1)
        except (TypeError, ValueError):
            row.piecesPerBox = 1
        if row.piecesPerBox < 1:
            row.piecesPerBox = 1
    return row


def coerce_row(obj) -> StockExtractRow:
    if isinstance(obj, StockExtractRow):
        return normalize_row(obj)
    if isinstance(obj, dict):
        return normalize_row(StockExtractRow.model_validate(obj))
    raise TypeError(f"Cannot coerce row from {type(obj)!r}")


def is_non_product_row(row: StockExtractRow) -> bool:
    name = (row.name or "").strip()
    code = (row.code or "").strip()
    if not name and not code:
        return True
    return bool(TOTAL_NAME_RE.match(name))


def drop_non_product_rows(rows: Sequence[StockExtractRow]) -> List[StockExtractRow]:
    return [r for r in rows if not is_non_product_row(r)]


def _table_markdown(table: Sequence[Sequence]) -> str:
    lines = []
    for raw_row in table:
        cells = [("" if c is None else str(c).replace("\n", " ")).strip() for c in raw_row]
        if not any(cells):
            continue
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def _open_pdfplumber(raw: bytes):
    import pdfplumber

    return pdfplumber.open(io.BytesIO(raw))


def extract_pdf_text(raw: bytes) -> str:
    """Digital PDF tables/text. Empty when the file is a scan or not a PDF."""
    if not raw or not raw.startswith(b"%PDF"):
        return ""

    parts: List[str] = []
    try:
        pdf_ctx = _open_pdfplumber(raw)
        with pdf_ctx as pdf:
            for i, page in enumerate(pdf.pages, 1):
                tables = page.extract_tables() or []
                table_bits = [_table_markdown(t) for t in tables]
                table_bits = [t for t in table_bits if t.strip()]
                if table_bits:
                    parts.append(f"### Page {i} table")
                    parts.extend(table_bits)
                text = (page.extract_text() or "").strip()
                if text:
                    parts.append(f"### Page {i} text")
                    parts.append(text)
    except ImportError:
        logger.warning("pdfplumber is not installed; skipping PDF text layer")
        return ""
    except Exception:
        logger.exception("pdfplumber failed to read PDF text")
        return ""

    text = "\n\n".join(parts).strip()
    if len(text) < _MIN_PDF_TEXT:
        return ""
    if len(text) > _MAX_PDF_TEXT:
        return text[:_MAX_PDF_TEXT]
    return text


def sheet_user_text(pdf_text: str) -> str:
    lead = (
        "Extract every product line from the attached sheet. "
        "Skip totals, GST, headers, and blank rows. "
        "qty is boxes (tiles) or pieces (sanitary), never sqft or rupees."
    )
    if not (pdf_text or "").strip():
        return lead
    return (
        f"{lead} Prefer the digital table text for codes and quantities.\n\n"
        f"### SHEET TEXT ###\n{pdf_text.strip()}"
    )


def seed_instruction_text(prompt: Optional[PromptConfig] = None) -> str:
    """YAML instructions + constraints, used as the DSPy signature docstring seed."""
    cfg = prompt or settings.prompt_extraction
    parts = [cfg.instructions.strip()]
    if cfg.constraints:
        parts.append("Constraints:")
        parts.extend(f"- {c}" for c in cfg.constraints)
    return "\n".join(parts)
