import { itemAmount, round2 } from "./calc";
import {
  convertAreaRate,
  formatArea,
  isSlabProduct,
  measurementsPayload,
  rowAreaSqft,
  slabLineQtyRate,
  totalArea,
} from "./slab";
import { SQM_TO_SQFT } from "./uom";

const SHEET_ROWS = [
  { length: 8, width: 8.25 },
  { length: 9.5, width: 9.75 },
  { length: 10, width: 10 },
];

describe("rowAreaSqft feet", () => {
  it("matches the estimate sheet cells", () => {
    expect(rowAreaSqft(8, 8.25, "ft")).toBe(66);
    expect(rowAreaSqft(9.5, 9.75, "ft")).toBe(92.625);
    expect(rowAreaSqft(10, 10, "ft")).toBe(100);
  });
});

describe("sheet total", () => {
  it("258.625 × ₹45 = ₹11,638.13", () => {
    const area = totalArea(SHEET_ROWS, "ft", "sqft");
    expect(area).toBe(258.625);
    expect(area * 45).toBeCloseTo(11638.125, 6);
    expect(round2(area * 45)).toBe(11638.13);
    expect(itemAmount({
      qty: area, rate: 45, unit: "sqft", productUnit: "sqft",
    })).toBe(11638.13);
  });
});

describe("cm → sq.ft", () => {
  it("8.25 × 9.75 cm is about 0.087 sq.ft", () => {
    const a = rowAreaSqft(8.25, 9.75, "cm");
    expect(a).toBeCloseTo((8.25 * 9.75) / 929.0304, 10);
    expect(Math.round(a * 1000) / 1000).toBe(0.087);
    expect(formatArea(a)).toBe("0.087");
  });
});

describe("area unit toggle", () => {
  it("converts total to sq.m", () => {
    const sqft = totalArea(SHEET_ROWS, "ft", "sqft");
    const sqm = totalArea(SHEET_ROWS, "ft", "sqm");
    expect(sqm).toBeCloseTo(sqft / SQM_TO_SQFT, 10);
  });

  it("keeps amount when rate is ₹/sq.m on a sq.ft SKU", () => {
    const product = { unit: "sqft", category: "natural_stone" };
    const { qty, unit, rate } = slabLineQtyRate({
      rows: SHEET_ROWS,
      measureUnit: "ft",
      areaUnit: "sqm",
      product,
      uiRate: 45 * SQM_TO_SQFT,
    });
    expect(unit).toBe("sqft");
    expect(qty).toBeCloseTo(258.625, 4);
    expect(itemAmount({ qty, rate, unit, productUnit: "sqft" })).toBe(11638.13);
  });

  it("converts displayed rate sq.ft ↔ sq.m", () => {
    expect(convertAreaRate(45, "sqft", "sqm")).toBeCloseTo(45 * SQM_TO_SQFT, 6);
    expect(convertAreaRate(45 * SQM_TO_SQFT, "sqm", "sqft")).toBeCloseTo(45, 6);
  });
});

describe("isSlabProduct", () => {
  it("is true only for stone categories", () => {
    expect(isSlabProduct({ category: "natural_stone" })).toBe(true);
    expect(isSlabProduct({ category: "engineered_stone" })).toBe(true);
    expect(isSlabProduct({ category: "stone" })).toBe(true);
    expect(isSlabProduct({ category: "tiles" })).toBe(false);
    expect(isSlabProduct({ unit: "sqft" })).toBe(false);
  });
});

describe("measurementsPayload", () => {
  it("drops empty rows and stores computed area", () => {
    const payload = measurementsPayload(
      [...SHEET_ROWS, { length: "", width: "" }, { length: 0, width: 4 }],
      "ft",
    );
    expect(payload).toHaveLength(3);
    expect(payload[0]).toEqual({ length: 8, width: 8.25, area: 66 });
    expect(payload[1].area).toBe(92.625);
  });
});
