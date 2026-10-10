import {
  beginWhatsAppOpen,
  buildBillWaText,
  buildCustomerPingWaText,
  buildReturnWaText,
  buildVusoolWaText,
  firstNonEmptyPhone,
  indianMobileDigits,
  openWhatsAppTab,
  shopWantsWhatsApp,
  shouldAutoOpenWhatsApp,
  waMeUrl,
} from "./whatsapp";

test("indianMobileDigits keeps a 10-digit mobile and strips 91 / leading 0", () => {
  expect(indianMobileDigits("9876543210")).toBe("9876543210");
  expect(indianMobileDigits("+91 98765 43210")).toBe("9876543210");
  expect(indianMobileDigits("919876543210")).toBe("9876543210");
  expect(indianMobileDigits("09876543210")).toBe("9876543210");
  expect(indianMobileDigits("987654321")).toBe("");
  expect(indianMobileDigits("98765")).toBe("");
  expect(indianMobileDigits("")).toBe("");
  expect(indianMobileDigits(null)).toBe("");
  expect(indianMobileDigits("1234567890")).toBe("");
});

test("waMeUrl encodes text and returns null when phone is empty or incomplete", () => {
  expect(waMeUrl("", "hello")).toBeNull();
  expect(waMeUrl("98765", "hello")).toBeNull();
  const url = waMeUrl("9876543210", "Bill GST1\nTotal: Rs 1,000");
  expect(url).toMatch(/^whatsapp:\/\/send\?phone=919876543210&text=/);
  expect(url).toContain(encodeURIComponent("Bill GST1\nTotal: Rs 1,000"));
  expect(url).not.toContain("₹");
});

test("firstNonEmptyPhone prefers the typed value even when it is incomplete", () => {
  expect(firstNonEmptyPhone("98765", "9876543210")).toBe("98765");
  expect(firstNonEmptyPhone("", "  ", "9876543210")).toBe("9876543210");
  expect(firstNonEmptyPhone(null, undefined, "")).toBe("");
});

test("shop toggle defaults on and skips auto-open without a valid mobile", () => {
  expect(shopWantsWhatsApp(undefined)).toBe(true);
  expect(shopWantsWhatsApp({})).toBe(true);
  expect(shopWantsWhatsApp({ whatsappAfterSave: true })).toBe(true);
  expect(shopWantsWhatsApp({ whatsappAfterSave: false })).toBe(false);
  expect(shouldAutoOpenWhatsApp({ whatsappAfterSave: true }, "9876543210")).toBe(true);
  expect(shouldAutoOpenWhatsApp({ whatsappAfterSave: true }, "98765")).toBe(false);
  expect(shouldAutoOpenWhatsApp({ whatsappAfterSave: false }, "9876543210")).toBe(false);
});

test("Hinglish templates use Rs not rupee sign", () => {
  const bill = buildBillWaText({
    shopName: "Shree Tiles",
    customerName: "Geeta",
    invoiceNo: "GST12",
    grandTotal: 1500,
    amountPaid: 500,
    amountPending: 1000,
  });
  expect(bill).toContain("Namaste");
  expect(bill).toContain("Geeta");
  expect(bill).toContain("Shree Tiles");
  expect(bill).toContain("GST12");
  expect(bill).toContain("Total:");
  expect(bill).toContain("Rs");
  expect(bill).not.toContain("₹");

  const paidUp = buildBillWaText({
    shopName: "Shree Tiles",
    invoiceNo: "GST13",
    grandTotal: 500,
    amountPaid: 500,
    amountPending: 0,
  });
  expect(paidUp).not.toMatch(/Udhari/);

  const ret = buildReturnWaText({
    shopName: "Shree Tiles",
    invoiceNo: "RET1",
    amount: 200,
    settlement: "adjust_udhari",
    settlementDetail: { cash: 0, udhariAdjusted: 200, storeCredit: 0 },
  });
  expect(ret).toContain("Return: RET1");
  expect(ret).toContain("Udhari Adjusted:");
  expect(ret).toContain("Rs");
  expect(ret).not.toContain("₹");

  const vusool = buildVusoolWaText({
    shopName: "Shree Tiles",
    amount: 300,
    mode: "online",
    remainingUdhari: 700,
  });
  expect(vusool).toContain("Payment Received");
  expect(vusool).toContain("(online)");
  expect(vusool).toContain("Remaining Udhari:");
  expect(vusool).toContain("Rs");
  expect(vusool).not.toContain("₹");

  const ping = buildCustomerPingWaText({
    shopName: "Shree Tiles",
    customerName: "Ramesh",
    udhari: 400,
  });
  expect(ping).toContain("Ramesh");
  expect(ping).toContain("Udhari Amount:");
  expect(ping).toContain("Rs");
});

test("bill message writes a real invoice link and skips an unsafe url", () => {
  const link = "https://shop.example/b/abcdefghijklmnopqrstuvwx";
  const linked = buildBillWaText({
    shopName: "Shree Tiles",
    customerName: "Geeta",
    invoiceNo: "GST12",
    grandTotal: 1500,
    amountPaid: 500,
    amountPending: 1000,
    pdfUrl: link,
  });
  expect(linked).toContain("Your invoice PDF:");
  expect(linked).toContain(link);
  expect(linked).not.toMatch(/attached/i);

  const blocked = buildBillWaText({
    shopName: "Shree Tiles",
    invoiceNo: "GST12",
    grandTotal: 1,
    amountPaid: 1,
    amountPending: 0,
    pdfUrl: "javascript:alert(1)",
  });
  expect(blocked).not.toContain("javascript:");
  expect(blocked).not.toContain("Your invoice PDF:");
});

test("openWhatsAppTab launches the desktop app and closes a leftover blank tab", () => {
  const open = jest.spyOn(window, "open");
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const tab = { location: "about:blank", close: jest.fn() };
  const opened = openWhatsAppTab({
    phone: "9876543210",
    text: "hello",
    preopened: tab,
  });
  expect(opened.opened).toBe(true);
  expect(opened.blocked).toBe(false);
  expect(opened.url).toMatch(/^whatsapp:\/\/send\?phone=919876543210/);
  expect(tab.location).toBe("about:blank");
  expect(tab.close).toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  expect(click).toHaveBeenCalled();

  const blank = { location: "about:blank", close: jest.fn() };
  const skipped = openWhatsAppTab({ phone: "98765", text: "hello", preopened: blank });
  expect(skipped.opened).toBe(false);
  expect(skipped.url).toBeNull();
  expect(blank.close).toHaveBeenCalled();
  open.mockRestore();
  click.mockRestore();
});

test("openWhatsAppTab does not open a browser tab", () => {
  const open = jest.spyOn(window, "open");
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const result = openWhatsAppTab({ phone: "9876543210", text: "hi" });
  expect(result.opened).toBe(true);
  expect(result.blocked).toBe(false);
  expect(result.url).toMatch(/^whatsapp:\/\/send\?phone=919876543210/);
  expect(open).not.toHaveBeenCalled();
  open.mockRestore();
  click.mockRestore();
});

test("beginWhatsAppOpen never opens a browser tab", () => {
  window.open = jest.fn(() => ({ location: "about:blank", close: jest.fn() }));
  expect(beginWhatsAppOpen({ whatsappAfterSave: false }, "9876543210")).toBeNull();
  expect(beginWhatsAppOpen({ whatsappAfterSave: true }, "9876543210")).toBeNull();
  expect(window.open).not.toHaveBeenCalled();
});
