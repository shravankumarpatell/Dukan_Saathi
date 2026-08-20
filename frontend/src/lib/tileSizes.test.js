import { normalizeTileSize, formatTileSize, proposeCustomTileSize, tileSizeToInches } from "./tileSizes";

describe("normalizeTileSize", () => {
  it("treats bare 2x2 / 2*2 as feet, not inches", () => {
    expect(normalizeTileSize("2*2")).toBe("2x2 ft");
    expect(normalizeTileSize("2x2")).toBe("2x2 ft");
    expect(normalizeTileSize("2×2")).toBe("2x2 ft");
    expect(normalizeTileSize("600x600")).toBe("2x2 ft");
    expect(normalizeTileSize("24x24")).toBe("2x2 ft");
  });

  it("treats 12x18 / 12*18 as inches, not feet", () => {
    expect(normalizeTileSize("12*18")).toBe("12x18 in");
    expect(normalizeTileSize("12x18")).toBe("12x18 in");
    expect(normalizeTileSize("300x450")).toBe("12x18 in");
    expect(normalizeTileSize("1x1.5 ft")).toBe("12x18 in");
  });

  it("maps 2x4 and 1x1 in shop feet language", () => {
    expect(normalizeTileSize("2x4")).toBe("2x4 ft");
    expect(normalizeTileSize("1x1")).toBe("1x1 ft");
    expect(normalizeTileSize("8x12")).toBe("8x12 in");
    expect(normalizeTileSize("12x24")).toBe("12x24 in");
    expect(normalizeTileSize("60*120")).toBe("2x4 ft");
    expect(normalizeTileSize("60x120")).toBe("2x4 ft");
  });

  it("returns empty for unknown or sanitary-blank", () => {
    expect(normalizeTileSize("")).toBe("");
    expect(normalizeTileSize("basin")).toBe("");
    expect(normalizeTileSize("2x2 in")).toBe("");
  });

  it("formatTileSize keeps a one-off string", () => {
    expect(formatTileSize("2*2")).toBe("2x2 ft");
    expect(formatTileSize("odd-size")).toBe("odd-size");
  });

  it("proposes a custom size when the list does not have it", () => {
    expect(proposeCustomTileSize("2x2")).toBeNull();
    const custom = proposeCustomTileSize("15x15");
    expect(custom).toMatchObject({ value: "15x15 in", group: "Custom" });
    expect(custom.mm[0]).toBeGreaterThan(370);
  });

  it("converts 2x2 ft to inches for sq-ft math", () => {
    const { tileLenInch, tileWidInch } = tileSizeToInches("2x2 ft");
    expect(tileLenInch).toBeCloseTo(600 / 25.4, 5);
    expect(tileWidInch).toBeCloseTo(600 / 25.4, 5);
  });
});
