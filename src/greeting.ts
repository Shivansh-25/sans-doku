export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning ♡ A slow, sweet start to your day.";
  if (hour >= 12 && hour < 17) return "Good afternoon ♡ A little break, just for you.";
  if (hour >= 17 && hour < 22) return "Good evening ♡ Unwind with a little puzzle.";
  return "Still up? Don't forget to rest ♡ One more square, then sleep.";
}
// They started dating on 22 November 2025.
const start = { year: 2025, month: 11, day: 22 };
const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
export function daysTogether(now: Date): number {
  return Math.floor(
    (utc(now.getFullYear(), now.getMonth() + 1, now.getDate()) -
      utc(start.year, start.month, start.day)) /
      86400000,
  );
}
export function togetherLine(now: Date): string {
  const days = daysTogether(now);
  if (days < 0) return "";
  const months = (now.getFullYear() - start.year) * 12 + (now.getMonth() + 1 - start.month);
  if (days === 0) return "Today is where it all began ♡";
  if (now.getDate() === start.day && months > 0)
    return months % 12 === 0
      ? `Happy ${months / 12 === 1 ? "1 year" : `${months / 12} years`} together ♡`
      : `Happy ${months}-month anniversary ♡`;
  return `${days} ${days === 1 ? "day" : "days"} together ♡`;
}
