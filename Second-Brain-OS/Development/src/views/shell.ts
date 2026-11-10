import { h, clear, preserveScroll, isTypingTarget, modKey } from '../ui/dom';
import { icon } from '../ui/icons';
import { pageTransition, flip, setMotionPreference, enter } from '../ui/motion';
import { toast, setOverlayLayer, installTooltips, menu } from '../ui/components/overlay';
import { openPalette, PaletteCommand } from '../ui/components/palette';
import { openCapture } from '../ui/components/capture';
import { button, iconButton } from '../ui/components/basic';
import type { AppContext, CaptureMode, CapturePreset, PageDef } from './context';
import { NAV, routeForKind } from './meta';
import { PAGES } from './pages';
import type { DataStore, Snapshot } from '../core/store';
import type { Actions } from '../core/actions';
import { ConflictError } from '../core/actions';
import type { VaultPort } from '../core/ports';
import type { Settings } from '../core/settings';
import { today } from '../core/dates';
import { log } from '../core/logger';

export interface ShellDeps {
  store: DataStore;
  actions: Actions;
  port: VaultPort;
  host: 'obsidian' | 'preview';
  settings: Settings;
  saveSettings: () => void;
  now?: () => Date;
  /** extra commands contributed by host (e.g. Obsidian-only) */
  hostCommands?: PaletteCommand[];
  onOpenSettings?: () => void;
}

/**
 * AppShell — sidebar · top bar · workspace · context panel.
 * Owns routing (with history), keyboard shortcuts and the AppContext.
 */
export class AppShell implements AppContext {
  readonly store: DataStore;
  readonly actions: Actions;
  readonly port: VaultPort;
  readonly host: 'obsidian' | 'preview';
  settings: Settings;
  private deps: ShellDeps;

  root!: HTMLElement;
  private sidebar!: HTMLElement;
  private main!: HTMLElement;
  private pageEl!: HTMLElement;
  private crumbsEl!: HTMLElement;
  private actionsEl!: HTMLElement;
  private contextEl!: HTMLElement;
  private contextBody!: HTMLElement;
  private history: string[] = [];
  private future: string[] = [];
  private route = 'home';
  private page: PageDef | null = null;
  private param: string | undefined;
  private unsub: (() => void)[] = [];
  private pageStates = new Map<string, object>();
  private chord: { key: string; at: number } | null = null;
  private lastVersion = -1;
  private renderQueued = false;

  constructor(deps: ShellDeps) {
    this.deps = deps;
    this.store = deps.store;
    this.actions = deps.actions;
    this.port = deps.port;
    this.host = deps.host;
    this.settings = deps.settings;
  }

