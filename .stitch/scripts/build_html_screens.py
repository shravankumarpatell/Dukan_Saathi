#!/usr/bin/env python3
"""Build self-contained HTML screens of every DukanSaathi page, field, and popup for Stitch."""
from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "capture-html"
PROJECT_ID = "9847785945380024944"

NAV = [
    ("Dashboard", "F1", True),
    ("New Bill", "F2", False),
    ("Stock", "F3", False),
    ("Bill History", "F4", False),
    ("Returns", "Alt+R", False),
    ("Add Stock", "Alt+N", False),
    ("Udhari & Customers", "Alt+U", False),
    ("Analyst", "Alt+A", False),
    ("Analytics", "Alt+I", False),
]

HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet"/>
<style>
:root {{ --ink:#0B1220; --mint:#1A5BFA; --mint-dark:#154EE0; --mint-soft:#E8EEFF; --canvas:#EEF2FF; --muted:#94A3B8; }}
* {{ box-sizing:border-box; }}
html,body {{ margin:0; height:100%; font-family:Inter,system-ui,sans-serif; color:var(--ink); background:var(--canvas); }}
body {{ background:
  radial-gradient(900px 500px at 12% -10%, rgba(26,91,250,.18), transparent 55%),
  radial-gradient(700px 400px at 90% 10%, rgba(21,78,224,.12), transparent 50%),
  var(--canvas); }}
.mono {{ font-family:"JetBrains Mono",ui-monospace,monospace; }}
kbd {{ display:inline-flex; align-items:center; border:1px solid #cbd5e1; background:#f1f5f9; color:#475569; border-radius:4px; padding:1px 6px; font:600 10px Inter,sans-serif; white-space:nowrap; }}
kbd.dark {{ border-color:rgba(255,255,255,.25); background:rgba(255,255,255,.15); color:#fff; }}
.glass {{ background:rgba(255,255,255,.16); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,.22); box-shadow:inset 0 1px 0 rgba(255,255,255,.35); }}
.glass-dark {{ background:rgba(11,18,32,.52); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,.14); }}
.panel {{ background:#fff; border:1px solid rgba(226,232,240,.8); border-radius:16px; box-shadow:0 1px 2px rgba(11,18,32,.04); }}
.shell {{ display:flex; min-height:100vh; }}
.sidebar {{ width:260px; flex-shrink:0; color:#fff; display:flex; flex-direction:column; padding:0; }}
.side-brand {{ padding:20px; border-bottom:1px solid rgba(255,255,255,.1); }}
.side-brand h1 {{ margin:0; font-size:17px; font-weight:600; }}
.side-brand p {{ margin:4px 0 0; font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:#94A3B8; }}
.palette-btn {{ margin:12px; display:flex; align-items:center; gap:8px; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.04); border-radius:8px; padding:8px 12px; color:rgba(255,255,255,.5); font-size:13px; }}
.nav {{ flex:1; padding:8px 12px; }}
.nav a {{ display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:8px; color:rgba(255,255,255,.55); text-decoration:none; font-size:14px; border-left:3px solid transparent; }}
.nav a.active {{ border-left-color:var(--mint); background:rgba(255,255,255,.1); color:#fff; }}
.nav a span {{ flex:1; }}
.side-foot {{ padding:12px; border-top:1px solid rgba(255,255,255,.1); }}
.main {{ flex:1; min-width:0; }}
.topbar {{ display:flex; align-items:center; justify-content:space-between; padding:14px 32px; }}
.topbar h2 {{ margin:0; font-size:15px; font-weight:600; }}
.content {{ padding:28px 32px 40px; }}
.input, select, textarea {{ width:100%; border:1px solid #cbd5e1; border-radius:8px; padding:8px 12px; font:14px Inter,sans-serif; outline:none; background:#fff; }}
label.lbl {{ display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:4px; }}
.btn {{ display:inline-flex; align-items:center; justify-content:center; gap:6px; border:0; border-radius:12px; padding:10px 14px; font:600 14px Inter,sans-serif; cursor:default; }}
.btn-mint {{ background:var(--mint); color:#fff; }}
.btn-ink {{ background:var(--ink); color:#fff; }}
.btn-ghost {{ background:#fff; border:1px solid #cbd5e1; color:#334155; }}
.btn-rose {{ background:#fff1f2; border:1px solid #fecdd3; color:#be123c; }}
.btn-soft {{ background:var(--mint-soft); color:var(--mint-dark); border:1px solid rgba(26,91,250,.3); }}
.chip {{ display:inline-flex; border-radius:4px; padding:2px 6px; font-size:10px; font-weight:700; }}
.chip-tile {{ background:#fef3c7; color:#92400e; }}
.chip-san {{ background:#e0f2fe; color:#075985; }}
.chip-low {{ background:#ffe4e6; color:#be123c; }}
.seg {{ display:grid; gap:4px; background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:4px; }}
.seg b {{ display:flex; align-items:center; justify-content:center; gap:6px; padding:8px; border-radius:8px; font-size:13px; font-weight:600; color:#64748b; }}
.seg b.on {{ background:var(--ink); color:#fff; }}
table.data {{ width:100%; border-collapse:collapse; font-size:13px; }}
table.data th {{ text-align:left; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#94a3b8; padding:8px 12px; background:#f8fafc; }}
table.data td {{ padding:8px 12px; border-top:1px solid #f1f5f9; }}
table.data td.num {{ text-align:right; font-family:"JetBrains Mono",monospace; }}
.overlay {{ position:fixed; inset:0; background:rgba(11,18,32,.45); display:flex; align-items:center; justify-content:center; padding:24px; z-index:40; }}
.dialog {{ background:#fff; color:var(--ink); border-radius:16px; padding:24px; width:min(560px,100%); max-height:90vh; overflow:auto; box-shadow:0 20px 50px rgba(11,18,32,.25); }}
.dialog.wide {{ width:min(720px,100%); }}
.dialog h3 {{ margin:0 0 16px; font-size:18px; }}
.grid2 {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }}
.span2 {{ grid-column:1 / -1; }}
.row {{ display:flex; align-items:center; gap:8px; }}
.muted {{ color:#64748b; font-size:12px; }}
</style>
</head>
<body>
"""

FOOT = "</body></html>"


def kbd(keys: str, dark: bool = False) -> str:
    return f'<kbd class="{"dark" if dark else ""}">{keys}</kbd>'


def inp(placeholder="", value="", testid="", extra="") -> str:
    tid = f' data-testid="{testid}"' if testid else ""
    val = f' value="{value}"' if value else ""
    return f'<input class="input" placeholder="{placeholder}"{val}{tid} {extra}/>'


def field(label: str, control: str, cls: str = "") -> str:
    return f'<div class="{cls}"><label class="lbl">{label}</label>{control}</div>'


def sidebar(active: str) -> str:
    links = []
    for label, keys, _end in NAV:
        cls = "active" if label == active else ""
        links.append(f'<a class="{cls}" href="#"><span>{label}</span>{kbd(keys, True)}</a>')
    return f"""
<aside class="sidebar glass-dark">
  <div class="side-brand">
    <h1>Aajana trading</h1>
    <p class="mono">Ledger · Stock · Udhari</p>
  </div>
  <div class="palette-btn">Jaayein kahin bhi… {kbd("Ctrl+K", True)}</div>
  <nav class="nav">{"".join(links)}</nav>
  <div class="side-foot">
    <a href="#" style="display:flex;align-items:center;gap:12px;padding:10px 12px;color:rgba(255,255,255,.55);text-decoration:none;font-size:14px;">
      <span style="flex:1">Settings</span>{kbd("Alt+S", True)}
    </a>
    <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;font-size:13px;">
      <span style="flex:1">Shravan Kumar<br/><span class="muted" style="color:rgba(255,255,255,.4)">signed in</span></span>
    </div>
  </div>
</aside>"""


def topbar(title: str) -> str:
    return f"""<header class="topbar glass">
  <h2>{title}</h2>
  <div class="row">{kbd("Alt+K")}<span style="width:32px;height:32px;border-radius:999px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;">S</span></div>
</header>"""


def app(title: str, nav: str, body: str, overlay: str = "") -> str:
    return HEAD.format(title=title) + f"""
<div class="shell">
  {sidebar(nav)}
  <div class="main">
    {topbar(title.split(" — ")[0] if " — " in title else title)}
    <main class="content">{body}</main>
  </div>
</div>
{overlay}
""" + FOOT


def auth(title: str, card: str) -> str:
    return HEAD.format(title=title) + f"""
<div style="display:grid;min-height:100vh;grid-template-columns:1fr 1fr;">
  <div style="background:var(--ink);color:#fff;padding:48px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;">
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at top left,rgba(26,91,250,.35),transparent 55%);"></div>
    <div style="position:relative;">
      <p class="mono" style="font-size:11px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--mint);">DukanSaathi</p>
      <h1 style="margin:16px 0 0;font-size:36px;font-weight:600;">The dukaan,<br/>as a ledger.</h1>
      <p style="margin-top:12px;max-width:28rem;color:rgba(255,255,255,.55);font-size:14px;">Keyboard-first POS for tile retail — bills, stock, and udhari without the circus.</p>
    </div>
    <div style="position:relative;display:flex;flex-direction:column;gap:20px;font-size:14px;">
      <div><b>Ledger in real time</b><div style="color:rgba(255,255,255,.5)">Kamai, udhari, cash — ek private console.</div></div>
      <div><b>GST-ready bills</b><div style="color:rgba(255,255,255,.5)">Clean PDFs, split payments, vusool.</div></div>
      <div><b>Stock from a photo</b><div style="color:rgba(255,255,255,.5)">Supplier sheet in, catalog out.</div></div>
    </div>
  </div>
  <div style="display:flex;align-items:center;justify-content:center;padding:24px;">{card}</div>
</div>
""" + FOOT


def dialog(title: str, inner: str, wide: bool = False) -> str:
    return f'<div class="overlay"><div class="dialog{" wide" if wide else ""}"><h3>{title}</h3>{inner}</div></div>'


def screens() -> list[tuple[str, str, str]]:
    """Return (filename, stitch_title, html)."""
    out: list[tuple[str, str, str]] = []

    login_card = f"""
    <div class="panel" style="width:24rem;padding:24px;background:rgba(255,255,255,.7);backdrop-filter:blur(24px);">
      <h2 style="margin:0 0 24px;font-size:24px;">Apni dukaan kholiye</h2>
      <button class="btn btn-ink" style="width:100%;" data-testid="google-login-btn">Continue with Google</button>
      <div style="display:flex;align-items:center;gap:12px;margin:16px 0;"><div style="flex:1;height:1px;background:#e2e8f0;"></div><span class="muted" style="letter-spacing:.12em;text-transform:uppercase;font-size:11px;">or</span><div style="flex:1;height:1px;background:#e2e8f0;"></div></div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        {inp("Email", "", "login-email-input", 'type="email"')}
        {inp("Password", "", "login-password-input", 'type="password"')}
        <button class="btn btn-mint" style="width:100%;" data-testid="login-submit-button">Sign in</button>
      </div>
      <div class="row" style="justify-content:space-between;margin-top:16px;font-size:14px;">
        <span data-testid="login-forgot-password-link" style="font-weight:600;color:#64748b;">Forgot password?</span>
        <span data-testid="login-register-link" style="font-weight:600;">Create account</span>
      </div>
    </div>"""
    out.append(("01-login.html", "/login", auth("/login", login_card)))

    signup_card = f"""
    <div class="panel" style="width:24rem;padding:24px;background:rgba(255,255,255,.7);backdrop-filter:blur(24px);">
      <h2 style="margin:0 0 24px;font-size:24px;">Naya account</h2>
      <button class="btn btn-ink" style="width:100%;" data-testid="google-login-btn">Continue with Google</button>
      <div style="display:flex;align-items:center;gap:12px;margin:16px 0;"><div style="flex:1;height:1px;background:#e2e8f0;"></div><span class="muted" style="letter-spacing:.12em;text-transform:uppercase;font-size:11px;">or</span><div style="flex:1;height:1px;background:#e2e8f0;"></div></div>
      <div style="display:flex;flex-direction:column;gap:12px;">
        {inp("Name", "", "register-name-input")}
        {inp("Email", "", "register-email-input", 'type="email"')}
        {inp("Password", "", "register-password-input", 'type="password"')}
        {inp("Confirm password", "", "register-password-confirm-input", 'type="password"')}
        <button class="btn btn-mint" style="width:100%;" data-testid="register-submit-button">Create account</button>
      </div>
      <p style="margin-top:16px;font-size:14px;">Already have an account? <b data-testid="register-login-link">Sign in</b></p>
    </div>"""
    out.append(("02-signup.html", "/signup", auth("/signup", signup_card)))

    dash = f"""
    <div data-testid="dashboard-page">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid rgba(26,91,250,.4);padding-bottom:16px;margin-bottom:32px;">
        <h2 style="margin:0;font-size:36px;font-weight:600;">Namaste</h2>
        <p class="mono muted" style="letter-spacing:.16em;text-transform:uppercase;">Tuesday, 25 August 2026</p>
      </div>
      <div class="panel" style="overflow:hidden;display:grid;grid-template-columns:repeat(4,1fr);">
        {"".join(f'<div style="padding:16px;border-right:1px solid #e2e8f0;" data-testid="{tid}"><div class="muted" style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;">{lab}</div><div class="mono" style="font-size:28px;font-weight:600;color:{col};margin-top:4px;">{val}</div></div>' for tid, lab, val, col in [
            ("stat-revenue","Aaj ki kamayi","₹1,24,500","var(--mint)"),
            ("stat-bills","Aaj Bills","18","var(--ink)"),
            ("stat-udhari","Total Udhari","₹86,200","#e11d48"),
            ("stat-lowstock","Low Stock","4","#b45309"),
        ])}
      </div>
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;margin-top:16px;align-items:start;">
        <div class="panel" style="padding:20px;">
          <div class="row" style="margin-bottom:16px;"><b>Add Expense</b>{kbd("Alt+E")}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            {inp("Amount ₹", "", "dash-exp-amount")}
            {inp("Note", "", "dash-exp-note")}
          </div>
          <div class="row" style="margin-top:12px;">
            <div class="seg" style="flex:1;grid-template-columns:1fr 1fr;">
              <b class="on" data-testid="dash-exp-mode-cash">Cash</b>
              <b data-testid="dash-exp-mode-online">Online</b>
            </div>
            <button class="btn btn-mint" data-testid="dash-add-expense-btn">Add {kbd("Enter", True)}</button>
          </div>
        </div>
        <div class="panel" style="padding:20px;" data-testid="dash-sqft-card">
          <div class="row" style="margin-bottom:16px;"><b>Quick sq-ft calculator</b>{kbd("Alt+Q")}</div>
          <div style="display:grid;grid-template-columns:1fr 200px;gap:20px;">
            <div>
              <div class="seg" style="width:14rem;grid-template-columns:1fr 1fr;margin-bottom:12px;">
                <b class="on" data-testid="dash-sqft-mode-lw">L × W</b>
                <b data-testid="dash-sqft-mode-area">Sq-ft</b>
              </div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
                {field("Length (ft)", inp("", "", "dash-sqft-roomLengthFt"))}
                {field("Width (ft)", inp("", "", "dash-sqft-roomWidthFt"))}
                {field("Tile size", inp("2x2 ft", "", "dash-sqft-size"))}
                {field("Pcs / box", inp("", "", "dash-sqft-piecesPerBox"))}
              </div>
            </div>
            <aside style="background:var(--ink);color:#fff;border-radius:16px;padding:16px;">
              <p class="mono" style="font-size:28px;margin:0;opacity:.35;" data-testid="dash-sqft-boxes">0 + 0</p>
              <p class="muted" style="color:rgba(255,255,255,.55);">boxes + loose pcs</p>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;border-top:1px solid rgba(255,255,255,.1);margin-top:16px;padding-top:12px;">
                <div><div class="muted" style="color:rgba(255,255,255,.4);">Area</div><span class="mono" data-testid="dash-sqft-area">0</span></div>
                <div><div class="muted" style="color:rgba(255,255,255,.4);">Tiles</div><span class="mono" data-testid="dash-sqft-tiles">0</span></div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>"""
    out.append(("03-dashboard.html", "/", app("Dashboard", "Dashboard", dash)))

    bill = f"""
    <div data-testid="new-bill-page">
      <div class="row" style="justify-content:space-between;margin-bottom:16px;">
        <button class="btn btn-rose" data-testid="clear-bill-btn">Clear {kbd("Alt+Shift+C")}</button>
        <div class="seg" style="width:14rem;grid-template-columns:1fr 1fr;">
          <b class="on" data-testid="type-sale">Sale</b>
          <b data-testid="type-purchase">Purchase</b>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;">
        <div>
          <div class="panel" style="padding:16px;margin-bottom:16px;">
            <h3 style="margin:0 0 12px;">Customer {kbd("/")}</h3>
            <div style="display:grid;grid-template-columns:1fr 11rem;gap:12px;">
              {inp("Customer name", "", "customer-name")}
              {inp("Phone", "", "customer-phone")}
            </div>
            <label class="row" style="margin-top:12px;font-size:14px;"><input type="checkbox" data-testid="is-contractor"/> Contractor / Dealer {kbd("Alt+Enter")}</label>
            {inp("Project / site note", "", "site-note")}
          </div>
          <div class="panel" style="padding:16px;">
            <h3 style="margin:0 0 12px;">Items</h3>
            {inp("Search name / code / company…", "", "product-search-input")}
            <button class="btn btn-soft" style="margin-top:12px;" data-testid="view-cart-btn">View cart <span class="chip" style="background:var(--mint-soft);color:var(--mint-dark);" data-testid="view-cart-count">0</span></button>
          </div>
        </div>
        <div class="panel" style="padding:16px;">
          <label class="row" style="font-size:14px;"><input type="checkbox" data-testid="gst-toggle"/> GST <select data-testid="gst-rate" class="input" style="width:5rem;"><option>18%</option></select></label>
          <div style="margin-top:12px;" class="grid2">
            {field("Discount type", '<select class="input" data-testid="discount-type"><option>₹</option><option>%</option></select>')}
            {field("Discount", inp("", "", "discount-value"))}
          </div>
          <div style="display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;margin-top:12px;padding-top:12px;font-size:18px;font-weight:700;"><span>Total</span><span class="mono" data-testid="bill-grand-total">₹0</span></div>
          <div class="grid2" style="margin-top:12px;">
            {field("Cash", inp("", "", "pay-cash"))}
            {field("Online", inp("", "", "pay-online"))}
          </div>
          <button class="btn btn-ghost" style="width:100%;margin-top:8px;" data-testid="pay-full-btn">Full pending</button>
          <label class="row" style="margin-top:8px;font-size:13px;"><input type="checkbox" data-testid="use-store-credit"/> Use store credit</label>
          <div data-testid="pending-line" style="margin-top:8px;padding:8px;border-radius:8px;background:#ecfdf5;color:#047857;font-size:13px;font-weight:700;">Pending ₹0</div>
          <div class="grid2" style="margin-top:12px;">
            <button class="btn btn-soft" data-testid="preview-bill-btn">Preview {kbd("Alt+P")}</button>
            <button class="btn btn-ink" data-testid="confirm-save-btn">Save {kbd("F9", True)}</button>
          </div>
        </div>
      </div>
    </div>"""
    out.append(("04-new-bill.html", "/bill", app("New Bill", "New Bill", bill)))

    purchase = bill.replace('data-testid="type-sale">Sale', 'data-testid="type-sale">Sale').replace(
        '<b class="on" data-testid="type-sale">Sale</b>\n          <b data-testid="type-purchase">Purchase</b>',
        '<b data-testid="type-sale">Sale</b>\n          <b class="on" data-testid="type-purchase">Purchase</b>',
    ).replace("Customer {kbd", "Supplier {kbd")
    out.append(("05-new-bill-purchase.html", "/bill · purchase", app("New Bill", "New Bill", purchase)))

    stock_rows = "".join(
        f"""<tr data-testid="product-row-{i}">
          <td><b>{name}</b> {low}{('<span class="chip chip-tile">Tiles</span>' if tile else '<span class="chip chip-san">Sanitary</span>')}<div class="muted">{co}</div></td>
          <td class="mono">{code}</td><td>{size}</td><td class="num">{pcs}</td>
          <td class="num" data-testid="stock-qty-{i}">{qty}</td><td class="num">{price}</td>
        </tr>"""
        for i, (name, co, code, size, pcs, qty, price, tile, low) in enumerate([
            ("1107 LD ASH", "Aajana", "1107", "2x2 ft", "4", "101b", "₹0", True, ""),
            ("1002 LL WHITE", "Aajana", "1002", "2x2 ft", "4", "12b", "₹450", True, '<span class="chip chip-low">LOW</span> '),
            ("Flush tank", "Hindware", "FT-01", "—", "—", "7 pcs", "₹1,250", False, ""),
        ], 1)
    )
    stock = f"""
    <div data-testid="inventory-page">
      <div class="panel" style="overflow:hidden;">
        <div class="row" style="padding:12px;border-bottom:1px solid #f1f5f9;">
          <div class="row" style="flex:1;border:1px solid #e2e8f0;border-radius:12px;padding:8px 12px;background:#f8fafc;">
            {inp("Name, code, company…", "", "inventory-search")} {kbd("/")}
          </div>
          <span class="mono muted">3</span>
          <button class="btn btn-mint" data-testid="bulk-upload-btn">Add Stock {kbd("Alt+N", True)}</button>
        </div>
        <table class="data" data-testid="stock-list">
          <thead><tr><th>Item</th><th>Code</th><th>Size</th><th>Pcs</th><th>Stock</th><th>Rate</th></tr></thead>
          <tbody>{stock_rows}</tbody>
        </table>
      </div>
    </div>"""
    out.append(("06-stock.html", "/inventory", app("Stock Management", "Stock", stock)))

    low_banner = '<div data-testid="low-filter-banner" style="padding:8px 12px;background:#fff1f2;color:#be123c;font-weight:600;display:flex;justify-content:space-between;">Low stock (1) <span data-testid="clear-low-filter">Clear</span></div>'
    stock_low = stock.replace('<table class="data"', low_banner + '<table class="data"')
    out.append(("07-stock-low.html", "/inventory?low=1", app("Stock Management", "Stock", stock_low)))

    hist = f"""
    <div data-testid="history-page">
      <div class="row" style="margin-bottom:12px;">
        {inp("Invoice no / customer…", "", "history-search")}
        <input class="input" type="date" data-testid="history-date" value="2026-08-25" style="width:11rem;"/>
        <select class="input" data-testid="history-filter" style="width:9rem;"><option>All</option><option>Paid</option><option>Partial</option><option>Pending</option></select>
      </div>
      <div class="panel" data-testid="history-list">
        <div class="row" style="padding:12px 16px;justify-content:space-between;border-bottom:1px solid #f1f5f9;" data-testid="history-row-1">
          <div><b>Ram Traders</b><div class="muted">INV-1042 · 25 Aug 2026</div></div>
          <div style="text-align:right;"><b class="mono">₹18,400</b><div style="color:#059669;font-size:11px;font-weight:700;">PAID</div></div>
        </div>
        <div class="row" style="padding:12px 16px;justify-content:space-between;" data-testid="history-row-2">
          <div><b>Walk-in</b><div class="muted">INV-1041 · 25 Aug 2026</div></div>
          <div style="text-align:right;"><b class="mono">₹6,200</b><div style="color:#e11d48;font-size:11px;font-weight:700;">PENDING</div></div>
        </div>
      </div>
    </div>"""
    out.append(("08-history.html", "/history", app("Bill History", "Bill History", hist)))

    returns = f"""
    <div data-testid="returns-page" style="max-width:36rem;margin:0 auto;">
      <div class="row panel" style="padding:4px;margin-bottom:16px;">
        <button class="btn btn-ink" style="flex:1;" data-testid="returns-tab-new">New Return {kbd("Alt+1", True)}</button>
        <button class="btn btn-ghost" style="flex:1;" data-testid="returns-tab-edit">Store-credit convert {kbd("Alt+2")}</button>
      </div>
      <div class="panel" style="padding:16px;">
        <label class="lbl">Original invoice (search &amp; select) {kbd("/")}</label>
        {inp("Invoice no / customer…", "", "return-invoice-no")}
      </div>
    </div>"""
    out.append(("09-returns.html", "/returns", app("Returns", "Returns", returns)))

    ret_detail = returns.replace(
        "</div>\n    </div>",
        f"""</div>
      <div class="panel" style="padding:16px;margin-top:16px;" data-testid="return-detail">
        <div class="row" style="justify-content:space-between;"><div><b>Ram Traders</b><div class="muted">INV-1042</div></div><b>₹18,400</b></div>
        <div data-testid="return-row-0" class="panel" style="padding:12px;margin-top:12px;">
          <b>1107 LD ASH</b>
          <div class="grid2" style="margin-top:8px;">
            {field("Box", inp("", "1", "return-qty-0"))}
            {field("Pcs", inp("", "0", "return-pieces-0"))}
          </div>
        </div>
        <div class="row" style="justify-content:space-between;margin-top:12px;">Refund {inp("", "450", "return-refund")}</div>
        <div class="grid2" style="margin-top:12px;">
          <button class="btn btn-soft" data-testid="preview-return-btn">Preview {kbd("Alt+P")}</button>
          <button class="btn btn-ink" data-testid="submit-return-btn">Save {kbd("F9", True)}</button>
        </div>
      </div>
    </div>"""
    )
    out.append(("10-returns-detail.html", "/returns · line items", app("Returns", "Returns", ret_detail)))

    convert = f"""
    <div data-testid="returns-page" style="max-width:36rem;margin:0 auto;">
      <div class="row panel" style="padding:4px;margin-bottom:16px;">
        <button class="btn btn-ghost" style="flex:1;" data-testid="returns-tab-new">New Return {kbd("Alt+1")}</button>
        <button class="btn btn-ink" style="flex:1;" data-testid="returns-tab-edit">Store-credit convert {kbd("Alt+2", True)}</button>
      </div>
      <div data-testid="convert-store-credit">
        {inp("Search return invoice…", "", "convert-return-search")}
        <div class="panel" style="padding:16px;margin-top:12px;" data-testid="convert-return-panel">
          <p>Settlement: cash / udhari / store credit</p>
          <button class="btn btn-ink" data-testid="convert-return-save">Save convert {kbd("F9", True)}</button>
        </div>
      </div>
    </div>"""
    out.append(("11-returns-convert.html", "/returns · store-credit convert", app("Returns", "Returns", convert)))

    bulk = f"""
    <div data-testid="bulk-upload-page">
      <label class="panel" data-testid="bulk-file-label" style="display:flex;gap:16px;padding:16px;border:2px dashed rgba(26,91,250,.4);">
        <div><b>Photo ya PDF choose karein</b><div class="muted">JPG, PNG, PDF — har nayi file ke products grid ke neeche add honge</div></div>
        <input type="file" data-testid="bulk-file-input" style="display:none"/>
      </label>
      <div class="panel" style="margin-top:16px;overflow:auto;">
        <table class="data">
          <thead><tr><th>Type</th><th>Name</th><th>Code</th><th>Company</th><th>Size</th><th>Pcs/box</th><th>Qty</th><th>Price</th></tr></thead>
          <tbody>
            <tr>
              <td><div class="seg" style="grid-template-columns:1fr 1fr;"><b class="on">Tiles</b><b>Sanitary</b></div></td>
              <td>{inp("Name")}</td><td>{inp("Code")}</td><td>{inp("Company")}</td>
              <td>{inp("2x2 ft")}</td><td>{inp("4")}</td><td>{inp("10")}</td><td>{inp("450")}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <button class="btn btn-ink" style="width:100%;margin-top:16px;" data-testid="bulk-confirm-btn">Review &amp; Confirm Batch {kbd("F9", True)}</button>
    </div>"""
    out.append(("12-add-stock.html", "/bulk", app("Add Stock", "Add Stock", bulk)))

    udhari = f"""
    <div data-testid="customers-page">
      <div class="row panel" style="padding:4px;margin-bottom:12px;">
        <button class="btn btn-ink" style="flex:1;" data-testid="tab-udhari">Udhari</button>
        <button class="btn btn-ghost" style="flex:1;" data-testid="tab-customers">Customers</button>
      </div>
      <div class="row" style="margin-bottom:12px;" data-testid="role-filter">
        <button class="btn btn-ink" data-testid="role-filter-all">All</button>
        <button class="btn btn-ghost" data-testid="role-filter-customer">Customer</button>
        <button class="btn btn-ghost" data-testid="role-filter-contractor">Contractor</button>
        {inp("Search name / phone…", "", "customer-search")}
      </div>
      <div class="grid2" data-testid="udhari-list">
        <div class="panel" style="padding:16px;" data-testid="udhari-card-1">
          <b>Ram Traders</b><div class="muted">98xxxxxxxx</div>
          <p class="mono" style="font-size:22px;color:#e11d48;margin:8px 0;">₹24,000</p>
          <button class="btn btn-soft" style="width:100%;" data-testid="pay-btn-1">Record payment {kbd("F8")}</button>
        </div>
      </div>
    </div>"""
    out.append(("13-udhari.html", "/customers", app("Udhari & Customers", "Udhari & Customers", udhari)))

    cust = udhari.replace('data-testid="tab-udhari">Udhari', 'data-testid="tab-udhari">Udhari').replace(
        '<button class="btn btn-ink" style="flex:1;" data-testid="tab-udhari">Udhari</button>\n        <button class="btn btn-ghost" style="flex:1;" data-testid="tab-customers">Customers</button>',
        '<button class="btn btn-ghost" style="flex:1;" data-testid="tab-udhari">Udhari</button>\n        <button class="btn btn-ink" style="flex:1;" data-testid="tab-customers">Customers</button>',
    ).replace('data-testid="udhari-list"', 'data-testid="udhari-list" style="display:none"') + f"""
      <button class="btn btn-ink" data-testid="add-customer-btn" style="margin-top:12px;">Naya customer {kbd("Alt+C", True)}</button>
      <div class="panel" style="padding:16px;margin-top:12px;" data-testid="customer-card-1">
        <b>Ram Traders</b><div class="muted">98xxxxxxxx · Contractor</div>
        <span class="chip" style="background:#ede9fe;color:#6d28d9;" data-testid="store-credit-1">Store credit: ₹500</span>
      </div>"""
    out.append(("14-customers.html", "/customers?tab=customers", app("Udhari & Customers", "Udhari & Customers", cust)))

    chat = f"""
    <div data-testid="chat-page" style="display:flex;flex-direction:column;height:70vh;">
      <div class="row" style="margin-bottom:8px;">
        <div style="background:var(--ink);color:#fff;border-radius:8px;padding:8px;">Analyst</div>
        <div class="ml-auto panel" style="padding:4px;margin-left:auto;" data-testid="chat-privacy-toggle">
          <button class="btn btn-ink" data-testid="privacy-strict">Strict</button>
          <button class="btn btn-ghost" data-testid="privacy-rich">Rich</button>
        </div>
      </div>
      <p class="muted" data-testid="privacy-notice">Strict: bill/customer rows Gemini ko nahi jaate.</p>
      <div class="panel" style="flex:1;padding:16px;" data-testid="chat-messages">
        <button class="btn btn-ghost" data-testid="chat-suggestion">Ram ka last bill</button>
        <button class="btn btn-ghost" data-testid="chat-suggestion">pichle mahine ki kamai</button>
        <button class="btn btn-ghost" data-testid="chat-suggestion">sabse zyada udhari kiska</button>
        <button class="btn btn-ghost" data-testid="chat-suggestion">low stock kaunsa</button>
      </div>
      <div class="row" style="margin-top:12px;">
        {inp("Ram ka last bill, pichle mahine ki kamai…", "", "chat-input")}
        <button class="btn btn-ink" data-testid="chat-send" style="width:52px;height:52px;">➤</button>
      </div>
    </div>"""
    out.append(("15-analyst.html", "/chat", app("Analyst", "Analyst", chat)))
    chat_rich = chat.replace('data-testid="privacy-strict">Strict', 'data-testid="privacy-strict">Strict').replace(
        '<button class="btn btn-ink" data-testid="privacy-strict">Strict</button>\n          <button class="btn btn-ghost" data-testid="privacy-rich">Rich</button>',
        '<button class="btn btn-ghost" data-testid="privacy-strict">Strict</button>\n          <button class="btn btn-ink" data-testid="privacy-rich">Rich</button>',
    ).replace("privacy-notice", "privacy-notice-rich")
    out.append(("16-analyst-rich.html", "/chat · rich", app("Analyst", "Analyst", chat_rich)))

    analytics = f"""
    <div data-testid="analytics-page">
      <div data-testid="range-select" class="seg" style="width:20rem;grid-template-columns:1fr 1fr 1fr;margin-left:auto;">
        <b class="on" data-testid="range-day">Daily</b><b data-testid="range-month">Monthly</b><b data-testid="range-year">Yearly</b>
      </div>
      <div class="panel row" style="padding:12px;margin:12px 0;justify-content:space-between;">
        <span data-testid="analytics-date">25 Aug 2026</span>
        <button class="btn btn-ink" data-testid="analytics-print-summary">Print day-book {kbd("Alt+P", True)}</button>
      </div>
      <p data-testid="analytics-period-label">Aaj</p>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
        {"".join(f'<div class="panel" style="padding:12px;" data-testid="{t}"><div class="muted">{l}</div><div class="mono" style="font-size:20px;font-weight:600;">{v}</div></div>' for t,l,v in [
            ("kpi-kamai","Kamai","₹1,24,500"),("kpi-karcha","Karcha","₹8,200"),
            ("kpi-bachat","Bachat (kamai − karcha)","₹1,16,300"),("kpi-bills","Bills","18"),
            ("kpi-cash","Cash aaya","₹90,000"),("kpi-online","Online aaya","₹34,500"),
            ("kpi-udhari-out","Udhari diya","₹12,000"),("kpi-udhari-in","Udhari vusool","₹6,000"),
        ])}
      </div>
      <div class="panel" style="height:220px;margin-top:16px;padding:16px;"><b>Kamai vs karcha</b>
        <div style="display:flex;align-items:flex-end;gap:8px;height:160px;margin-top:12px;">
          {"".join(f'<div style="flex:1;background:var(--mint);height:{h}%;border-radius:4px 4px 0 0;opacity:.85;"></div>' for h in (40,70,55,90,60,80,45))}
        </div>
      </div>
    </div>"""
    out.append(("17-analytics.html", "/analytics", app("Analytics", "Analytics", analytics)))

    settings = f"""
    <div data-testid="settings-page" style="max-width:36rem;margin:0 auto;">
      <div style="text-align:right;margin-bottom:12px;"><button class="btn btn-soft" data-testid="edit-settings-btn">Edit</button></div>
      <div class="panel" style="padding:16px;">
        {field("Shop name *", inp("", "Aajana trading company", "set-name"))}
        {field("Owner name", inp("", "Shravan Kumar", "set-ownerName"))}
        {field("Phone *", inp("", "9876543210", "set-phone"))}
        {field("Address", inp("", "Showroom, main road", "set-address"))}
        <label class="row" style="margin:12px 0;"><input type="checkbox" checked data-testid="set-gst"/> GST invoicing enabled (default 18%)</label>
        {field("GSTIN", inp("", "27AAAAA0000A1Z5", "set-gstin"))}
        <div class="panel" style="padding:12px;background:#f8fafc;" data-testid="privacy-settings">
          <b>Chat privacy (DPDP)</b>
          <label class="row" style="margin-top:8px;"><input type="checkbox" data-testid="set-chat-privacy-rich"/> Rich mode — jawab ke liye sample rows Gemini ko bhejo</label>
        </div>
      </div>
    </div>"""
    out.append(("18-settings.html", "/settings", app("Settings", "Settings", settings)))
    settings_edit = settings.replace(
        'data-testid="edit-settings-btn">Edit',
        'data-testid="edit-settings-btn" style="display:none">Edit',
    ) + """
      <div class="row" style="max-width:36rem;margin:12px auto 0;gap:8px;">
        <button class="btn btn-ghost" style="flex:1;" data-testid="cancel-settings-btn">Cancel</button>
        <button class="btn btn-ink" style="flex:1;" data-testid="save-settings-btn">Save """ + kbd("F9", True) + """</button>
      </div>"""
    out.append(("19-settings-edit.html", "/settings · edit", app("Settings", "Settings", settings_edit)))

    onboard = f"""
    <div data-testid="settings-page" style="max-width:36rem;margin:48px auto;">
      <h2>Welcome! Setup your shop</h2>
      <div class="panel" style="padding:16px;">
        {field("Shop name *", inp("", "", "set-name"))}
        {field("Owner name", inp("", "", "set-ownerName"))}
        {field("Phone *", inp("", "", "set-phone"))}
        {field("Address", inp("", "", "set-address"))}
        <button class="btn btn-mint" style="width:100%;margin-top:12px;" data-testid="save-settings-btn">Continue {kbd("F9", True)}</button>
      </div>
    </div>"""
    out.append(("20-onboarding.html", "/settings · onboarding", HEAD.format(title="/settings · onboarding") + onboard + FOOT))

    # Overlays
    out.append(("21-command-palette.html", "/ · command palette", app("Dashboard", "Dashboard", dash, dialog("Jaayein kahin bhi…", f"""
      {inp("Kahan jaana hai? Screen, item ya customer ka naam likhein…", "", "palette-input")}
      <p class="muted" style="margin:12px 0 6px;">Kaam — Actions</p>
      <div class="row" style="padding:8px 0;"><span style="flex:1"><b>Naya bill banayein</b> <span class="muted">New sale or purchase invoice</span></span>{kbd("F2")}</div>
      <div class="row" style="padding:8px 0;"><span style="flex:1"><b>Kharcha add karein</b></span>{kbd("Alt+E")}</div>
      <div class="row" style="padding:8px 0;"><span style="flex:1"><b>Sq-ft calculator</b></span>{kbd("Alt+Q")}</div>
      <div class="row" style="padding:8px 0;"><span style="flex:1"><b>Udhari payment lein</b></span>{kbd("F8")}</div>
      <div class="row" style="padding:8px 0;"><span style="flex:1"><b>Stock intake karein</b></span>{kbd("Alt+N")}</div>
      <p class="muted" style="margin:12px 0 6px;">Screens</p>
      <div class="row" style="padding:8px 0;"><span style="flex:1">Dashboard</span>{kbd("F1")}</div>
      <div class="row" style="padding:8px 0;"><span style="flex:1">Stock</span>{kbd("F3")}</div>
    """, True))))

    help_items = "".join(
        f'<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;"><span>{lab}</span>{kbd(k)}</div>'
        for k, lab in [
            ("Ctrl+K", "Command palette"), ("F1", "Dashboard"), ("F2", "New bill"), ("F3", "Stock"),
            ("F4", "Bill history"), ("Alt+R", "Returns"), ("Alt+N", "Add stock"), ("Alt+U", "Udhari"),
            ("Alt+A", "Analyst"), ("Alt+I", "Analytics"), ("F9", "Save"), ("Alt+P", "Preview PDF"),
            ("Alt+C", "Naya item / customer"), ("/", "Focus search"), ("Esc", "Cancel"),
        ]
    )
    out.append(("22-shortcut-help.html", "/ · shortcuts", app("Dashboard", "Dashboard", dash, f'<div class="overlay"><div class="dialog wide" data-testid="shortcut-help"><h3>Keyboard shortcuts {kbd("Alt+K")}</h3>{help_items}</div></div>')))

    edit_prod = dialog("Edit Product", f"""
      <div class="grid2" data-testid="product-form-dialog">
        <div class="span2 seg" style="grid-template-columns:1fr 1fr;"><b class="on" data-testid="pf-unit-box">Tiles · Boxes + Pcs</b><b data-testid="pf-unit-piece">Sanitary · Pieces</b></div>
        {field("Name", inp("", "1107 LD ASH", "pf-name"), "span2")}
        {field("Code", inp("", "1107", "pf-code"))}
        {field("Company", inp("", "Aajana", "pf-company"))}
        {field("Size", inp("", "2x2 ft", "pf-size"))}
        {field("Pieces / box", inp("", "4", "pf-piecesPerBox"))}
        {field("Price (₹/box)", inp("", "0", "pf-sellPrice"))}
        {field("Stock (boxes)", inp("", "101", "pf-stockQty"), "span2")}
        {field("Low-stock threshold", inp("", "10", "pf-lowStockThreshold"), "span2")}
        <button class="btn btn-ink span2" data-testid="save-product-btn">Save {kbd("F9", True)}</button>
      </div>
    """)
    out.append(("23-edit-product.html", "/inventory · edit product", app("Stock Management", "Stock", stock, edit_prod)))

    item = dialog("1107 LD ASH <span class='chip chip-tile'>Tiles</span> <span class='chip' data-testid='detail-stock-remaining' style='background:var(--mint-soft);color:var(--mint-dark);'>101b</span>", f"""
      <div class="grid2" data-testid="item-details-dialog">
        {field("Box", inp("", "1", "detail-qty"))}
        {field("Pcs", inp("", "0", "detail-pieces"))}
        {field("Rate", inp("", "450", "detail-rate"), "span2")}
        <div class="span2 row" style="justify-content:space-between;"><b>Amount <span data-testid="detail-amount">₹450</span></b>
          <button class="btn btn-soft" data-testid="detail-sqft-btn">Sq-ft {kbd("Alt+Q")}</button></div>
        <button class="btn btn-ink span2" data-testid="detail-add-btn">Add line {kbd("Enter", True)}</button>
      </div>
    """)
    out.append(("24-item-details.html", "/bill · item details", app("New Bill", "New Bill", bill, item)))

    sqft = dialog("Sq-ft calculator", f"""
      <div data-testid="sqft-dialog">
        <div class="seg" style="width:14rem;grid-template-columns:1fr 1fr;">
          <b class="on" data-testid="sqft-mode-lw">L × W</b><b data-testid="sqft-mode-area">Sq-ft</b>
        </div>
        <div class="grid2" style="margin-top:12px;">
          {field("Length (ft)", inp("", "12", "sqft-roomLengthFt"))}
          {field("Width (ft)", inp("", "10", "sqft-roomWidthFt"))}
          {field("Tile size", inp("", "2x2 ft", "sqft-size"))}
          {field("Pcs / box", inp("", "4", "sqft-boxes"))}
        </div>
        <button class="btn btn-mint" style="width:100%;margin-top:12px;" data-testid="sqft-apply-btn">Apply {kbd("Enter", True)}</button>
      </div>
    """)
    out.append(("25-sqft-dialog.html", "/bill · sq-ft calculator", app("New Bill", "New Bill", bill, sqft)))

    cart = dialog("Cart <span class='chip'>1</span>", f"""
      <div data-testid="bill-cart-dialog">
        <div data-testid="bill-item-0" class="panel" style="padding:10px;margin-bottom:8px;">
          <b>1107 LD ASH</b> <span class="chip chip-tile">Tiles</span>
          <div class="row" style="margin-top:8px;">
            {field("Box", inp("", "2", "item-qty-0"))}
            {field("Pcs", inp("", "1", "item-pieces-0"))}
            {field("Rate/box", inp("", "450", "item-rate-0"))}
            <div>Amt <b data-testid="item-amount-0">₹900</b></div>
            <button data-testid="item-sqft-0" class="btn btn-soft">Sq-ft</button>
            <button data-testid="del-item-0" class="btn btn-rose">Del {kbd("Alt+X")}</button>
          </div>
        </div>
        <div class="row" style="justify-content:space-between;"><span>Subtotal</span><b data-testid="bill-cart-subtotal">₹900</b></div>
        <button class="btn btn-ghost" style="width:100%;margin-top:8px;" data-testid="bill-cart-close">Close {kbd("Esc")}</button>
      </div>
    """, True)
    out.append(("26-bill-cart.html", "/bill · cart", app("New Bill", "New Bill", bill, cart)))

    cart_empty = dialog("Cart", '<p class="muted" style="text-align:center;padding:32px;" data-testid="bill-cart-empty">Koi item nahi. Search karke add karein.</p>')
    out.append(("27-bill-cart-empty.html", "/bill · cart empty", app("New Bill", "New Bill", bill, cart_empty)))

    clear = f"""<div class="overlay"><div class="dialog" data-testid="clear-bill-dialog">
      <h3>Bill clear karein?</h3>
      <p class="muted">Saari lines, customer, discount aur payment hat jaayengi. Ye undo nahi hoga.</p>
      <div class="row" style="justify-content:flex-end;margin-top:16px;">
        <button class="btn btn-ghost" data-testid="clear-bill-cancel">Cancel {kbd("Esc")}</button>
        <button class="btn" style="background:#e11d48;color:#fff;" data-testid="clear-bill-confirm">Haan, clear karo {kbd("Enter", True)}</button>
      </div>
    </div></div>"""
    out.append(("28-clear-bill.html", "/bill · clear confirm", app("New Bill", "New Bill", bill, clear)))

    pay = dialog("Record Payment — Ram Traders", f"""
      <div data-testid="payment-dialog">
        <div class="panel" style="padding:12px;margin-bottom:8px;" data-testid="pay-bill-1">
          <div class="row" style="justify-content:space-between;"><div><b>INV-1042</b><div class="muted">pending ₹12,000</div></div>
          <button data-testid="pay-bill-fill-1">Full</button></div>
          {inp("Amount ₹", "12000", "pay-bill-amt-1")}
        </div>
        <div class="seg" style="grid-template-columns:1fr 1fr;">
          <b class="on" data-testid="pay-mode-cash">Cash</b><b data-testid="pay-mode-online">Online</b>
        </div>
        <div class="row" style="justify-content:space-between;margin:12px 0;"><b>Total payment</b><b data-testid="pay-alloc-total">₹12,000</b></div>
        <button class="btn" style="width:100%;background:#059669;color:#fff;" data-testid="submit-payment-btn">Record Payment {kbd("F9", True)}</button>
      </div>
    """)
    out.append(("29-payment.html", "/customers · record payment", app("Udhari & Customers", "Udhari & Customers", udhari, pay)))

    naya = dialog("Naya item", f"""
      <div class="grid2" data-testid="new-product-dialog">
        <div class="span2 seg" style="grid-template-columns:1fr 1fr;"><b class="on" data-testid="np-unit-box">Tiles · Boxes + Pcs</b><b data-testid="np-unit-piece">Sanitary · Pieces</b></div>
        {field("Name", inp("", "", "np-name"), "span2")}
        {field("Code", inp("", "", "np-code"))}
        {field("Company", inp("", "", "np-company"))}
        {field("Size", inp("", "", "np-size"))}
        {field("Pieces / box", inp("", "", "np-piecesPerBox"))}
        {field("Price optional (₹/box)", inp("", "", "np-sellPrice"))}
        {field("Stock (boxes)", inp("", "", "np-stockQty"))}
        {field("Low-stock alert", inp("", "", "np-lowStockThreshold"))}
        <button class="btn btn-ink span2">Add &amp; bill me lagayein {kbd("F9", True)}</button>
      </div>
    """)
    out.append(("30-naya-item.html", "/ · naya item", app("New Bill", "New Bill", bill, naya)))

    qc = dialog("Naya customer", f"""
      <div data-testid="quick-customer-dialog">
        {field("Name", inp("", "", "qc-name"))}
        {field("Phone (optional)", inp("98xxxxxxxx", "", "qc-phone"))}
        <label class="row"><input type="checkbox" data-testid="qc-contractor"/> Contractor / Dealer {kbd("Alt+Enter")}</label>
        {field("Project / site note", inp("", "", "qc-site"))}
        <button class="btn btn-ink" style="width:100%;margin-top:12px;">Add customer {kbd("Enter", True)}</button>
      </div>
    """)
    out.append(("31-naya-customer.html", "/customers · naya customer", app("Udhari & Customers", "Udhari & Customers", cust, qc)))

    pdf = f"""<div class="overlay"><div class="dialog wide" data-testid="pdf-viewer-dialog" style="width:min(48rem,100%);padding:8px;">
      <div style="height:70vh;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#94a3b8;">Invoice PDF preview</div>
      <div class="row" style="justify-content:flex-end;padding:8px;"><button class="btn btn-ink" data-testid="pdf-download-btn">Download</button></div>
    </div></div>"""
    out.append(("32-pdf-viewer.html", "/history · PDF viewer", app("Bill History", "Bill History", hist, pdf)))

    prod_dd = bill.replace(
        inp("Search name / code / company…", "", "product-search-input"),
        inp("Search name / code / company…", "1107", "product-search-input")
        + """<div class="panel" style="margin-top:4px;">
          <div style="padding:10px 12px;background:var(--mint-soft);" data-testid="product-option-1"><b>1107 LD ASH</b> <span class="chip chip-tile">Tiles</span> <span class="mono muted">101b · ₹0</span></div>
          <div style="padding:10px 12px;" data-testid="product-add-new">Naya item add karein: “1107” {kbd("Alt+C")}</div>
        </div>"""
    )
    out.append(("33-product-search.html", "/bill · product search", app("New Bill", "New Bill", prod_dd)))

    cust_dd = bill.replace(
        inp("Customer name", "", "customer-name"),
        inp("Customer name", "Ram", "customer-name")
        + """<div class="panel" style="margin-top:4px;">
          <div style="padding:10px 12px;background:var(--mint-soft);" data-testid="customer-option-1"><b>Ram Traders</b> <span class="muted">₹24,000 udhari</span></div>
          <div style="padding:10px 12px;" data-testid="customer-add-new">Naya customer {kbd("Alt+C")}</div>
        </div>"""
    )
    out.append(("34-customer-search.html", "/bill · customer search", app("New Bill", "New Bill", cust_dd)))

    inv_dd = returns.replace(
        inp("Invoice no / customer…", "", "return-invoice-no"),
        inp("Invoice no / customer…", "1042", "return-invoice-no")
        + """<div class="panel" style="margin-top:4px;">
          <div style="padding:10px 12px;background:var(--mint-soft);" data-testid="invoice-option-1"><b>INV-1042</b> · Ram Traders · ₹18,400</div>
        </div>"""
    )
    out.append(("35-invoice-search.html", "/returns · invoice search", app("Returns", "Returns", inv_dd)))

    size_dd = dash.replace(
        inp("2x2 ft", "", "dash-sqft-size"),
        inp("2x2 ft", "2", "dash-sqft-size")
        + """<div class="panel" style="position:absolute;z-index:5;width:12rem;">
          <div style="padding:8px 12px;background:var(--mint-soft);" data-testid="dash-sqft-size-opt-2x2">2x2 ft</div>
          <div style="padding:8px 12px;" data-testid="dash-sqft-size-opt-2x4">2x4 ft</div>
          <div style="padding:8px 12px;" data-testid="dash-sqft-size-add">Add custom size</div>
        </div>"""
    )
    out.append(("36-tile-size.html", "/ · tile size select", app("Dashboard", "Dashboard", size_dd)))

    draft = (
        HEAD.format(title="/ · draft confirm")
        + f"""
<div class="shell">{sidebar("Dashboard")}<div class="main">{topbar("Dashboard")}<main class="content">{dash}</main></div></div>
<div style="position:fixed;left:260px;right:0;bottom:20px;display:flex;justify-content:center;">
  <div class="panel" data-testid="draft-card" style="width:28rem;border:2px solid #f59e0b;background:#fffbeb;padding:20px;">
    <b>Confirm expense draft</b>
    <p class="muted">₹500 · Diesel</p>
    <div class="row" style="margin-top:12px;">
      <button class="btn btn-ghost" data-testid="draft-cancel-btn">Cancel {kbd("Esc")}</button>
      <button class="btn btn-mint" data-testid="draft-confirm-btn">Confirm {kbd("Ctrl+Enter")}</button>
    </div>
  </div>
</div>
"""
        + FOOT
    )
    out.append(("37-draft-card.html", "/ · draft confirm", draft))

    mobile = HEAD.format(title="/ · mobile") + f"""
<div style="max-width:28rem;margin:0 auto;min-height:100vh;background:var(--canvas);display:flex;flex-direction:column;">
  <header class="glass" style="padding:12px 16px;display:flex;justify-content:space-between;"><b>Aajana trading</b><span style="width:32px;height:32px;border-radius:999px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;">S</span></header>
  <main style="padding:16px;flex:1;">{dash}</main>
  <nav class="glass" style="display:flex;align-items:flex-end;padding:8px;gap:4px;">
    <div style="flex:1;text-align:center;font-size:10px;font-weight:600;">Home</div>
    <div style="flex:1;text-align:center;font-size:10px;font-weight:600;">Stock</div>
    <div style="flex:1;display:flex;justify-content:center;"><div style="width:64px;height:64px;margin-top:-32px;border-radius:999px;background:var(--mint);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;" data-testid="new-bill-fab">+</div></div>
    <div style="flex:1;text-align:center;font-size:10px;font-weight:600;">Returns</div>
    <div style="flex:1;text-align:center;font-size:10px;font-weight:600;">Analyst</div>
  </nav>
</div>
""" + FOOT
    out.append(("38-mobile-shell.html", "/ · mobile shell", mobile))

    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for name, title, html in screens():
        path = OUT / name
        path.write_text(html, encoding="utf-8")
        manifest.append({"file": str(path), "title": title})
        print(f"wrote {name} ({path.stat().st_size} bytes) {title}")
    man = OUT / "manifest.json"
    man.write_text(json.dumps({"projectId": PROJECT_ID, "screens": manifest}, indent=2), encoding="utf-8")
    print(f"manifest {len(manifest)} screens -> {man}")


if __name__ == "__main__":
    main()
