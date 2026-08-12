// Demo seed data for tiles & sanitaryware showroom, used in DEMO mode (no Firebase).
export function seedData() {
  const now = Date.now();
  const day = 86400000;
  const iso = (offset) => new Date(now - offset * day).toISOString();

  const products = [
    { id: "p1", name: "2130 Highlight", code: "2130", company: "Kajaria", size: "2x2 ft", unit: "box", piecesPerBox: 4, sellPrice: 450, stockQty: 160, lowStockThreshold: 25 },
    { id: "p2", name: "3420 Highlight Blue", code: "3420B", company: "Somany", size: "1x1 ft", unit: "box", piecesPerBox: 9, sellPrice: 300, stockQty: 16, lowStockThreshold: 20 },
    { id: "p3", name: "3420 Highlight Yellow", code: "3420Y", company: "Somany", size: "1x1 ft", unit: "box", piecesPerBox: 9, sellPrice: 300, stockQty: 62, lowStockThreshold: 20 },
    { id: "p4", name: "Marble Finish Floor Tile", code: "MF24", company: "Kajaria", size: "2x4 ft", unit: "box", piecesPerBox: 2, sellPrice: 820, stockQty: 85, lowStockThreshold: 15 },
    { id: "p5", name: "Wash Basin Ivory", code: "WB-IV", company: "Cera", size: "", unit: "piece", piecesPerBox: 1, sellPrice: 1400, stockQty: 16, lowStockThreshold: 5 },
    { id: "p6", name: "One Piece Closet", code: "OPC-01", company: "Hindware", size: "", unit: "piece", piecesPerBox: 1, sellPrice: 7200, stockQty: 7, lowStockThreshold: 3 },
    { id: "p7", name: "Wall Tile Glossy White", code: "WTGW", company: "Nitco", size: "1x1.5 ft", unit: "box", piecesPerBox: 6, sellPrice: 260, stockQty: 140, lowStockThreshold: 20 },
  ];

  const customers = [
    { id: "c1", name: "Ashok Kumar", phone: "9876543210", isContractor: true, siteNote: "Green Valley Villa, Plot 12", totalPending: 12500, storeCredit: 0 },
    { id: "c2", name: "Ramesh Traders", phone: "9812345678", isContractor: false, siteNote: "", totalPending: 0, storeCredit: 2000 },
    { id: "c3", name: "Suresh", phone: "", isContractor: false, siteNote: "", totalPending: 3200, storeCredit: 0 },
    { id: "c4", name: "Ashok Singh", phone: "9900112233", isContractor: true, siteNote: "Sunrise Apartments", totalPending: 0, storeCredit: 1500 },
  ];

  const invoices = [
    { id: "i1", invoiceNo: "GST20260001", date: iso(1), type: "sale", customerId: "c1", customerName: "Ashok Kumar",
      items: [{ productId: "p1", name: "2130 Highlight", qty: 10, unit: "box", rate: 450, amount: 4500 }],
      discount: null, gstEnabled: true, gstRate: 18,
      subtotal: 4500, discountOff: 0, gstAmount: 810, grandTotal: 5310,
      payments: [{ mode: "cash", amount: 3000 }], amountPaid: 3000, amountPending: 2310, paymentStatus: "partial",ewayRequired: false, createdVia: "manual" },
    { id: "i2", invoiceNo: "GST20260002", date: iso(0), type: "sale", customerId: "c2", customerName: "Ramesh Traders",
      items: [{ productId: "p4", name: "Marble Finish Floor Tile", qty: 20, unit: "box", rate: 820, amount: 16400 }],
      discount: { type: "percent", value: 5 }, gstEnabled: true, gstRate: 18,
      subtotal: 16400, discountOff: 820, gstAmount: 2804.4, grandTotal: 18384.4,
      payments: [{ mode: "online", amount: 18384.4 }], amountPaid: 18384.4, amountPending: 0, paymentStatus: "paid",ewayRequired: false, createdVia: "voice" },
    { id: "i3", invoiceNo: "GST20260003", date: iso(0), type: "sale", customerId: "c3", customerName: "Suresh",
      items: [{ productId: "p5", name: "Wash Basin Ivory", qty: 2, unit: "piece", rate: 1400, amount: 2800 }],
      discount: null, gstEnabled: true, gstRate: 18,
      subtotal: 2800, discountOff: 0, gstAmount: 504, grandTotal: 3304,
      payments: [{ mode: "cash", amount: 1000 }], amountPaid: 1000, amountPending: 2304, paymentStatus: "partial",ewayRequired: false, createdVia: "manual" },
    { id: "i4", invoiceNo: "GST20260004", date: iso(5), type: "sale", customerId: "c4", customerName: "Ashok Singh",
      items: [{ productId: "p6", name: "One Piece Closet", qty: 3, unit: "piece", rate: 7200, amount: 21600 }],
      discount: null, gstEnabled: true, gstRate: 18,
      subtotal: 21600, discountOff: 0, gstAmount: 3888, grandTotal: 25488,
      payments: [{ mode: "online", amount: 25488 }], amountPaid: 25488, amountPending: 0, paymentStatus: "paid",ewayRequired: false, createdVia: "manual" },
    { id: "i5", invoiceNo: "GST20260005", date: iso(12), type: "sale", customerId: "c1", customerName: "Ashok Kumar",
      items: [{ productId: "p1", name: "2130 Highlight", qty: 30, unit: "box", rate: 450, amount: 13500 }, { productId: "p7", name: "Wall Tile Glossy White", qty: 15, unit: "box", rate: 260, amount: 3900 }],
      discount: null, gstEnabled: true, gstRate: 18,
      subtotal: 17400, discountOff: 0, gstAmount: 3132, grandTotal: 20532,
      payments: [{ mode: "cash", amount: 10000 }], amountPaid: 10000, amountPending: 10532, paymentStatus: "partial",ewayRequired: false, createdVia: "voice" },
  ];

  const expenses = [
    { id: "e1", date: iso(0), amount: 500, note: "Tea & snacks", mode: "cash" },
    { id: "e2", date: iso(0), amount: 1200, note: "Loading labour", mode: "cash" },
  ];

  const stockLedger = [
    { id: "l1", productId: "p1", change: -10, reason: "sale", invoiceId: "i1", timestamp: iso(1) },
    { id: "l2", productId: "p4", change: -20, reason: "sale", invoiceId: "i2", timestamp: iso(0) },
  ];

  const returns = [];

  return { products, customers, invoices, expenses, stockLedger, returns, meta: { invoiceSeq: 6 } };
}
