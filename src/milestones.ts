import type { Difficulty } from "./game";
import { dayKey, difficulties, summarize, type Finish } from "./stats";
export type RuleKind = "total" | "streak" | "difficulty" | "nohint" | "fast" | "days" | "date";
export type Rule = { kind: RuleKind; value: number; difficulty?: Difficulty; date?: string };
export type Milestone = { id: string; title: string; rule: Rule; text: string; builtin: boolean };
// What the admin sees when building a rule.
export const RULE_KINDS: { kind: RuleKind; label: string; unit: string; max: number }[] = [
  { kind: "total", label: "Puzzles finished (any level)", unit: "puzzles", max: 5000 },
  { kind: "difficulty", label: "Puzzles of one level", unit: "puzzles", max: 5000 },
  { kind: "streak", label: "Days in a row", unit: "days", max: 365 },
  { kind: "days", label: "Different days played", unit: "days", max: 2000 },
  { kind: "nohint", label: "Puzzles finished without a hint", unit: "puzzles", max: 5000 },
  { kind: "fast", label: "A fast finish (under N minutes)", unit: "minutes", max: 600 },
  { kind: "date", label: "On a special date", unit: "", max: 0 },
];
// Built-in milestones: the rule is fixed, the wording can be replaced in the admin page.
export const BUILTIN_MILESTONES: { key: string; title: string; rule: Rule; defaultText: string }[] = [
  { key: "first", title: "Your very first puzzle", rule: { kind: "total", value: 1 }, defaultText: "Your very first one ♡ I'm so proud of you. Every big thing starts with one little square." },
  { key: "ten", title: "Ten puzzles", rule: { kind: "total", value: 10 }, defaultText: "Ten puzzles already! I love how you keep showing up for yourself ♡" },
  { key: "streak7", title: "Seven days in a row", rule: { kind: "streak", value: 7 }, defaultText: "Seven days in a row ♡ Thank you for taking time for yourself. I love you." },
  { key: "hard", title: "Your first hard one", rule: { kind: "difficulty", value: 1, difficulty: "hard" }, defaultText: "Your first hard puzzle! You're so smart, and I'm so proud of you ♡" },
  { key: "fifty", title: "Fifty puzzles", rule: { kind: "total", value: 50 }, defaultText: "Fifty! You make calm look easy, and I'm so proud of you ♡" },
  { key: "hundred", title: "One hundred puzzles", rule: { kind: "total", value: 100 }, defaultText: "A hundred puzzles. A hundred quiet little moments of you. I love you ♡" },
];
export const BUILTIN_KEYS = BUILTIN_MILESTONES.map((m) => m.key);
export type CustomRow = {
  id: number;
  title: string;
  kind: RuleKind;
  difficulty: Difficulty | null;
  value: number;
  on_date: string | null;
  text: string;
  enabled: number;
};
export const ruleOf = (row: Pick<CustomRow, "kind" | "difficulty" | "value" | "on_date">): Rule => ({
  kind: row.kind,
  value: row.value,
  ...(row.difficulty ? { difficulty: row.difficulty } : {}),
  ...(row.on_date ? { date: row.on_date } : {}),
});
// Built-ins (with any replacement wording) followed by the enabled custom milestones.
export function milestoneList(texts: Record<string, string>, custom: CustomRow[]): Milestone[] {
  return [
    ...BUILTIN_MILESTONES.map((m) => ({ id: `k:${m.key}`, title: m.title, rule: m.rule, text: texts[m.key] || m.defaultText, builtin: true })),
    ...custom
      .filter((c) => c.enabled)
      .map((c) => ({ id: `c:${c.id}`, title: c.title, rule: ruleOf(c), text: c.text, builtin: false })),
  ];
}
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
export function ruleText(rule: Rule): string {
  const v = rule.value;
  const level = rule.difficulty ? ` ${rule.difficulty}` : "";
  switch (rule.kind) {
    case "total":
      return v === 1 ? "Finish a puzzle" : `Finish ${plural(v, "puzzle")}`;
    case "difficulty":
      return v === 1 ? `Finish a${level} puzzle` : `Finish ${v}${level} puzzles`;
    case "streak":
      return `Play ${plural(v, "day")} in a row`;
    case "days":
      return `Play on ${plural(v, "different day")}`;
    case "nohint":
      return v === 1 ? "Finish a puzzle without a hint" : `Finish ${plural(v, "puzzle")} without a hint`;
    case "fast":
      return `Finish ${rule.difficulty ? `a ${rule.difficulty}` : "any"} puzzle in under ${plural(v, "minute")}`;
    case "date":
      return rule.date ? `On ${rule.date}` : "On a date";
  }
}
export type Progress = { done: boolean; current: number; target: number };
export function ruleProgress(rule: Rule, finishes: Finish[], now = new Date()): Progress {
  const s = summarize(finishes, now);
  const bool = (done: boolean): Progress => ({ done, current: done ? 1 : 0, target: 1 });
  switch (rule.kind) {
    case "total":
      return { done: s.total >= rule.value, current: s.total, target: rule.value };
    case "streak":
      return { done: s.longestStreak >= rule.value, current: s.longestStreak, target: rule.value };
    case "difficulty": {
      const n = rule.difficulty && difficulties.includes(rule.difficulty) ? s.byDifficulty[rule.difficulty].count : s.total;
      return { done: n >= rule.value, current: n, target: rule.value };
    }
    case "nohint": {
      const n = finishes.filter((f) => f.hints === 0).length;
      return { done: n >= rule.value, current: n, target: rule.value };
    }
    case "days": {
      const n = new Set(finishes.map((f) => dayKey(new Date(f.at)))).size;
      return { done: n >= rule.value, current: n, target: rule.value };
    }
    case "fast":
      return bool(
        finishes.some(
          (f) =>
            f.hints === 0 &&
            f.ms >= 1000 &&
            f.ms <= rule.value * 60000 &&
            (!rule.difficulty || f.difficulty === rule.difficulty),
        ),
      );
    case "date":
      return bool(Boolean(rule.date) && dayKey(now) >= (rule.date as string));
  }
}
export const unlockedIds = (list: Milestone[], finishes: Finish[], now = new Date()) =>
  list.filter((m) => ruleProgress(m.rule, finishes, now).done).map((m) => m.id);
