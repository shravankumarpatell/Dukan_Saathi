import { billShareToken, isShareToken, publicBillUrl } from "./billLink";

const token = "abcdefghijklmnopqrstuvwx";

test("publicBillUrl uses the site origin and rejects a short or unsafe token", () => {
  expect(isShareToken(token)).toBe(true);
  expect(isShareToken("short")).toBe(false);
  expect(publicBillUrl(token, "https://shop.example/")).toBe(`https://shop.example/b/${token}`);
  expect(publicBillUrl("GST12", "https://shop.example")).toBe("");
  expect(publicBillUrl(token, "javascript:alert(1)")).toBe("");
});

test("billShareToken reads only /b/<token>", () => {
  expect(billShareToken(`/b/${token}`)).toBe(token);
  expect(billShareToken(`/b/${token}/`)).toBe(token);
  expect(billShareToken("/bill")).toBeNull();
  expect(billShareToken("/b/short")).toBe("");
  expect(billShareToken(`/b/${encodeURIComponent(token)}`)).toBe(token);
});
