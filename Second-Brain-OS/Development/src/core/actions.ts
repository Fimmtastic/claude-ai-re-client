import type { EntityKind, ISODate, Priority, Task, TaskStatus } from './types';
import type { VaultPort } from './ports';
import type { DataStore } from './store';
import type { Settings } from './settings';
import { CreateInput, renderTemplate, safeFilename, applyUserTemplate } from './templates';
import { PRIORITY_TO_EMOJI, ensureBlockId, formatTaskLine, nextOccurrence, setLineDue, setLineStatus, TASK_RE } from './task-parser';
import { BLOCK_ID_RE, newId } from './ids';
import { today, weekKey, monthKey, quarterKey } from './dates';
import { Emitter } from './events';
import { log } from './logger';

/**
 * Actions — every write the app performs goes through here.
 *
 * Guarantees:
 *  - never overwrites an existing file on create (unique names)
 *  - task edits verify the exact line before writing (no blind line-number writes)
 *  - first modification of an existing file per day is backed up to .sbos/backups
 *  - every write is undoable while the file is unchanged since
 */

export class ConflictError extends Error {}

interface UndoEntry {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface ActionEvents extends Record<string, unknown> {
  undo: { label: string; canUndo: boolean; canRedo: boolean };
}

export const BACKUP_ROOT = '.sbos/backups';

export class Actions {
  readonly events = new Emitter<ActionEvents>();
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  private backedUp = new Set<string>();

  constructor(private port: VaultPort, private store: DataStore, private settings: () => Settings, private now: () => Date = () => new Date()) {}

  private todayISO() {
    return today(this.now());
  }

  // ---------------- undo ----------------

  private push(e: UndoEntry) {
    this.undoStack.push(e);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.events.emit('undo', { label: e.label, canUndo: true, canRedo: false });
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  peekUndo() {
    return this.undoStack[this.undoStack.length - 1]?.label;
  }

  async undo(): Promise<string | null> {
    const e = this.undoStack.pop();
    if (!e) return null;
    await e.undo();
    this.redoStack.push(e);
    this.events.emit('undo', { label: e.label, canUndo: this.canUndo, canRedo: true });
    return e.label;
  }

  async redo(): Promise<string | null> {
    const e = this.redoStack.pop();
    if (!e) return null;
    await e.redo();
    this.undoStack.push(e);
    this.events.emit('undo', { label: e.label, canUndo: true, canRedo: this.canRedo });
    return e.label;
  }

  // ---------------- backup ----------------

  /** Copies the current content of `path` to .sbos/backups/<date>/ once per day. */
  async backup(path: string): Promise<void> {
    const key = `${this.todayISO()}|${path}`;
    if (this.backedUp.has(key) || !this.port.exists(path)) return;
    const content = await this.port.read(path);
    await this.port.writeRaw(`${BACKUP_ROOT}/${this.todayISO()}/${path}`, content);
    this.backedUp.add(key);
  }

  async pruneBackups(): Promise<number> {
    const days = this.settings().backupRetentionDays;
    const folders = await this.port.listRaw(BACKUP_ROOT);
    const cutoff = new Date(this.now().getTime() - days * 86400000).toISOString().slice(0, 10);
    let removed = 0;
    for (const f of folders) {
      const name = f.split('/').pop() ?? '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(name) && name < cutoff) {
        await this.port.removeRaw(f);
        removed++;
      }
    }
    return removed;
  }

  /** Content edit with backup + undo, verified by `fn`. */
  async edit(path: string, label: string, fn: (content: string) => string): Promise<void> {
    await this.backup(path);
    let before = '';
    let after = '';
    await this.port.process(path, (cur) => {
      before = cur;
      after = fn(cur);
      return after;
    });
    if (before === after) return;
    await this.store.reindex(path);
    this.push({
      label,
      undo: async () => {
        await this.port.process(path, (cur) => {
          if (cur !== after) throw new ConflictError('File changed since — cannot undo safely.');
          return before;
        });
        await this.store.reindex(path);
      },
      redo: async () => {
        await this.port.process(path, (cur) => {
          if (cur !== before) throw new ConflictError('File changed since — cannot redo safely.');
          return after;
        });
        await this.store.reindex(path);
      },
    });
  }

