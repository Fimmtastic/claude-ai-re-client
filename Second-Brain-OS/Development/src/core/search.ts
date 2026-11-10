import type { Entity, Task } from './types';
import type { Snapshot } from './store';

/**
 * Global search: fast in-memory scoring over titles, tags, headings and
 * (once loaded) body text. Typo-tolerant prefix/subsequence matching on titles.
 * Designed for < 10 ms on 5k notes per keystroke (see tests/performance).
 */

export interface SearchHit {
  type: 'entity' | 'task';
  entity?: Entity;
  task?: Task;
  score: number;
  title: string;
  subtitle: string;
  snippet?: string;
}

export interface SearchOptions {
  limit?: number;
  kinds?: string[];
  includePrivate?: boolean;
  textOf?: (path: string) => string;
}

export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
}

/** Subsequence fuzzy score in [0,1]; 0 = no match. */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const idx = target.indexOf(query);
  if (idx === 0) return 1;
  if (idx > 0) return target[idx - 1] === ' ' || target[idx - 1] === '-' ? 0.9 : 0.75;
  let qi = 0;
  let gaps = 0;
  let last = -1;
  for (let i = 0; i < target.length && qi < query.length; i++) {
    if (target[i] === query[qi]) {
      if (last >= 0 && i - last > 1) gaps++;
      last = i;
      qi++;
    }
  }
  if (qi < query.length) return 0;
  return Math.max(0.1, 0.55 - gaps * 0.08);
}

export function search(snap: Snapshot, rawQuery: string, opts: SearchOptions = {}): SearchHit[] {
  const q = normalize(rawQuery.trim());
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const limit = opts.limit ?? 30;
  const hits: SearchHit[] = [];
  const kinds = opts.kinds ? new Set(opts.kinds) : null;

  for (const e of snap.entities) {
    if (kinds && !kinds.has(e.kind)) continue;
    if (!opts.includePrivate && e.kind === 'journal') continue;
    const title = normalize(e.title);
    let score = 0;
    const ts = fuzzyScore(q, title);
    score += ts * 10;
    let allTerms = true;
    let snippet: string | undefined;
    const body = opts.textOf ? opts.textOf(e.path) : '';
    for (const term of terms) {
      let found = false;
      if (title.includes(term)) { score += 2; found = true; }
      if (e.tags.some((t) => t.startsWith(term))) { score += 1.5; found = true; }
      if (body) {
        const bi = body.indexOf(term);
        if (bi >= 0) {
          score += 0.6;
          found = true;
          if (!snippet) snippet = makeSnippet(body, bi, term.length);
        }
      }
      if (!found) allTerms = false;
    }
    if (!allTerms && ts === 0) continue;
    if (score <= 0) continue;
    if (e.archived) score *= 0.6;
    // recency boost (max +1)
    score += Math.max(0, 1 - (Date.now() - e.mtime) / (90 * 86400000));
    hits.push({ type: 'entity', entity: e, score, title: e.title, subtitle: e.kind, snippet });
  }

  if (!kinds || kinds.has('task')) {
    for (const t of snap.tasks) {
      const text = normalize(t.text);
      if (!terms.every((term) => text.includes(term))) continue;
      let score = 4 + fuzzyScore(q, text) * 4;
      if (t.status === 'done' || t.status === 'cancelled') score *= 0.5;
      hits.push({ type: 'task', task: t, score, title: t.text, subtitle: 'task' });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

function makeSnippet(body: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 50);
  const end = Math.min(body.length, idx + len + 70);
  return (start > 0 ? '…' : '') + body.slice(start, end).replace(/\s+/g, ' ').trim() + (end < body.length ? '…' : '');
}

/** Debounce helper for search inputs */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): ((...a: A) => void) & { cancel(): void } {
  let t: ReturnType<typeof setTimeout> | null = null;
  const d = (...a: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.cancel = () => t && clearTimeout(t);
  return d;
}
