export type Prefs = { mistakes: boolean; timer: boolean; advance: boolean; sound: boolean };
const key = "sansdoku:prefs:v1";
const defaults: Prefs = { mistakes: true, timer: false, advance: false, sound: true };
let prefs: Prefs = { ...defaults };
try {
  const v = JSON.parse(localStorage.getItem(key) || "null");
  if (v && typeof v === "object")
    for (const name of Object.keys(defaults) as (keyof Prefs)[])
      if (typeof v[name] === "boolean") prefs[name] = v[name];
} catch {}
export const getPrefs = (): Prefs => prefs;
export function setPref(name: keyof Prefs, value: boolean) {
  prefs = { ...prefs, [name]: value };
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {}
}
