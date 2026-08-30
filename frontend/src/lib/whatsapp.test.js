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
  expect(url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
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
    invoiceNo: "GST12",
    grandTotal: 1500,
    amountPaid: 500,
    amountPending: 1000,
  });
  expect(bill).toContain("Shree Tiles");
  expect(bill).toContain("Bill GST12");
  expect(bill).toContain("Total: Rs");
  expect(bill).toContain("Paid: Rs");
  expect(bill).toContain("Udhari: Rs");
  expect(bill).toContain("Dhanyavaad.");
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
  expect(ret).toContain("Return RET1");
  expect(ret).toContain("udhari Rs");
  expect(ret).not.toContain("₹");

  const vusool = buildVusoolWaText({
    shopName: "Shree Tiles",
    amount: 300,
    mode: "online",
    remainingUdhari: 700,
  });
  expect(vusool).toContain("Udhari vusool");
  expect(vusool).toContain("(online)");
  expect(vusool).toContain("Baaki: Rs");
  expect(vusool).not.toContain("₹");

  const ping = buildCustomerPingWaText({
    shopName: "Shree Tiles",
    customerName: "Ramesh",
    udhari: 400,
  });
  expect(ping).toContain("Ramesh");
  expect(ping).toContain("Udhari: Rs");
});

test("openWhatsAppTab uses a preopened tab and closes it when there is no URL", () => {
  const tab = { location: "about:blank", close: jest.fn() };
  const opened = openWhatsAppTab({
    phone: "9876543210",
    text: "hello",
    preopened: tab,
  });
  expect(opened.opened).toBe(true);
  expect(opened.blocked).toBe(false);
  expect(tab.location).toMatch(/^https:\/\/wa\.me\/919876543210/);
  expect(tab.close).not.toHaveBeenCalled();

  const blank = { location: "about:blank", close: jest.fn() };
  const skipped = openWhatsAppTab({ phone: "98765", text: "hello", preopened: blank });
  expect(skipped.opened).toBe(false);
  expect(skipped.url).toBeNull();
  expect(blank.close).toHaveBeenCalled();
});

test("openWhatsAppTab reports blocked when window.open returns null", () => {
  const orig = window.open;
  window.open = jest.fn(() => null);
  const result = openWhatsAppTab({ phone: "9876543210", text: "hi" });
  expect(result.opened).toBe(false);
  expect(result.blocked).toBe(true);
  expect(result.url).toMatch(/^https:\/\/wa\.me\/919876543210/);
  window.open = orig;
});

test("beginWhatsAppOpen does not open a tab when the shop toggle is off", () => {
  window.open = jest.fn(() => ({ location: "about:blank", close: jest.fn() }));
  expect(beginWhatsAppOpen({ whatsappAfterSave: false }, "9876543210")).toBeNull();
  expect(beginWhatsAppOpen({ whatsappAfterSave: true }, "98765")).toBeNull();
  expect(window.open).not.toHaveBeenCalled();
  const tab = beginWhatsAppOpen({ whatsappAfterSave: true }, "9876543210");
  expect(window.open).toHaveBeenCalledWith("about:blank", "_blank");
  expect(tab).toBeTruthy();
});
