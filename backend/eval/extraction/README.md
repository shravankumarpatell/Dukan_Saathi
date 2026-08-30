# Stock-sheet extraction gold set

Label **7** supplier sheets so we can score extraction at 100% on known files and compile the prompt with DSPy GEPA.

## Layout

- `samples/` — original PDF or image (`01-kajaria-stock.pdf`, `.png`, `.jpg`, …). Binaries are gitignored.
- `gold/` — one JSON per sample, **same stem**: `01-kajaria-stock.json`. Gold JSON is gitignored.
- `gold/_example.json` — template only (not scored).

`source` inside the JSON must be the sample filename.

## Fields (Add Stock rows only)

| Field | Rule |
|---|---|
| `name` | Product name as printed |
| `code` | SKU/code if on the sheet, else `""` |
| `company` | Brand if on the sheet, else `""` |
| `size` | Closed list value (`2x2 ft`, `12x18 in`, …) or `""` for sanitary |
| `unit` | `box` (tiles/flooring) or `piece` (sanitary) |
| `piecesPerBox` | Pieces in one box; `1` for sanitary |
| `qty` | **Boxes** for tiles, **pieces** for sanitary — not sqft, not rupees |
| `lowConfidence` | Omit |

Do **not** label: invoice header, GST, grand total, blank lines, prices.

Allowed sizes: `8x12 in`, `10x15 in`, `10x16 in`, `10x30 in`, `12x18 in`, `12x24 in`, `12x36 in`, `1x1 ft`, `16x16 in`, `16x32 in`, `2x2 ft`, `2x4 ft`, `32x32 in`, `1x1 m`, `4x4 ft`, `6x36 in`, `8x40 in`, `8x48 in`, `8x56 in`, `1x4 ft`, `800x1600 mm`, `800x2400 mm`, `4x6 ft`, `4x8 ft`.

## Score

100% = same row count after dropping totals, and every row matches `name`, `code`, `company`, `size`, `unit`, `piecesPerBox`, `qty` (after the same normalizers the app uses).

## Commands (from `backend/`)

```bash
pip install -r requirements.txt
pip install -r requirements-eval.txt   # DSPy, for compile only

python -m eval.extraction.compile --baseline-only
python -m eval.extraction.compile
# GEPA is skipped when production holdout is already 100%. Force it with:
python -m eval.extraction.compile --gepa --budget 48
```

Need 7 labeled pairs before compile. Holdout is the last 2 files (sorted by stem). Production holdout 100% skips GEPA by default. Pass `--gepa` to compile; a perfect GEPA holdout writes `config/prompts/extraction.optimized.yaml`.
