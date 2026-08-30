"""List gold cases (no live LLM). Pytest runs execution against fixtures."""

from __future__ import annotations

import json
from pathlib import Path

GOLD_DIR = Path(__file__).resolve().parent / "gold"


def load_gold() -> list[dict]:
    cases = []
    for path in sorted(GOLD_DIR.glob("*.json")):
        cases.append(json.loads(path.read_text(encoding="utf-8")))
    return cases


def main() -> None:
    cases = load_gold()
    print(f"{len(cases)} gold cases")
    for case in cases:
        print(f"- {case['id']}: {case['category']} :: {case['question']}")


if __name__ == "__main__":
    main()
