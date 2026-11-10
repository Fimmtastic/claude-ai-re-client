import type { ISODate, Priority, Task, TaskStatus } from './types';
import { BLOCK_ID_RE, pathId } from './ids';
import { addDays, addMonths, isISODate, parseISO, toISO } from './dates';

/**
 * Task line format (compatible with the popular "Tasks" emoji syntax and with
 * Dataview inline fields, so data stays portable):
 *
 *   - [ ] Configure VLAN 20 [[Netzwerk Umbau]] #network 📅 2026-11-12 ⏫ 🔁 every week ^t-ab12cd
 *
 * Status:  [ ] todo   [/] doing   [x] done   [-] cancelled
 * Dates:   📅 due   ⏳ scheduled   ✅ done      (or [due:: …] [scheduled:: …] [completion:: …])
 * Priority 🔺 urgent ⏫ high 🔼 medium 🔽 low  (or [priority:: high])
 * Repeat:  🔁 every day|week|2 weeks|month|weekday|year   (or [repeat:: …])
 */

export const TASK_RE = /^(\s*)[-*+]\s\[(.)\]\s+(.*)$/;

const STATUS_CHAR: Record<string, TaskStatus> = { ' ': 'todo', '/': 'doing', x: 'done', X: 'done', '-': 'cancelled' };
export const STATUS_TO_CHAR: Record<TaskStatus, string> = { todo: ' ', doing: '/', done: 'x', cancelled: '-' };

const PRIORITY_EMOJI: Record<string, Priority> = { '🔺': 'urgent', '⏫': 'high', '🔼': 'medium', '🔽': 'low' };
export const PRIORITY_TO_EMOJI: Record<Priority, string> = { urgent: '🔺', high: '⏫', medium: '🔼', low: '🔽', none: '' };

