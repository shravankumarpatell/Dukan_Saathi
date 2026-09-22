import { previousTextField, shouldKeepFieldFocus } from "./keepFieldFocus";

function el(html) {
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  return wrap;
}

describe("shouldKeepFieldFocus", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps the caret when the click is on empty page chrome", () => {
    const root = el('<input id="a" /><div id="panel"></div>');
    const input = root.querySelector("#a");
    const panel = root.querySelector("#panel");
    expect(shouldKeepFieldFocus(input, panel)).toBe(true);
  });

  it("lets a click move to another field or its label", () => {
    const root = el('<input id="a" /><label for="b">Name</label><input id="b" />');
    const a = root.querySelector("#a");
    const label = root.querySelector("label");
    const b = root.querySelector("#b");
    expect(shouldKeepFieldFocus(a, b)).toBe(false);
    expect(shouldKeepFieldFocus(a, label)).toBe(false);
  });

  it("lands on the previous text field when the focused row is removed", () => {
    const root = el(`
      <input id="labour-label" />
      <input id="labour-amt" />
      <div id="row">
        <input id="transport-label" />
        <input id="transport-amt" />
        <button id="x">x</button>
      </div>
    `);
    const fields = [...root.querySelectorAll("input")];
    const row = root.querySelector("#row");
    expect(previousTextField(fields, root.querySelector("#transport-label"), row).id).toBe("labour-amt");
    expect(previousTextField(fields, root.querySelector("#transport-amt"), row).id).toBe("labour-amt");
    expect(previousTextField(fields, root.querySelector("#x"), row).id).toBe("labour-amt");
  });

  it("ignores clicks when nothing text-like is focused", () => {
    const root = el('<button id="btn">Save</button><div id="panel"></div>');
    expect(shouldKeepFieldFocus(root.querySelector("#btn"), root.querySelector("#panel"))).toBe(false);
  });
});
