import type { ISODate } from './types';

/** Date helpers operating on local calendar dates (no timezone surprises). */

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(now: Date = new Date()): ISODate {
  return toISO(now);
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export function isISODate(v: unknown): v is ISODate {
  if (typeof v !== 'string') return false;
  const m = ISO_RE.exec(v);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1;
}

/** Accepts Date, ISO strings and YAML date values. Returns undefined if invalid. */
export function normalizeDate(v: unknown): ISODate | undefined {
  if (v instanceof Date && !isNaN(v.getTime())) return toISO(v);
  if (typeof v === 'string') {
    const s = v.trim();
    if (isISODate(s)) return s.slice(0, 10);
  }
  return undefined;
}

export function parseISO(d: ISODate): Date {
  const m = ISO_RE.exec(d);
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseISO(d);
  x.setDate(x.getDate() + n);
  return toISO(x);
}

export function addMonths(d: ISODate, n: number): ISODate {
  const x = parseISO(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return toISO(x);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000);
}

/** ISO-8601 week: returns { year, week } */
export function isoWeek(d: ISODate): { year: number; week: number } {
  const date = parseISO(d);
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

export function weekKey(d: ISODate): string {
  const { year, week } = isoWeek(d);
  return `${year}-W${pad(week)}`;
}

/** Monday of the ISO week containing d */
export function startOfWeek(d: ISODate): ISODate {
  const x = parseISO(d);
  const day = x.getDay() || 7;
  x.setDate(x.getDate() - day + 1);
  return toISO(x);
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function quarterKey(d: ISODate): string {
  const m = Number(d.slice(5, 7));
  return `${d.slice(0, 4)}-Q${Math.ceil(m / 3)}`;
}

export function range(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 3700) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function fmt(d: ISODate | undefined, locale: string, opts: Intl.DateTimeFormatOptions): string {
  if (!d) return '';
  const x = parseISO(d);
  if (isNaN(x.getTime())) return d;
  return new Intl.DateTimeFormat(locale, opts).format(x);
}

/** Human relative label: Today, Tomorrow, Yesterday, in 3 days, 2 days ago, or date */
export function relativeDay(d: ISODate, ref: ISODate, locale: string): string {
  const n = diffDays(d, ref);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return fmt(d, locale, { weekday: 'long' });
  if (n < 0 && n > -7) return `${-n} days ago`;
  return fmt(d, locale, { day: 'numeric', month: 'short' });
}

export function relativeTime(ts: number, now: number = Date.now()): string {
  const s = Math.round((now - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  const mo = Math.round(days / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}
