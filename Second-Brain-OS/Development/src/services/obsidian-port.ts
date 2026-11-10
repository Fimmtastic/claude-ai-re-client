import { App, Component, MarkdownRenderer, TFile, TFolder, getAllTags, normalizePath, CachedMetadata } from 'obsidian';
import type { FileInfo, VaultEvent, VaultPort } from '../core/ports';

/**
 * VaultPort implementation on top of the official Obsidian API only:
 * Vault, MetadataCache, FileManager, Workspace, MarkdownRenderer.
 */
export class ObsidianPort implements VaultPort {
  private listeners = new Set<(ev: VaultEvent) => void>();
  private refs: { off: () => void }[] = [];

  constructor(private app: App, private owner: Component) {
    const mc = app.metadataCache;
    const v = app.vault;
    // metadataCache 'changed' fires after the cache for a file is up to date
    const onChanged = mc.on('changed', (file) => this.emit({ type: 'upsert', path: file.path }));
    const onDelete = v.on('delete', (f) => f instanceof TFile && f.extension === 'md' && this.emit({ type: 'delete', path: f.path }));
    const onRename = v.on('rename', (f, oldPath) => f instanceof TFile && f.extension === 'md' && this.emit({ type: 'rename', path: f.path, oldPath }));
    for (const r of [onChanged, onDelete, onRename]) owner.registerEvent(r);
  }

  private emit(ev: VaultEvent) {
    for (const l of this.listeners) l(ev);
  }

  private toInfo(f: TFile): FileInfo {
    const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(f);
    const links = new Set<string>();
    for (const l of [...(cache?.links ?? []), ...(cache?.frontmatterLinks ?? []), ...(cache?.embeds ?? [])]) {
      const dest = this.app.metadataCache.getFirstLinkpathDest(l.link.split('#')[0] ?? '', f.path);
      links.add((dest?.basename ?? l.link.split('/').pop()!.split('#')[0]!).toLowerCase());
    }
    const tags = cache ? (getAllTags(cache) ?? []).map((t) => t.replace(/^#/, '').toLowerCase()) : [];
    return {
      path: f.path,
      basename: f.basename,
      mtime: f.stat.mtime,
      ctime: f.stat.ctime,
      frontmatter: (cache?.frontmatter as Record<string, unknown> | undefined) ?? null,
      tags: [...new Set(tags)],
      links: [...links],
      headings: (cache?.headings ?? []).map((h) => h.heading),
      h1: cache?.headings?.find((h) => h.level === 1)?.heading,
      hasTasks: (cache?.listItems ?? []).some((li) => li.task !== undefined),
    };
  }

  private file(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return f instanceof TFile ? f : null;
  }

  listFiles() {
    return this.app.vault.getMarkdownFiles().map((f) => this.toInfo(f));
  }
  getFile(path: string) {
    const f = this.file(path);
    return f ? this.toInfo(f) : null;
  }
  exists(path: string) {
    return !!this.app.vault.getAbstractFileByPath(normalizePath(path));
  }
  async read(path: string) {
    const f = this.file(path);
    if (!f) throw new Error(`Not found: ${path}`);
    return this.app.vault.cachedRead(f);
  }
  async create(path: string, content: string) {
    const p = normalizePath(path);
    if (this.exists(p)) throw new Error(`File already exists: ${p}`);
    await this.app.vault.create(p, content);
  }
  async process(path: string, fn: (c: string) => string) {
    const f = this.file(path);
    if (!f) throw new Error(`Not found: ${path}`);
    return this.app.vault.process(f, fn);
  }
  async processFrontMatter(path: string, fn: (fm: Record<string, unknown>) => void) {
    const f = this.file(path);
    if (!f) throw new Error(`Not found: ${path}`);
    await this.app.fileManager.processFrontMatter(f, fn);
  }
  async trash(path: string) {
    const f = this.file(path);
    if (f) await this.app.fileManager.trashFile(f);
  }
  async ensureFolder(path: string) {
    const p = normalizePath(path);
    const parts = p.split('/');
    let cur = '';
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(cur);
      if (!existing) await this.app.vault.createFolder(cur);
      else if (!(existing instanceof TFolder)) throw new Error(`${cur} is a file, expected folder`);
    }
  }
  async writeRaw(path: string, content: string) {
    const a = this.app.vault.adapter;
    const p = normalizePath(path);
    const dir = p.split('/').slice(0, -1);
    let cur = '';
    for (const part of dir) {
      cur = cur ? `${cur}/${part}` : part;
      if (!(await a.exists(cur))) await a.mkdir(cur);
    }
    await a.write(p, content);
  }
  async readRaw(path: string) {
    const a = this.app.vault.adapter;
    return (await a.exists(path)) ? a.read(path) : null;
  }
  async listRaw(folder: string) {
    const a = this.app.vault.adapter;
    if (!(await a.exists(folder))) return [];
    const l = await a.list(folder);
    return l.folders;
  }
  async removeRaw(path: string) {
    const a = this.app.vault.adapter;
    if (await a.exists(path)) await a.rmdir(path, true);
  }
  openFile(path: string, opts: { newLeaf?: boolean; line?: number } = {}) {
    const f = this.file(path);
    if (!f) return;
    const ws = this.app.workspace;
    // never replace the Second Brain view itself: reuse an editor tab or open a new one
    const leaf = opts.newLeaf ? ws.getLeaf('tab') : ws.getLeavesOfType('markdown')[0] ?? ws.getLeaf('tab');
    void leaf.openFile(f, { active: true, ...(opts.line !== undefined ? { eState: { line: opts.line } } : {}) }).then(() => ws.revealLeaf(leaf));
  }
  async renderMarkdown(md: string, el: HTMLElement, sourcePath: string) {
    el.empty();
    await MarkdownRenderer.render(this.app, md, el, sourcePath, this.owner);
  }
  subscribe(l: (ev: VaultEvent) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  resolveLink(link: string, from: string) {
    return this.app.metadataCache.getFirstLinkpathDest(link.split('|')[0]!.split('#')[0]!, from)?.path ?? null;
  }
  backlinks(path: string) {
    const out: string[] = [];
    const resolved = this.app.metadataCache.resolvedLinks;
    for (const [src, dests] of Object.entries(resolved)) if (dests[path]) out.push(src);
    return out;
  }
}
