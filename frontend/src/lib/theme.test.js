import { applyTheme, readStoredTheme, THEME_KEY } from "./theme";

test("applyTheme persists dark and light without a system option", () => {
  document.documentElement.classList.remove("dark");
  applyTheme("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  expect(readStoredTheme()).toBe("dark");

  applyTheme("light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(localStorage.getItem(THEME_KEY)).toBe("light");
  expect(readStoredTheme()).toBe("light");
});