  // ---------------- entities ----------------

  folderFor(kind: EntityKind, date: ISODate, extra?: { topic?: string }): string {
    const f = this.settings().folders;
    const year = date.slice(0, 4);
    switch (kind) {
      case 'project': return f.projects;
      case 'goal': return f.goals;
      case 'worklog': return `${f.worklogs}/${year}`;
      case 'journal': return `${f.journal}/${year}`;
      case 'daily': return f.daily;
      case 'review': return `${f.journal}/Reviews`;
      case 'learning': return `${f.knowledge}/Learning`;
      case 'resource': return f.resources;
      case 'note': return extra?.topic ? `${f.knowledge}/${safeFilename(extra.topic)}` : f.knowledge;
    }
  }

  uniquePath(folder: string, base: string): string {
    let p = `${folder}/${base}.md`;
    for (let i = 2; this.port.exists(p); i++) p = `${folder}/${base} ${i}.md`;
    return p;
  }

  allocateId(kind: string): string {
    const snap = this.store.snapshot();
    return newId(kind, (id) => snap.byId.has(id));
  }

  async create(input: Omit<CreateInput, 'id' | 'date'> & { date?: ISODate; filename?: string }): Promise<string> {
    const date = input.date ?? this.todayISO();
    const id = this.allocateId(input.kind);
    const folder = this.folderFor(input.kind, date, { topic: input.topic });
    await this.port.ensureFolder(folder);
    const filename = safeFilename(input.filename ?? input.title);
    const path = this.uniquePath(folder, filename);
    let content = renderTemplate({ ...input, id, date });
    const userTpl = `${this.settings().folders.system}/Templates/${input.kind}.md`;
    if (this.port.exists(userTpl)) {
      const tpl = await this.port.read(userTpl);
      content = applyUserTemplate(tpl, { title: input.title, date, id, project: input.project ? `[[${input.project}]]` : '' });
    }
    await this.port.create(path, content);
    await this.store.reindex(path);
    log.info(`created ${input.kind} ${path}`);
    this.push({
      label: `Create ${input.kind}`,
      undo: async () => {
        const cur = await this.port.read(path);
        if (cur !== content) throw new ConflictError('File was edited — not removed. Delete it manually if needed.');
        await this.port.trash(path);
        await this.store.reindex(path);
      },
      redo: async () => {
        if (this.port.exists(path)) throw new ConflictError('A file with that name exists now.');
        await this.port.create(path, content);
        await this.store.reindex(path);
      },
    });
    return path;
  }

  /** Returns today's daily note path, creating it if needed. */
  async ensureDaily(date: ISODate = this.todayISO()): Promise<string> {
    const snap = this.store.snapshot();
    const existing = snap.daily.find((d) => d.date === date);
    if (existing) return existing.path;
    const p = `${this.settings().folders.daily}/${date}.md`;
    if (this.port.exists(p)) return p;
    return this.create({ kind: 'daily', title: date, date, filename: date });
  }

  async ensureJournal(date: ISODate = this.todayISO()): Promise<string> {
    const existing = this.store.snapshot().journal.find((j) => j.date === date);
    if (existing) return existing.path;
    return this.create({ kind: 'journal', title: date, date, filename: date });
  }

  async ensureReview(period: 'daily' | 'weekly' | 'monthly' | 'quarterly', date: ISODate = this.todayISO(), body = ''): Promise<{ path: string; created: boolean }> {
    const key = period === 'weekly' ? weekKey(date) : period === 'monthly' ? monthKey(date) : period === 'quarterly' ? quarterKey(date) : date;
    const existing = this.store.snapshot().reviews.find((r) => r.period === period && r.periodKey === key);
    if (existing) return { path: existing.path, created: false };
    const label = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly' }[period];
    const path = await this.create({ kind: 'review', title: `${key} ${label} Review`, period, periodKey: key, body, date });
    return { path, created: true };
  }

