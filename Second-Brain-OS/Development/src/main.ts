import { ItemView, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, App, debounce } from 'obsidian';
import { ObsidianPort } from './services/obsidian-port';
import { DataStore } from './core/store';
import { Actions } from './core/actions';
import { DEFAULT_SETTINGS, mergeSettings, Settings, WIDGET_LABELS } from './core/settings';
import { AppShell } from './views/shell';
import { log } from './core/logger';
import { DEFAULT_FOLDERS } from './core/schema';
import type { PaletteCommand } from './ui/components/palette';

export const VIEW_TYPE = 'second-brain-os';

/**
 * Second Brain OS — core plugin entry.
 * Lifecycle: load settings → build port/store/actions → register view,
 * commands, ribbon → index vault when layout is ready.
 */
export default class SecondBrainPlugin extends Plugin {
  settings: Settings = DEFAULT_SETTINGS;
  port!: ObsidianPort;
  store!: DataStore;
  actions!: Actions;
  private shells = new Set<AppShell>();
  private saveDebounced = debounce(() => void this.saveData(this.settings), 400, true);

  override async onload() {
    this.settings = mergeSettings(await this.loadData());
    log.debugEnabled = this.settings.debug;
    this.port = new ObsidianPort(this.app, this);
    this.store = new DataStore(this.port, { folders: this.settings.folders, schedule: (fn) => (window.requestIdleCallback ? window.requestIdleCallback(() => fn(), { timeout: 120 }) : window.setTimeout(fn, 16)) });
    this.actions = new Actions(this.port, this.store, () => this.settings);

    this.registerView(VIEW_TYPE, (leaf) => new SecondBrainView(leaf, this));
    this.addRibbonIcon('brain-circuit', 'Open Second Brain', () => void this.activate());
    this.addSettingTab(new SecondBrainSettingTab(this.app, this));
    this.registerCommands();

    this.app.workspace.onLayoutReady(async () => {
      await log.time('store.init', () => this.store.init());
      void this.actions.pruneBackups().catch((e) => log.warn('backup prune failed', e));
      if (this.settings.openOnStartup) await this.activate();
      this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => this.onLeafChange(leaf)));
      // follow Obsidian's light/dark switch when appearance mode is 'obsidian'
      this.registerEvent(this.app.workspace.on('css-change', () => { for (const s of this.shells) s.applyAppearance(); }));
      this.onLeafChange(this.app.workspace.getMostRecentLeaf());
    });
  }

  override onunload() {
    document.body.classList.remove('sbos-immersive', 'sbos-app-active', 'sbos-hide-obsidian-nav');
    this.store?.destroy();
  }

  saveSettings() {
    this.saveDebounced();
    log.debugEnabled = this.settings.debug;
  }

  applySettingsToShells() {
    this.store.folders = this.settings.folders;
    for (const s of this.shells) s.applySettings(this.settings);
    this.onLeafChange(this.app.workspace.getMostRecentLeaf());
  }

  attach(shell: AppShell) { this.shells.add(shell); }
  detach(shell: AppShell) { this.shells.delete(shell); }
  anyShell(): AppShell | undefined { return [...this.shells][0]; }

  async activate(route?: string) {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = ws.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await ws.revealLeaf(leaf);
    ws.setActiveLeaf(leaf, { focus: true });
    if (this.settings.immersive) {
      ws.leftSplit?.collapse();
      ws.rightSplit?.collapse();
    }
    if (route) (leaf.view as SecondBrainView).shell?.navigate(route);
  }

  /** Immersive mode: hide Obsidian chrome only while our view is the active leaf. */
  refreshHostChrome() {
    this.onLeafChange(this.app.workspace.getMostRecentLeaf());
  }

  private onLeafChange(leaf: WorkspaceLeaf | null) {
    const active = leaf?.view.getViewType() === VIEW_TYPE;
    document.body.classList.toggle('sbos-app-active', active);
    document.body.classList.toggle('sbos-immersive', active && this.settings.immersive);
    document.body.classList.toggle('sbos-hide-obsidian-nav', active && this.settings.bottomNav.hideObsidianBar);
    // Offer a way back from any markdown editor
    if (leaf?.view instanceof MarkdownView) {
      const v = leaf.view as MarkdownView & { __sbosAction?: HTMLElement };
      if (!v.__sbosAction) v.__sbosAction = v.addAction('brain-circuit', 'Back to Second Brain', () => void this.activate());
    }
  }

  private withShell(fn: (s: AppShell) => void) {
    void this.activate().then(() => {
      const s = this.anyShell();
      if (s) fn(s);
    });
  }

  private registerCommands() {
    const add = (id: string, name: string, cb: () => void) => this.addCommand({ id, name, callback: cb });
    add('open', 'Open Second Brain', () => void this.activate());
    add('open-palette', 'Search & command palette', () => this.withShell((s) => s.palette()));
    add('quick-capture', 'Quick capture', () => this.withShell((s) => s.capture('task')));
    add('new-worklog', 'New worklog', () => this.withShell((s) => s.capture('worklog')));
    add('new-note', 'New knowledge note', () => this.withShell((s) => s.capture('note')));
    add('capture-idea', 'Capture idea', () => this.withShell((s) => s.capture('idea')));
    add('go-today', 'Go to Today', () => void this.activate('today'));
    add('go-tasks', 'Go to Tasks', () => void this.activate('tasks'));
    add('daily-review', 'Start daily review', () => void this.activate('review/daily'));
    add('weekly-review', 'Start weekly review', () => void this.activate('review/weekly'));
    add('toggle-immersive', 'Toggle immersive mode', () => { this.settings.immersive = !this.settings.immersive; this.saveSettings(); this.applySettingsToShells(); new Notice(`Immersive mode ${this.settings.immersive ? 'on' : 'off'}`); });
    add('undo', 'Undo last Second Brain change', () => void this.anyShell()?.undo());
    add('scaffold-vault', 'Create missing vault folders (safe)', () => void this.scaffold());
    add('create-backup', 'Create full backup of vault notes', () => void this.fullBackup());
    add('remove-test-data', 'Remove demo / test data (sbos-testdata: true)', () => void this.removeTestData());
    this.addCommand({
      id: 'open-current-in-app', name: 'Show current note in Second Brain',
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (!f) return false;
        if (!checking) void this.activate().then(() => this.anyShell()?.open(f.path));
        return true;
      },
    });
  }

  hostCommands(): PaletteCommand[] {
    return [
      { id: 'host-immersive', label: `${this.settings.immersive ? 'Disable' : 'Enable'} immersive mode`, icon: 'focus', section: 'App', run: () => { this.settings.immersive = !this.settings.immersive; this.saveSettings(); this.applySettingsToShells(); } },
      { id: 'host-files', label: 'Show Obsidian file explorer', icon: 'folder', section: 'App', run: () => { this.app.workspace.leftSplit?.expand(); } },
      { id: 'host-palette', label: 'Obsidian command palette', icon: 'command', section: 'App', run: () => this.runObsidianCommand('command-palette:open') },
      { id: 'host-new-note', label: 'New Obsidian note (plain)', icon: 'file', section: 'App', run: () => this.runObsidianCommand('file-explorer:new-file') },
      { id: 'host-backup', label: 'Create full backup', icon: 'download', section: 'App', run: () => void this.fullBackup() },
      { id: 'host-scaffold', label: 'Create missing vault folders', icon: 'folder', section: 'App', run: () => void this.scaffold() },
      { id: 'host-testdata', label: 'Remove demo / test data', icon: 'trash', section: 'App', run: () => void this.removeTestData() },
    ];
  }

  /** Runs a built-in Obsidian command if available (app.commands is not part of the typed API, so this is guarded). */
  private runObsidianCommand(id: string) {
    const cmds = (this.app as App & { commands?: { executeCommandById?(id: string): boolean } }).commands;
    if (!cmds?.executeCommandById?.(id)) new Notice('This Obsidian command is not available here.');
  }

  /** Creates only missing folders + inbox. Never touches existing files. */
  async scaffold() {
    const f = this.settings.folders;
    let created = 0;
    for (const folder of Object.values(f)) if (!this.port.exists(folder)) { await this.port.ensureFolder(folder); created++; }
    if (!this.port.exists(this.settings.inboxFile)) { await this.port.create(this.settings.inboxFile, '# Inbox\n\n## Tasks\n'); created++; }
    new Notice(created ? `Second Brain: created ${created} missing item(s).` : 'Second Brain: vault structure already complete.');
  }

  async fullBackup() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const files = this.app.vault.getMarkdownFiles();
    let n = 0;
    for (const f of files) {
      await this.port.writeRaw(`.sbos/full-backups/${stamp}/${f.path}`, await this.app.vault.cachedRead(f));
      n++;
    }
    new Notice(`Backup of ${n} notes written to .sbos/full-backups/${stamp}`);
  }

  async removeTestData() {
    const targets = this.app.vault.getMarkdownFiles().filter((f: TFile) => this.app.metadataCache.getFileCache(f)?.frontmatter?.['sbos-testdata'] === true);
    if (!targets.length) { new Notice('No test data found.'); return; }
    const ok = window.confirm(`Move ${targets.length} demo files (sbos-testdata: true) to the trash?`);
    if (!ok) return;
    for (const f of targets) await this.app.fileManager.trashFile(f);
    new Notice(`Removed ${targets.length} demo files (moved to trash).`);
  }
}

