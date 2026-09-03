"""Row-alignment metric for stock-sheet extraction (100% = exact field match)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Optional, Sequence

from app.genai.schemas import StockExtractRow
from app.genai.stock_extract import coerce_row, drop_non_product_rows

QTY_EPS = 0.01
COMPARE_FIELDS = ("name", "code", "company", "size", "unit", "piecesPerBox", "qty")
_FINISH_TOKENS = frozenset(
    {"glossy", "carving", "matt", "matte", "polished", "sugar", "honed", "lapato"}
)


@dataclass
class MetricResult:
    exact: bool
    score: float
    feedback: str
    matched: int = 0
    missing: List[str] = field(default_factory=list)
    extra: List[str] = field(default_factory=list)
    diffs: List[str] = field(default_factory=list)


def _name_key(name: str) -> str:
    from app.genai.stock_extract import collapse_duplicate_name

    return " ".join(collapse_duplicate_name(name).split()).casefold()


def _canon_name(name: str) -> str:
    tokens = [t for t in _name_key(name).split() if t not in _FINISH_TOKENS]
    return " ".join(tokens)


def _names_equal(gold_name: str, pred_name: str) -> bool:
    if _name_key(gold_name) == _name_key(pred_name):
        return True
    ga, pa = _canon_name(gold_name), _canon_name(pred_name)
    if not ga or not pa:
        return False
    return ga == pa or ga.endswith(pa) or pa.endswith(ga)


def _code_key(code: str) -> str:
    return (code or "").strip().casefold()


def _row_label(row: StockExtractRow) -> str:
    code = (row.code or "").strip()
    name = (row.name or "").strip() or "?"
    size = (row.size or "").strip()
    bit = f"{name}"
    if code:
        bit = f"{code} {bit}"
    if size:
        bit += f" [{size}]"
    return bit


def _name_size_key(row: StockExtractRow) -> tuple:
    return (_canon_name(row.name), (row.size or "").strip().casefold())


def _code_align_key(row: StockExtractRow) -> Optional[str]:
    code = _code_key(row.code)
    return code or None


def _match_index(
    gold: StockExtractRow,
    unused: List[int],
    pred: Sequence[StockExtractRow],
    keyfn,
) -> Optional[int]:
    gkey = keyfn(gold)
    if gkey is None:
        return None
    for index in unused:
        if keyfn(pred[index]) == gkey:
            return index
    return None


def _qty_equal(a: float, b: float) -> bool:
    try:
        return abs(float(a) - float(b)) <= QTY_EPS
    except (TypeError, ValueError):
        return False


def _field_equal(field: str, gold: StockExtractRow, pred: StockExtractRow) -> bool:
    if field == "qty":
        return _qty_equal(gold.qty, pred.qty)
    if field == "piecesPerBox":
        return int(gold.piecesPerBox or 0) == int(pred.piecesPerBox or 0)
    if field == "name":
        return _names_equal(gold.name, pred.name)
    if field == "code":
        return _code_key(gold.code) == _code_key(pred.code)
    if field == "company":
        return _name_key(gold.company) == _name_key(pred.company)
    if field == "size":
        return (gold.size or "").strip() == (pred.size or "").strip()
    if field == "unit":
        return (gold.unit or "").strip().lower() == (pred.unit or "").strip().lower()
    return getattr(gold, field) == getattr(pred, field)


def _prep(rows: Sequence[Any]) -> List[StockExtractRow]:
    out = []
    for obj in rows or []:
        try:
            out.append(coerce_row(obj))
        except Exception:
            continue
    return drop_non_product_rows(out)


def _pred_rows(pred: Any) -> Sequence[Any]:
    if pred is None:
        return []
    if isinstance(pred, dict) and "rows" in pred:
        return pred["rows"] or []
    rows = getattr(pred, "rows", None)
    if rows is None:
        return []
    return rows


def score_rows(gold_rows: Sequence[Any], pred_rows: Sequence[Any]) -> MetricResult:
    """1.0 only when counts match and every aligned pair matches all compare fields.

    Partial ``score`` is matching_rows / max(len(gold), len(pred)) for GEPA.
    """
    gold = _prep(gold_rows)
    pred = _prep(pred_rows)

    unused = list(range(len(pred)))
    pairs: List[tuple[StockExtractRow, StockExtractRow]] = []
    missing: List[str] = []

    for g in gold:
        found = _match_index(g, unused, pred, _name_size_key)
        if found is None:
            found = _match_index(g, unused, pred, _code_align_key)
        if found is None:
            missing.append(_row_label(g))
            continue
        unused.remove(found)
        pairs.append((g, pred[found]))

    extra = [_row_label(pred[i]) for i in unused]
    diffs: List[str] = []
    matched = 0
    for g, p in pairs:
        field_diffs = [f for f in COMPARE_FIELDS if not _field_equal(f, g, p)]
        if field_diffs:
            bits = []
            for f in field_diffs:
                bits.append(f"{f}: gold={getattr(g, f)!r} pred={getattr(p, f)!r}")
            diffs.append(f"{_row_label(g)} — " + "; ".join(bits))
        else:
            matched += 1

    denom = max(len(gold), len(pred), 1)
    score = matched / denom
    exact = (
        len(gold) == len(pred)
        and not missing
        and not extra
        and not diffs
        and (len(gold) > 0 or len(pred) == 0)
    )
    if exact:
        score = 1.0

    lines = []
    if exact:
        lines.append(f"Perfect match: {len(gold)} product rows.")
    else:
        lines.append(
            f"Score {score:.3f} ({matched} exact of {len(gold)} gold, {len(pred)} predicted)."
        )
        if len(gold) != len(pred):
            lines.append(f"Count mismatch: gold={len(gold)} pred={len(pred)}.")
        if missing:
            lines.append("Missing: " + "; ".join(missing))
        if extra:
            lines.append("Extra (headers/totals/wrong lines): " + "; ".join(extra))
        if diffs:
            lines.append("Field diffs: " + " | ".join(diffs))
        lines.append(
            "qty is the printed count (boxes/pieces/m/bag), never area or amount. "
            "Drop total/GST/header rows. Use closed tile sizes."
        )

    return MetricResult(
        exact=exact,
        score=score,
        feedback="\n".join(lines),
        matched=matched,
        missing=missing,
        extra=extra,
        diffs=diffs,
    )


def score_prediction(gold: Any, pred: Any) -> MetricResult:
    gold_rows = gold if isinstance(gold, list) else _pred_rows(gold)
    if hasattr(gold, "rows") and not isinstance(gold, list):
        gold_rows = gold.rows
    return score_rows(gold_rows, _pred_rows(pred))


def gepa_metric(gold, pred, trace=None, pred_name=None, pred_trace=None, program_trace=None):
    """Float for DSPy Evaluate; Prediction(score, feedback) when GEPA asks for text."""
    result = score_prediction(gold, pred)
    if pred_name is not None or pred_trace is not None or trace is not None:
        try:
            import dspy

            return dspy.Prediction(score=float(result.score), feedback=result.feedback)
        except ImportError:
            return {"score": float(result.score), "feedback": result.feedback}
    return float(result.score)
