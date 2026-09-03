import { UNIT_BOX, UNIT_PIECE } from "./units";
import {
  applyColumnFill,
  fillDownFrom,
  formatFillToast,
  hasColumnRange,
  isCellEmpty,
  isRowEligible,
  mapExtractedPiecesPerBox,
  selectedRowIds,
} from "./bulkFill";

const tile = (id, extra = {}) => ({
  id, name: `T${id}`, unit: UNIT_BOX, size: "2x2 ft", piecesPerBox: "", company: "", qty: "10", price: "",
  ...extra,
});

const sanitary = (id, extra = {}) => ({
  id, name: `S${id}`, unit: UNIT_PIECE, size: "", piecesPerBox: 1, company: "", qty: "3", price: "",
  ...extra,
});

describe("bulkFill empty / eligibility", () => {
  it("treats tile pcs/box of 1 as empty", () => {
    expect(isCellEmpty(tile(1, { piecesPerBox: 1 }), "piecesPerBox")).toBe(true);
    expect(isCellEmpty(tile(1, { piecesPerBox: "1" }), "piecesPerBox")).toBe(true);
    expect(isCellEmpty(tile(1, { piecesPerBox: "" }), "piecesPerBox")).toBe(true);
    expect(isCellEmpty(tile(1, { piecesPerBox: 6 }), "piecesPerBox")).toBe(false);
  });

  it("does not treat type as empty", () => {
    expect(isCellEmpty(tile(1), "unit")).toBe(false);
  });

  it("skips sanitary for size and pcs/box", () => {
    expect(isRowEligible(sanitary(1), "piecesPerBox")).toBe(false);
    expect(isRowEligible(sanitary(1), "size")).toBe(false);
    expect(isRowEligible(sanitary(1), "company")).toBe(true);
    expect(isRowEligible(tile(1), "piecesPerBox")).toBe(true);
  });
});

describe("applyColumnFill", () => {
  it("fills empty tile pcs/box including dummy 1, skips sanitary", () => {
    const rows = [
      tile(1, { piecesPerBox: 1 }),
      tile(2, { piecesPerBox: "" }),
      tile(3, { piecesPerBox: 4 }),
      sanitary(4),
    ];
    const { rows: next, count } = applyColumnFill({
      rows, field: "piecesPerBox", value: "6", mode: "empty",
    });
    expect(count).toBe(2);
    expect(next[0].piecesPerBox).toBe("6");
    expect(next[1].piecesPerBox).toBe("6");
    expect(next[2].piecesPerBox).toBe(4);
    expect(next[3].piecesPerBox).toBe(1);
  });

  it("overwrites all eligible rows in all mode", () => {
    const rows = [tile(1, { company: "A" }), tile(2, { company: "B" }), sanitary(3, { company: "C" })];
    const { rows: next, count } = applyColumnFill({
      rows, field: "company", value: "Kajaria", mode: "all",
    });
    expect(count).toBe(3);
    expect(next.map((r) => r.company)).toEqual(["Kajaria", "Kajaria", "Kajaria"]);
  });

  it("fills only selected ids", () => {
    const rows = [tile(1, { company: "" }), tile(2, { company: "" }), tile(3, { company: "" })];
    const { rows: next, count } = applyColumnFill({
      rows, field: "company", value: "Somany", mode: "selected", selectedIds: [2, 3],
    });
    expect(count).toBe(2);
    expect(next[0].company).toBe("");
    expect(next[1].company).toBe("Somany");
    expect(next[2].company).toBe("Somany");
  });

  it("does not write size onto sanitary in all mode", () => {
    const rows = [tile(1, { size: "" }), sanitary(2)];
    const { rows: next, count } = applyColumnFill({
      rows, field: "size", value: "2x4 ft", mode: "all",
    });
    expect(count).toBe(1);
    expect(next[0].size).toBe("2x4 ft");
    expect(next[1].size).toBe("");
  });

  it("does not fill box onto a stone row", () => {
    const rows = [
      tile(1, { category: "tiles", unit: UNIT_BOX }),
      {
        id: 2, name: "S2", category: "natural_stone", unit: "sqft",
        size: "", piecesPerBox: 1, company: "", qty: "10", price: "",
        allowedUnits: ["sqft", "sqm"],
      },
    ];
    const { rows: next } = applyColumnFill({
      rows, field: "unit", value: UNIT_BOX, mode: "all",
    });
    expect(next[0].unit).toBe(UNIT_BOX);
    expect(next[1].unit).toBe("sqft");
    expect(next[1].allowedUnits).toEqual(["sqft", "sqm"]);
  });
});

describe("fillDownFrom", () => {
  it("copies from current cell to eligible rows below", () => {
    const rows = [
      tile(1, { piecesPerBox: 6 }),
      tile(2, { piecesPerBox: 1 }),
      sanitary(3),
      tile(4, { piecesPerBox: "" }),
    ];
    const { rows: next, count } = fillDownFrom({
      rows, field: "piecesPerBox", startIndex: 0, selectedIds: [],
    });
    expect(count).toBe(2);
    expect(next[1].piecesPerBox).toBe("6");
    expect(next[2].piecesPerBox).toBe(1);
    expect(next[3].piecesPerBox).toBe("6");
  });

  it("copies top of selection down the selection only", () => {
    const rows = [
      tile(1, { company: "Alpha" }),
      tile(2, { company: "keep" }),
      tile(3, { company: "" }),
      tile(4, { company: "" }),
    ];
    const { rows: next, count } = fillDownFrom({
      rows, field: "company", startIndex: 1, selectedIds: [2, 3],
    });
    expect(count).toBe(1);
    expect(next[0].company).toBe("Alpha");
    expect(next[1].company).toBe("keep");
    expect(next[2].company).toBe("keep");
    expect(next[3].company).toBe("");
  });
});

describe("helpers", () => {
  it("selectedRowIds and hasColumnRange", () => {
    const rows = [tile(1), tile(2), tile(3)];
    expect(selectedRowIds(rows, 2, 0)).toEqual([1, 2, 3]);
    expect(hasColumnRange({ startIndex: 0, endIndex: 2 })).toBe(true);
    expect(hasColumnRange({ startIndex: 1, endIndex: 1 })).toBe(false);
  });

  it("mapExtractedPiecesPerBox blanks dummy 1 on tiles", () => {
    expect(mapExtractedPiecesPerBox("box", 1)).toBe("");
    expect(mapExtractedPiecesPerBox("box", 6)).toBe(6);
    expect(mapExtractedPiecesPerBox("piece", 1)).toBe(1);
  });

  it("formatFillToast names pcs/box", () => {
    expect(formatFillToast(12, "piecesPerBox", "6")).toBe("12 tiles pe 6 pcs/box");
  });
});
