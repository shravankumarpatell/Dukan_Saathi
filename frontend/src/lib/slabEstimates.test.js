import {
  SLAB_DEFAULT_ROWS,
  SLAB_FORMS_KEY,
  SLAB_PENDING_BILL_KEY,
  clampRowCount,
  consumePendingSlabBill,
  deleteSlabForm,
  emptySlabForm,
  loadSavedSlabForms,
  saveSlabForm,
  setPendingSlabBill,
  slabFormHasPieces,
  slabFormToBillLine,
} from "./slabEstimates";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("slabEstimates storage", () => {
  it("clamps row counts", () => {
    expect(clampRowCount(0)).toBe(1);
    expect(clampRowCount(10)).toBe(10);
    expect(clampRowCount(900)).toBe(700);
  });

  it("saves, lists, and deletes forms", () => {
    const saved = saveSlabForm({
      ...emptySlabForm(),
      partyName: "skp",
      quality: "P-white",
      rows: [{ length: "8", width: "8.25" }],
      rate: "45",
    });
    expect(saved.id).toBeTruthy();
    expect(saved.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(loadSavedSlabForms()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(SLAB_FORMS_KEY))).toHaveLength(1);
    deleteSlabForm(saved.id);
    expect(loadSavedSlabForms()).toHaveLength(0);
  });

  it("dedupes forms with same party, quality, vehicle, and lot", () => {
    const base = {
      ...emptySlabForm(),
      partyName: "Skp",
      quality: "P-white",
      vehicleNo: "RJ46QA0249",
      lotNo: "L-12",
      rows: [{ length: "8", width: "8.25" }],
      rate: "45",
    };
    const first = saveSlabForm(base);
    // Same identity (case/space-insensitive), new object with no id — should update in place.
    const second = saveSlabForm({
      ...base,
      partyName: "  skp ",
      quality: "p-white",
      rate: "50",
    });
    expect(second.id).toBe(first.id);
    const list = loadSavedSlabForms();
    expect(list).toHaveLength(1);
    expect(list[0].rate).toBe("50");

    // A different lot number is a distinct worksheet.
    saveSlabForm({ ...base, lotNo: "L-13" });
    expect(loadSavedSlabForms()).toHaveLength(2);
  });

  it("hands a line to New Bill", () => {
    const form = {
      ...emptySlabForm(),
      partyName: "skp",
      vehicleNo: "RJ46QA0249",
      quality: "P-white",
      rows: [{ length: 8, width: 8.25 }, { length: 9.5, width: 9.75 }, { length: 10, width: 10 }],
      rate: "45",
      measureUnit: "ft",
      areaUnit: "sqft",
    };
    expect(slabFormHasPieces(form)).toBe(true);
    const product = {
      id: "p1",
      name: "P-white",
      unit: "sqft",
      category: "natural_stone",
      packQty: 1,
      allowedUnits: ["sqft", "sqm"],
    };
    const line = slabFormToBillLine(form, product);
    expect(line.productId).toBe("p1");
    expect(line.qty).toBe(258.625);
    expect(line.rate).toBe(45);
    expect(line.measurements).toHaveLength(3);
    expect(line.startingRow).toBe(1);

    setPendingSlabBill({ customerName: "skp", vehicleNo: "RJ46QA0249", items: [line] });
    expect(sessionStorage.getItem(SLAB_PENDING_BILL_KEY)).toBeTruthy();
    const pending = consumePendingSlabBill();
    expect(pending.customerName).toBe("skp");
    expect(pending.items[0].qty).toBe(258.625);
    expect(consumePendingSlabBill()).toBeNull();
  });

  it("starts with a 10-row pad", () => {
    expect(emptySlabForm().rows).toHaveLength(SLAB_DEFAULT_ROWS);
    expect(SLAB_DEFAULT_ROWS).toBe(10);
  });
});
