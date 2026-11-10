import type {
  DailyNote, Entity, Goal, JournalEntry, LearningItem, Note, Project, Review, Task, Worklog,
} from './types';
import type { FileInfo, VaultPort, VaultEvent } from './ports';
import { DEFAULT_FOLDERS, FolderConfig, detectKind, toEntity, stripFrontmatter } from './schema';
import { parseTasks } from './task-parser';
import { Emitter } from './events';
import { log } from './logger';

/**
 * DataStore — single source of truth for all modules.
 *
 *  - Initial index is built from metadata (no file reads) so the UI can render
 *    immediately; bodies are then read in small idle-time batches.
 *  - Afterwards only changed files are re-indexed (event driven).
 *  - Consumers read immutable `Snapshot`s, memoized per store version.
 */

export interface Snapshot {
  version: number;
  ready: boolean;
  bodiesLoaded: boolean;
  entities: Entity[];
  projects: Project[];
  goals: Goal[];
  worklogs: Worklog[]; // newest first
  journal: JournalEntry[]; // newest first
  daily: DailyNote[]; // newest first
  reviews: Review[];
  notes: Note[]; // knowledge + resources
  learning: LearningItem[];
  tasks: Task[];
  byPath: Map<string, Entity>;
  byBasename: Map<string, Entity>;
  byId: Map<string, Entity>;
  tasksByProject: Map<string, Task[]>;
  duplicateIds: string[];
}

interface StoreEvents extends Record<string, unknown> {
  change: Snapshot;
  progress: { loaded: number; total: number };
}

export interface StoreOptions {
  folders?: FolderConfig;
  /** Max chars of body kept for full-text search per file */
  searchTextLimit?: number;
  batchSize?: number;
  /** schedule function for background work (requestIdleCallback in browsers) */
  schedule?: (fn: () => void) => void;
  includeTestData?: boolean;
}

export class DataStore {
  readonly events = new Emitter<StoreEvents>();
  private entities = new Map<string, Entity>();
  private tasks = new Map<string, Task[]>();
  private text = new Map<string, string>();
  private version = 0;
  private snap: Snapshot | null = null;
  private ready = false;
  private bodiesLoaded = false;
  private unsub: (() => void) | null = null;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  private pending = new Map<string, Promise<void>>();
  folders: FolderConfig;
  private opts: Required<Omit<StoreOptions, 'folders'>>;

  constructor(private port: VaultPort, options: StoreOptions = {}) {
    this.folders = options.folders ?? DEFAULT_FOLDERS;
    this.opts = {
      searchTextLimit: options.searchTextLimit ?? 20000,
      batchSize: options.batchSize ?? 40,
      schedule: options.schedule ?? ((fn) => setTimeout(fn, 0)),
      includeTestData: options.includeTestData ?? true,
    };
  }

  /** Builds the metadata index synchronously, then loads bodies in background. */
  async init(opts: { awaitBodies?: boolean } = {}): Promise<void> {
    const t0 = performance.now();
    const files = this.port.listFiles();
    for (const f of files) this.indexMeta(f);
    this.ready = true;
    this.bump(true);
    log.info(`index(meta) ${files.length} files in ${(performance.now() - t0).toFixed(1)}ms`);
    this.unsub = this.port.subscribe((ev) => this.onVaultEvent(ev));
    const bodies = this.loadBodies(files);
    if (opts.awaitBodies) await bodies;
  }

  destroy(): void {
    this.unsub?.();
    this.events.clear();
    if (this.emitTimer) clearTimeout(this.emitTimer);
  }

  private indexMeta(f: FileInfo): void {
    if (!this.opts.includeTestData && f.frontmatter?.['sbos-testdata'] === true) return;
    const e = toEntity(f, this.folders);
    if (e) this.entities.set(f.path, e);
    else this.entities.delete(f.path);
  }

  private async loadBodies(files: FileInfo[]): Promise<void> {
    const total = files.length;
    let loaded = 0;
    const t0 = performance.now();
    for (let i = 0; i < files.length; i += this.opts.batchSize) {
      const batch = files.slice(i, i + this.opts.batchSize);
      await Promise.all(batch.map((f) => this.indexBody(f).catch((e) => log.warn(`body index failed ${f.path}`, e))));
      loaded += batch.length;
      this.events.emit('progress', { loaded, total });
      if (i + this.opts.batchSize < files.length) await new Promise<void>((r) => this.opts.schedule(r));
    }
    this.bodiesLoaded = true;
    this.bump(true);
    log.info(`index(bodies) ${total} files in ${(performance.now() - t0).toFixed(1)}ms`);
  }

