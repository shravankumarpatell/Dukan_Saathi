# STITCH BRIEF — DukanSaathi glass POS (desktop 1440×900)

You are a senior product designer generating screens for an **existing** React POS. This is not a new company. This is not Velocity Infrastructure, not a cloud landing page, not TilePOS.

## 0. Product lock (break these and the screen is wrong)

- Product name: **DukanSaathi**. Shop name in the sidebar: **Aajana trading**.
- Wordmark **DUKANSAATHI** only on login.
- Language: Hinglish labels (Namaste, Udhari, Kamayi, Naya item, Jaayein kahin bhi…).
- **Keyboard-first.** Every primary control shows its shortcut in a small kbd chip. Bindings are frozen: F1 Dashboard, F2 New Bill, F3 Stock, F4 History, Alt+R Returns, Alt+N Add Stock, Alt+U Udhari, Alt+A Analyst, Alt+I Analytics, Alt+S Settings, Alt+K Shortcuts, Ctrl+K palette, F9 Save, Alt+P Preview, Alt+E expense, Alt+Q sq-ft, F8 udhari pay, / focus search, Esc cancel.
- **No voice.** No microphone icon, no push-to-talk, no “Bolo”, no Speech bubble as the product identity. Analyst is a **text** chat.
- Never: Velocity.com, Julian Bates, Sophia Lin, Catalog, Records, phone-only OTP login, Unsplash showroom hero, orange chrome.

## 1. Visual system (Meng To Velocity, adapted to a POS)

Tokens from Velocity:

- Primary `#1A5BFA` · Accent `#154EE0` · Surface `#CBD5E1` · White `#FFFFFF` · Secondary text `#A1A1AA`
- Type: **Inter** (UI), **JetBrains Mono** (keys, rupees, qty)
- Radius: cards 16px, controls 8px, pills 9999px
- Spacing: 8px base, 16px gaps, 24px card padding

Atmosphere: a **blue mesh / aurora sits behind the app**, not on the data. Soft radial `#1A5BFA` blobs on `#EEF2FF`.

### Glass (2026 web approximation of Liquid Glass — chrome only)

Use glass for: sidebar, command palette, modal dialogs, sticky top bar, login card.

Recipe:

- `backdrop-filter: blur(24px)`
- fill `rgba(255,255,255,0.16)` (or `rgba(11,18,32,0.45)` on the dark sidebar)
- 1px edge `rgba(255,255,255,0.22)`
- inset highlight `0 1px 0 rgba(255,255,255,0.35)`

Do **not** frost tables, cart line-items, or invoice lists. Dense POS data stays on solid white / `#F8FAFC` panels so numbers stay readable (WCAG 4.5:1). If reduced transparency is implied, use solid fills.

Primary buttons: solid `#1A5BFA` with white Inter semibold. Ghost: 1px ink border. Destructive: rose outline, not orange.

## 2. Shell (every authenticated screen)

Left 260px glass sidebar on the mesh:

1. Shop name **Aajana trading** (Inter semibold). Caption `LEDGER · STOCK · UDHARI` in JetBrains Mono 11px.
2. Search button: “Jaayein kahin bhi…” + kbd `Ctrl+K`
3. Nav, exact order, each with icon + label + kbd: Dashboard F1, New Bill F2, Stock F3, Bill History F4, Returns Alt+R, Add Stock Alt+N, Udhari & Customers Alt+U, Analyst Alt+A, Analytics Alt+I. Active: 3px `#1A5BFA` left bar + slight white fill.
4. Footer: Settings Alt+S, Shortcuts Alt+K, avatar + logout.

Main: sticky glass header with page title. Content on the mesh; work surfaces are solid cards.

## 3. Screens to design (one screen per generation)

### Login `/login`
Split. Left: deep `#0B1220` with blue glow, wordmark DUKANSAATHI in `#1A5BFA`, headline “The dukaan, as a ledger.” Three lines: Instant data entry. GST-ready PDF bill. Photo se stock intake. **No mic.** Right: glass card, “Apni dukaan kholiye”, Continue with Google (ink), or, Email, Password, Sign in (`#1A5BFA`), Forgot password · Create account.

### Dashboard `/`
Namaste + date. Bento: one **solid** KPI strip (Aaj ki kamayi, Aaj Bills, Total Udhari, Low Stock) with JetBrains Mono rupees; kamayi in `#1A5BFA`. Two solid cards: Add Expense (amount, note, Cash|Online, Add) and Daily Summary (date, Print PDF Alt+P). Full-width Quick Sq-ft Calculator (Length × Width, tile size, pcs/box, wastage). No Recent Sales marketplace.

### New Bill `/bill`
Sale | Purchase. Customer search + phone. Contractor checkbox. Item search. Solid cart table. Payment Cash / Online / Udhari. Buttons: Clear (rose ghost), Preview Alt+P, Save F9 large primary blue.

### Stock `/inventory`
Add Stock, Naya item. Search name/code/company. Solid list: Pearl White, Ivory, qty badge, price, LOW, chevron. Not a photo grid.

### Analyst `/chat`
Header Analyst. Strict | Rich toggle. Empty chips: Ram ka last bill · pichle mahine ki kamai · sabse zyada udhari kiska · low stock kaunsa. Composer + Send. **No microphone.**

## 4. Device

Desktop 1440×900. Model Gemini 3 Flash. One screen per prompt. IBM/Inter, not serif display. Keep density operational — this is a counter terminal, not a marketing site.
