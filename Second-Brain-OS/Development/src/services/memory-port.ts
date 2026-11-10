import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { FileInfo, VaultEvent, VaultPort } from '../core/ports';

/**
 * In-memory VaultPort used by unit tests, benchmarks and the browser preview.
 * Mirrors the behaviour of the Obsidian port closely enough to exercise the
 * whole data layer (metadata extraction, events, atomic processing).
 */
export class MemoryPort implements VaultPort {
  files = new Map<string, { content: string; ctime: number; mtime: number }>();
  raw = new Map<string, string>();
  trashed: string[] = [];
  opened: string[] = [];
  private listeners = new Set<(ev: VaultEvent) => void>();
  private meta = new Map<string, FileInfo>();
  clock: () => number = () => Date.now();

  constructor(seed: Record<string, string | { content: string; ctime?: number; mtime?: number }> = {}) {
    for (const [p, v] of Object.entries(seed)) {
      const c = typeof v === 'string' ? { content: v } : v;
      const now = this.clock();
      this.files.set(p, { content: c.content, ctime: c.ctime ?? now, mtime: c.mtime ?? c.ctime ?? now });
    }
  }

  private emit(ev: VaultEvent) {
    for (const l of this.listeners) l(ev);
  }

  private info(path: string): FileInfo | null {
    const f = this.files.get(path);
    if (!f) return null;
    const cached = this.meta.get(path);
    if (cached && cached.mtime === f.mtime) return cached;
    const info = extractInfo(path, f.content, f.ctime, f.mtime);
    this.meta.set(path, info);
    return info;
  }

  listFiles(): FileInfo[] {
    return [...this.files.keys()].filter((p) => p.endsWith('.md')).map((p) => this.info(p)!);
  }
  getFile(path: string) {
    return this.info(path);
  }
  exists(path: string) {
    return this.files.has(path) || [...this.files.keys()].some((p) => p.startsWith(path + '/'));
  }
  async read(path: string) {
    const f = this.files.get(path);
    if (!f) throw new Error(`Not found: ${path}`);
    return f.content;
  }
  async create(path: string, content: string) {
    if (this.files.has(path)) throw new Error(`File already exists: ${path}`);
    const now = this.clock();
    this.files.set(path, { content, ctime: now, mtime: now });
    this.emit({ type: 'upsert', path });
  }
  async process(path: string, fn: (c: string) => string) {
    const f = this.files.get(path);
    if (!f) throw new Error(`Not found: ${path}`);
    const next = fn(f.content);
    if (next !== f.content) {
      f.content = next;
      f.mtime = Math.max(this.clock(), f.mtime + 1);
      this.emit({ type: 'upsert', path });
    }
    return next;
  }
  async processFrontMatter(path: string, fn: (fm: Record<string, unknown>) => void) {
    await this.process(path, (content) => {
      const { fm, body } = splitFm(content);
      const data = (fm ? parseYaml(fm) : {}) ?? {};
      fn(data);
      return `---\n${stringifyYaml(data)}---\n${body}`;
    });
  }
  async trash(path: string) {
    if (!this.files.delete(path)) return;
    this.trashed.push(path);
    this.meta.delete(path);
    this.emit({ type: 'delete', path });
  }
  async ensureFolder() {}
  async writeRaw(path: string, content: string) {
    this.raw.set(path, content);
  }
  async readRaw(path: string) {
    return this.raw.get(path) ?? null;
  }
  async listRaw(folder: string) {
    const out = new Set<string>();
    for (const k of this.raw.keys()) if (k.startsWith(folder + '/')) out.add(folder + '/' + k.slice(folder.length + 1).split('/')[0]);
    return [...out];
  }
  async removeRaw(path: string) {
    for (const k of [...this.raw.keys()]) if (k === path || k.startsWith(path + '/')) this.raw.delete(k);
  }
  openFile(path: string) {
    this.opened.push(path);
  }
  async renderMarkdown(md: string, el: HTMLElement) {
    el.innerHTML = miniMarkdown(md);
  }
  subscribe(l: (ev: VaultEvent) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  resolveLink(link: string) {
    const name = link.split('|')[0]!.split('#')[0]!.trim().toLowerCase();
    for (const p of this.files.keys()) {
      const base = p.split('/').pop()!.replace(/\.md$/, '').toLowerCase();
      if (base === name || p.toLowerCase() === name || p.toLowerCase() === name + '.md') return p;
    }
    return null;
  }
  images = new Map<string, string>();
  listImages() {
    return [...this.images.keys()];
  }
  resourceUrl(path: string) {
    return this.images.get(path) ?? null;
  }
  async writeBinary(path: string, data: ArrayBuffer) {
    if (this.images.has(path)) throw new Error(`File already exists: ${path}`);
    const url = typeof URL !== 'undefined' && typeof Blob !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(new Blob([data])) : `mem://${path}`;
    this.images.set(path, url);
  }
  backlinks(path: string) {
    const base = path.split('/').pop()!.replace(/\.md$/, '').toLowerCase();
    return this.listFiles().filter((f) => f.path !== path && f.links.includes(base)).map((f) => f.path);
  }
}

function splitFm(content: string): { fm: string | null; body: string } {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) return { fm: null, body: content };
  const end = content.indexOf('\n---', 3);
  if (end < 0) return { fm: null, body: content };
  const after = content.indexOf('\n', end + 4);
  return { fm: content.slice(4, end + 1), body: after < 0 ? '' : content.slice(after + 1) };
}

