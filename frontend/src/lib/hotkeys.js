/**
 * Keyboard binding parsing + matching.
 *
 * Binding syntax (case-insensitive), modifiers joined with "+":
 *   "F9"  "mod+s"  "alt+c"  "shift+enter"  "/"  "?"  "escape"  "arrowdown"
 *
 * "mod" resolves to Cmd on macOS and Ctrl everywhere else.
 */

export const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);

const KEY_ALIASES = {
  esc: "escape",
  del: "delete",
  ins: "insert",
  space: " ",
  spacebar: " ",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  return: "enter",
  plus: "+",
};

/** Parse "mod+shift+k" into a comparable descriptor. */
export function parseBinding(binding) {
  const out = { ctrl: false, alt: false, shift: false, meta: false, key: "" };
  const raw = String(binding || "").trim();
  if (!raw) return out;

  // "+" is both the separator and a possible key ("ctrl++").
  const tokens = raw === "+" ? ["+"] : raw.split("+").map((t) => t.trim());

  tokens.forEach((token, i) => {
    const t = token.toLowerCase();
    if (t === "") {
      if (i === tokens.length - 1) out.key = "+";
      return;
    }
    switch (t) {
      case "mod":
        if (IS_MAC) out.meta = true; else out.ctrl = true;
        break;
      case "ctrl": case "control": out.ctrl = true; break;
      case "alt": case "option": out.alt = true; break;
      case "shift": out.shift = true; break;
      case "meta": case "cmd": case "command": out.meta = true; break;
      default: out.key = KEY_ALIASES[t] || t;
    }
  });

  return out;
}

/** Normalize a KeyboardEvent into the same vocabulary parseBinding produces. */
export function eventKey(e) {
  const k = e.key;
  if (!k) return "";
  if (k === " " || k === "Spacebar") return " ";
  return k.toLowerCase();
}

const isNamedKey = (key) => key.length > 1;
const isLetterOrDigit = (key) => key.length === 1 && /[a-z0-9]/i.test(key);

/**
 * Does this event satisfy the parsed binding?
 *
 * Shift is only compared for named keys (Enter, F9, ArrowDown) and
 * alphanumerics. For punctuation like "?" or "/" the shift state is implied by
 * the character the layout produced, so requiring an exact match would break
 * non-US keyboards.
 */
export function eventMatches(e, parsed) {
  if (!parsed.key) return false;
  if (e.ctrlKey !== parsed.ctrl) return false;
  if (e.altKey !== parsed.alt) return false;
  if (e.metaKey !== parsed.meta) return false;

  if (!keyMatches(e, parsed.key)) return false;

  if (isNamedKey(parsed.key) || isLetterOrDigit(parsed.key)) {
    if (e.shiftKey !== parsed.shift) return false;
  }
  return true;
}

function keyMatches(e, wanted) {
  if (eventKey(e) === wanted) return true;
  // Alt+letter emits a different character on macOS (Alt+X → "≈") and on some
  // European layouts, so fall back to the physical key for those.
  if ((e.altKey || e.ctrlKey) && /^[a-z]$/.test(wanted)) {
    return e.code === `Key${wanted.toUpperCase()}`;
  }
  if ((e.altKey || e.ctrlKey) && /^[0-9]$/.test(wanted)) {
    return e.code === `Digit${wanted}`;
  }
  return false;
}

/** True when focus is inside something the user is typing into. */
export function isTypingTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el.type || "text").toLowerCase();
    // Buttons/checkboxes aren't "typing" targets
    return !["button", "submit", "reset", "checkbox", "radio", "file", "range", "color"].includes(type);
  }
  return !!el.isContentEditable;
}

/**
 * A shortcut may fire while the user is typing only when it can't be confused
 * with normal text entry: it carries Ctrl/Alt/Cmd, or it's a function key or
 * Escape, or it explicitly opts in.
 *
 * This is what stops "N" from starting a new bill mid-way through typing a
 * customer called "Naresh".
 */
export function allowedWhileTyping(parsed, allowInInput) {
  if (allowInInput) return true;
  if (parsed.ctrl || parsed.alt || parsed.meta) return true;
  if (/^f([1-9]|1[0-2])$/.test(parsed.key)) return true;
  if (parsed.key === "escape") return true;
  return false;
}

const DISPLAY = {
  escape: "Esc",
  enter: "Enter",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  " ": "Space",
  backspace: "⌫",
  delete: "Del",
  tab: "Tab",
};

/** Human-readable label for a binding, e.g. "Ctrl + K" or "⌘ K". */
export function formatBinding(binding) {
  const p = parseBinding(binding);
  const parts = [];
  if (p.ctrl) parts.push(IS_MAC ? "⌃" : "Ctrl");
  if (p.alt) parts.push(IS_MAC ? "⌥" : "Alt");
  if (p.shift) parts.push(IS_MAC ? "⇧" : "Shift");
  if (p.meta) parts.push(IS_MAC ? "⌘" : "Win");

  let key = DISPLAY[p.key];
  if (!key) {
    key = /^f([1-9]|1[0-2])$/.test(p.key) ? p.key.toUpperCase() : p.key.toUpperCase();
  }
  parts.push(key);
  return parts.join(IS_MAC ? " " : " + ");
}
