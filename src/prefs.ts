export type Prefs = { mistakes: boolean; timer: boolean };
const key = "sansdoku:prefs:v1";
let prefs: Prefs = { mistakes: true, timer: false };
try {
  const v = JSON.parse(localStorage.getItem(key) || "null");
  if (v && typeof v === "object")
    prefs = {
      mistakes: typeof v.mistakes === "boolean" ? v.mistakes : true,
      timer: typeof v.timer === "boolean" ? v.timer : false,
    };
} catch {}
export const getPrefs = (): Prefs => prefs;
export function setPref(name: keyof Prefs, value: boolean) {
  prefs = { ...prefs, [name]: value };
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {}
}
