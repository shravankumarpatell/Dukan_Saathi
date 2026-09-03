import {
  UNIT_BOX, UNIT_PIECE,
  applyCatalogCategoryChange, applyCatalogUnitChange, normalizeProductUnitFields, productMetaLine,
  isTileOnlyCatalogField, unitKindChipClass, CONTRACTOR_CHIP, formatQtyLabel,
  catalogShowsSize, catalogShowsPpb, isSlabProduct,
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

describe("qty labels", () => {
  it("renders sq.ft and meters", () => {
    expect(formatQtyLabel({ qty: 16, unit: "sqft" })).toBe("16 sq.ft");
    expect(formatQtyLabel({ qty: 20, unit: "box" })).toBe("20 box");
    expect(formatQtyLabel({ qty: 2, pieces: 3, unit: "box" })).toBe("2 box + 3 pc");
    expect(formatQtyLabel({ qty: 5, unit: "piece" })).toBe("5 pcs");
  });

  it("stone SKUs bill in remaining sq.ft, not tile size", () => {
    expect(catalogShowsSize({ category: "natural_stone", unit: "sqft" })).toBe(false);
    expect(catalogShowsSize({ category: "engineered_stone", unit: "sqft" })).toBe(false);
    expect(isSlabProduct({ category: "natural_stone" })).toBe(true);
    expect(formatQtyLabel({ qty: 562.75, unit: "sqft" })).toBe("562.75 sq.ft");
  });
});

describe("applyCatalogCategoryChange", () => {
  it("snaps tiles + box to stone sq.ft and drops box from the unit list", () => {
    const next = applyCatalogCategoryChange(
      {
        category: "tiles",
        unit: UNIT_BOX,
        size: "2x2 ft",
        piecesPerBox: 4,
        allowedUnits: ["box", "piece", "sqft"],
      },
      "natural_stone",
    );
    expect(next.category).toBe("natural_stone");
    expect(next.unit).toBe("sqft");
    expect(next.allowedUnits).toEqual(["sqft", "sqm"]);
    expect(next.allowedUnits).not.toContain("box");
    expect(next.size).toBe("");
    expect(catalogShowsPpb(next)).toBe(false);
    expect(catalogShowsSize(next)).toBe(false);
  });

  it("keeps sq.ft when a tile already priced per sq.ft becomes stone", () => {
    const next = applyCatalogCategoryChange(
      { category: "tiles", unit: "sqft", size: "2x2 ft" },
      "natural_stone",
    );
    expect(next.unit).toBe("sqft");
    expect(next.allowedUnits).toEqual(["sqft", "sqm"]);
  });

  it("snaps sanitary piece to stone sq.ft", () => {
    const next = applyCatalogCategoryChange(
      { category: "sanitaryware", unit: UNIT_PIECE },
      "engineered_stone",
    );
    expect(next.category).toBe("engineered_stone");
    expect(next.unit).toBe("sqft");
    expect(next.allowedUnits).toEqual(["sqft", "sqm"]);
  });
});