const DATE = '(\\d{4}-\\d{2}-\\d{2})';
const DUE_RE = new RegExp(`(?:📅|📆|🗓️?)\\s*${DATE}`, 'u');
const SCHED_RE = new RegExp(`⏳\\s*${DATE}`, 'u');
const DONE_RE = new RegExp(`✅\\s*${DATE}`, 'u');
const REPEAT_RE = /🔁\s*([a-z0-9 ]+?)(?=\s*(?:📅|⏳|✅|🔺|⏫|🔼|🔽|\^t-|\[|#|$))/iu;
const FIELD_RE = /\[(\w+)::\s*([^\]]*)\]/g;
const TAG_RE = /(?:^|\s)#([\p{L}\p{N}_/-]+)/gu;
const LINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

export function isTaskLine(line: string): boolean {
  return TASK_RE.test(line);
}

export interface ParseContext {
  path: string;
  /** lower-cased basename if the containing file is a project */
  fileProject?: string;
  fileGoal?: string;
  testData?: boolean;
}

export function parseTaskLine(line: string, lineNo: number, ctx: ParseContext): Task | null {
  const m = TASK_RE.exec(line);
  if (!m) return null;
  const indent = (m[1] ?? '').replace(/\t/g, '    ').length;
  const status = STATUS_CHAR[m[2] ?? ' '];
  if (!status) return null; // unknown status char: not ours, leave untouched
  let body = m[3] ?? '';

  const fields: Record<string, string> = {};
  body.replace(FIELD_RE, (_s, k: string, v: string) => {
    fields[k.toLowerCase()] = v.trim();
    return '';
  });

  const blockMatch = BLOCK_ID_RE.exec(' ' + body);
  const blockId = blockMatch?.[1];

  const due = DUE_RE.exec(body)?.[1] ?? fields['due'];
  const scheduled = SCHED_RE.exec(body)?.[1] ?? fields['scheduled'];
  const done = DONE_RE.exec(body)?.[1] ?? fields['completion'] ?? fields['done'];
  let priority: Priority = 'none';
  for (const [emoji, p] of Object.entries(PRIORITY_EMOJI)) if (body.includes(emoji)) { priority = p; break; }
  const fp = fields['priority']?.toLowerCase();
  if (fp && ['urgent', 'high', 'medium', 'low'].includes(fp)) priority = fp as Priority;
  const recurrence = (REPEAT_RE.exec(body)?.[1] ?? fields['repeat'])?.trim().toLowerCase();

  const tags: string[] = [];
  for (const t of body.matchAll(TAG_RE)) if (t[1]) tags.push(t[1].toLowerCase());
  const links: string[] = [];
  for (const l of body.matchAll(LINK_RE)) if (l[1]) links.push(basenameOf(l[1]).toLowerCase());

  // Clean display text
  let text = body
    .replace(FIELD_RE, '')
    .replace(BLOCK_ID_RE, '')
    .replace(new RegExp(DUE_RE.source, 'gu'), '')
    .replace(new RegExp(SCHED_RE.source, 'gu'), '')
    .replace(new RegExp(DONE_RE.source, 'gu'), '')
    .replace(/🔁\s*[a-z0-9 ]+?(?=\s*(?:📅|⏳|✅|🔺|⏫|🔼|🔽|\^t-|#|$))/giu, '')
    .replace(/[🔺⏫🔼🔽]/gu, '')
    .replace(/\s#milestone\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (text.startsWith('#milestone')) text = text.replace('#milestone', '').trim();
  body = text;

  const milestone = tags.includes('milestone');
  const project = ctx.fileProject ?? fields['project']?.replace(/\[\[|\]\]/g, '').toLowerCase();

  return {
    id: blockId ?? `${pathId(ctx.path)}:${lineNo}`,
    stable: !!blockId,
    path: ctx.path,
    line: lineNo,
    raw: line,
    text: body,
    status,
    due: isISODate(due) ? due : undefined,
    scheduled: isISODate(scheduled) ? scheduled : undefined,
    done: isISODate(done) ? done : undefined,
    priority,
    recurrence: recurrence || undefined,
    tags,
    links,
    project,
    goal: ctx.fileGoal,
    milestone,
    indent,
    testData: !!ctx.testData,
  };
}

export function parseTasks(content: string, ctx: ParseContext): Task[] {
  const out: Task[] = [];
  const lines = content.split('\n');
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^\s*(```|~~~)/.test(line)) inCode = !inCode;
    if (inCode) continue;
    if (line.length < 6 || line.indexOf('[') < 0) continue;
    const t = parseTaskLine(line.replace(/\r$/, ''), i, ctx);
    if (t) {
      // a project link inside the task line wins over nothing, file project wins over link
      out.push(t);
    }
  }
  return out;
}

function basenameOf(link: string): string {
  const s = link.trim();
  const slash = s.lastIndexOf('/');
  return (slash >= 0 ? s.slice(slash + 1) : s).replace(/\.md$/i, '');
}

/** ---------- serialization helpers (pure) ---------- */

export interface NewTaskInput {
  text: string;
  due?: ISODate;
  scheduled?: ISODate;
  priority?: Priority;
  recurrence?: string;
  projectLink?: string; // basename to link [[...]]
  milestone?: boolean;
  blockId: string;
}

export function formatTaskLine(t: NewTaskInput, status: TaskStatus = 'todo', indent = ''): string {
  const parts: string[] = [t.text.trim().replace(/\n/g, ' ')];
  if (t.milestone) parts.push('#milestone');
  if (t.projectLink && !t.text.includes(`[[${t.projectLink}`)) parts.push(`[[${t.projectLink}]]`);
  if (t.priority && t.priority !== 'none') parts.push(PRIORITY_TO_EMOJI[t.priority]);
  if (t.recurrence) parts.push(`🔁 ${t.recurrence}`);
  if (t.scheduled) parts.push(`⏳ ${t.scheduled}`);
  if (t.due) parts.push(`📅 ${t.due}`);
  parts.push(`^${t.blockId}`);
  return `${indent}- [${STATUS_TO_CHAR[status]}] ${parts.join(' ')}`;
}

/** Changes status char and adds/removes ✅ date. Preserves everything else verbatim. */
export function setLineStatus(line: string, status: TaskStatus, doneDate: ISODate): string {
  const m = TASK_RE.exec(line);
  if (!m) throw new Error('Not a task line');
  let body = m[3] ?? '';
  body = body.replace(new RegExp(`\\s*${DONE_RE.source}`, 'u'), '').replace(/\s*\[completion::[^\]]*\]/, '');
  if (status === 'done') {
    const block = BLOCK_ID_RE.exec(' ' + body);
    if (block) body = body.replace(BLOCK_ID_RE, '').trimEnd() + ` ✅ ${doneDate} ^${block[1]}`;
    else body = body.trimEnd() + ` ✅ ${doneDate}`;
  }
  const prefix = line.slice(0, line.indexOf('[') + 1);
  return `${prefix}${STATUS_TO_CHAR[status]}] ${body}`;
}

export function ensureBlockId(line: string, blockId: string): string {
  if (BLOCK_ID_RE.test(' ' + line)) return line;
  return `${line.trimEnd()} ^${blockId}`;
}

/** Replace text of a task while keeping metadata tokens. */
export function setLineDue(line: string, due: ISODate | undefined): string {
  let out = line.replace(new RegExp(`\\s*${DUE_RE.source}`, 'u'), '').replace(/\s*\[due::[^\]]*\]/, '');
  if (due) {
    const block = BLOCK_ID_RE.exec(out);
    if (block) out = out.replace(BLOCK_ID_RE, '').trimEnd() + ` 📅 ${due} ^${block[1]}`;
    else out = out.trimEnd() + ` 📅 ${due}`;
  }
  return out;
}

/** ---------- recurrence ---------- */

export function nextOccurrence(rule: string, from: ISODate): ISODate | undefined {
  const r = rule.trim().toLowerCase();
  const m = /^every\s+(?:(\d+)\s+)?(day|days|week|weeks|month|months|year|years|weekday)$/.exec(r);
  const alias: Record<string, string> = { daily: 'every day', weekly: 'every week', monthly: 'every month', yearly: 'every year' };
  if (!m) return alias[r] ? nextOccurrence(alias[r]!, from) : undefined;
  const n = Number(m[1] ?? 1);
  switch (m[2]) {
    case 'day':
    case 'days':
      return addDays(from, n);
    case 'week':
    case 'weeks':
      return addDays(from, 7 * n);
    case 'month':
    case 'months':
      return addMonths(from, n);
    case 'year':
    case 'years':
      return addMonths(from, 12 * n);
    case 'weekday': {
      const d = parseISO(from);
      do d.setDate(d.getDate() + 1);
      while (d.getDay() === 0 || d.getDay() === 6);
      return toISO(d);
    }
  }
  return undefined;
}
