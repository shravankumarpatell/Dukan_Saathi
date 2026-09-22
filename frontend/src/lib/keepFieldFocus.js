/**
 * Keep the text caret in the field the user is typing in.
 * A click on empty page chrome must not blur it. A click on another
 * field, label, or menu option still moves focus as usual.
 */

const TEXT_ENTRY = "input, textarea, [contenteditable='true']";

const ALLOW_FOCUS = [
  "input",
  "textarea",
  "select",
  "label",
  "summary",
  "a[href]",
  "[contenteditable='true']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='option']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='tab']",
  "[role='slider']",
].join(",");

const NON_TEXT_INPUT = new Set([
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "file",
  "range",
  "color",
  "image",
  "hidden",
]);

export function isTextEntry(el) {
  if (!el || el === document.body || el === document.documentElement) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  const type = (el.getAttribute("type") || "text").toLowerCase();
  return !NON_TEXT_INPUT.has(type);
}

/**
 * Text field just before `active`, skipping anything inside `exclude`
 * (the row that is about to be removed). If focus is on the row's
 * remove button, start from that row's last text field.
 */
export function previousTextField(fields, active, exclude) {
  let idx = fields.indexOf(active);
  if (idx < 0 && exclude) {
    let lastInRow = -1;
    fields.forEach((el, i) => {
      if (exclude.contains(el)) lastInRow = i;
    });
    idx = lastInRow + 1;
  }
  if (idx < 0) return null;
  for (let i = idx - 1; i >= 0; i--) {
    if (exclude?.contains(fields[i])) continue;
    return fields[i];
  }
  return null;
}

/** True when this mousedown should be cancelled so the caret stays put. */
export function shouldKeepFieldFocus(active, target) {
  if (!isTextEntry(active)) return false;
  if (!target || target.nodeType !== 1) return false;
  if (active.contains(target)) return false;
  if (target.closest(ALLOW_FOCUS)) return false;
  return true;
}

export function installKeepFieldFocus() {
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    if (!shouldKeepFieldFocus(document.activeElement, e.target)) return;
    e.preventDefault();
  };
  document.addEventListener("mousedown", onMouseDown, true);
  return () => document.removeEventListener("mousedown", onMouseDown, true);
}