class SecondBrainView extends ItemView {
  shell: AppShell | null = null;
  constructor(leaf: WorkspaceLeaf, private plugin: SecondBrainPlugin) {
    super(leaf);
    this.navigation = false;
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Second Brain'; }
  override getIcon() { return 'brain-circuit'; }

  override async onOpen() {
    const el = this.contentEl;
    el.empty();
    el.addClass('sbos-view');
    const p = this.plugin;
    this.shell = new AppShell({
      store: p.store,
      actions: p.actions,
      port: p.port,
      host: 'obsidian',
      settings: p.settings,
      saveSettings: () => p.saveSettings(),
      hostCommands: p.hostCommands(),
      onHostChrome: () => p.refreshHostChrome(),
      onOpenSettings: () => {
        const setting = (this.app as App & { setting?: { open(): void; openTabById(id: string): void } }).setting;
        setting?.open();
        setting?.openTabById(p.manifest.id);
      },
    });
    this.shell.mount(el);
    p.attach(this.shell);
  }

  override async onClose() {
    if (this.shell) {
      this.plugin.detach(this.shell);
      this.shell.destroy();
      this.shell = null;
    }
    document.body.classList.remove('sbos-immersive', 'sbos-app-active', 'sbos-hide-obsidian-nav');
  }
}

class SecondBrainSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SecondBrainPlugin) { super(app, plugin); }
  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const save = () => { this.plugin.saveSettings(); this.plugin.applySettingsToShells(); };
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Second Brain OS' });
    new Setting(containerEl).setName('Your name').setDesc('Used in the dashboard greeting.').addText((t) => t.setValue(s.userName).onChange((v) => { s.userName = v; save(); }));
    new Setting(containerEl).setName('Trainee name').setDesc('Printed on the Ausbildungsnachweis export.').addText((t) => t.setValue(s.traineeName).onChange((v) => { s.traineeName = v; save(); }));
    new Setting(containerEl).setName('Motto').setDesc('Shown on the dashboard unless today’s daily note has its own motto.').addText((t) => t.setValue(s.motto).onChange((v) => { s.motto = v; save(); }));
    new Setting(containerEl).setName('Locale').setDesc('Date formatting, e.g. de-DE or en-GB.').addText((t) => t.setValue(s.locale).onChange((v) => { try { new Intl.DateTimeFormat(v); s.locale = v; save(); } catch { /* ignore invalid */ } }));

    new Setting(containerEl).setName('Appearance studio').setDesc('Themes, accent colour, backgrounds, liquid glass, corner radius and the bottom navigation bar — with live preview.').addButton((b) => b.setButtonText('Open').setCta().onClick(() => void this.plugin.activate('appearance')));
    containerEl.createEl('h3', { text: 'Experience' });
    new Setting(containerEl).setName('Open on startup').addToggle((t) => t.setValue(s.openOnStartup).onChange((v) => { s.openOnStartup = v; save(); }));
    new Setting(containerEl).setName('Immersive mode').setDesc('Hide ribbon, tab bar and status bar while Second Brain is the active tab. Markdown editing is unaffected.').addToggle((t) => t.setValue(s.immersive).onChange((v) => { s.immersive = v; save(); }));
    new Setting(containerEl).setName('Accent').addDropdown((d) => d.addOptions({ indigo: 'Indigo', blue: 'Blue', teal: 'Teal', amber: 'Amber', rose: 'Rose', graphite: 'Graphite', custom: 'Custom (Appearance studio)' }).setValue(s.accent).onChange((v) => { s.accent = v as Settings['accent']; save(); }));
    new Setting(containerEl).setName('Density').addDropdown((d) => d.addOptions({ comfortable: 'Comfortable', compact: 'Compact' }).setValue(s.density).onChange((v) => { s.density = v as Settings['density']; save(); }));
    new Setting(containerEl).setName('Reduce motion').setDesc('System follows your OS preference.').addDropdown((d) => d.addOptions({ system: 'System', on: 'Always reduce', off: 'Full motion' }).setValue(s.reduceMotion).onChange((v) => { s.reduceMotion = v as Settings['reduceMotion']; save(); }));
    new Setting(containerEl).setName('Privacy mode').setDesc('Blur journal excerpts and exclude the journal from global search.').addToggle((t) => t.setValue(s.privacyMode).onChange((v) => { s.privacyMode = v; save(); }));

    containerEl.createEl('h3', { text: 'Dashboard widgets' });
    for (const w of s.dashboard) new Setting(containerEl).setName(WIDGET_LABELS[w.id]).addToggle((t) => t.setValue(w.visible).onChange((v) => { w.visible = v; save(); }));

    containerEl.createEl('h3', { text: 'Habits' });
    new Setting(containerEl).setName('Habits').setDesc('Comma separated. Stored per day in the daily note property “habits”.').addText((t) => t.setValue(s.habits.join(', ')).onChange((v) => { s.habits = v.split(',').map((x) => x.trim()).filter(Boolean); save(); }));

    containerEl.createEl('h3', { text: 'Folders' });
    for (const key of Object.keys(DEFAULT_FOLDERS) as (keyof typeof DEFAULT_FOLDERS)[]) {
      new Setting(containerEl).setName(key).addText((t) => t.setPlaceholder(DEFAULT_FOLDERS[key]).setValue(s.folders[key]).onChange((v) => { s.folders[key] = v.trim() || DEFAULT_FOLDERS[key]; save(); }));
    }
    new Setting(containerEl).setName('Inbox file').addText((t) => t.setValue(s.inboxFile).onChange((v) => { s.inboxFile = v.trim() || DEFAULT_SETTINGS.inboxFile; save(); }));

    containerEl.createEl('h3', { text: 'Data safety' });
    new Setting(containerEl).setName('Backup retention (days)').setDesc('Before the app modifies an existing note it stores a copy in .sbos/backups/<date>/ (once per file per day).').addText((t) => t.setValue(String(s.backupRetentionDays)).onChange((v) => { const n = Number(v); if (n >= 1) { s.backupRetentionDays = n; save(); } }));
    new Setting(containerEl).setName('Full backup now').addButton((b) => b.setButtonText('Create backup').onClick(() => void this.plugin.fullBackup()));
    new Setting(containerEl).setName('Remove demo data').setDesc('Moves all files with “sbos-testdata: true” to the trash.').addButton((b) => b.setButtonText('Remove').setWarning().onClick(() => void this.plugin.removeTestData()));
    new Setting(containerEl).setName('Developer logging').addToggle((t) => t.setValue(s.debug).onChange((v) => { s.debug = v; save(); }));
  }
}
