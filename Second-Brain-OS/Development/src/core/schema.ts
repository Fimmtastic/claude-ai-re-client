import type {
  BaseEntity, DailyNote, Entity, EntityKind, Goal, GoalLevel, GoalStatus, JournalEntry, LearningItem,
  Note, Priority, Project, ProjectStatus, Review, ReviewPeriod, WorkContext, Worklog, WorklogSections,
} from './types';
import type { FileInfo } from './ports';
import { normalizeDate, quarterKey, monthKey, weekKey } from './dates';
import { pathId } from './ids';

/**
 * Schema: turns raw frontmatter (+ optional body) into validated entities.
 * Never throws for user data — problems are collected in `issues`.
 */

export const SCHEMA_VERSION = 1;

export interface FolderConfig {
  system: string;
  daily: string;
  worklogs: string;
  knowledge: string;
  projects: string;
  goals: string;
  journal: string;
  resources: string;
  archive: string;
}

export const DEFAULT_FOLDERS: FolderConfig = {
  system: '00-System',
  daily: '01-Daily',
  worklogs: '02-Worklogs',
  knowledge: '03-Knowledge',
  projects: '04-Projects',
  goals: '05-Goals',
  journal: '06-Journal',
  resources: '07-Resources',
  archive: '08-Archive',
};

const KINDS: EntityKind[] = ['note', 'project', 'goal', 'worklog', 'journal', 'daily', 'review', 'learning', 'resource'];

export function inFolder(path: string, folder: string): boolean {
  return path === folder || path.startsWith(folder.replace(/\/$/, '') + '/');
}

export function detectKind(info: FileInfo, folders: FolderConfig): EntityKind | null {
  const t = info.frontmatter?.['type'];
  if (typeof t === 'string' && (KINDS as string[]).includes(t.toLowerCase())) return t.toLowerCase() as EntityKind;
  if (inFolder(info.path, folders.system)) return null;
  if (inFolder(info.path, folders.worklogs)) return 'worklog';
  if (inFolder(info.path, folders.daily)) return 'daily';
  if (inFolder(info.path, folders.journal)) return 'journal';
  if (inFolder(info.path, folders.goals)) return 'goal';
  if (inFolder(info.path, folders.projects)) return 'project';
  if (inFolder(info.path, folders.resources)) return 'resource';
  if (inFolder(info.path, folders.knowledge)) return 'note';
  if (inFolder(info.path, folders.archive)) return 'note';
  return 'note'; // loose notes anywhere count as knowledge
}

// ---------- coercion helpers ----------

export function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  return undefined;
}

export function num(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
  return undefined;
}

export function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => str(x)).filter((x): x is string => !!x);
  const s = str(v);
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

/** "[[Folder/Name|Alias]]" → "name" */
export function linkTarget(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const m = /\[\[([^\]|#]+)/.exec(s);
  const raw = (m ? m[1] : s) ?? '';
  const slash = raw.lastIndexOf('/');
  return (slash >= 0 ? raw.slice(slash + 1) : raw).replace(/\.md$/i, '').trim().toLowerCase() || undefined;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T, issues: string[], field: string): T {
  const s = str(v)?.toLowerCase();
  if (!s) return fallback;
  if ((allowed as readonly string[]).includes(s)) return s as T;
  issues.push(`${field}: unknown value "${s}" (expected ${allowed.join(' | ')})`);
  return fallback;
}

/** Duration: 90, "90m", "1.5h", "1h 30m", "01:30" → minutes */
export function parseDuration(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v)) return v <= 24 ? Math.round(v * 60) : Math.round(v); // ≤24 → hours
  const s = str(v)?.toLowerCase();
  if (!s) return undefined;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  let total = 0;
  let matched = false;
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*(h|std|m|min)/g)) {
    matched = true;
    const n = Number((m[1] ?? '0').replace(',', '.'));
    total += m[2] === 'h' || m[2] === 'std' ? n * 60 : n;
  }
  if (matched) return Math.round(total);
  const n = Number(s.replace(',', '.'));
  if (isFinite(n)) return n <= 24 ? Math.round(n * 60) : Math.round(n);
  return undefined;
}

