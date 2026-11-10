import type { ActivityEvent, Entity, Goal, ISODate, Priority, Project, Task, Worklog } from './types';
import type { Snapshot } from './store';
import { addDays, diffDays, range, startOfWeek, toISO, weekKey } from './dates';

/**
 * Pure, data-driven derivations. No fake numbers: when there is not enough
 * data, functions return `null` and the UI shows an honest empty state.
 */

export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

export const isOpen = (t: Task) => t.status === 'todo' || t.status === 'doing';

export interface Progress {
  done: number;
  total: number;
  ratio: number | null;
}

export function taskProgress(tasks: Task[]): Progress {
  const relevant = tasks.filter((t) => t.status !== 'cancelled' && t.indent === 0);
  const done = relevant.filter((t) => t.status === 'done').length;
  return { done, total: relevant.length, ratio: relevant.length ? done / relevant.length : null };
}

export function projectTasks(snap: Snapshot, p: Project): Task[] {
  return snap.tasksByProject.get(p.basename.toLowerCase()) ?? [];
}

export function projectProgress(snap: Snapshot, p: Project): Progress {
  const prog = taskProgress(projectTasks(snap, p).filter((t) => !t.milestone));
  if (p.status === 'done' && prog.ratio === null) return { done: 0, total: 0, ratio: 1 };
  return prog;
}

export function sortTasks(tasks: Task[], todayISO: ISODate): Task[] {
  return [...tasks].sort((a, b) => {
    const ad = a.due ?? a.scheduled;
    const bd = b.due ?? b.scheduled;
    const aOver = ad && ad < todayISO ? 0 : 1;
    const bOver = bd && bd < todayISO ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    if (a.status !== b.status) return a.status === 'doing' ? -1 : b.status === 'doing' ? 1 : 0;
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr) return pr;
    if (ad && bd && ad !== bd) return ad < bd ? -1 : 1;
    if (ad && !bd) return -1;
    if (!ad && bd) return 1;
    return a.path === b.path ? a.line - b.line : a.path < b.path ? -1 : 1;
  });
}

export function nextAction(snap: Snapshot, p: Project, todayISO: ISODate): Task | undefined {
  return sortTasks(projectTasks(snap, p).filter(isOpen), todayISO)[0];
}

export function milestones(snap: Snapshot, p: Project): Task[] {
  return projectTasks(snap, p).filter((t) => t.milestone);
}

export interface GoalProgress {
  ratio: number | null;
  source: 'metric' | 'projects' | 'tasks' | 'achieved' | 'none';
  detail: string;
}

export function goalProjects(snap: Snapshot, g: Goal): Project[] {
  const key = g.basename.toLowerCase();
  return snap.projects.filter((p) => p.goals.includes(key));
}

export function goalChildren(snap: Snapshot, g: Goal): Goal[] {
  const key = g.basename.toLowerCase();
  return snap.goals.filter((c) => c.parent === key);
}

export function goalTasks(snap: Snapshot, g: Goal): Task[] {
  const key = g.basename.toLowerCase();
  return snap.tasks.filter((t) => t.goal === key);
}

export function goalProgress(snap: Snapshot, g: Goal, depth = 0): GoalProgress {
  if (g.status === 'achieved') return { ratio: 1, source: 'achieved', detail: 'Achieved' };
  if (g.target !== undefined && g.target > 0 && g.current !== undefined) {
    const ratio = Math.max(0, Math.min(1, g.current / g.target));
    return { ratio, source: 'metric', detail: `${fmtNum(g.current)} / ${fmtNum(g.target)}${g.unit ? ' ' + g.unit : ''}` };
  }
  const parts: number[] = [];
  const projs = goalProjects(snap, g);
  for (const p of projs) {
    const pr = projectProgress(snap, p);
    if (pr.ratio !== null) parts.push(pr.ratio);
  }
  if (depth < 4)
    for (const c of goalChildren(snap, g)) {
      const cp = goalProgress(snap, c, depth + 1);
      if (cp.ratio !== null) parts.push(cp.ratio);
    }
  const own = taskProgress(goalTasks(snap, g));
  if (own.ratio !== null) parts.push(own.ratio);
  if (!parts.length) return { ratio: null, source: 'none', detail: 'No measurable data yet' };
  const ratio = parts.reduce((a, b) => a + b, 0) / parts.length;
  const src = projs.length ? 'projects' : 'tasks';
  return { ratio, source: src, detail: `${parts.length} source${parts.length > 1 ? 's' : ''}` };
}