  async setFrontmatter(path: string, patch: Record<string, unknown>, label = 'Update properties'): Promise<void> {
    await this.backup(path);
    const before: Record<string, unknown> = {};
    await this.port.processFrontMatter(path, (fm) => {
      for (const [k, v] of Object.entries(patch)) {
        before[k] = fm[k];
        if (v === undefined || v === null) delete fm[k];
        else fm[k] = v;
      }
    });
    await this.store.reindex(path);
    const apply = (vals: Record<string, unknown>) => async () => {
      await this.port.processFrontMatter(path, (fm) => {
        for (const [k, v] of Object.entries(vals)) {
          if (v === undefined || v === null) delete fm[k];
          else fm[k] = v;
        }
      });
      await this.store.reindex(path);
    };
    this.push({ label, undo: apply(before), redo: apply(patch) });
  }

  async trash(path: string): Promise<void> {
    await this.backup(path);
    await this.port.trash(path);
    await this.store.reindex(path);
  }

  // ---------------- tasks ----------------

  /**
   * Finds the current line index of a task in `lines`:
   * 1. same line number + identical raw text, 2. block id, 3. unique identical raw text.
   */
  static locate(lines: string[], t: Pick<Task, 'line' | 'raw' | 'stable' | 'id'>): number {
    if (lines[t.line]?.replace(/\r$/, '') === t.raw) return t.line;
    if (t.stable) {
      const i = lines.findIndex((l) => BLOCK_ID_RE.exec(' ' + l.replace(/\r$/, ''))?.[1] === t.id);
      if (i >= 0) return i;
    }
    const matches = lines.reduce<number[]>((acc, l, i) => (l.replace(/\r$/, '') === t.raw ? [...acc, i] : acc), []);
    if (matches.length === 1) return matches[0]!;
    throw new ConflictError('Task changed on disk — please reopen and try again.');
  }

  private async editTask(t: Task, label: string, fn: (line: string, lines: string[], idx: number) => string[] | string): Promise<void> {
    await this.edit(t.path, label, (content) => {
      const lines = content.split('\n');
      const idx = Actions.locate(lines, t);
      const cr = lines[idx]!.endsWith('\r') ? '\r' : '';
      const res = fn(lines[idx]!.replace(/\r$/, ''), lines, idx);
      const repl = (Array.isArray(res) ? res : [res]).map((l) => l + cr);
      lines.splice(idx, 1, ...repl);
      return lines.join('\n');
    });
  }

  async setTaskStatus(t: Task, status: TaskStatus): Promise<void> {
    const date = this.todayISO();
    await this.editTask(t, status === 'done' ? 'Complete task' : 'Update task', (line) => {
      const withId = ensureBlockId(line, t.stable ? t.id : this.allocateId('task'));
      const updated = setLineStatus(withId, status, date);
      if (status === 'done' && t.status !== 'done' && t.recurrence) {
        const base = t.due ?? t.scheduled ?? date;
        const next = nextOccurrence(t.recurrence, base < date ? date : base);
        if (next) {
          const indent = /^(\s*)/.exec(line)?.[1] ?? '';
          const fresh = setLineDue(setLineStatus(line, 'todo', date).replace(BLOCK_ID_RE, ''), next);
          const freshWithId = ensureBlockId(fresh.replace(/\s+$/, ''), this.allocateId('task'));
          return [freshWithId.startsWith(indent) ? freshWithId : indent + freshWithId.trimStart(), updated];
        }
      }
      return updated;
    });
  }

  async setTaskDue(t: Task, due: ISODate | undefined): Promise<void> {
    await this.editTask(t, 'Reschedule task', (line) => setLineDue(ensureBlockId(line, t.stable ? t.id : this.allocateId('task')), due));
  }

  async setTaskPriority(t: Task, p: Priority): Promise<void> {
    await this.editTask(t, 'Set priority', (line) => {
      const cleaned = ensureBlockId(line, t.stable ? t.id : this.allocateId('task')).replace(/\s*\[priority::[^\]]*\]/, '').replace(/\s*[🔺⏫🔼🔽]/gu, '');
      const emoji = PRIORITY_TO_EMOJI[p];
      if (!emoji) return cleaned;
      const block = BLOCK_ID_RE.exec(cleaned);
      return block ? cleaned.replace(BLOCK_ID_RE, '').trimEnd() + ` ${emoji} ^${block[1]}` : `${cleaned.trimEnd()} ${emoji}`;
    });
  }

