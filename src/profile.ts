export type Profile = { id: string; nickname: string; chosen: boolean };
const key = "sansdoku:profile:v1";
let profile: Profile = { id: crypto.randomUUID(), nickname: "", chosen: false };
try {
  const saved = JSON.parse(localStorage.getItem(key) || "null");
  if (
    saved &&
    typeof saved.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      saved.id,
    ) &&
    typeof saved.nickname === "string" &&
    saved.nickname.length <= 24 &&
    !/[\u0000-\u001f\u007f]/.test(saved.nickname) &&
    typeof saved.chosen === "boolean"
  ) {
    profile = saved;
  }
} catch {
  /* A temporary profile still allows play without storage. */
}
try {
  localStorage.setItem(key, JSON.stringify(profile));
} catch {}
export const getProfile = () => profile;
export const canUseSans = () =>
  profile.nickname.trim().toLowerCase() === "sans";
export function setNickname(value: string) {
  const nickname = value.trim();
  if (nickname.length > 24 || /[\u0000-\u001f\u007f]/.test(nickname))
    return false;
  profile = { ...profile, nickname, chosen: true };
  try {
    localStorage.setItem(key, JSON.stringify(profile));
  } catch {}
  return true;
}