export function extractInfo(path: string, content: string, ctime: number, mtime: number): FileInfo {
  const { fm, body } = splitFm(content);
  let frontmatter: Record<string, unknown> | null = null;
  if (fm) {
    try {
      const parsed = parseYaml(fm);
      frontmatter = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
      // obsidian returns dates as strings; yaml parses to strings too unless timestamps — normalise
    } catch {
      frontmatter = null;
    }
  }
  const tags = new Set<string>();
  for (const m of body.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) if (m[1] && !/^\d+$/.test(m[1])) tags.add(m[1].toLowerCase());
  const links = new Set<string>();
  const scan = content; // links in frontmatter count too (like Obsidian's frontmatterLinks)
  for (const m of scan.matchAll(/\[\[([^\]|#]+)/g)) if (m[1]) links.add(m[1].split('/').pop()!.replace(/\.md$/, '').trim().toLowerCase());
  const headings: string[] = [];
  for (const m of body.matchAll(/^#{1,6}\s+(.+)$/gm)) if (m[1]) headings.push(m[1].trim());
  const basename = path.split('/').pop()!.replace(/\.md$/, '');
  const h1 = /^#\s+(.+?)\s*$/m.exec(body)?.[1];
  return { path, basename, ctime, mtime, h1, frontmatter, tags: [...tags], links: [...links], headings, hasTasks: /^\s*[-*+] \[.\]/m.test(body) };
}

/** Tiny markdown renderer for the preview harness only. */
export function miniMarkdown(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const { body } = splitFm(md);
  const out: string[] = [];
  let inList = false;
  let inCode = false;
  for (const raw of body.split('\n')) {
    if (raw.startsWith('```')) {
      out.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }
    if (inCode) { out.push(esc(raw)); continue; }
    const line = esc(raw)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_m, a: string, b: string) => `<a class="internal-link">${b || a}</a>`);
    const li = /^\s*[-*] (?:\[(.)\] )?(.*)$/.exec(line);
    if (li) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(li[1] !== undefined ? `<li class="task-list-item"><input type="checkbox" ${li[1] !== ' ' ? 'checked' : ''} disabled> ${li[2]}</li>` : `<li>${li[2]}</li>`);
      continue;
    }
    if (inList) { out.push('</ul>'); inList = false; }
    const h = /^(#{1,6}) (.*)$/.exec(line);
    if (h) out.push(`<h${h[1]!.length}>${h[2]}</h${h[1]!.length}>`);
    else if (line.startsWith('&gt; ')) out.push(`<blockquote>${line.slice(5)}</blockquote>`);
    else if (line.trim()) out.push(`<p>${line}</p>`);
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}
