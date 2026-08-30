import {
  LayoutDashboard, Package, Undo2, Bot, Plus,
  ReceiptText, Users, Upload, BarChart3, Settings,
} from "lucide-react";

/**
 * The single source of truth for DukanSaathi's keyboard vocabulary.
 *
 * Everything that shows or handles a shortcut reads from here — the command
 * palette, the help sheet, the sidebar hints and the page hooks — so a key can
 * never mean two different things on two different screens.
 *
 * ── Why these keys ──────────────────────────────────────────────────────────
 * Some of the obvious choices are owned by the browser and cannot be reclaimed
 * reliably, so they are deliberately avoided:
 *
 *   F5           page reload            → expense uses Alt+E (not F-keys)
 *   F6           browser toolbar focus  → udhari payment moved to F8
 *   F11 / F12    fullscreen / devtools  → unused
 *   Alt+D/F      address bar / menus    → those letters are unused
 *   Ctrl+N/T/W   window management      → unused
 *
 * Nav F-keys (primary workflow): F1 Dashboard, F2 Bill, F3 Stock, F4 History.
 * Search anywhere: Alt+K. Shortcut cheat sheet: Ctrl+K (⌘K on Mac).
 *
 * Change a binding here and it updates everywhere, including the on-screen
 * hints and the cheat sheet.
 */

export const SCOPES = {
  GLOBAL: "global",
  DASHBOARD: "page:dashboard",
  BILLING: "page:billing",
  INVENTORY: "page:inventory",
  CUSTOMERS: "page:customers",
  RETURNS: "page:returns",
  HISTORY: "page:history",
  BULK: "page:bulk",
  ANALYTICS: "page:analytics",
  SETTINGS: "page:settings",
  CHAT: "page:chat",
  PALETTE: "modal:palette",
  HELP: "modal:help",
  DRAFT: "overlay:draft",
  CLEAR_BILL: "modal:clear-bill",
};

/** Reused across pages so the same action always has the same key. */
export const KEYS = {
  palette: "alt+k",
  help: "mod+k",
  /** Clear Analyst chat (Alt+K is search). */
  chatClear: "alt+shift+k",

  gotoDashboard: "F1",
  gotoBill: "F2",
  gotoStock: "F3",
  gotoHistory: "F4",
  gotoReturns: "alt+r",
  gotoBulk: "alt+n",
  gotoCustomers: "alt+u",
  gotoChat: "alt+a",
  gotoAnalytics: "alt+i",

  gotoExpense: "alt+e",
  gotoUdhari: "F8",
  gotoSettings: "alt+s",

  save: "F9",
  saveAlt: "mod+s",
  cancel: "escape",
  quickCreate: "alt+c",
  preview: "alt+p",
  /** Open the selected original sale invoice (Returns). */
  openOriginal: "alt+o",
  deleteRow: "alt+x",
  /** Clear / reset the whole New Bill form (with confirm). */
  clearBill: "alt+shift+c",
  focusSearch: "/",
  confirmDraft: "mod+enter",
  toggleCheckbox: "alt+enter",
  /** Open sq-ft → boxes/pcs calculator (item-details popup, tiles only). */
  sqftCalc: "alt+q",
};

/**
 * Navigation targets. Order matches the sidebar.
 * `keys` doubles as the sidebar hint and the command-palette shortcut label.
 */
export const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, keys: KEYS.gotoDashboard, end: true, keywords: "home ghar overview stats" },
  { to: "/bill", label: "New Bill", icon: Plus, keys: KEYS.gotoBill, keywords: "invoice sale bill banao" },
  { to: "/inventory", label: "Stock", icon: Package, keys: KEYS.gotoStock, keywords: "inventory items products maal tiles sanitary" },
  { to: "/history", label: "Bill History", icon: ReceiptText, keys: KEYS.gotoHistory, keywords: "invoices past bills receipts" },
  { to: "/returns", label: "Returns", icon: Undo2, keys: KEYS.gotoReturns, keywords: "return refund wapas store credit" },
  { to: "/bulk", label: "Add Stock", icon: Upload, keys: KEYS.gotoBulk, keywords: "bulk upload intake supplier maal" },
  { to: "/customers", label: "Udhari & Customers", icon: Users, keys: KEYS.gotoCustomers, keywords: "udhari credit grahak party ledger customers" },
  { to: "/chat", label: "AI Saathi", icon: Bot, keys: KEYS.gotoChat, keywords: "chat ai help sawal saathi analyst munim hisaab" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, keys: KEYS.gotoAnalytics, keywords: "reports charts revenue top sellers kamai karcha monthly yearly daily" },
];

