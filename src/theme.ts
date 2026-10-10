export type Theme = "system" | "light" | "dark";
const preference = matchMedia("(prefers-color-scheme: dark)");
let theme: Theme = "system";
try {
  const saved = localStorage.getItem("sansdoku:theme");
  if (saved === "light" || saved === "dark") theme = saved;
} catch {
  /* System appearance still works without storage. */
}
function apply() {
  const dark = theme === "dark" || (theme === "system" && preference.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#1c2420" : "#f7f5ef");
}
export function getTheme() {
  return theme;
}
export function setTheme(value: Theme) {
  theme = value;
  try {
    localStorage.setItem("sansdoku:theme", value);
  } catch {}
  apply();
}
preference.addEventListener("change", apply);
apply();
