import { itemAmount } from "./calc";
import {
  fromProductUnit,
  sqftPerBox,
  sqftPerPiece,
  toProductUnit,
  usesPieceStock,
} from "./uom";

const kajaria = { unit: "box", size: "2x2 ft", piecesPerBox: 4, category: "tiles" };

describe("Kajaria 2x2 ft", () => {
  it("uses nominal 4 sq.ft / piece, 16 sq.ft / box", () => {
    expect(sqftPerPiece(kajaria)).toBe(4);
    expect(sqftPerBox(kajaria)).toBe(16);
  });

  it("20 box @ ₹800 = ₹16000", () => {
    expect(itemAmount({ ...kajaria, qty: 20, rate: 800, unit: "box", pieces: 0 })).toBe(16000);
  });

  it("8 piece @ ₹800/box = ₹1600", () => {
    expect(itemAmount({ ...kajaria, qty: 8, rate: 800, unit: "piece", productUnit: "box" })).toBe(1600);
  });

  it("16 sq.ft = 1 box = ₹800", () => {
    expect(toProductUnit(kajaria, "sqft", 16)).toBe(1);
    expect(itemAmount({ ...kajaria, qty: 16, rate: 800, unit: "sqft", productUnit: "box" })).toBe(800);
  });

  it("150 sq.ft = 9.375 box = ₹7500", () => {
    expect(toProductUnit(kajaria, "sqft", 150)).toBe(9.375);
    expect(itemAmount({ ...kajaria, qty: 150, rate: 800, unit: "sqft", productUnit: "box" })).toBe(7500);
  });
});

describe("pipe and bag", () => {
  it("10 ft of meter-priced pipe", () => {
    const pipe = { unit: "mtr", category: "plumbing_construction" };
    const m = toProductUnit(pipe, "ft", 10);
    expect(m).toBeCloseTo(10 / 3.280839895, 6);
    expect(itemAmount({ qty: 10, unit: "ft", rate: 100, productUnit: "mtr" })).toBeCloseTo(m * 100, 2);
  });

  it("10 kg of 20 kg bag @ ₹400/bag = ₹200", () => {
    const bag = { unit: "bag", packQty: 20, category: "tile_installation" };
    expect(toProductUnit(bag, "kg", 10)).toBe(0.5);
    expect(itemAmount({ qty: 10, unit: "kg", rate: 400, productUnit: "bag", packQty: 20 })).toBe(200);
  });

  it("sanitary qty * rate", () => {
    expect(itemAmount({ qty: 5, rate: 100, unit: "piece" })).toBe(500);
  });
});

describe("fromProductUnit", () => {
  it("1 box → 16 sq.ft", () => {
    expect(fromProductUnit(kajaria, "sqft", 1)).toBe(16);
  });
});

describe("usesPieceStock", () => {
  it("reads productUnit on a sq.ft line", () => {
    expect(usesPieceStock({ unit: "sqft", productUnit: "box" })).toBe(true);
    expect(usesPieceStock({ unit: "mtr" })).toBe(false);
  });
});
