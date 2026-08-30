"""Execution accuracy for shop-analyst gold (compare result sets, not SQL text)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any


def _cell(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Decimal):
        value = float(value)
    if isinstance(value, float):
        return round(value, 2)
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    return str(value)


def normalize_row(row: dict, keys: list[str] | None = None) -> tuple:
    use = keys or sorted(row.keys())
    return tuple((k, _cell(row.get(k))) for k in use)


def execution_accuracy(
    actual: list[dict],
    expected: list[dict],
    *,
    keys: list[str] | None = None,
) -> bool:
    """True when multisets of projected rows match."""
    if expected is None:
        return True
    if len(actual) != len(expected):
        return False
    if not expected:
        return True
    cols = keys or sorted(set(expected[0].keys()) & set((actual[0] or expected[0]).keys()))
    if actual and not cols:
        cols = sorted(expected[0].keys())
    left = sorted(normalize_row(r, cols) for r in actual)
    right = sorted(normalize_row(r, cols) for r in expected)
    return left == right