  // ───────────── AppContext ─────────────
  snap(): Snapshot {
    return this.store.snapshot();
  }
  now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }
  today() {
    return today(this.now());
  }
  saveSettings() {
    this.deps.saveSettings();
  }
  state<T extends object>(key: string, init: T): T {
    let s = this.pageStates.get(key) as T | undefined;
    if (!s) this.pageStates.set(key, (s = init));
    return s;
  }
  projectTitle(key: string | undefined) {
    if (!key) return '';
    return this.snap().byBasename.get(key)?.title ?? key;
  }

  async run(label: string, fn: () => Promise<unknown>, opts: { silent?: boolean; undoable?: boolean } = {}): Promise<boolean> {
    try {
      await fn();
      if (!opts.silent)
        toast(label, {
          tone: 'ok',
          action: opts.undoable && this.actions.canUndo ? { label: 'Undo', run: () => void this.undo() } : undefined,
        });
      return true;
    } catch (e) {
      log.error(`${label} failed`, e);
      toast(e instanceof ConflictError ? e.message : `Couldn’t complete: ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' });
      this.scheduleRender(true);
      return false;
    }
  }

  async undo() {
    try {
      const l = await this.actions.undo();
      toast(l ? `Undone: ${l}` : 'Nothing to undo', { action: l ? { label: 'Redo', run: () => void this.redo() } : undefined });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: 'error' });
    }
  }
  async redo() {
    try {
      const l = await this.actions.redo();
      toast(l ? `Redone: ${l}` : 'Nothing to redo');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: 'error' });
    }
  }

  open(path: string) {
    const e = this.snap().byPath.get(path);
    if (!e) {
      this.edit(path);
      return;
    }
    this.navigate(routeForKind(e.kind, path));
  }
  edit(path: string, opts?: { newLeaf?: boolean; line?: number }) {
    this.port.openFile(path, opts);
  }
  capture(mode: CaptureMode = 'task', preset: Partial<CapturePreset> = {}) {
    openCapture(this, mode, preset);
  }
  palette(initial = '') {
    openPalette(this, this.commands(), initial);
  }
  refresh() {
    this.scheduleRender(true);
  }
  toggleContextPanel(force?: boolean) {
    const open = force ?? !this.settings.ui.contextOpen;
    this.settings.ui.contextOpen = open;
    this.root.classList.toggle('has-context', open);
    this.saveSettings();
    if (open) this.renderContext();
  }

  // ───────────── mounting ─────────────
  mount(container: HTMLElement) {
    setMotionPreference(this.settings.reduceMotion);
    this.root = h('div', {
      class: ['sbos-root', 'sb-app', this.settings.ui.sidebarCollapsed && 'is-collapsed', this.settings.ui.contextOpen && 'has-context', `sb-density-${this.settings.density}`],
      dataset: { accent: this.settings.accent },
      attrs: { tabindex: '-1' },
    });
    const overlay = h('div', { class: 'sb-overlay-layer sbos-root', dataset: { accent: this.settings.accent } });
    setOverlayLayer(overlay);
    this.root.append(this.buildSidebar(), this.buildMain(), this.buildContext());
    container.append(this.root);
    document.body.append(overlay);
    this.unsub.push(() => overlay.remove());
    this.unsub.push(installTooltips(this.root));
    this.unsub.push(installTooltips(overlay));
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    this.unsub.push(this.store.events.on('change', () => this.scheduleRender()));
    this.navigate(this.settings.ui.route || 'home', { replace: true, initial: true });
  }

  destroy() {
    this.page?.dispose?.();
    this.unsub.forEach((u) => u());
    this.root?.remove();
  }

  applySettings(s: Settings) {
    this.settings = s;
    this.root.dataset.accent = s.accent;
    document.querySelectorAll<HTMLElement>('.sb-overlay-layer').forEach((o) => (o.dataset.accent = s.accent));
    this.root.classList.remove('sb-density-comfortable', 'sb-density-compact');
    this.root.classList.add(`sb-density-${s.density}`);
    setMotionPreference(s.reduceMotion);
    this.scheduleRender(true);
  }

  private buildSidebar() {
    const nav = h('nav', { class: 'sb-nav', attrs: { 'aria-label': 'Main navigation' } });
    for (const item of NAV) {
      const a = h('a', { class: 'sb-nav__item', attrs: { href: '#', 'data-tip': this.settings.ui.sidebarCollapsed ? item.label : undefined, 'aria-label': item.label }, dataset: { nav: item.id } },
        icon(item.icon, 18, 'sb-nav__icon'),
        h('span', { class: 'sb-nav__label' }, item.label),
        h('span', { class: 'sb-nav__count sb-num', dataset: { count: item.id } }),
        item.key ? h('span', { class: 'sb-nav__key' }, `G ${item.key.toUpperCase()}`) : null);
      a.addEventListener('click', (e) => { e.preventDefault(); this.navigate(item.route); });
      if (item.id === 'reviews' || item.id === 'archive') nav.append(h('div', { class: 'sb-nav__sep' }));
      nav.append(a);
    }
    const collapse = iconButton(this.settings.ui.sidebarCollapsed ? 'panel-left' : 'panel-left', 'Toggle sidebar  [', () => this.toggleSidebar());
    const settingsBtn = iconButton('settings', 'Settings', (ev) => this.openSettingsMenu(ev.currentTarget as HTMLElement));
    this.sidebar = h('aside', { class: 'sb-sidebar' },
      h('div', { class: 'sb-brand' },
        h('div', { class: 'sb-brand__mark', attrs: { 'aria-hidden': 'true' } }, h('span'), h('span')),
        h('div', { class: 'sb-brand__text' }, h('span', { class: 'sb-brand__name' }, 'Second Brain'), h('span', { class: 'sb-brand__sub' }, 'Personal OS'))),
      h('button', { class: 'sb-sidebar__search', attrs: { type: 'button', 'aria-label': 'Search' }, on: { click: () => this.palette() } },
        icon('search', 15), h('span', null, 'Search'), h('kbd', { class: 'sb-kbd' }, `${modKey} K`)),
      nav,
      h('div', { class: 'sb-sidebar__spacer' }),
      h('div', { class: 'sb-sidebar__projects', dataset: { slot: 'pinned' } }),
      h('div', { class: 'sb-sidebar__footer' }, settingsBtn, collapse));
    return this.sidebar;
  }

  private buildMain() {
    this.crumbsEl = h('div', { class: 'sb-crumbs' });
    this.actionsEl = h('div', { class: 'sb-topbar__page-actions' });
    const topbar = h('header', { class: 'sb-topbar' },
      iconButton('panel-left', 'Menu', () => this.toggleSidebar(), { class: 'sb-topbar__menu' }),
      h('div', { class: 'sb-topbar__nav' },
        iconButton('back', 'Back  Alt ←', () => this.back(), { class: 'sb-hist-back' }),
        iconButton('forward', 'Forward  Alt →', () => this.forward(), { class: 'sb-hist-fwd' })),
      this.crumbsEl,
      h('div', { class: 'sb-topbar__actions' },
        this.actionsEl,
        button({ icon: 'command', title: `Command palette  ${modKey} K`, variant: 'ghost', size: 'sm', onClick: () => this.palette('>') }),
        button({ icon: 'plus', label: 'Capture', variant: 'primary', size: 'sm', shortcut: 'C', onClick: () => this.capture(), class: 'sb-capture-btn' }),
        iconButton('panel-right', 'Context panel  ]', () => this.toggleContextPanel())));
    this.pageEl = h('div', { class: 'sb-page' });
    this.main = h('main', { class: 'sb-main', dataset: { scrollKey: 'main' } }, this.pageEl);
    return h('div', { class: 'sb-workspace' }, topbar, this.main);
  }

  private buildContext() {
    this.contextBody = h('div', { class: 'sb-context__body', dataset: { scrollKey: 'context' } });
    this.contextEl = h('aside', { class: 'sb-context', attrs: { 'aria-label': 'Context' } },
      h('header', { class: 'sb-context__header' }, h('span', null, 'Context'), iconButton('x', 'Close panel', () => this.toggleContextPanel(false))),
      this.contextBody);
    return this.contextEl;
  }

  private toggleSidebar() {
    this.settings.ui.sidebarCollapsed = !this.settings.ui.sidebarCollapsed;
    this.root.classList.toggle('is-collapsed', this.settings.ui.sidebarCollapsed);
    this.sidebar.querySelectorAll<HTMLElement>('.sb-nav__item').forEach((a) => {
      if (this.settings.ui.sidebarCollapsed) a.dataset.tip = a.getAttribute('aria-label') ?? '';
      else delete a.dataset.tip;
    });
    this.saveSettings();
  }

  private openSettingsMenu(anchor: HTMLElement) {
    const accents: Settings['accent'][] = ['indigo', 'blue', 'teal', 'amber', 'rose', 'graphite'];
    menu([
      { label: 'Plugin settings…', icon: 'settings', run: () => this.deps.onOpenSettings?.(), disabled: !this.deps.onOpenSettings },
      { label: 'Customize dashboard', icon: 'kanban', run: () => { this.navigate('home'); this.state('home', { editing: false }).editing = true; this.refresh(); } },
      { label: this.settings.density === 'compact' ? 'Comfortable density' : 'Compact density', icon: 'list', run: () => { this.settings.density = this.settings.density === 'compact' ? 'comfortable' : 'compact'; this.saveSettings(); this.applySettings(this.settings); } },
      { label: this.settings.privacyMode ? 'Disable privacy mode' : 'Enable privacy mode', icon: this.settings.privacyMode ? 'eye' : 'eye-off', run: () => { this.settings.privacyMode = !this.settings.privacyMode; this.saveSettings(); this.refresh(); } },
      { separator: true, label: '' },
      ...accents.map((a) => ({ label: `Accent: ${a[0]!.toUpperCase()}${a.slice(1)}`, checked: this.settings.accent === a, run: () => { this.settings.accent = a; this.saveSettings(); this.applySettings(this.settings); } })),
    ], anchor, { align: 'start' });
  }

  // ───────────── routing ─────────────
  navigate(route: string, opts: { replace?: boolean; initial?: boolean; dir?: 'forward' | 'back' } = {}) {
    const [id, ...rest] = route.split('/');
    let page = PAGES[id ?? 'home'];
    let r = route;
    if (!page) { page = PAGES['home']!; r = 'home'; }
    if (!opts.replace && !opts.initial && r !== this.route) {
      this.history.push(this.route);
      if (this.history.length > 100) this.history.shift();
      if (opts.dir !== 'back' && opts.dir !== 'forward') this.future = [];
    }
    this.page?.dispose?.();
    // on narrow layouts the sidebar is an overlay: close it after choosing a destination
    if (this.root.clientWidth <= 760 && this.root.classList.contains('is-collapsed')) { this.root.classList.remove('is-collapsed'); this.settings.ui.sidebarCollapsed = false; }
    this.route = r;
    this.page = page;
    this.param = rest.length ? rest.join('/') : undefined;
    this.settings.ui.route = r;
    this.saveSettings();
    this.render(opts.initial ? 'none' : opts.dir ?? 'forward', true);
    this.main.scrollTop = 0;
  }
  back() {
    const prev = this.history.pop();
    if (!prev) return;
    this.future.push(this.route);
    this.navigate(prev, { replace: true, dir: 'back' });
  }
  forward() {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(this.route);
    this.navigate(next, { replace: true, dir: 'forward' });
  }

  private scheduleRender(force = false) {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      const v = this.snap().version;
      if (!force && v === this.lastVersion) return;
      this.render('none', false);
    });
  }

  private render(dir: 'forward' | 'back' | 'none', fresh: boolean) {
    const page = this.page;
    if (!page) return;
    this.lastVersion = this.snap().version;
    const t0 = performance.now();
    // nav state
    this.sidebar.querySelectorAll<HTMLElement>('.sb-nav__item').forEach((a) => {
      const on = a.dataset.nav === page.nav;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    this.root.querySelector('.sb-hist-back')?.toggleAttribute('disabled', !this.history.length);
    this.root.querySelector('.sb-hist-fwd')?.toggleAttribute('disabled', !this.future.length);
    this.renderNavCounts();
    this.renderCrumbs();
    clear(this.actionsEl);
    for (const a of page.actions?.(this, this.param) ?? []) this.actionsEl.append(a);

    const draw = () => {
      try {
        clear(this.pageEl);
        this.pageEl.className = `sb-page sb-page--${page.id}`;
        page.render(this, this.pageEl, this.param);
      } catch (e) {
        log.error(`render ${page.id} failed`, e);
        clear(this.pageEl);
        this.pageEl.append(h('div', { class: 'sb-error' }, h('h2', null, 'Something went wrong rendering this page.'), h('pre', null, e instanceof Error ? e.stack ?? e.message : String(e)), button({ label: 'Go home', onClick: () => this.navigate('home') })));
      }
    };
    if (fresh) {
      draw();
      pageTransition(this.pageEl, dir);
      this.pageEl.querySelectorAll(':scope > *').forEach((el, i) => i < 8 && enter(el, i * 26, 4));
    } else {
      const flippable = this.pageEl.querySelectorAll('[data-flip]').length;
      preserveScroll(this.root, () => (flippable && flippable < 250 ? flip(this.pageEl, draw) : draw()));
    }
    if (this.settings.ui.contextOpen) this.renderContext();
    log.debug(`render ${page.id} ${(performance.now() - t0).toFixed(1)}ms`);
  }

  private renderCrumbs() {
    clear(this.crumbsEl);
    const page = this.page!;
    const crumbs = page.crumbs?.(this, this.param) ?? [];
    const all = [...crumbs, { label: page.title(this, this.param) }];
    all.forEach((c, i) => {
      if (i) this.crumbsEl.append(icon('chevron-right', 13, 'sb-crumbs__sep'));
      const last = i === all.length - 1;
      const el = h(c.route && !last ? 'a' : 'span', { class: ['sb-crumbs__item', last && 'is-current'], attrs: { href: c.route && !last ? '#' : undefined, 'aria-current': last ? 'page' : undefined } }, c.label);
      if (c.route && !last) el.addEventListener('click', (e) => { e.preventDefault(); this.navigate(c.route!); });
      this.crumbsEl.append(el);
    });
  }

  private renderNavCounts() {
    const s = this.snap();
    const t = this.today();
    const open = s.tasks.filter((x) => x.status === 'todo' || x.status === 'doing');
    const todayCount = open.filter((x) => (x.due && x.due <= t) || (x.scheduled && x.scheduled <= t)).length;
    const counts: Record<string, number> = {
      today: todayCount,
      projects: s.projects.filter((p) => p.status === 'active' && !p.archived).length,
    };
    this.sidebar.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
      const n = counts[el.dataset.count!];
      el.textContent = n ? String(n) : '';
    });
    // pinned active projects
    const slot = this.sidebar.querySelector<HTMLElement>('[data-slot="pinned"]')!;
    clear(slot);
    const active = s.projects.filter((p) => p.status === 'active' && !p.archived).sort((a, b) => b.mtime - a.mtime).slice(0, 4);
    if (active.length) {
      slot.append(h('div', { class: 'sb-sidebar__label' }, 'Active projects'));
      for (const p of active) {
        const a = h('a', { class: ['sb-nav__item', 'sb-nav__item--sub', this.route === `project/${p.path}` && 'is-active'], attrs: { href: '#', 'aria-label': p.title, 'data-tip': this.settings.ui.sidebarCollapsed ? p.title : undefined } },
          h('span', { class: 'sb-nav__bullet' }), h('span', { class: 'sb-nav__label' }, p.title));
        a.addEventListener('click', (e) => { e.preventDefault(); this.navigate(`project/${p.path}`); });
        slot.append(a);
      }
    }
  }

  private renderContext() {
    clear(this.contextBody);
    const page = this.page;
    if (page?.context) {
      try {
        page.context(this, this.contextBody, this.param);
      } catch (e) {
        log.error('context render failed', e);
      }
    } else {
      this.contextBody.append(h('p', { class: 'sb-muted' }, 'No contextual information for this page.'));
    }
  }

  // ───────────── keyboard ─────────────
  private onKey(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); this.palette(); return; }
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); this.back(); return; }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); this.forward(); return; }
    if (isTypingTarget(e.target)) return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) void this.redo(); else void this.undo(); return; }
    if (mod || e.altKey) return;
    const k = e.key.toLowerCase();
    if (this.chord && Date.now() - this.chord.at < 1200) {
      this.chord = null;
      const item = NAV.find((n) => n.key === k);
      if (item) { e.preventDefault(); this.navigate(item.route); }
      return;
    }
    switch (k) {
      case 'g': this.chord = { key: 'g', at: Date.now() }; e.preventDefault(); break;
      case '/': e.preventDefault(); this.palette(); break;
      case 'c': e.preventDefault(); this.capture('task'); break;
      case 'n': e.preventDefault(); this.capture('note'); break;
      case 'w': e.preventDefault(); this.capture('worklog'); break;
      case '[': e.preventDefault(); this.toggleSidebar(); break;
      case ']': e.preventDefault(); this.toggleContextPanel(); break;
      case '?': e.preventDefault(); this.showShortcuts(); break;
    }
  }

  showShortcuts() {
    const rows: [string, string][] = [
      [`${modKey} K`, 'Search & commands'], ['/', 'Search'], ['C', 'Capture task'], ['N', 'New note'], ['W', 'New worklog'],
      ['G then H/D/W/K/P/T/G/L/J/R/A', 'Go to section'], ['[ / ]', 'Toggle sidebar / context panel'], ['Alt ← / →', 'Back / forward'],
      [`${modKey} Z / ${modKey} ⇧ Z`, 'Undo / redo'], ['Space or X', 'Toggle focused task'], ['Enter', 'Rename focused task'], ['E', 'Open task in note'], ['J / K', 'Next / previous task'],
    ];
    openPalette(this, [], '');
    // replace palette content with shortcut sheet
    const pal = document.querySelector('.sb-palette .sb-modal__body');
    if (pal) {
      clear(pal);
      pal.append(h('div', { class: 'sb-shortcuts' }, h('h2', null, 'Keyboard shortcuts'), ...rows.map(([k, d]) => h('div', { class: 'sb-shortcuts__row' }, h('span', null, d), h('kbd', { class: 'sb-kbd' }, k)))));
    }
  }

  commands(): PaletteCommand[] {
    const nav = NAV.map<PaletteCommand>((n) => ({ id: `go-${n.id}`, label: `Go to ${n.label}`, icon: n.icon, section: 'Navigate', hint: n.key ? `G ${n.key.toUpperCase()}` : undefined, run: () => this.navigate(n.route) }));
    const create: PaletteCommand[] = [
      { id: 'new-task', label: 'New task', icon: 'tasks', section: 'Create', hint: 'C', run: () => this.capture('task') },
      { id: 'new-note', label: 'New note', icon: 'knowledge', section: 'Create', hint: 'N', run: () => this.capture('note') },
      { id: 'new-worklog', label: 'New worklog', icon: 'worklog', section: 'Create', hint: 'W', run: () => this.capture('worklog') },
      { id: 'new-project', label: 'New project', icon: 'projects', section: 'Create', run: () => this.capture('project') },
      { id: 'new-goal', label: 'New goal', icon: 'goals', section: 'Create', run: () => this.capture('goal') },
      { id: 'capture-idea', label: 'Capture idea', icon: 'zap', section: 'Create', run: () => this.capture('idea') },
      { id: 'new-journal', label: 'Write journal entry', icon: 'journal', section: 'Create', run: () => this.capture('journal') },
      { id: 'new-learning', label: 'New learning item', icon: 'learning', section: 'Create', run: () => this.capture('learning') },
    ];
    const review: PaletteCommand[] = (['daily', 'weekly', 'monthly', 'quarterly'] as const).map((p) => ({ id: `review-${p}`, label: `Start ${p} review`, icon: 'reviews', section: 'Review', run: () => this.navigate(`review/${p}`) }));
    const app: PaletteCommand[] = [
      { id: 'undo', label: 'Undo last change', icon: 'undo', section: 'App', hint: `${modKey} Z`, run: () => void this.undo() },
      { id: 'toggle-sidebar', label: 'Toggle sidebar', icon: 'panel-left', section: 'App', hint: '[', run: () => this.toggleSidebar() },
      { id: 'toggle-context', label: 'Toggle context panel', icon: 'panel-right', section: 'App', hint: ']', run: () => this.toggleContextPanel() },
      { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'command', section: 'App', hint: '?', run: () => this.showShortcuts() },
      { id: 'customize', label: 'Customize dashboard', icon: 'kanban', section: 'App', run: () => { this.navigate('home'); this.state('home', { editing: false }).editing = true; this.refresh(); } },
      { id: 'export-week', label: 'Export Ausbildungsnachweis (this week)', icon: 'download', section: 'Worklogs', keywords: 'training record berichtsheft', run: () => this.navigate('worklogs/export') },
    ];
    return [...create, ...nav, ...review, ...app, ...(this.deps.hostCommands ?? [])];
  }
}