export function formatMinutes(min: number | undefined): string {
  if (min === undefined) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ---------- body sections ----------

const SECTION_ALIASES: Record<keyof WorklogSections, string[]> = {
  activity: ['tätigkeit', 'tätigkeiten', 'activity', 'was habe ich gemacht', 'beschreibung'],
  learned: ['gelernt', 'learned', 'erkenntnisse', 'neu gelernt'],
  problems: ['probleme', 'problems', 'herausforderungen'],
  solutions: ['lösungen', 'losungen', 'solutions', 'lösung'],
  questions: ['offene fragen', 'questions', 'fragen'],
  next: ['nächste schritte', 'next steps', 'next', 'todo'],
};

export function splitSections(body: string): Map<string, string> {
  const out = new Map<string, string>();
  let current = '_';
  let buf: string[] = [];
  for (const line of body.split('\n')) {
    const h = /^#{1,4}\s+(.+?)\s*$/.exec(line);
    if (h) {
      out.set(current, buf.join('\n').trim());
      current = (h[1] ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
      buf = [];
    } else buf.push(line);
  }
  out.set(current, buf.join('\n').trim());
  return out;
}

export function bulletItems(text: string): string[] {
  const items: string[] = [];
  for (const line of text.split('\n')) {
    const m = /^\s*(?:[-*+]|\d+\.)\s+(?:\[.\]\s+)?(.+)$/.exec(line);
    if (m && m[1] && m[1].trim()) items.push(m[1].trim());
    else if (line.trim() && !line.trim().startsWith('>') && items.length === 0 && !/^[-*+]\s*$/.test(line.trim())) {
      // allow plain paragraph as single item
      items.push(line.trim());
    }
  }
  return items;
}

export function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  if (end < 0) return content;
  const after = content.indexOf('\n', end + 4);
  return after < 0 ? '' : content.slice(after + 1);
}

function pickSection(sections: Map<string, string>, key: keyof WorklogSections): string {
  for (const alias of SECTION_ALIASES[key]) {
    for (const [name, text] of sections) if (name === alias || name.startsWith(alias)) return text;
  }
  return '';
}

export function parseWorklogBody(body: string): WorklogSections {
  const s = splitSections(body);
  return {
    activity: pickSection(s, 'activity'),
    learned: bulletItems(pickSection(s, 'learned')),
    problems: bulletItems(pickSection(s, 'problems')),
    solutions: bulletItems(pickSection(s, 'solutions')),
    questions: bulletItems(pickSection(s, 'questions')),
    next: bulletItems(pickSection(s, 'next')),
  };
}

export function excerptOf(body: string, max = 180): string {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s.*$/gm, ' ')
    .replace(/^\s*[-*+]\s\[.\]\s.*$/gm, ' ')
    .replace(/!\[\[[^\]]*\]\]/g, ' ')
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_m, a: string, b: string) => b || a)
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

// ---------- entity builder ----------

