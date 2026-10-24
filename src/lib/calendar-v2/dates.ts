// Calendar arithmetic uses civil date keys, never the browser/server local zone.
export const calendarTimeZone = "Asia/Dubai";
const parts = new Intl.DateTimeFormat("en-GB", { timeZone: calendarTimeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
export function dubaiDate(instant: Date) {
  const p = Object.fromEntries(parts.formatToParts(instant).map(p => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function validCalendarDate(value: string) {
  if (!/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function addCalendarDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}
export function monthStart(day: string) { return day.slice(0, 7) + "-01"; }
export function moveMonth(day: string, months: number) {
  const date = new Date(`${monthStart(day)}T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + months); return date.toISOString().slice(0, 10);
}
export function weekStart(day: string) { return addCalendarDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7)); }
export function daysBetween(start: string, end: string) {
  const days: string[] = []; for (let date = start; date < end; date = addCalendarDays(date, 1)) days.push(date); return days;
}
export function dubaiDayStart(day: string) {
  // Derive the IANA offset with Intl instead of assuming the host time zone or
  // treating a civil date as UTC. A second pass resolves the target local day.
  const midnight = Date.parse(`${day}T00:00:00Z`);
  let candidate = midnight;
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(parts.formatToParts(new Date(candidate)).map(p => [p.type, p.value]));
    const wall = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    candidate += midnight - wall;
  }
  return new Date(candidate);
}
export function calendarDateLabel(day: string, options: Intl.DateTimeFormatOptions = { dateStyle: "full" }) {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}
export function deadlineTime(instant: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: calendarTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant));
}
