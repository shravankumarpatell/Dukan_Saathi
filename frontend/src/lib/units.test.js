import {
  UNIT_BOX, UNIT_PIECE,
  applyCatalogUnitChange, normalizeProductUnitFields, productMetaLine,
  isTileOnlyCatalogField, unitKindChipClass, CONTRACTOR_CHIP,
} from "./units";
import { itemAmount } from "./calc";

describe("catalog fields by type", () => {
  it("treats size and piecesPerBox as tiles-only", () => {
    expect(isTileOnlyCatalogField("size")).toBe(true);
    expect(isTileOnlyCatalogField("piecesPerBox")).toBe(true);
    expect(isTileOnlyCatalogField("name")).toBe(false);
  });

  it("clears size and forces pcs/box=1 when switching to sanitary", () => {
    const next = applyCatalogUnitChange(
      { unit: UNIT_BOX, size: "2x2 ft", piecesPerBox: 4, name: "Tile" },
      UNIT_PIECE,
    );
    expect(next).toMatchObject({ unit: UNIT_PIECE, size: "", piecesPerBox: 1, name: "Tile" });
  });

  it("drops dummy pcs/box=1 when switching back to tiles", () => {
    const next = applyCatalogUnitChange(
      { unit: UNIT_PIECE, size: "", piecesPerBox: "1" },
      UNIT_BOX,
    );
    expect(next).toMatchObject({ unit: UNIT_BOX, size: "", piecesPerBox: "" });
  });

  it("normalizeProductUnitFields strips sanitary size on save", () => {
    const saved = normalizeProductUnitFields({
      unit: UNIT_PIECE, size: "leftover", piecesPerBox: 8, name: "Basin",
    });
    expect(saved).toMatchObject({ unit: UNIT_PIECE, size: "", piecesPerBox: 1 });
  });

  it("productMetaLine omits size and pcs/box for sanitary", () => {
    const line = productMetaLine({
      code: "WB", company: "Cera", size: "should-hide", unit: UNIT_PIECE, piecesPerBox: 1,
    });
    expect(line).toBe("WB · Cera · Sanitary");
    expect(line).not.toMatch(/pcs\/box|should-hide/);
  });

  it("gives tiles, sanitary, and contractor distinct chip classes", () => {
    expect(unitKindChipClass({ unit: UNIT_BOX })).toBe("ds-chip ds-chip-tile");
    expect(unitKindChipClass({ unit: UNIT_PIECE })).toBe("ds-chip ds-chip-sanitary");
    expect(CONTRACTOR_CHIP).toBe("ds-chip ds-chip-role");
    expect(unitKindChipClass({ unit: UNIT_BOX })).not.toContain("ds-chip-role");
  });
});

describe("itemAmount unit default", () => {
  it("treats missing unit as tiles so loose pieces count", () => {
    expect(itemAmount({ qty: 1, pieces: 2, rate: 400, piecesPerBox: 4 })).toBe(600);
  });

  it("ignores loose pieces for sanitary", () => {
    expect(itemAmount({ qty: 5, pieces: 99, rate: 100, unit: UNIT_PIECE })).toBe(500);
  });
});