  async setTaskText(t: Task, text: string): Promise<void> {
    await this.editTask(t, 'Rename task', (line) => {
      const clean = text.replace(/\n/g, ' ').trim();
      if (!clean) return line;
      // keep all metadata tokens after the old text
      const m = TASK_RE.exec(line);
      if (!m) return line;
      const body = m[3] ?? '';
      const idx = body.indexOf(t.text.slice(0, Math.min(12, t.text.length)));
      const rest = idx >= 0 ? body.slice(idx + t.text.length) : '';
      return line.slice(0, line.length - body.length) + clean + rest;
    });
  }

  async deleteTask(t: Task): Promise<void> {
    await this.editTask(t, 'Delete task', () => []);
  }

  /**
   * Adds a task to a file. Inserts below a "## Tasks" (or Aufgaben) heading
   * when present, otherwise appends at the end.
   */
  async addTask(input: { text: string; due?: ISODate; priority?: Priority; recurrence?: string; project?: string; milestone?: boolean; target?: string }): Promise<string> {
    const snap = this.store.snapshot();
    let path = input.target;
    const projectEntity = input.project ? snap.byBasename.get(input.project.toLowerCase()) : undefined;
    if (!path) path = projectEntity?.kind === 'project' ? projectEntity.path : this.settings().inboxFile;
    if (!this.port.exists(path)) {
      const folder = path.split('/').slice(0, -1).join('/');
      if (folder) await this.port.ensureFolder(folder);
      await this.port.create(path, `# Inbox\n\nCaptured tasks land here. Process them during your daily review.\n\n## Tasks\n`);
    }
    const line = formatTaskLine({
      text: input.text,
      due: input.due,
      priority: input.priority,
      recurrence: input.recurrence,
      milestone: input.milestone,
      projectLink: projectEntity && projectEntity.path !== path ? projectEntity.basename : undefined,
      blockId: this.allocateId('task'),
    });
    await this.edit(path, 'Add task', (content) => insertUnderHeading(content, input.milestone ? ['milestones', 'meilensteine'] : ['tasks', 'aufgaben', 'plan'], line));
    return path;
  }

  /** Appends text to a section (or end) of a file — used by quick capture & reviews. */
  async appendToSection(path: string, headings: string[], text: string): Promise<void> {
    await this.edit(path, 'Append', (content) => insertUnderHeading(content, headings, text));
  }
}

export function insertUnderHeading(content: string, headings: string[], line: string): string {
  const lines = content.split('\n');
  const hi = lines.findIndex((l) => {
    const m = /^#{1,4}\s+(.+)$/.exec(l);
    return !!m && headings.includes((m[1] ?? '').trim().toLowerCase());
  });
  if (hi < 0) {
    const trimmed = content.replace(/\s+$/, '');
    return trimmed ? `${trimmed}\n\n${line}\n` : `${line}\n`;
  }
  const level = (/^(#+)/.exec(lines[hi]!)?.[1] ?? '##').length;
  let end = lines.length;
  for (let i = hi + 1; i < lines.length; i++) {
    const m = /^(#+)\s/.exec(lines[i]!);
    if (m && (m[1] ?? '').length <= level) { end = i; break; }
  }
  let at = end;
  while (at > hi + 1 && (lines[at - 1] ?? '').trim() === '') at--;
  // drop an empty placeholder bullet ("- ") right before the insertion point
  if (at > hi + 1 && (lines[at - 1] ?? '').trim() === '-') { lines.splice(at - 1, 1); at--; }
  const insert = at === hi + 1 ? ['', line] : [line];
  lines.splice(at, 0, ...insert);
  const after = at + insert.length;
  if (after < lines.length && (lines[after] ?? '').trim() !== '') lines.splice(after, 0, '');
  return lines.join('\n');
}
