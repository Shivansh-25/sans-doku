import { milestoneList, ruleProgress, ruleText, type CustomRow } from "./milestones";
import type { Finish } from "./stats";
export type Notes = {
  messages: { id: number; text: string; at: number }[];
  milestones: Record<string, string>; // replacement wording for the built-in milestones
  custom: CustomRow[];
};
export type InboxItem = { id: string; title: string; text: string; at?: number };
const cacheKey = "sansdoku:notes:cache:v1";
const seenKey = "sansdoku:notes:seen:v1";
const empty = (): Notes => ({ messages: [], milestones: {}, custom: [] });
export function cachedNotes(): Notes {
  try {
    const v = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (v && Array.isArray(v.messages) && v.milestones && typeof v.milestones === "object")
      return { ...v, custom: Array.isArray(v.custom) ? v.custom : [] };
  } catch {}
  return empty();
}
export async function fetchNotes(): Promise<Notes | null> {
  try {
    const r = await fetch("/api/notes", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const data = await r.json();
    if (!Array.isArray(data.messages) || typeof data.milestones !== "object") return null;
    data.custom = Array.isArray(data.custom) ? data.custom : [];
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
export function inbox(notes: Notes, finishes: Finish[], now = new Date()): InboxItem[] {
  const messages = notes.messages.map((m) => ({
    id: `m:${m.id}`,
    title: "A little note for you ♡",
    text: m.text,
    at: m.at,
  }));
  const milestones = milestoneList(notes.milestones, notes.custom)
    .filter((m) => ruleProgress(m.rule, finishes, now).done)
    .map((m) => ({ id: m.id, title: m.title, text: m.text }));
  return [...messages, ...milestones];
}
export const unseenItems = (items: InboxItem[], seen = loadSeen()) =>
  items.filter((i) => !seen.includes(i.id));
// Gentle teasers for the closest locked milestones. Date surprises stay hidden.
export function nextLocked(notes: Notes, finishes: Finish[], count = 2, now = new Date()): string[] {
  return milestoneList(notes.milestones, notes.custom)
    .filter((m) => m.rule.kind !== "date")
    .map((m) => ({ m, p: ruleProgress(m.rule, finishes, now) }))
    .filter((x) => !x.p.done)
    .sort((a, b) => b.p.current / b.p.target - a.p.current / a.p.target)
    .slice(0, count)
    .map(({ m, p }) => (p.target > 1 ? `${ruleText(m.rule)} · ${p.current}/${p.target}` : ruleText(m.rule)));
}
