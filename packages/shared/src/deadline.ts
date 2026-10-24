import type { LimitDays } from './triage.js';

// Reporting deadline for a serious incident.
// MDR Art. 87(3) to (5): 15, 2 or 10 days after awareness.
// MDCG 2023-3 Rev.2 Q14: calendar days, day 0 is the awareness date, the period ends at 23:59:59 on the last day.
// Regulation 1182/71 Art. 3(4): a last day on a Saturday, Sunday or public holiday moves to the next working day.
// Regulation 1182/71 Art. 3(5): a period of two days or more includes at least two working days.
// Public holidays: Austria, Arbeitsruhegesetz section 7(2), for 2026 and 2027 only.

export const TIME_ZONE = 'Europe/Vienna';
export const SUPPORTED_YEARS = [2026, 2027] as const;

const DAY_MS = 86_400_000;

export class DeadlineRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeadlineRangeError';
  }
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const parseDay = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new RangeError(`Not a date: ${s}`);
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t) || isoDay(t) !== s) throw new RangeError(`Not a date: ${s}`);
  return t;
};

// Anonymous Gregorian algorithm for Easter Sunday.
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function austrianHolidays(year: number): Map<string, string> {
  if (!(SUPPORTED_YEARS as readonly number[]).includes(year)) {
    throw new DeadlineRangeError(`Austrian public holidays are only configured for ${SUPPORTED_YEARS.join(' and ')}.`);
  }
  const easter = parseDay(easterSunday(year));
  const fromEaster = (days: number) => isoDay(easter + days * DAY_MS);
  const fixed = (md: string) => `${year}-${md}`;
  return new Map([
    [fixed('01-01'), 'New Year'],
    [fixed('01-06'), 'Epiphany'],
    [fromEaster(1), 'Easter Monday'],
    [fixed('05-01'), 'State holiday'],
    [fromEaster(39), 'Ascension Day'],
    [fromEaster(50), 'Whit Monday'],
    [fromEaster(60), 'Corpus Christi'],
    [fixed('08-15'), 'Assumption Day'],
    [fixed('10-26'), 'National Day'],
    [fixed('11-01'), "All Saints' Day"],
    [fixed('12-08'), 'Immaculate Conception'],
    [fixed('12-25'), 'Christmas Day'],
    [fixed('12-26'), "St Stephen's Day"],
  ]);
}

const holidayCache = new Map<number, Map<string, string>>();
function holidayName(day: string): string | undefined {
  const year = Number(day.slice(0, 4));
  let map = holidayCache.get(year);
  if (!map) {
    map = austrianHolidays(year);
    holidayCache.set(year, map);
  }
  return map.get(day);
}

export type RestReason = 'Saturday' | 'Sunday' | string;

export function restReason(day: string): RestReason | null {
  const dow = new Date(parseDay(day)).getUTCDay();
  if (dow === 6) return 'Saturday';
  if (dow === 0) return 'Sunday';
  return holidayName(day) ?? null;
}

export interface DeadlineDay {
  date: string;
  index: number; // calendar day number, 0 is the awareness date
  rest: RestReason | null; // why it is not a working day
  extension: boolean; // after the legal last day, added by the rest-day rules
}

export interface Deadline {
  limitDays: LimitDays;
  awarenessDate: string;
  legalLastDay: string; // awareness date + limit, before any adjustment
  dueDate: string;
  dueAt: string; // ISO instant of 23:59:59 Vienna time on dueDate
  days: DeadlineDay[];
  explanation: string[];
}

const fmt = (day: string) =>
  new Date(parseDay(day)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');

export function computeDeadline(awarenessDate: string, limitDays: LimitDays): Deadline {
  const start = parseDay(awarenessDate);
  const legal = start + limitDays * DAY_MS;
  let end = legal;
  const explanation = [`Day 0 is the awareness date, ${fmt(awarenessDate)}. The period starts the next day.`];
  explanation.push(`Day ${limitDays} is ${fmt(isoDay(legal))}.`);

  const isRest = (t: number) => restReason(isoDay(t)) !== null;
  const workingDays = () => {
    let n = 0;
    for (let t = start + DAY_MS; t <= end; t += DAY_MS) if (!isRest(t)) n++;
    return n;
  };

  if (isRest(end)) {
    const skipped: string[] = [];
    while (isRest(end)) {
      skipped.push(`${fmt(isoDay(end))} (${restReason(isoDay(end))})`);
      end += DAY_MS;
    }
    explanation.push(`It is not a working day, so the period moves past ${skipped.join(', ')} to ${fmt(isoDay(end))}.`);
  }
  if (limitDays >= 2 && workingDays() < 2) {
    while (workingDays() < 2 || isRest(end)) end += DAY_MS;
    explanation.push(`A period of two days or more must contain two working days, so it ends on ${fmt(isoDay(end))}.`);
  }
  explanation.push(`Due ${fmt(isoDay(end))} at 23:59 Vienna time. Report immediately; this is the latest date.`);

  const days: DeadlineDay[] = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const date = isoDay(t);
    days.push({ date, index: Math.round((t - start) / DAY_MS), rest: t === start ? null : restReason(date), extension: t > legal });
  }
  const dueDate = isoDay(end);
  return { limitDays, awarenessDate, legalLastDay: isoDay(legal), dueDate, dueAt: zonedEndOfDay(dueDate), days, explanation };
}

// Offset of Vienna from UTC at instant t, in milliseconds.
function zoneOffset(t: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - t;
}

export function zonedEndOfDay(day: string): string {
  const local = parseDay(day) + DAY_MS - 1000; // 23:59:59 as if UTC
  let t = local - zoneOffset(local);
  t = local - zoneOffset(t);
  return new Date(t).toISOString();
}

// Calendar date in Vienna for an instant.
export function viennaDate(instant: Date | string): string {
  const t = typeof instant === 'string' ? Date.parse(instant) : instant.getTime();
  return isoDay(t + zoneOffset(t));
}

export function timeLeft(dueAt: string, now: Date | string) {
  const ms = Date.parse(dueAt) - (typeof now === 'string' ? Date.parse(now) : now.getTime());
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / DAY_MS);
  const hours = Math.floor((abs % DAY_MS) / 3_600_000);
  return { overdue, soon: !overdue && ms < 2 * DAY_MS, days, hours, text: `${days} d ${hours} h ${overdue ? 'overdue' : 'left'}` };
}
