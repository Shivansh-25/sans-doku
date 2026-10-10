import { canUseSans } from "./profile";
export type Theme = "system" | "light" | "dark" | "sans";
const preference = matchMedia("(prefers-color-scheme: dark)");
let theme: Theme = "system";
try {
  const saved = localStorage.getItem("sansdoku:theme");
  if (
    saved === "light" ||
    saved === "dark" ||
    (saved === "sans" && canUseSans())
  )
    theme = saved;
} catch {
  /* System appearance still works without storage. */
}
function apply() {
  const dark = theme === "dark" || (theme === "system" && preference.matches);
  document.documentElement.dataset.theme =
    theme === "sans" ? "sans" : dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      theme === "sans" ? "#fff1f6" : dark ? "#1c2420" : "#f7f5ef",
    );
}
export function getTheme() {
  return theme;
}
export function setTheme(value: Theme) {
  theme = value === "sans" && !canUseSans() ? "system" : value;
  try {
    localStorage.setItem("sansdoku:theme", theme);
  } catch {}
  apply();
}
preference.addEventListener("change", apply);
apply();
