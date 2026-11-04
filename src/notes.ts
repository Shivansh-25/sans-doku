import { MILESTONES, unlockedKeys } from "./milestones";
import type { Finish } from "./stats";
export type Notes = {
  messages: { id: number; text: string; at: number }[];
  milestones: Record<string, string>;
};
export type InboxItem = { id: string; title: string; text: string; at?: number };
const cacheKey = "sansdoku:notes:cache:v1";
const seenKey = "sansdoku:notes:seen:v1";
const empty = (): Notes => ({ messages: [], milestones: {} });
export function cachedNotes(): Notes {
  try {
    const v = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (v && Array.isArray(v.messages) && v.milestones && typeof v.milestones === "object") return v;
  } catch {}
  return empty();
}
export async function fetchNotes(): Promise<Notes | null> {
  try {
    const r = await fetch("/api/notes", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data.messages) || typeof data.milestones !== "object") return null;
    try {
      localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch {}
    return data;
  } catch {
    return null;
  }
}
export function loadSeen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(seenKey) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function markSeen(ids: string[]) {
  try {
    localStorage.setItem(seenKey, JSON.stringify([...new Set([...loadSeen(), ...ids])].slice(-300)));
  } catch {}
}
// Everything she has received: your messages (newest first) and the milestones she unlocked.
export function inbox(notes: Notes, finishes: Finish[]): InboxItem[] {
  const unlocked = unlockedKeys(finishes);
  const messages = notes.messages.map((m) => ({
    id: `m:${m.id}`,
    title: "A little note for you ♡",
    text: m.text,
    at: m.at,
  }));
  const milestones = MILESTONES.filter((m) => unlocked.includes(m.key)).map((m) => ({
    id: `k:${m.key}`,
    title: m.title,
    text: notes.milestones[m.key] || m.defaultText,
  }));
  return [...messages, ...milestones];
}
export const unseenItems = (items: InboxItem[], seen = loadSeen()) =>
  items.filter((i) => !seen.includes(i.id));
export function nextLocked(finishes: Finish[], count = 2): string[] {
  const unlocked = unlockedKeys(finishes);
  return MILESTONES.filter((m) => !unlocked.includes(m.key)).slice(0, count).map((m) => m.hint);
}
