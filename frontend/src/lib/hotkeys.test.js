import { parseBinding, eventMatches, isTypingTarget, allowedWhileTyping, formatBinding } from "./hotkeys";

/**
 * The keymap is only as trustworthy as the matcher underneath it, and the
 * failure mode is silent (a shortcut simply never fires). These cover the
 * cases that actually bite: punctuation keys that carry an implicit Shift,
 * "mod" resolving per-platform, and single letters firing mid-typing.
 */

const press = (key, mods = {}) => ({
  key,
  code: mods.code || "",
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
  metaKey: !!mods.meta,
});

const matches = (binding, event) => eventMatches(event, parseBinding(binding));

describe("parseBinding", () => {
  it("reads modifiers and the key", () => {
    expect(parseBinding("alt+c")).toMatchObject({ alt: true, ctrl: false, key: "c" });
    expect(parseBinding("F9")).toMatchObject({ key: "f9", ctrl: false, alt: false });
    expect(parseBinding("shift+enter")).toMatchObject({ shift: true, key: "enter" });
  });

  it("maps mod to Ctrl on non-Mac", () => {
    // jsdom reports a Linux-ish platform, so mod is Ctrl here.
    expect(parseBinding("mod+s")).toMatchObject({ ctrl: true, meta: false, key: "s" });
  });

  it("understands aliases", () => {
    expect(parseBinding("esc").key).toBe("escape");
    expect(parseBinding("up").key).toBe("arrowup");
  });
});

describe("eventMatches", () => {
  it("matches function keys and letter combos", () => {
    expect(matches("F9", press("F9"))).toBe(true);
    expect(matches("F9", press("F8"))).toBe(false);
    expect(matches("alt+c", press("c", { alt: true }))).toBe(true);
    expect(matches("alt+c", press("c"))).toBe(false);
  });

  it("does not fire a bare key when a modifier is held", () => {
    expect(matches("F2", press("F2", { ctrl: true }))).toBe(false);
  });

  it("ignores Shift state for punctuation, which carries it implicitly", () => {
    // "?" is Shift+/ on a US layout — the browser reports the character.
    expect(matches("?", press("?", { shift: true }))).toBe(true);
    expect(matches("/", press("/"))).toBe(true);
  });

  it("enforces Shift for named keys and letters", () => {
    expect(matches("shift+enter", press("Enter", { shift: true }))).toBe(true);
    expect(matches("shift+enter", press("Enter"))).toBe(false);
    expect(matches("alt+c", press("C", { alt: true, shift: true }))).toBe(false);
  });

  it("falls back to the physical key when Alt rewrites the character", () => {
    // macOS turns Alt+X into "≈"; the binding must still resolve.
    expect(matches("alt+x", press("≈", { alt: true, code: "KeyX" }))).toBe(true);
  });
});

describe("typing guard", () => {
  it("recognises text entry targets", () => {
    const input = document.createElement("input");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(checkbox)).toBe(false);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
  });

  it("blocks bare letters while typing but lets modified and function keys through", () => {
    expect(allowedWhileTyping(parseBinding("n"))).toBe(false);
    expect(allowedWhileTyping(parseBinding("/"))).toBe(false);
    expect(allowedWhileTyping(parseBinding("alt+c"))).toBe(true);
    expect(allowedWhileTyping(parseBinding("mod+k"))).toBe(true);
    expect(allowedWhileTyping(parseBinding("F9"))).toBe(true);
    expect(allowedWhileTyping(parseBinding("escape"))).toBe(true);
    expect(allowedWhileTyping(parseBinding("enter"), true)).toBe(true);
  });
});

describe("formatBinding", () => {
  it("renders labels a shopkeeper can read", () => {
    expect(formatBinding("F9")).toBe("F9");
    expect(formatBinding("alt+c")).toBe("Alt + C");
    expect(formatBinding("arrowdown")).toBe("↓");
    expect(formatBinding("escape")).toBe("Esc");
  });
});