export function nextMilestone(snap: Snapshot, g: Goal): Task | undefined {
  const own = goalTasks(snap, g).filter(isOpen);
  const fromProjects = goalProjects(snap, g).flatMap((p) => milestones(snap, p).filter(isOpen));
  const all = [...own.filter((t) => t.milestone), ...fromProjects, ...own];
  return all.sort((a, b) => (a.due ?? '9999') < (b.due ?? '9999') ? -1 : 1)[0];
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ---------- task buckets ----------

export interface TaskBuckets {
  inbox: Task[];
  today: Task[];
  overdue: Task[];
  upcoming: Task[];
  someday: Task[];
  completed: Task[];
}

export function bucketTasks(tasks: Task[], todayISO: ISODate, inboxPath?: string): TaskBuckets {
  const b: TaskBuckets = { inbox: [], today: [], overdue: [], upcoming: [], someday: [], completed: [] };
  for (const t of tasks) {
    if (t.status === 'done' || t.status === 'cancelled') {
      b.completed.push(t);
      continue;
    }
    const d = t.scheduled && (!t.due || t.scheduled < t.due) ? t.scheduled : t.due;
    if (d && d < todayISO && t.due && t.due < todayISO) b.overdue.push(t);
    else if (d && d <= todayISO) b.today.push(t);
    else if (d) b.upcoming.push(t);
    else if ((inboxPath && t.path === inboxPath) || (!t.project && !t.goal)) b.inbox.push(t);
    else b.someday.push(t);
  }
  b.completed.sort((x, y) => ((x.done ?? '') < (y.done ?? '') ? 1 : -1));
  b.upcoming.sort((x, y) => ((x.due ?? x.scheduled ?? '') < (y.due ?? y.scheduled ?? '') ? -1 : 1));
  return b;
}

// ---------- time series ----------

export function dailyCounts(dates: (ISODate | undefined)[], from: ISODate, to: ISODate): { date: ISODate; value: number }[] {
  const m = new Map<string, number>();
  for (const d of dates) if (d && d >= from && d <= to) m.set(d, (m.get(d) ?? 0) + 1);
  return range(from, to).map((date) => ({ date, value: m.get(date) ?? 0 }));
}

export function completedPerDay(snap: Snapshot, from: ISODate, to: ISODate) {
  return dailyCounts(snap.tasks.filter((t) => t.status === 'done').map((t) => t.done), from, to);
}

export function worklogMinutesPerDay(snap: Pick<Snapshot, 'worklogs'>, from: ISODate, to: ISODate) {
  const m = new Map<string, number>();
  for (const w of snap.worklogs) if (w.date >= from && w.date <= to) m.set(w.date, (m.get(w.date) ?? 0) + (w.minutes ?? 0));
  return range(from, to).map((date) => ({ date, value: m.get(date) ?? 0 }));
}

/** Learning activity: learning sessions, worklogs with "learned" items, knowledge notes created. */
export function learningActivity(snap: Snapshot, from: ISODate, to: ISODate) {
  const dates: ISODate[] = [];
  for (const l of snap.learning) for (const s of l.sessions) dates.push(s.date);
  for (const w of snap.worklogs) if (w.sections.learned.length) dates.push(w.date);
  for (const n of snap.notes) dates.push(toISO(new Date(n.ctime)));
  return dailyCounts(dates, from, to);
}

export function streak(series: { date: ISODate; value: number }[], todayISO: ISODate): number {
  const m = new Map(series.map((s) => [s.date, s.value]));
  let n = 0;
  let d = todayISO;
  if (!(m.get(d) ?? 0)) d = addDays(d, -1); // today not yet done doesn't break streak
  while ((m.get(d) ?? 0) > 0) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function weeklyTotals(series: { date: ISODate; value: number }[]): { week: string; start: ISODate; value: number }[] {
  const m = new Map<string, { start: ISODate; value: number }>();
  for (const s of series) {
    const k = weekKey(s.date);
    const cur = m.get(k) ?? { start: startOfWeek(s.date), value: 0 };
    cur.value += s.value;
    m.set(k, cur);
  }
  return [...m.entries()].map(([week, v]) => ({ week, ...v })).sort((a, b) => (a.start < b.start ? -1 : 1));
}

// ---------- activity timeline ----------

export function activity(snap: Snapshot, limit = 30, sinceDays = 30, now = Date.now()): ActivityEvent[] {
  const since = now - sinceDays * 86400000;
  const ev: ActivityEvent[] = [];
  for (const e of snap.entities) {
    if (e.ctime >= since) ev.push({ ts: e.ctime, date: toISO(new Date(e.ctime)), kind: e.kind, title: e.title, path: e.path, verb: 'created' });
    if (e.mtime >= since && e.mtime - e.ctime > 60000)
      ev.push({ ts: e.mtime, date: toISO(new Date(e.mtime)), kind: e.kind, title: e.title, path: e.path, verb: 'edited' });
  }
  const sinceISO = toISO(new Date(since));
  for (const t of snap.tasks) {
    if (t.status === 'done' && t.done && t.done >= sinceISO) {
      const file = snap.byPath.get(t.path);
      // completion has day precision; place at noon unless file mtime same day gives better order
      const ts = file && toISO(new Date(file.mtime)) === t.done ? file.mtime : new Date(t.done + 'T12:00:00').getTime();
      ev.push({ ts, date: t.done, kind: 'task', title: t.text, path: t.path, verb: 'completed' });
    }
  }
  return ev.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

// ---------- worklogs ----------

export interface WorklogSummary {
  week: string;
  from: ISODate;
  to: ISODate;
  entries: Worklog[];
  minutes: number;
  days: number;
  byProject: { project: string; minutes: number; count: number }[];
  technologies: { name: string; count: number }[];
  learned: string[];
  problems: string[];
  questions: string[];
  next: string[];
}

export function worklogWeek(worklogs: Worklog[], anyDayInWeek: ISODate): WorklogSummary {
  const from = startOfWeek(anyDayInWeek);
  const to = addDays(from, 6);
  const entries = worklogs.filter((w) => w.date >= from && w.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1));
  const proj = new Map<string, { minutes: number; count: number }>();
  const tech = new Map<string, number>();
  for (const w of entries) {
    const k = w.project ?? '—';
    const p = proj.get(k) ?? { minutes: 0, count: 0 };
    p.minutes += w.minutes ?? 0;
    p.count++;
    proj.set(k, p);
    for (const t of w.technologies) tech.set(t, (tech.get(t) ?? 0) + 1);
  }
  return {
    week: weekKey(from),
    from,
    to,
    entries,
    minutes: entries.reduce((a, w) => a + (w.minutes ?? 0), 0),
    days: new Set(entries.map((e) => e.date)).size,
    byProject: [...proj.entries()].map(([project, v]) => ({ project, ...v })).sort((a, b) => b.minutes - a.minutes),
    technologies: [...tech.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    learned: entries.flatMap((e) => e.sections.learned),
    problems: entries.flatMap((e) => e.sections.problems),
    questions: entries.flatMap((e) => e.sections.questions),
    next: entries.flatMap((e) => e.sections.next),
  };
}

export interface Skill {
  name: string;
  count: number;
  first: ISODate;
  last: ISODate;
  minutes: number;
}

/** Skills = technologies documented in worklogs, aggregated over time. */
export function skills(worklogs: Worklog[]): Skill[] {
  const m = new Map<string, Skill>();
  for (const w of worklogs) {
    for (const raw of w.technologies) {
      const key = raw.toLowerCase();
      const s = m.get(key) ?? { name: raw, count: 0, first: w.date, last: w.date, minutes: 0 };
      s.count++;
      s.minutes += w.minutes ?? 0;
      if (w.date < s.first) s.first = w.date;
      if (w.date > s.last) s.last = w.date;
      m.set(key, s);
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));
}

/** Markdown export for the Ausbildungsnachweis (weekly report). Only work/school context. */
export function exportTrainingRecord(sum: WorklogSummary, opts: { name?: string; locale: string; projectTitle: (k: string) => string }): string {
  const entries = sum.entries.filter((e) => e.context !== 'private');
  const lines: string[] = [];
  lines.push(`# Ausbildungsnachweis ${sum.week}`);
  lines.push('');
  lines.push(`Zeitraum: ${sum.from} – ${sum.to}${opts.name ? `  ·  Auszubildende/r: ${opts.name}` : ''}`);
  lines.push('');
  const groups: [string, string][] = [['work', 'Betriebliche Tätigkeiten'], ['school', 'Berufsschule']];
  for (const [ctx, label] of groups) {
    const list = entries.filter((e) => e.context === ctx);
    if (!list.length) continue;
    lines.push(`## ${label}`);
    lines.push('');
    for (const e of list) {
      const dur = e.minutes !== undefined ? ` (${(e.minutes / 60).toFixed(1).replace('.', ',')} h)` : '';
      const proj = e.project ? ` — ${opts.projectTitle(e.project)}` : '';
      lines.push(`### ${e.date}${proj}${dur}`);
      const act = e.sections.activity || e.title;
      lines.push(act);
      if (e.technologies.length) lines.push(`*Technologien:* ${e.technologies.join(', ')}`);
      lines.push('');
    }
  }
  const learned = entries.flatMap((e) => e.sections.learned);
  if (learned.length) {
    lines.push('## Unterweisungen / Gelerntes');
    lines.push('');
    for (const l of learned) lines.push(`- ${l}`);
    lines.push('');
  }
  const minutes = entries.reduce((a, w) => a + (w.minutes ?? 0), 0);
  lines.push(`**Dokumentierte Zeit:** ${(minutes / 60).toFixed(1).replace('.', ',')} h an ${new Set(entries.map((e) => e.date)).size} Tagen`);
  lines.push('');
  lines.push('---');
  lines.push('Unterschrift Auszubildende/r: ____________________    Unterschrift Ausbilder/in: ____________________');
  return lines.join('\n');
}

// ---------- smart connections ----------

export interface Connection {
  entity: Entity;
  score: number;
  reasons: string[];
}

/**
 * Explainable relatedness: shared tags (weighted by rarity), direct links,
 * backlinks, shared topic / project. No hidden embeddings, no content mutation.
 */
export function related(snap: Snapshot, target: Entity, backlinks: string[], limit = 8): Connection[] {
  const tagFreq = new Map<string, number>();
  for (const e of snap.entities) for (const t of e.tags) tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
  const tkey = target.basename.toLowerCase();
  const tTags = new Set(target.tags);
  const back = new Set(backlinks);
  const tTopic = 'topic' in target ? (target as { topic?: string }).topic : undefined;
  const out: Connection[] = [];
  for (const e of snap.entities) {
    if (e.path === target.path || e.archived) continue;
    let score = 0;
    const reasons: string[] = [];
    if (target.links.includes(e.basename.toLowerCase())) {
      score += 3;
      reasons.push('linked');
    }
    if (back.has(e.path) || e.links.includes(tkey)) {
      score += 3;
      reasons.push('backlink');
    }
    const shared = e.tags.filter((t) => tTags.has(t));
    for (const t of shared) score += 1 / Math.log2(1 + (tagFreq.get(t) ?? 1)) + 0.25;
    if (shared.length) reasons.push(shared.slice(0, 3).map((t) => '#' + t).join(' '));
    if (tTopic && 'topic' in e && (e as { topic?: string }).topic === tTopic) {
      score += 0.75;
      reasons.push(`topic: ${tTopic}`);
    }
    const tl = new Set(target.links);
    const common = e.links.filter((l) => tl.has(l));
    if (common.length) {
      score += common.length * 0.6;
      reasons.push(`${common.length} shared link${common.length > 1 ? 's' : ''}`);
    }
    if (score > 0.5) out.push({ entity: e, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Notes worth resurfacing: not edited for 30+ days, well connected, deterministic per day. */
export function rediscover(snap: Snapshot, todayISO: ISODate, n = 3): Entity[] {
  const now = new Date(todayISO + 'T12:00:00').getTime();
  const pool = snap.notes.filter((x) => !x.archived && now - x.mtime > 30 * 86400000);
  if (!pool.length) return [];
  let seed = 0;
  for (const c of todayISO) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const scored = pool
    .map((x) => ({ x, s: x.tags.length + x.links.length + ((seed ^ hash(x.path)) % 7) }))
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, n).map((s) => s.x);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function daysUntil(d: ISODate | undefined, todayISO: ISODate): number | undefined {
  return d ? diffDays(d, todayISO) : undefined;
}
