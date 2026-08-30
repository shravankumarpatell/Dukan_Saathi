"""Load labeled extraction sheets (gold JSON + sample PDF/image)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import List, Sequence, Tuple

from pydantic import BaseModel, ConfigDict, Field

from app.genai.schemas import StockExtractRow
from app.genai.stock_extract import (
    encode_payload,
    extract_pdf_text,
    mime_from_path,
    normalize_row,
)

ROOT = Path(__file__).resolve().parent
SAMPLES_DIR = ROOT / "samples"
GOLD_DIR = ROOT / "gold"
EXAMPLE_GOLD = "_example.json"
EXPECTED_LABELED = 7
HOLDOUT_N = 2


class GoldFile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    source: str
    notes: str = ""
    rows: List[StockExtractRow] = Field(default_factory=list)


@dataclass
class LabeledSheet:
    stem: str
    source: str
    sample_path: Path
    gold_path: Path
    rows: List[StockExtractRow]
    mime: str
    image_base64: str
    sheet_text: str


class DatasetError(Exception):
    pass


def _gold_json_paths(gold_dir: Path) -> List[Path]:
    return sorted(
        p for p in gold_dir.glob("*.json") if p.name != EXAMPLE_GOLD and p.is_file()
    )


def _find_sample(source: str, stem: str, samples_dir: Path) -> Path | None:
    direct = samples_dir / source
    if direct.is_file():
        return direct
    matches = sorted(samples_dir.glob(stem + ".*"))
    files = [p for p in matches if p.is_file() and p.suffix.lower() not in (".json", ".md")]
    return files[0] if files else None


def load_labeled(
    gold_dir: Path | None = None,
    samples_dir: Path | None = None,
) -> List[LabeledSheet]:
    gold_dir = Path(gold_dir or GOLD_DIR)
    samples_dir = Path(samples_dir or SAMPLES_DIR)
    items: List[LabeledSheet] = []
    for gold_path in _gold_json_paths(gold_dir):
        data = json.loads(gold_path.read_text(encoding="utf-8"))
        gold = GoldFile.model_validate(data)
        sample = _find_sample(gold.source, gold_path.stem, samples_dir)
        if sample is None:
            raise DatasetError(
                f"{gold_path.name}: no sample file for source={gold.source!r} in {samples_dir}"
            )
        raw = sample.read_bytes()
        mime = mime_from_path(sample)
        sheet_text = extract_pdf_text(raw) if mime == "application/pdf" else ""
        rows = [normalize_row(r) for r in gold.rows]
        items.append(
            LabeledSheet(
                stem=gold_path.stem,
                source=gold.source or sample.name,
                sample_path=sample,
                gold_path=gold_path,
                rows=rows,
                mime=mime,
                image_base64=encode_payload(raw),
                sheet_text=sheet_text,
            )
        )
    return items


def missing_label_message(found: int, need: int = EXPECTED_LABELED) -> str:
    return (
        f"Need {need} labeled sheets (gold JSON + matching file in samples/). "
        f"Found {found}. Label {max(need - found, 0)} more. "
        f"See eval/extraction/README.md"
    )


def require_labeled(
    n: int = EXPECTED_LABELED,
    gold_dir: Path | None = None,
    samples_dir: Path | None = None,
) -> List[LabeledSheet]:
    items = load_labeled(gold_dir=gold_dir, samples_dir=samples_dir)
    if len(items) < n:
        raise DatasetError(missing_label_message(len(items), n))
    return items


def split_train_holdout(
    items: Sequence[LabeledSheet],
    holdout_n: int = HOLDOUT_N,
) -> Tuple[List[LabeledSheet], List[LabeledSheet]]:
    if len(items) < holdout_n + 1:
        raise DatasetError(
            f"Need at least {holdout_n + 1} labeled sheets to split train/holdout; found {len(items)}."
        )
    train = list(items[:-holdout_n])
    holdout = list(items[-holdout_n:])
    return train, holdout