export const NAV_BOTTOM = [
  { to: "/settings", label: "Settings", icon: Settings, keys: KEYS.gotoSettings, keywords: "shop profile gst phone address" },
];

/**
 * The cheat sheet shown by Ctrl+K (⌘K).
 *
 * Page-specific shortcuts are appended live from whatever scopes are currently
 * on the stack, so this only lists the vocabulary that's true everywhere.
 * "Go anywhere" order matches the sidebar.
 */
export const SHORTCUT_GUIDE = [
  {
    group: "Jaana kahin bhi — Go anywhere",
    items: [
      { keys: KEYS.palette, label: "Search anywhere (bills, items, customers, screens)" },
      { keys: KEYS.gotoDashboard, label: "Dashboard" },
      { keys: KEYS.gotoBill, label: "New bill" },
      { keys: KEYS.gotoStock, label: "Stock" },
      { keys: KEYS.gotoHistory, label: "Bill history" },
      { keys: KEYS.gotoReturns, label: "Returns" },
      { keys: KEYS.gotoBulk, label: "Add stock (bulk)" },
      { keys: KEYS.gotoCustomers, label: "Udhari & Customers" },
      { keys: KEYS.gotoChat, label: "AI Saathi" },
      { keys: KEYS.gotoAnalytics, label: "Analytics" },
      { keys: KEYS.gotoExpense, label: "Add expense" },
      { keys: KEYS.sqftCalc, label: "Quick sq-ft calculator (Dashboard)" },
      { keys: KEYS.gotoUdhari, label: "Record udhari payment" },
      { keys: KEYS.gotoSettings, label: "Settings" },
    ],
  },
  {
    group: "Form bharna — Data entry",
    items: [
      { keys: "enter", label: "Next field; on last field opens Preview if available" },
      { keys: "shift+enter", label: "Previous field" },
      { keys: KEYS.toggleCheckbox, label: "Toggle checkbox / radio; on View cart button, open cart" },
      { keys: KEYS.save, label: "Save current form (never Enter)" },
      { keys: KEYS.saveAlt, label: "Save current form" },
      { keys: KEYS.cancel, label: "Cancel / close current section (never blurs the page start field)" },
      { keys: KEYS.quickCreate, label: "Create customer or item on the fly" },
      { keys: KEYS.preview, label: "Preview / print PDF" },
      { keys: KEYS.openOriginal, label: "Open selected original invoice (Returns)" },
      { keys: KEYS.deleteRow, label: "Delete current line (New Bill: opens cart, or deletes focused cart row)" },
      { keys: KEYS.clearBill, label: "Clear / reset New Bill (asks for confirmation)" },
      { keys: KEYS.sqftCalc, label: "Sq-ft calculator (Dashboard, or while adding a tile item)" },
      { keys: "arrowleft", label: "Highlight previous option (cash/online / type / settlement)" },
      { keys: "arrowright", label: "Highlight next option" },
      { keys: "enter", label: "Select highlighted option / next field (View cart: Enter advances; Alt+Enter opens cart)" },
    ],
  },
  {
    group: "List aur search",
    items: [
      { keys: KEYS.focusSearch, label: "Focus the start field on this screen" },
      { keys: "arrowdown", label: "Next result" },
      { keys: "arrowup", label: "Previous result" },
      { keys: "enter", label: "Pick highlighted result" },
      { keys: KEYS.cancel, label: "Close the dropdown (keeps focus on the search box)" },
    ],
  },
  {
    group: "Confirm",
    items: [
      { keys: KEYS.confirmDraft, label: "Confirm the pending draft" },
      { keys: KEYS.help, label: "This cheat sheet" },
    ],
  },
];
