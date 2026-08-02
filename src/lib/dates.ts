const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function getNextAnnualOccurrence(sourceDate: string, now = new Date()): string {
  const source = parseDateOnly(sourceDate);
  const currentYear = now.getUTCFullYear();
  const month = source.getUTCMonth();
  const sourceDay = source.getUTCDate();
  const safeDay = month === 1 && sourceDay === 29 && !isLeapYear(currentYear) ? 28 : sourceDay;
  const candidate = new Date(Date.UTC(currentYear, month, safeDay));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (candidate < today) {
    const nextYear = currentYear + 1;
    const nextSafeDay = month === 1 && sourceDay === 29 && !isLeapYear(nextYear) ? 28 : sourceDay;
    return formatDateOnly(new Date(Date.UTC(nextYear, month, nextSafeDay)));
  }

  return formatDateOnly(candidate);
}

export function getCountdown(targetDate: string, now = new Date()): { days: number; label: string } {
  const target = parseDateOnly(targetDate);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const days = Math.max(0, Math.round((target.getTime() - today.getTime()) / DAY_MS));

  return { days, label: days === 0 ? '就是今天' : `还有 ${days} 天` };
}

export function getRelationshipDuration(
  startDate: string | null | undefined,
  now = new Date()
): { years: number; months: number; days: number; totalDays: number } | undefined {
  if (!startDate) return undefined;

  const start = parseDateOnly(startDate);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const totalDays = Math.max(0, Math.round((today.getTime() - start.getTime()) / DAY_MS));
  let years = today.getUTCFullYear() - start.getUTCFullYear();
  let months = today.getUTCMonth() - start.getUTCMonth();
  let days = today.getUTCDate() - start.getUTCDate();

  if (days < 0) {
    months -= 1;
    const daysInPreviousMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)).getUTCDate();
    days += daysInPreviousMonth;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { years, months, days, totalDays };
}
