export type DailyTime = { day: string; activeMs: number };
const offset = 330 * 60_000;
export const indiaDay = (timestamp: number) =>
  new Date(timestamp + offset).toISOString().slice(0, 10);
export function addDailyTime(
  days: DailyTime[],
  start: number,
  elapsed: number,
) {
  let end = start + elapsed;
  while (start < end) {
    const day = indiaDay(start);
    const next = Date.parse(day + "T00:00:00Z") + 86400000 - offset;
    const stop = Math.min(end, next);
    const existing = days.find((d) => d.day === day);
    if (existing) existing.activeMs += stop - start;
    else days.push({ day, activeMs: stop - start });
    start = stop;
  }
  days.sort((a, b) => a.day.localeCompare(b.day));
}
export function activitySummary(data: DailyTime[], count: number, now: number) {
  const today = indiaDay(now);
  const start = Date.parse(today + "T00:00:00Z") - (count - 1) * 86400000;
  const daily = Array.from({ length: count }, (_, i) => {
    const day = new Date(start + i * 86400000).toISOString().slice(0, 10);
    return { day, activeMs: data.find((d) => d.day === day)?.activeMs || 0 };
  });
  const weeks = new Map<string, number>(),
    months = new Map<string, number>();
  for (const d of daily) {
    const date = new Date(d.day + "T00:00:00Z");
    const monday = new Date(
      date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
    weeks.set(monday, (weeks.get(monday) || 0) + d.activeMs);
    const month = d.day.slice(0, 7);
    months.set(month, (months.get(month) || 0) + d.activeMs);
  }
  const total = daily.reduce((sum, d) => sum + d.activeMs, 0);
  const mostActive = daily.reduce<DailyTime | null>(
    (best, d) =>
      d.activeMs > 0 && (!best || d.activeMs > best.activeMs) ? d : best,
    null,
  );
  return {
    daily,
    weekly: Array.from(weeks, ([day, activeMs]) => ({ day, activeMs })),
    monthly: Array.from(months, ([day, activeMs]) => ({ day, activeMs })),
    total,
    mostActive,
    averageDay: total / count,
    averageWeek: total / weeks.size,
    averageMonth: total / months.size,
  };
}
