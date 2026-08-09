# DukanSaathi — PRD & Build Log

## Original problem statement
AI voice-first stock & billing assistant for local Indian retail (tiles & sanitaryware first), bilingual Hindi/English. Core rule: **confirmation-before-commit** — every action that changes stock/money/balance produces a DRAFT first (for bills: an on-screen PDF preview the shopkeeper can show the customer); nothing writes until explicit confirm.

## User choices
- Stack: **Firebase** (client-side) React app — NOT the platform's FastAPI/Mongo. User insisted on Firebase.
- Config for Firebase + Gemini via `frontend/src/config.json` and `frontend/.env` (user provides real keys later).
- AI: **Gemini 3 Flash** (model configurable, default `gemini-flash-latest`) for NLU + bulk-stock vision.
- Auth: **Firebase Google login**.
- Voice STT/TTS: **Web Speech API**.
- Scope: **Full** app in first build.
- **DEMO mode**: app auto-runs on localStorage + local heuristic NLU + sample data when Firebase/Gemini keys are absent, so it is fully usable/testable in preview.

## Architecture
- Client-side React (CRA/craco) + Tailwind + shadcn. No custom backend used.
- `services/config.js` decides IS_DEMO / GEMINI_READY from env + config.json.
- `services/data.js`: unified data layer — demoStore (localStorage, per-shop key `dukansaathi_<shopId>`) OR Firestore (`/shops/{shopId}/...`). Same interface.
- `services/auth.js`: demo login OR Firebase Google `signInWithPopup`.
- `services/gemini.js` + `services/localNlu.js`: Gemini REST NLU/vision with local heuristic fallback.
- `context/AppContext.jsx`: **commitDraft()** is the ONLY write path (sale/purchase/payment/return/stock_transfer/product_save/bulk_stock/expense).
- `lib/`: calc (GST 18%, e-way ₹50,000, sqft, words), fuzzy (Fuse.js), invoicePdf & summaryPdf (jsPDF+autotable).

## Verified rates (June 2026)
- GST tiles/sanitaryware = **18%** (HSN 6907/6908/6910). E-way bill threshold = **₹50,000**.

## Implemented (2026-06 / first build) — all frontend-tested 100%
- Shop demo/Google login + per-shop data scoping.
- Inventory: CRUD, box/piece + pieces-per-box, showroom vs godown, low-stock badges, move-to-showroom transfer.
- Billing: product search, sq-ft calculator, GST toggle+slabs, bill/discount, split cash/online/udhari, e-way flag, **PDF preview confirm-before-commit**, invoice numbering.
- Customers: name + optional phone, contractor/site tag, running udhari, record-payment flow.
- Returns: voice/manual, settlement (cash/adjust udhari/store credit), stock restore + ledger.
- Voice assistant: push-to-talk, bilingual NLU→draft, queries (stock/udhari/buyers/top-seller), ask-back on ambiguity.
- Bulk stock upload: photo/PDF → editable review table with low-confidence flags → batch confirm.
- Analytics: top products, revenue chart, slow movers, top customers, expenses, printable daily summary PDF.

## Backlog / remaining (P1/P2)
- P1: Batch/lot tracking per product (A7) — pending owner validation.
- P1: Returns draft to show showroom-vs-godown destination bin.
- P2: Real Firebase security rules file + deploy config; wire real Gemini key testing.
- P2: Customer purchase-history detail view; payment history ledger UI.

## Notes
- PDF iframe renders blank in headless Chromium (no PDF plugin) — fine in real browsers.
- Firebase Cloud Functions from PRD not deployable in this sandbox; Gemini called client-side (user supplies own key).