export function toEntity(info: FileInfo, folders: FolderConfig, body?: string): Entity | null {
  const kind = detectKind(info, folders);
  if (!kind) return null;
  const fm = info.frontmatter ?? {};
  const issues: string[] = [];
  const id = str(fm['id']) ?? pathId(info.path);
  const fmTags = list(fm['tags']).map((t) => t.replace(/^#/, '').toLowerCase());
  const tags = Array.from(new Set([...info.tags, ...fmTags]));
  const status = str(fm['status'])?.toLowerCase();
  const base: BaseEntity = {
    path: info.path,
    basename: info.basename,
    mtime: info.mtime,
    ctime: info.ctime,
    id,
    kind,
    title: str(fm['title']) ?? info.h1 ?? (kind === 'worklog' ? info.basename.replace(/^\d{4}-\d{2}-\d{2}\s+/, '') || info.basename : info.basename),
    tags,
    links: info.links,
    area: str(fm['area']),
    archived: inFolder(info.path, folders.archive) || status === 'archived' || fm['archived'] === true,
    testData: fm['sbos-testdata'] === true,
    issues,
  };
  const created = normalizeDate(fm['created']);
  const dateFromName = normalizeDate(info.basename.slice(0, 10));
  const fallbackDate = normalizeDate(fm['date']) ?? dateFromName ?? created ?? new Date(info.ctime).toISOString().slice(0, 10);
  if (fm['date'] !== undefined && !normalizeDate(fm['date'])) issues.push(`date: invalid date "${String(fm['date'])}"`);
  const text = body !== undefined ? stripFrontmatter(body) : undefined;

  switch (kind) {
    case 'project': {
      const p: Project = {
        ...base,
        kind: 'project',
        status: oneOf<ProjectStatus>(fm['status'], ['planned', 'active', 'paused', 'done', 'archived'], 'active', issues, 'status'),
        priority: oneOf<Priority>(fm['priority'], ['urgent', 'high', 'medium', 'low', 'none'], 'none', issues, 'priority'),
        description: str(fm['description']) ?? (text ? excerptOf(text, 160) : ''),
        start: normalizeDate(fm['start']),
        deadline: normalizeDate(fm['deadline'] ?? fm['due']),
        goals: list(fm['goals'] ?? fm['goal']).map((g) => linkTarget(g)).filter((x): x is string => !!x),
      };
      return p;
    }
    case 'goal': {
      const g: Goal = {
        ...base,
        kind: 'goal',
        level: oneOf<GoalLevel>(fm['level'], ['vision', 'year', 'quarter', 'month', 'week'], 'year', issues, 'level'),
        status: oneOf<GoalStatus>(fm['status'], ['active', 'achieved', 'paused', 'dropped'], 'active', issues, 'status'),
        parent: linkTarget(fm['parent']),
        due: normalizeDate(fm['due'] ?? fm['deadline']),
        target: num(fm['target']),
        current: num(fm['current']),
        unit: str(fm['unit']),
        description: str(fm['description']) ?? (text ? excerptOf(text, 160) : ''),
      };
      if (fm['target'] !== undefined && g.target === undefined) issues.push('target: not a number');
      return g;
    }
    case 'worklog': {
      const w: Worklog = {
        ...base,
        kind: 'worklog',
        date: fallbackDate,
        project: linkTarget(fm['project']),
        minutes: parseDuration(fm['duration'] ?? fm['time']),
        technologies: list(fm['technologies'] ?? fm['tech']).map((t) => t.replace(/^\[\[|\]\]$/g, '')),
        context: oneOf<WorkContext>(fm['context'], ['work', 'school', 'private'], 'work', issues, 'context'),
        sections: text !== undefined ? parseWorklogBody(text) : { activity: '', learned: [], problems: [], solutions: [], questions: [], next: [] },
      };
      if (fm['duration'] !== undefined && w.minutes === undefined) issues.push('duration: could not parse');
      return w;
    }
    case 'journal': {
      const sec = text !== undefined ? splitSections(text) : new Map<string, string>();
      let highlights: string[] = [];
      for (const [k, v] of sec) if (k.startsWith('highlight')) highlights = bulletItems(v);
      const mood = num(fm['mood']);
      const j: JournalEntry = {
        ...base,
        kind: 'journal',
        date: fallbackDate,
        mood: mood !== undefined && mood >= 1 && mood <= 5 ? mood : undefined,
        excerpt: text ? excerptOf(text) : '',
        highlights,
      };
      return j;
    }
    case 'daily': {
      const d: DailyNote = {
        ...base,
        kind: 'daily',
        date: fallbackDate,
        focus: str(fm['focus']),
        focusProject: linkTarget(fm['focusProject'] ?? fm['focus_project']),
        motto: str(fm['motto']),
        habits: list(fm['habits']),
      };
      return d;
    }
    case 'review': {
      const period = oneOf<ReviewPeriod>(fm['period'], ['daily', 'weekly', 'monthly', 'quarterly'], 'weekly', issues, 'period');
      const key =
        str(fm['periodKey']) ??
        (period === 'weekly' ? weekKey(fallbackDate) : period === 'monthly' ? monthKey(fallbackDate) : period === 'quarterly' ? quarterKey(fallbackDate) : fallbackDate);
      const r: Review = { ...base, kind: 'review', period, date: fallbackDate, periodKey: key };
      return r;
    }
    case 'learning': {
      const sessions: LearningItem['sessions'] = [];
      if (text) {
        for (const line of text.split('\n')) {
          const m = /^\s*[-*]\s+(\d{4}-\d{2}-\d{2})\b\s*[·:|-]?\s*(.*)$/.exec(line);
          if (m && m[1]) {
            const rest = m[2] ?? '';
            const dm = /(\d+(?:[.,]\d+)?\s*(?:h|min|m))\b/.exec(rest);
            sessions.push({ date: m[1], minutes: dm ? parseDuration(dm[1]) : undefined, text: rest.replace(/^\s*[·|-]\s*/, '').trim() });
          }
        }
      }
      const l: LearningItem = {
        ...base,
        kind: 'learning',
        status: oneOf(fm['status'], ['planned', 'active', 'done', 'paused'] as const, 'active', issues, 'status'),
        progress: num(fm['progress']),
        total: num(fm['total']),
        unit: str(fm['unit']),
        sessions,
      };
      return l;
    }
    case 'note':
    case 'resource': {
      const n: Note = {
        ...base,
        kind,
        topic: str(fm['topic']) ?? topicFromPath(info.path, folders),
        favorite: fm['favorite'] === true || fm['pinned'] === true,
        collection: str(fm['collection']),
        url: str(fm['url'] ?? fm['source']),
        excerpt: text ? excerptOf(text) : '',
        wordCount: text ? (text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0) : 0,
      };
      return n;
    }
  }
}

function topicFromPath(path: string, folders: FolderConfig): string | undefined {
  if (!inFolder(path, folders.knowledge)) return undefined;
  const rest = path.slice(folders.knowledge.length + 1);
  const parts = rest.split('/');
  return parts.length > 1 ? parts[0] : undefined;
}

/** Which kinds need body content for complete models */
export function needsBody(kind: EntityKind): boolean {
  return kind === 'worklog' || kind === 'journal' || kind === 'learning';
}
