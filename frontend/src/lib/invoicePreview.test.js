import { invoiceShareText, rsAmount } from "./invoicePreview";

test("rsAmount uses Rs and Indian grouping", () => {
  expect(rsAmount(30800)).toBe("Rs 30,800");
  expect(rsAmount(3000.5)).toBe("Rs 3,000.5");
});

test("invoiceShareText describes the bill, not the app", () => {
  const text = invoiceShareText({
    shop: { name: "Aajana trading company" },
    invoice: {
      invoiceNo: "INV20260050",
      customerName: "Geeta",
      grandTotal: 33800,
      amountPaid: 30800,
      amountPending: 3000,
      items: [{ name: "Floor tile", qty: 10, rate: 3380 }],
    },
  });
  expect(text.title).toBe("INV20260050 · Aajana trading company");
  expect(text.description).toContain("Geeta");
  expect(text.description).toContain("Rs 33,800");
  expect(text.description).toContain("Rs 30,800");
  expect(text.description).toContain("Rs 3,000");
  expect(text.description).not.toMatch(/stock sambhalo/i);
  expect(text.items[0].name).toBe("Floor tile");
  expect(text.pending).toBe(true);
});
