/**
 * Minimal stand-in for the `obsidian` module — implements only the API
 * surface Second Brain OS uses, backed by an in-memory vault. Used to smoke
 * test the real plugin entry (main.ts) in Chromium. This is NOT Obsidian;
 * it verifies our wiring against the documented API shapes.
 */
import { extractInfo, miniMarkdown } from '../../src/services/memory-port';
import { parse, stringify } from 'yaml';

type Handler = (...a: unknown[]) => void;
class Events {
  private h = new Map<string, Set<Handler>>();
  on(name: string, fn: Handler) { (this.h.get(name) ?? this.h.set(name, new Set()).get(name)!).add(fn); return { name, fn, off: () => this.h.get(name)?.delete(fn) }; }
  trigger(name: string, ...a: unknown[]) { this.h.get(name)?.forEach((f) => f(...a)); }
}

export class TAbstractFile { constructor(public path: string) {} get name() { return this.path.split('/').pop()!; } }
export class TFile extends TAbstractFile {
  stat = { mtime: Date.now(), ctime: Date.now(), size: 0 };
  get basename() { return this.name.replace(/\.md$/, ''); }
  get extension() { return this.name.split('.').pop()!; }
}
export class TFolder extends TAbstractFile {}

export const normalizePath = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
export const getAllTags = (c: { tags?: { tag: string }[] }) => (c.tags ?? []).map((t) => t.tag);
export function debounce<T extends unknown[]>(fn: (...a: T) => void, ms: number) { let t: ReturnType<typeof setTimeout>; return (...a: T) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export class Notice { static log: string[] = []; constructor(msg: string) { Notice.log.push(msg); } }
export const MarkdownRenderer = { async render(_app: unknown, md: string, el: HTMLElement) { el.innerHTML = miniMarkdown(md); } };

export class Component {
  _events: { off: () => void }[] = [];
  registerEvent(r: { off: () => void }) { this._events.push(r); }
  register(fn: () => void) { this._events.push({ off: fn }); }
  load() {}
  unload() { this._events.forEach((e) => e.off()); }
}

class Vault extends Events {
  files = new Map<string, { content: string; file: TFile }>();
  folders = new Set<string>();
  raw = new Map<string, string>();
  constructor(private mc: () => MetadataCache) { super(); }
  getMarkdownFiles() { return [...this.files.values()].map((f) => f.file); }
  getAbstractFileByPath(p: string) { return this.files.get(p)?.file ?? (this.folders.has(p) ? new TFolder(p) : null); }
  async cachedRead(f: TFile) { return this.files.get(f.path)!.content; }
  async read(f: TFile) { return this.cachedRead(f); }
  async create(p: string, content: string) {
    if (this.files.has(p)) throw new Error('exists');
    const file = new TFile(p);
    this.files.set(p, { content, file });
    this.mc().index(file, content);
    this.trigger('create', file);
    return file;
  }
  async process(f: TFile, fn: (c: string) => string) {
    const e = this.files.get(f.path)!;
    e.content = fn(e.content);
    e.file.stat.mtime = Date.now();
    this.mc().index(e.file, e.content);
    this.trigger('modify', e.file);
    return e.content;
  }
  async createFolder(p: string) { this.folders.add(p); }
  adapter = {
    exists: async (p: string) => this.raw.has(p) || [...this.raw.keys()].some((k) => k.startsWith(p + '/')),
    mkdir: async () => {},
    write: async (p: string, c: string) => { this.raw.set(p, c); },
    read: async (p: string) => this.raw.get(p) ?? '',
    list: async (p: string) => ({ files: [], folders: [...new Set([...this.raw.keys()].filter((k) => k.startsWith(p + '/')).map((k) => p + '/' + k.slice(p.length + 1).split('/')[0]))] }),
    rmdir: async (p: string) => { for (const k of [...this.raw.keys()]) if (k.startsWith(p)) this.raw.delete(k); },
  };
}

class MetadataCache extends Events {
  cache = new Map<string, Record<string, unknown>>();
  resolvedLinks: Record<string, Record<string, number>> = {};
  constructor(private vault: () => Vault) { super(); }
  index(f: TFile, content: string) {
    const info = extractInfo(f.path, content, f.stat.ctime, f.stat.mtime);
    const links = [...content.matchAll(/\[\[([^\]|#]+)/g)].map((m) => ({ link: m[1]! }));
    this.cache.set(f.path, {
      frontmatter: info.frontmatter ?? undefined,
      tags: info.tags.map((t) => ({ tag: '#' + t })),
      links,
      headings: [...content.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m) => ({ heading: m[2], level: m[1]!.length })),
      listItems: info.hasTasks ? [{ task: ' ' }] : [],
    });
    this.resolvedLinks[f.path] = {};
    for (const l of links) { const d = this.getFirstLinkpathDest(l.link, f.path); if (d) this.resolvedLinks[f.path]![d.path] = 1; }
    setTimeout(() => this.trigger('changed', f), 0);
  }
  getFileCache(f: TFile) { return this.cache.get(f.path) ?? null; }
  getFirstLinkpathDest(link: string, _from: string) {
    const name = link.split('/').pop()!.replace(/\.md$/, '').toLowerCase();
    return this.vault().getMarkdownFiles().find((f) => f.basename.toLowerCase() === name) ?? null;
  }
}

export class WorkspaceLeaf {
  view: ItemView | { getViewType(): string; file?: TFile } = { getViewType: () => 'empty' };
  constructor(private ws: Workspace) {}
  async setViewState(s: { type: string }) {
    const factory = this.ws.factories.get(s.type);
    if (!factory) throw new Error(`No view registered for ${s.type}`);
    const v = factory(this);
    this.view = v;
    await v.onOpen();
  }
  async openFile(f: TFile, s?: { active?: boolean }) { this.view = new MarkdownView(this, f); if (s?.active) this.ws.active = this; this.ws.trigger('active-leaf-change', this); }
  getViewState() { return { type: this.view.getViewType() }; }
}

export class Workspace extends Events {
  factories = new Map<string, (l: WorkspaceLeaf) => ItemView>();
  leaves: WorkspaceLeaf[] = [];
  active: WorkspaceLeaf | null = null;
  leftSplit = { collapsed: false, collapse() { this.collapsed = true; }, expand() { this.collapsed = false; } };
  rightSplit = { collapsed: false, collapse() { this.collapsed = true; }, expand() { this.collapsed = false; } };
  host!: HTMLElement;
  onLayoutReady(cb: () => void) { setTimeout(cb, 0); }
  getLeavesOfType(t: string) { return this.leaves.filter((l) => l.view.getViewType() === t); }
  getLeaf() { const l = new WorkspaceLeaf(this); this.leaves.push(l); return l; }
  async revealLeaf() {}
  setActiveLeaf(l: WorkspaceLeaf) { this.active = l; this.trigger('active-leaf-change', l); }
  getMostRecentLeaf() { return this.active; }
  getActiveFile() { return (this.active?.view as { file?: TFile }).file ?? null; }
}

export class App {
  vault: Vault;
  metadataCache: MetadataCache;
  workspace = new Workspace();
  fileManager = {
    processFrontMatter: async (f: TFile, fn: (fm: Record<string, unknown>) => void) => {
      await this.vault.process(f, (c) => {
        const m = /^---\n([\s\S]*?)\n---\n?/.exec(c);
        const fm = (m ? parse(m[1]!) : {}) ?? {};
        fn(fm);
        return `---\n${stringify(fm)}---\n${m ? c.slice(m[0].length) : c}`;
      });
    },
    trashFile: async (f: TFile) => { this.vault.files.delete(f.path); this.vault.trigger('delete', f); },
  };
  constructor() {
    this.vault = new Vault(() => this.metadataCache);
    this.metadataCache = new MetadataCache(() => this.vault);
  }
}

export class Plugin extends Component {
  static instances: Plugin[] = [];
  commands: { id: string; name: string }[] = [];
  data: unknown = null;
  constructor(public app: App, public manifest: { id: string }) { super(); Plugin.instances.push(this); }
  async loadData() { return this.data; }
  async saveData(d: unknown) { this.data = JSON.parse(JSON.stringify(d)); }
  registerView(type: string, f: (l: WorkspaceLeaf) => ItemView) { this.app.workspace.factories.set(type, f); }
  addRibbonIcon() { return document.createElement('div'); }
  addSettingTab() {}
  addCommand(c: { id: string; name: string }) { this.commands.push(c); return c; }
}

export class ItemView extends Component {
  app: App;
  containerEl = document.createElement('div');
  contentEl: HTMLElement;
  navigation = true;
  actions: string[] = [];
  constructor(public leaf: WorkspaceLeaf) {
    super();
    this.app = (leaf as unknown as { ws: Workspace }).ws ? (Plugin.instances[0]!.app) : Plugin.instances[0]!.app;
    this.contentEl = document.createElement('div');
    (this.contentEl as HTMLElement & { empty(): void; addClass(c: string): void }).empty = function (this: HTMLElement) { this.innerHTML = ''; };
    (this.contentEl as HTMLElement & { addClass(c: string): void }).addClass = function (this: HTMLElement, c: string) { this.classList.add(c); };
    this.containerEl.append(this.contentEl);
    this.contentEl.style.cssText = 'position:fixed;inset:0;';
    document.body.append(this.containerEl);
  }
  getViewType() { return ''; }
  getDisplayText() { return ''; }
  getIcon() { return ''; }
  addAction(_i: string, title: string) { this.actions.push(title); return document.createElement('div'); }
  async onOpen() {}
  async onClose() {}
}
export class MarkdownView extends ItemView {
  constructor(leaf: WorkspaceLeaf, public file: TFile) { super(leaf); this.containerEl.remove(); }
  override getViewType() { return 'markdown'; }
}
export class PluginSettingTab { containerEl = document.createElement('div'); constructor(public app: App, public plugin: Plugin) {} }
export class Setting { constructor(_el: HTMLElement) {} setName() { return this; } setDesc() { return this; } addText() { return this; } addToggle() { return this; } addDropdown() { return this; } addButton() { return this; } }
