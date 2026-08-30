# Data processing terms (DukanSaathi)

This note is the shop-facing processor disclosure for chat and billing data. It is not a substitute for a signed DPA.

## Roles

- **Data Fiduciary:** the shopkeeper, for their customers’ personal data (names, phones, bills, udhari).
- **Data Processor:** DukanSaathi (this application).
- **Sub-processor:** Google Cloud — Vertex AI Gemini in **asia-south1 (Mumbai)**.

DukanSaathi processes shop data only to run billing, stock, analytics, and the shop analyst chat that the shopkeeper asks for.

## What leaves the server in chat

Gemini receives schema and glossary (not personal data), a **tokenized** question (matched names replaced with ids), and a narration template with `{{column}}` placeholders. Result **rows stay on the server**. The backend fills the template locally.

Phone numbers are omitted from SQL projections unless the question asks for contact details.

## Residency and retention

- Vertex region is pinned to `asia-south1`. Override only with a documented reason (for example Assured Workloads India Data Boundary).
- Prompt/response storage on Vertex is disabled (`store=false` / `GEMINI_STORE_PROMPTS=false`).
- Request-response logging for Vertex should stay off at the GCP project. The default 24-hour in-memory cache is project-isolated; disable it in Vertex if a customer requires literal zero retention.
- Google’s Cloud Data Processing Addendum: Google does not train foundation models on this customer content without permission.
- Analyst traces store the tokenized question, SQL text, row **count**, latency, and route — **never row payloads**.
- The SQL-plan cache stores `question → SQL`, never numbers or result rows.

India’s DPDP Act 2023 and DPDP Rules 2025 use a negative list for cross-border transfers. Operational cross-border duties phase in (consent manager from 13 Nov 2026; several obligations from **13 May 2027**). Keeping result rows on the server means a future localization notification does not require re-architecting the chat path.

## RBI payment-data localization

The April 2018 Storage of Payment System Data circular binds authorised Payment System Operators and their vendors. Recording `payments.mode` and amounts in a billing app is **not** PSO activity today. The moment UPI collections or a PA/PG integration is added, payment data must be stored in India, and anything processed abroad deleted/returned within 24 hours. Server-side row fill plus an India region is the bridge to that duty.

## Breach, access, and grievance

- Security incidents that affect personal data will be notified to the shop (the Fiduciary) so they can meet DPDP timelines.
- Shopkeepers can export or correct customer records from the app (Customers, Bills). Deleting a shop’s data is a support request to the operator.
- Sub-processor change (leaving Google / changing region) will be disclosed before it is used for chat.
- Named grievance path: the shop’s support contact published in the product (in-app Settings / operator email).

## Purpose limitation

Gemini is not used to invent stock, other shops’ ledgers, profit/COGS (this app has no COGS), or anything outside answering the shopkeeper’s question against **their** Postgres rows.
