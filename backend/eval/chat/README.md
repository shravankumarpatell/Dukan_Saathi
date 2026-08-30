# Shop-analyst chat gold set

Execution accuracy on **result sets**, never SQL string match. Gold files here are synthetic (no real PII) and may be committed.

## Layout

- `gold/*.json` — one case each. Fields:
  - `id`, `question`, `category`
  - `route`: `metric` | `sql` | `refuse`
  - `metric` (when route is metric)
  - `sql` (when route is sql; uses `:start_date`, `:end_date`, `:c1`)
  - `expect` — list of row objects (numeric values compared at 2 dp)
  - `empty_ok` — if true, zero rows is success

## Categories

- `metric_parity` — kamai / bachat match daybook math (cash returns only reduce kamai; bachat = kamai − karcha).
- `named_entity` — customer + date + lines.
- `superlative` — highest udhari.
- `follow_up` — previous window from session memory (tested in pytest, not only gold SQL).
- `fanout` — line amounts via `v_invoice_lines.line_amount`, not a join that inflates headers.
- `refuse` — profit/COGS / other shops.

## Commands (from `backend/`)

```bash
python -m eval.chat.run
```

This loads gold and prints the cases. Live execution against a shop is in `backend/tests/test_eval_chat.py` (in-memory SQLite + scripted planner).