  private async indexBody(f: FileInfo): Promise<void> {
    if (!this.opts.includeTestData && f.frontmatter?.['sbos-testdata'] === true) return;
    const content = await this.port.read(f.path);
    const e = toEntity(f, this.folders, content);
    if (e) this.entities.set(f.path, e);
    else this.entities.delete(f.path);
    const kind = detectKind(f, this.folders);
    if (f.hasTasks || content.includes('- [')) {
      const ts = parseTasks(content, {
        path: f.path,
        fileProject: kind === 'project' ? f.basename.toLowerCase() : undefined,
        fileGoal: kind === 'goal' ? f.basename.toLowerCase() : undefined,
        testData: f.frontmatter?.['sbos-testdata'] === true,
      });
      if (ts.length) this.tasks.set(f.path, ts);
      else this.tasks.delete(f.path);
    } else this.tasks.delete(f.path);
    if (kind) {
      const body = stripFrontmatter(content);
      this.text.set(f.path, body.slice(0, this.opts.searchTextLimit).toLowerCase());
    }
  }

  private onVaultEvent(ev: VaultEvent): void {
    if (ev.type === 'ready') return;
    if (ev.type === 'delete') {
      this.removePath(ev.path);
      this.bump();
      return;
    }
    if (ev.type === 'rename') this.removePath(ev.oldPath);
    void this.reindex(ev.path);
  }

  private removePath(path: string) {
    this.entities.delete(path);
    this.tasks.delete(path);
    this.text.delete(path);
  }

  /** Re-index a single file now (used after own writes for instant feedback). */
  reindex(path: string): Promise<void> {
    const prev = this.pending.get(path) ?? Promise.resolve();
    const next = prev.then(async () => {
      const f = this.port.getFile(path);
      if (!f) {
        this.removePath(path);
      } else {
        this.indexMeta(f);
        await this.indexBody(f);
      }
      this.bump();
    }).catch((e) => log.warn(`reindex failed ${path}`, e));
    this.pending.set(path, next);
    void next.finally(() => { if (this.pending.get(path) === next) this.pending.delete(path); });
    return next;
  }

  private bump(immediate = false): void {
    this.version++;
    this.snap = null;
    if (immediate) {
      if (this.emitTimer) clearTimeout(this.emitTimer);
      this.emitTimer = null;
      this.events.emit('change', this.snapshot());
      return;
    }
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.events.emit('change', this.snapshot());
    }, 60);
  }

  /** Full-text body (lower-cased) for search; empty until bodies are loaded. */
  textOf(path: string): string {
    return this.text.get(path) ?? '';
  }

  snapshot(): Snapshot {
    if (this.snap) return this.snap;
    const entities = [...this.entities.values()];
    const byPath = new Map<string, Entity>();
    const byBasename = new Map<string, Entity>();
    const byId = new Map<string, Entity>();
    const idCount = new Map<string, number>();
    for (const e of entities) {
      byPath.set(e.path, e);
      // prefer non-archived entity for basename resolution
      const key = e.basename.toLowerCase();
      if (!byBasename.has(key) || byBasename.get(key)!.archived) byBasename.set(key, e);
      byId.set(e.id, e);
      if (!e.id.startsWith('path-')) idCount.set(e.id, (idCount.get(e.id) ?? 0) + 1);
    }
    const duplicateIds = [...idCount.entries()].filter(([, n]) => n > 1).map(([id]) => id);

    const tasks: Task[] = [];
    const tasksByProject = new Map<string, Task[]>();
    for (const list of this.tasks.values()) {
      for (const t0 of list) {
        let t = t0;
        if (!t.project) {
          const proj = t.links.find((l) => byBasename.get(l)?.kind === 'project');
          if (proj) t = { ...t, project: proj };
        }
        if (!t.goal) {
          const g = t.links.find((l) => byBasename.get(l)?.kind === 'goal');
          if (g) t = { ...t, goal: g };
        }
        tasks.push(t);
        if (t.project) {
          let arr = tasksByProject.get(t.project);
          if (!arr) tasksByProject.set(t.project, (arr = []));
          arr.push(t);
        }
      }
    }

    const by = <K extends Entity['kind']>(...kinds: K[]) =>
      entities.filter((e): e is Extract<Entity, { kind: K }> => (kinds as string[]).includes(e.kind));
    const newest = <T extends { date: string; mtime: number }>(arr: T[]) =>
      arr.sort((a, b) => (a.date === b.date ? b.mtime - a.mtime : a.date < b.date ? 1 : -1));

    this.snap = {
      version: this.version,
      ready: this.ready,
      bodiesLoaded: this.bodiesLoaded,
      entities,
      projects: by('project'),
      goals: by('goal'),
      worklogs: newest(by('worklog')),
      journal: newest(by('journal')),
      daily: newest(by('daily')),
      reviews: newest(by('review')),
      notes: by('note', 'resource'),
      learning: by('learning'),
      tasks,
      byPath,
      byBasename,
      byId,
      tasksByProject,
      duplicateIds,
    };
    return this.snap;
  }
}
