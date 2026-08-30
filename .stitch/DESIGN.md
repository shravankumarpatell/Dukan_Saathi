---
version: "trust-ledger-matte"
name: "Trust Ledger"
description: "Ice-blue canvas with navy chrome and a matte grain. Keyboard-first POS hierarchy, dense readable ledgers, CSS-only atmosphere."
colors:
  primary: "#2563EB"
  secondary: "#EAF2FF"
  accent: "#7DA8FF"
  background: "#EAF2FF"
  surface: "#1B365D"
  text-primary: "#1B365D"
  text-secondary: "#4A74A7"
  border: "#C7DDFF"
typography:
  display-lg:
    fontFamily: "Inter"
    fontSize: "64px"
    fontWeight: 500
    lineHeight: "1.04"
    letterSpacing: "0"
  body-md:
    fontFamily: "Inter"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.6"
  label-md:
    fontFamily: "JetBrains Mono"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "1.2"
spacing:
  base: "8px"
  gap: "16px"
  card-padding: "24px"
  section-padding: "80px"
rounded:
  card: "12px"
  control: "8px"
  pill: "9999px"
components:
  card:
    background: "Use the surface token with subtle borders and HTML-matched shadow depth"
    radius: "Match the declared card radius token"
  button:
    background: "Use primary or accent colors for the main action"
    radius: "Use the control or pill radius based on the source HTML"
---
# Trust Ledger — DukanSaathi

Visual spec for the existing React POS. Product, routes, Hinglish labels, and keyboard map stay. **No voice.** Tailwind class names (`mint`, `canvas`, `surface`, `ink`) stay; hex values are Trust Ledger.

## Product lock

Keyboard-first Hinglish POS. Sidebar brand is the **shop name**. Wordmark **DukanSaathi** on login only. Analyst is **text**. Keep testids, routes, keymap.

## Colors

Anchor: primary `#2563EB`, canvas `#EAF2FF`, chips/soft `#C7DDFF`, mid `#7DA8FF`, chrome/ink `#1B365D`, muted `#4A74A7`, border `#C7DDFF`.

- Canvas: ice `#EAF2FF` with blue radials + SVG noise grain behind UI.
- Chrome (sidebar, login left): solid navy `#1B365D` (not black).
- Data tables and form dialogs: solid light panels so numbers stay readable.
- Primary CTAs / kamayi / FAB: `#2563EB`. Tailwind token `mint` maps to this blue.
- Accent cap: one blue CTA + kamayi (or chart) per screen — not blue on every chip.

## Typography

Inter for UI. JetBrains Mono for labels, rupees, qty, kbd.

## Radius

Cards **12px**. Controls **8px**. Avatars / FAB stay **full circle**. No stadium pills on fields or panels.

## Chrome

`ds-glass` on ice headers (translucent, not frosted orange). `ds-glass-dark` solid navy sidebar (no espresso glass blur). `ds-panel` 12px light cards, matte shadow. Atmosphere is CSS only (no WebGL).

## Open Design craft

Search fields use `.ds-combo`: one 8px box, inner input unrounded. No nested border or focus ring. Focus is a 1px `#2563EB` border on the wrapper only.
