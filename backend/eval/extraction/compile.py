"""Baseline eval + DSPy GEPA compile for stock-sheet extraction.

Run from the backend/ directory:

    python -m eval.extraction.compile --baseline-only
    python -m eval.extraction.compile
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple

import yaml

from app.genai.config import CONFIG_DIR, settings
from app.genai.stock_extract import OPTIMIZED_PROMPT_FILE, seed_instruction_text
from eval.extraction.dataset import (
    EXPECTED_LABELED,
    DatasetError,
    LabeledSheet,
    require_labeled,
    split_train_holdout,
)
from eval.extraction.metric import MetricResult, gepa_metric, score_rows

logger = logging.getLogger(__name__)

Report = List[Tuple[str, MetricResult]]


def _print_report(title: str, report: Report) -> bool:
    print(f"\n=== {title} ===")
    all_exact = True
    for stem, result in report:
        flag = "PASS" if result.exact else "FAIL"
        print(f"  [{flag}] {stem}  score={result.score:.3f}")
        if not result.exact:
            all_exact = False
            for line in result.feedback.splitlines():
                print(f"         {line}")
    n = len(report)
    n_ok = sum(1 for _, r in report if r.exact)
    print(f"  exact {n_ok}/{n}")
    return all_exact and n > 0


def evaluate_production(items: Sequence[LabeledSheet]) -> Report:
    from app.genai.services import ExtractionService

    async def _run() -> Report:
        out: Report = []
        for item in items:
            pred = await ExtractionService.extract_stock(item.image_base64, item.mime)
            out.append((item.stem, score_rows(item.rows, pred.rows)))
        return out

    return asyncio.run(_run())


def _to_examples(items: Sequence[LabeledSheet]):
    import dspy

    examples = []
    for item in items:
        gold_rows = [r.model_dump() for r in item.rows]
        ex = dspy.Example(
            sheet_text=item.sheet_text or "(none)",
            image_base64=item.image_base64,
            image_mime=item.mime,
            rows=gold_rows,
        ).with_inputs("sheet_text", "image_base64", "image_mime")
        examples.append(ex)
    return examples


def evaluate_program(program, items: Sequence[LabeledSheet]) -> Report:
    out: Report = []
    for item in items:
        pred = program(
            sheet_text=item.sheet_text or "(none)",
            image_base64=item.image_base64,
            image_mime=item.mime,
        )
        out.append((item.stem, score_rows(item.rows, getattr(pred, "rows", []))))
    return out


def export_optimized_yaml(instructions: str, dest: Path | None = None) -> Path:
    dest = dest or (CONFIG_DIR / OPTIMIZED_PROMPT_FILE)
    seed = settings.prompt_extraction
    payload = {
        "system": seed.system,
        "instructions": instructions.strip(),
        "constraints": list(seed.constraints),
    }
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(
        yaml.safe_dump(payload, sort_keys=False, allow_unicode=True),
        encoding="utf-8",
    )
    print(f"Wrote {dest}")
    return dest


def _run_gepa(
    train: Sequence[LabeledSheet],
    holdout: Sequence[LabeledSheet],
    *,
    max_metric_calls: int = 32,
    resume: bool = False,
):
    try:
        import dspy
    except ImportError as exc:
        raise SystemExit(
            "DSPy is required for compile. From backend/: pip install -r requirements-eval.txt"
        ) from exc

    from eval.extraction.program import build_program, configure_dspy, make_lm, program_instructions

    student = make_lm(settings.models.primary.model, temperature=0.0)
    reflection = make_lm(settings.models.fallback.model, temperature=1.0)
    configure_dspy(student)

    program = build_program()
    print(
        f"GEPA budget: {max_metric_calls} Vertex calls "
        f"(~{max_metric_calls * 20 // 60} min). Stop with Ctrl+C."
    )
    cache_root = Path(__file__).resolve().parent / ".gepa_cache"
    log_dir = str(cache_root if resume else cache_root / f"run-{int(time.time())}")
    gepa = dspy.GEPA(
        metric=gepa_metric,
        max_metric_calls=max_metric_calls,
        reflection_lm=reflection,
        num_threads=1,
        track_stats=True,
        log_dir=log_dir,
    )
    compiled = gepa.compile(
        program,
        trainset=_to_examples(train),
        valset=_to_examples(holdout),
    )
    logger.info("GEPA optimized instructions:\n%s", program_instructions(compiled))
    return compiled


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Eval / compile stock-sheet extraction")
    parser.add_argument(
        "--baseline-only",
        action="store_true",
        help="Score the live ExtractionService only (no DSPy, no YAML export)",
    )
    parser.add_argument(
        "--force-export",
        action="store_true",
        help="Write extraction.optimized.yaml even if holdout is not perfect",
    )
    parser.add_argument(
        "--skip-final-all",
        action="store_true",
        help="Do not re-run GEPA on all labeled sheets after a perfect holdout",
    )
    parser.add_argument(
        "--gepa",
        action="store_true",
        help="Run DSPy GEPA even if production holdout is already 100%%",
    )
    parser.add_argument(
        "--resume-gepa",
        action="store_true",
        help="Resume eval/extraction/.gepa_cache (default is a fresh run dir)",
    )
    parser.add_argument(
        "--budget",
        type=int,
        default=32,
        help="Max Vertex metric calls for GEPA (default 32, not the 388-call light budget)",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    try:
        items = require_labeled(EXPECTED_LABELED)
    except DatasetError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    train, holdout = split_train_holdout(items)
    print(
        f"Labeled {len(items)} sheets. train={len(train)} {[t.stem for t in train]} "
        f"holdout={len(holdout)} {[h.stem for h in holdout]}"
    )

    print("Running production baseline (Vertex + current YAML)…")
    all_base = evaluate_production(items)
    all_ok = _print_report("baseline all", all_base)
    holdout_stems = {item.stem for item in holdout}
    holdout_ok = _print_report(
        "baseline holdout",
        [(stem, result) for stem, result in all_base if stem in holdout_stems],
    )

    if args.baseline_only:
        return 0 if all_ok else 1

    if holdout_ok and not args.gepa:
        print(
            "Production holdout is already 100%. Skipping GEPA "
            "(a stale cache run previously scored 0 on sheet 9). "
            "Pass --gepa to compile anyway."
        )
        return 0 if all_ok else 1

    print(
        f"Running DSPy GEPA on train / holdout (budget={args.budget} calls)…"
    )
    compiled = _run_gepa(
        train,
        holdout,
        max_metric_calls=args.budget,
        resume=args.resume_gepa,
    )
    from eval.extraction.program import program_instructions

    holdout_gepa = evaluate_program(compiled, holdout)
    holdout_ok = _print_report("GEPA holdout", holdout_gepa)

    instructions = program_instructions(compiled)
    if not instructions:
        instructions = seed_instruction_text()

    if holdout_ok and not args.skip_final_all:
        print("Holdout 100%. Re-running GEPA on all labeled sheets…")
        compiled = _run_gepa(
            items,
            holdout,
            max_metric_calls=args.budget,
            resume=args.resume_gepa,
        )
        instructions = program_instructions(compiled) or instructions
        _print_report("GEPA holdout after all-7 compile", evaluate_program(compiled, holdout))

    if holdout_ok or args.force_export:
        export_optimized_yaml(instructions)
        if not holdout_ok:
            print("Exported with --force-export; holdout was not 100%.")
        return 0

    print(
        "Holdout is not 100%. Not writing extraction.optimized.yaml. "
        "Fix gold labels / column rules, or pass --force-export."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
