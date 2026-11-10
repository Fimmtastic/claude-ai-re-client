import type { ISODate, Priority } from './types';
import { addDays, isISODate, parseISO, toISO } from './dates';

/**
 * Natural quick-add syntax (English + German):
 *   "Switch tauschen morgen !high @Netzwerk every week"
 *   tokens: today/heute, tomorrow/morgen, übermorgen, mon..sun / mo..so,
 *           next week/nächste woche, in 3 days/in 3 tagen, 2026-11-20, 20.11.
 *           !urgent !high !medium !low (or !1 !2 !3)
 *           @Project (matched against known project names, prefix allowed)
 *           every day|week|month|weekday / täglich|wöchentlich|monatlich
 */

export interface QuickTask {
  text: string;
  due?: ISODate;
  priority?: Priority;
  project?: string;
  recurrence?: string;
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, so: 0, sonntag: 0,
  mon: 1, monday: 1, mo: 1, montag: 1,
  tue: 2, tuesday: 2, di: 2, dienstag: 2,
  wed: 3, wednesday: 3, mi: 3, mittwoch: 3,
  thu: 4, thursday: 4, do: 4, donnerstag: 4,
  fri: 5, friday: 5, fr: 5, freitag: 5,
  sat: 6, saturday: 6, sa: 6, samstag: 6,
};

export function parseQuickTask(input: string, todayISO: ISODate, projects: string[] = []): QuickTask {
  let text = ` ${input.trim()} `;
  const out: QuickTask = { text: '' };
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = text.match(re);
    if (m && fn(m) !== false) text = text.replace(m[0], ' ');
  };

  take(/\s!(urgent|high|medium|low|1|2|3|4)\b/i, (m) => {
    const v = m[1]!.toLowerCase();
    out.priority = ({ '1': 'urgent', '2': 'high', '3': 'medium', '4': 'low' } as Record<string, Priority>)[v] ?? (v as Priority);
  });
  take(/\s(every\s+(?:\d+\s+)?(?:day|days|week|weeks|month|months|year|years|weekday)|täglich|wöchentlich|monatlich|jährlich|daily|weekly|monthly)(?=\s)/i, (m) => {
    const v = m[1]!.toLowerCase();
    out.recurrence = ({ täglich: 'every day', wöchentlich: 'every week', monatlich: 'every month', jährlich: 'every year', daily: 'every day', weekly: 'every week', monthly: 'every month' } as Record<string, string>)[v] ?? v;
  });
  take(/\s@("[^"]+"|[\p{L}\p{N}_-]+)/u, (m) => {
    const q = m[1]!.replace(/"/g, '').toLowerCase();
    const exact = projects.find((p) => p.toLowerCase() === q);
    const pref = projects.find((p) => p.toLowerCase().startsWith(q)) ?? projects.find((p) => p.toLowerCase().replace(/\s+/g, '').startsWith(q));
    const hit = exact ?? pref;
    if (!hit) return false;
    out.project = hit;
  });

  // dates
  take(/\s(\d{4}-\d{2}-\d{2})(?=\s)/, (m) => { if (!isISODate(m[1])) return false; out.due = m[1]; });
  if (!out.due) take(/\s(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?=\s)/, (m) => {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(todayISO.slice(0, 4));
    const d = toISO(new Date(y, Number(m[2]) - 1, Number(m[1])));
    if (!isISODate(d)) return false;
    out.due = !m[3] && d < todayISO ? toISO(new Date(y + 1, Number(m[2]) - 1, Number(m[1]))) : d;
  });
  if (!out.due) take(/\s(today|heute)(?=\s)/i, () => { out.due = todayISO; });
  if (!out.due) take(/\s(übermorgen|uebermorgen)(?=\s)/i, () => { out.due = addDays(todayISO, 2); });
  if (!out.due) take(/\s(tomorrow|morgen|tmr)(?=\s)/i, () => { out.due = addDays(todayISO, 1); });
  if (!out.due) take(/\s(next week|nächste woche|naechste woche)(?=\s)/i, () => { out.due = addDays(todayISO, 7); });
  if (!out.due) take(/\sin\s+(\d+)\s+(days?|tagen?|weeks?|wochen?)(?=\s)/i, (m) => {
    const n = Number(m[1]);
    out.due = addDays(todayISO, /w/i.test(m[2]!) ? n * 7 : n);
  });
  if (!out.due) take(/\s(?:on\s+|am\s+)?(mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)(?=\s)/i, (m) => {
    const wd = WEEKDAYS[m[1]!.toLowerCase()];
    if (wd === undefined) return false;
    const cur = parseISO(todayISO).getDay();
    let delta = (wd - cur + 7) % 7;
    if (delta === 0) delta = 7;
    out.due = addDays(todayISO, delta);
  });
  out.text = text.replace(/\s+/g, ' ').trim();
  return out;
}
