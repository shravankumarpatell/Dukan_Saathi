import { sortProductsForSearch, searchProducts, searchInvoices } from "./fuzzy";

const products = [
  { id: "a", name: "Alpha", stockQty: 10, unit: "box", piecesPerBox: 4 },
  { id: "b", name: "Beta", stockQty: 5, unit: "box", piecesPerBox: 4 },
  { id: "c", name: "Charlie", stockQty: 0, unit: "box", piecesPerBox: 4 },
  { id: "d", name: "Delta", stockQty: 20, unit: "box", piecesPerBox: 4 },
];

test("sortProductsForSearch ranks in-stock by sales qty then zero-stock last", () => {
  const salesQty = { a: 50, b: 100, c: 200, d: 10 };
  const sorted = sortProductsForSearch(products, salesQty).map((p) => p.id);
  expect(sorted).toEqual(["b", "a", "d", "c"]);
});

test("searchProducts keeps zero-stock at bottom when filtering", () => {
  const salesQty = { a: 1, b: 2, c: 99, d: 3 };
  const sorted = searchProducts(products, "a", salesQty).map((p) => p.id);
  expect(sorted[sorted.length - 1]).toBe("c");
  expect(sorted).toContain("a");
});

test("searchInvoices matches invoice no and customer name", () => {
  const invoices = [
    { id: "1", invoiceNo: "INV20260018", customerName: "azad", type: "sale" },
    { id: "2", invoiceNo: "RET20260013", customerName: "azad", type: "return" },
    { id: "3", invoiceNo: "GST001", customerName: "Ashok Kumar", type: "sale" },
  ];
  expect(searchInvoices(invoices, "INV20260018")[0].id).toBe("1");
  expect(searchInvoices(invoices, "GST001").map((i) => i.id)).toEqual(["3"]);
  expect(searchInvoices(invoices, "azad").map((i) => i.invoiceNo).sort()).toEqual(["INV20260018", "RET20260013"]);
  expect(searchInvoices(invoices, "")).toEqual([]);
});
