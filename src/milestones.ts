import type { Finish } from "./stats";
import { summarize } from "./stats";
export type Milestone = {
  key: string;
  title: string;
  hint: string; // shown while it is still locked
  defaultText: string;
};
// Texts can be replaced from the admin page; these are the gentle fallbacks.
export const MILESTONES: Milestone[] = [
  { key: "first", title: "Your very first puzzle", hint: "Finish your first puzzle", defaultText: "Your very first one ♡ I'm so proud of you. Every big thing starts with one little square." },
  { key: "ten", title: "Ten puzzles", hint: "Finish 10 puzzles", defaultText: "Ten puzzles already! I love how you keep showing up for yourself ♡" },
  { key: "streak7", title: "Seven days in a row", hint: "Play 7 days in a row", defaultText: "Seven days in a row ♡ Thank you for taking time for yourself. I love you." },
  { key: "hard", title: "Your first hard one", hint: "Finish a hard puzzle", defaultText: "Your first hard puzzle! You're so smart, and I'm so proud of you ♡" },
  { key: "fifty", title: "Fifty puzzles", hint: "Finish 50 puzzles", defaultText: "Fifty! You make calm look easy, and I'm so proud of you ♡" },
  { key: "hundred", title: "One hundred puzzles", hint: "Finish 100 puzzles", defaultText: "A hundred puzzles. A hundred quiet little moments of you. I love you ♡" },
];
export function unlockedKeys(finishes: Finish[]): string[] {
  const s = summarize(finishes);
  const unlocked = new Set<string>();
  if (s.total >= 1) unlocked.add("first");
  if (s.total >= 10) unlocked.add("ten");
  if (s.total >= 50) unlocked.add("fifty");
  if (s.total >= 100) unlocked.add("hundred");
  if (s.longestStreak >= 7) unlocked.add("streak7");
  if (s.byDifficulty.hard.count >= 1) unlocked.add("hard");
  return MILESTONES.filter((m) => unlocked.has(m.key)).map((m) => m.key);
}
