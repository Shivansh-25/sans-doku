export type Profile = {
  id: string;
  nickname: string;
  chosen: boolean;
  account?: string;
  deviceId?: string;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
    typeof saved.chosen === "boolean" &&
    (saved.account === undefined || saved.account === "sans") &&
    (saved.deviceId === undefined || uuid.test(saved.deviceId))
  ) {
    profile = saved;
    // The name "sans" belongs to the signed-in account only.
    if (!profile.account && reservedName(profile.nickname))
      profile = { ...profile, nickname: "" };
  }
} catch {
  /* A temporary profile still allows play without storage. */
}
try {
  localStorage.setItem(key, JSON.stringify(profile));
} catch {}
export const getProfile = () => profile;
export const canUseSans = () => profile.account === "sans";
export function reservedName(value: string) {
  return value.trim().toLowerCase() === "sans";
}
function store() {
  try {
    localStorage.setItem(key, JSON.stringify(profile));
  } catch {}
}
// Signing in adopts the account's stable player id so stats follow her across devices.
export function startAccount(playerId: string) {
  profile = {
    ...profile,
    deviceId: profile.deviceId || profile.id,
    id: playerId,
    nickname: "sans",
    chosen: true,
    account: "sans",
  };
  store();
}
export function endAccount() {
  profile = {
    id: profile.deviceId || crypto.randomUUID(),
    nickname: "",
    chosen: true,
  };
  store();
}
export function setNickname(value: string) {
  const nickname = value.trim();
  if (profile.account || reservedName(nickname)) return false;
  if (nickname.length > 24 || /[\u0000-\u001f\u007f]/.test(nickname))
    return false;
  profile = { ...profile, nickname, chosen: true };
  try {
    localStorage.setItem(key, JSON.stringify(profile));
  } catch {}
  return true;
}
