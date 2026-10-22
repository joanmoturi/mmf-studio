export function date(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function iso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const result = date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return iso(result);
}

export function addMonths(month: string, count: number): string {
  const result = date(`${month}-01`);
  result.setUTCMonth(result.getUTCMonth() + count);
  return iso(result).slice(0, 7);
}

export function monthDays(month: string): number {
  return date(addDays(`${addMonths(month, 1)}-01`, -1)).getUTCDate();
}

export function monthEnd(month: string): string {
  return `${month}-${String(monthDays(month)).padStart(2, "0")}`;
}

export function monthsBetween(start: string, end: string): number {
  return (
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(end.slice(5, 7)) -
    Number(start.slice(5, 7))
  );
}

export function months(start: string, end: string): string[] {
  return Array.from({ length: monthsBetween(start, end) + 1 }, (_, index) =>
    addMonths(start, index),
  );
}

export function yearDays(day: string): number {
  const year = Number(day.slice(0, 4));
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
}

export function periodDays(month: string, frequency: "monthly" | "quarterly" | "annually"): number {
  const year = month.slice(0, 4);
  const index = Number(month.slice(5, 7)) - 1;
  const count = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const start = `${year}-${String(Math.floor(index / count) * count + 1).padStart(2, "0")}`;
  return months(start, addMonths(start, count - 1)).reduce((sum, item) => sum + monthDays(item), 0);
}
