from pathlib import Path

import pytest

from eval.extraction.dataset import (
    DatasetError,
    missing_label_message,
    require_labeled,
    split_train_holdout,
)


def test_missing_label_message():
    msg = missing_label_message(0, 7)
    assert "Need 7" in msg
    assert "Label 7 more" in msg
    assert "README.md" in msg


def test_require_labeled_fails_when_empty(tmp_path: Path):
    gold = tmp_path / "gold"
    samples = tmp_path / "samples"
    gold.mkdir()
    samples.mkdir()
    (gold / "_example.json").write_text("{}", encoding="utf-8")
    with pytest.raises(DatasetError, match="Need 7"):
        require_labeled(7, gold_dir=gold, samples_dir=samples)


def test_require_labeled_loads_pairs(tmp_path: Path):
    gold = tmp_path / "gold"
    samples = tmp_path / "samples"
    gold.mkdir()
    samples.mkdir()
    items = []
    for i in range(7):
        stem = f"{i:02d}-sheet"
        pdf = samples / f"{stem}.pdf"
        pdf.write_bytes(b"%PDF-1.4 not a real pdf")
        (gold / f"{stem}.json").write_text(
            '{"source": "%s", "rows": [{"name": "Tile A", "code": "1", "company": "K", '
            '"size": "2x2 ft", "unit": "box", "piecesPerBox": 4, "qty": 10}]}' % pdf.name,
            encoding="utf-8",
        )
        items.append(stem)
    loaded = require_labeled(7, gold_dir=gold, samples_dir=samples)
    assert [x.stem for x in loaded] == items
    assert loaded[0].mime == "application/pdf"
    train, holdout = split_train_holdout(loaded)
    assert len(train) == 5
    assert len(holdout) == 2
    assert holdout[0].stem == "05-sheet"


def test_compile_main_exits_2_when_unlabeled(monkeypatch):
    from eval.extraction import compile as compile_mod
    from eval.extraction.dataset import DatasetError, missing_label_message

    def boom(*_a, **_k):
        raise DatasetError(missing_label_message(0, 7))

    monkeypatch.setattr(compile_mod, "require_labeled", boom)
    assert compile_mod.main(["--baseline-only"]) == 2
