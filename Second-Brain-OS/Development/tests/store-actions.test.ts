import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryPort } from '../src/services/memory-port';
import { DataStore } from '../src/core/store';
import { Actions, ConflictError, BACKUP_ROOT } from '../src/core/actions';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { projectProgress, goalProgress, bucketTasks, worklogWeek, exportTrainingRecord, related, skills, activity, completedPerDay, streak } from '../src/core/queries';
import { search } from '../src/core/search';

const NOW = new Date('2026-11-10T10:00:00');

function seed() {
  return new MemoryPort({
    '04-Projects/Netzwerk Umbau.md': `---\nid: pr-net00001\ntype: project\nstatus: active\npriority: high\ngoals: ["[[CCNA bestehen]]"]\n---\n# Netzwerk Umbau\n## Milestones\n- [ ] VLAN Konzept #milestone 📅 2026-11-20 ^t-ms0001\n## Tasks\n- [x] Bestandsaufnahme ✅ 2026-11-08 ^t-aaa001\n- [ ] Switch konfigurieren ⏫ 📅 2026-11-10 ^t-aaa002\n- [ ] Doku schreiben\n`,
    '05-Goals/CCNA bestehen.md': `---\nid: gl-ccna0001\ntype: goal\nlevel: year\narea: Career\n---\n# CCNA`,
    '05-Goals/Lesen.md': `---\nid: gl-read0001\ntype: goal\nlevel: year\ntarget: 12\ncurrent: 3\nunit: Bücher\n---\n`,
    '05-Goals/Leer.md': `---\nid: gl-empty001\ntype: goal\n---\n`,
    '02-Worklogs/2026/2026-11-09 Switch.md': `---\nid: wl-0000001\ntype: worklog\ndate: 2026-11-09\nproject: "[[Netzwerk Umbau]]"\nduration: 3h\ntechnologies: [VLAN, Cisco IOS]\ncontext: work\n---\n## Tätigkeit\nSwitch konfiguriert\n## Gelernt\n- Trunk Ports\n`,
    '02-Worklogs/2026/2026-11-10 BS.md': `---\nid: wl-0000002\ntype: worklog\ndate: 2026-11-10\nduration: 90m\ntechnologies: [Subnetting]\ncontext: school\n---\n## Tätigkeit\nSubnetting geübt\n`,
    '02-Worklogs/2026/2026-11-10 Privat.md': `---\nid: wl-0000003\ntype: worklog\ndate: 2026-11-10\nduration: 1h\ncontext: private\n---\n## Tätigkeit\nHomelab\n`,
    '03-Knowledge/Netzwerk/VLAN.md': `---\nid: nt-vlan0001\ntags: [network, vlan]\n---\n# VLAN\nVirtual LANs trennen Broadcast-Domänen. Siehe [[Trunking]].`,
    '03-Knowledge/Netzwerk/Trunking.md': `---\nid: nt-trnk0001\ntags: [network]\n---\n# Trunking\n802.1Q tagging`,
    '00-System/Inbox.md': `# Inbox\n\n## Tasks\n- [ ] Idee notieren\n`,
  });
}

let port: MemoryPort;
let store: DataStore;
let actions: Actions;
beforeEach(async () => {
  port = seed();
  port.clock = () => NOW.getTime();
  store = new DataStore(port);
  await store.init({ awaitBodies: true });
  actions = new Actions(port, store, () => DEFAULT_SETTINGS, () => NOW);
});

describe('store', () => {
  it('indexes entities and tasks with project resolution', () => {
    const s = store.snapshot();
    expect(s.projects).toHaveLength(1);
    expect(s.goals).toHaveLength(3);
    expect(s.worklogs.map((w) => w.date)).toEqual(['2026-11-10', '2026-11-10', '2026-11-09']);
    expect(s.tasks.filter((t) => t.project === 'netzwerk umbau')).toHaveLength(4);
    expect(s.duplicateIds).toEqual([]);
  });
  it('reports duplicate ids', async () => {
    await port.create('03-Knowledge/dup.md', '---\nid: nt-vlan0001\n---\n');
    await store.reindex('03-Knowledge/dup.md');
    expect(store.snapshot().duplicateIds).toEqual(['nt-vlan0001']);
  });
  it('computes progress honestly', () => {
    const s = store.snapshot();
    const p = projectProgress(s, s.projects[0]!);
    expect(p).toEqual({ done: 1, total: 3, ratio: 1 / 3 }); // milestone excluded
    const g = (name: string) => s.goals.find((x) => x.basename === name)!;
    expect(goalProgress(s, g('CCNA bestehen')).ratio).toBeCloseTo(1 / 3);
    expect(goalProgress(s, g('Lesen')).ratio).toBeCloseTo(0.25);
    expect(goalProgress(s, g('Leer')).ratio).toBeNull();
  });
  it('buckets tasks', () => {
    const b = bucketTasks(store.snapshot().tasks, '2026-11-10', DEFAULT_SETTINGS.inboxFile);
    expect(b.today.map((t) => t.text)).toEqual(['Switch konfigurieren']);
    expect(b.inbox.map((t) => t.text)).toEqual(['Idee notieren']);
    expect(b.upcoming.map((t) => t.text)).toEqual(['VLAN Konzept']);
    expect(b.completed).toHaveLength(1);
  });
});

describe('actions', () => {
  it('completes a task, adds block id, backs up and undoes', async () => {
    const t = store.snapshot().tasks.find((x) => x.text === 'Doku schreiben')!;
    expect(t.stable).toBe(false);
    await actions.setTaskStatus(t, 'done');
    const content = await port.read(t.path);
    expect(content).toMatch(/- \[x\] Doku schreiben ✅ 2026-11-10 \^t-[0-9a-z]{6}/);
    expect(port.raw.has(`${BACKUP_ROOT}/2026-11-10/${t.path}`)).toBe(true);
    const after = store.snapshot().tasks.find((x) => x.text === 'Doku schreiben')!;
    expect(after.status).toBe('done');
    await actions.undo();
    expect(await port.read(t.path)).toContain('- [ ] Doku schreiben\n');
    await actions.redo();
    expect(await port.read(t.path)).toContain('- [x] Doku schreiben');
  });
  it('refuses to write when the line changed on disk', async () => {
    const t = store.snapshot().tasks.find((x) => x.text === 'Doku schreiben')!;
    await port.process(t.path, (c) => c.replace('Doku schreiben', 'Doku schreiben (edited)'));
    await expect(actions.setTaskStatus(t, 'done')).rejects.toBeInstanceOf(ConflictError);
  });
  it('finds stable tasks after lines moved', async () => {
    const t = store.snapshot().tasks.find((x) => x.id === 't-aaa002')!;
    await port.process(t.path, (c) => c.replace('## Tasks\n', '## Tasks\n- [ ] inserted above\n'));
    await actions.setTaskStatus(t, 'done');
    expect(await port.read(t.path)).toContain('- [x] Switch konfigurieren ⏫ 📅 2026-11-10 ✅ 2026-11-10 ^t-aaa002');
  });
  it('creates next occurrence for recurring tasks', async () => {
    await actions.addTask({ text: 'Backup prüfen', due: '2026-11-10', recurrence: 'every week' });
    const t = store.snapshot().tasks.find((x) => x.text === 'Backup prüfen')!;
    await actions.setTaskStatus(t, 'done');
    const ts = store.snapshot().tasks.filter((x) => x.text === 'Backup prüfen');
    expect(ts.map((x) => [x.status, x.due])).toEqual([['todo', '2026-11-17'], ['done', '2026-11-10']]);
    expect(new Set(ts.map((x) => x.id)).size).toBe(2);
  });
  it('adds tasks under the project Tasks heading', async () => {
    await actions.addTask({ text: 'Firewall Regeln', project: 'Netzwerk Umbau', priority: 'medium' });
    const c = await port.read('04-Projects/Netzwerk Umbau.md');
    expect(c.trimEnd().split('\n').pop()).toMatch(/^- \[ \] Firewall Regeln 🔼 \^t-/);
  });
  it('creates entities without overwriting and with unique ids', async () => {
    const p1 = await actions.create({ kind: 'note', title: 'VLAN', topic: 'Netzwerk' });
    expect(p1).toBe('03-Knowledge/Netzwerk/VLAN 2.md');
    const e = store.snapshot().byPath.get(p1)!;
    expect(e.id).toMatch(/^nt-/);
    expect(e.id).not.toBe('nt-vlan0001');
    await actions.undo();
    expect(port.exists(p1)).toBe(false);
  });
  it('creates worklogs that parse back', async () => {
    const p = await actions.create({ kind: 'worklog', title: 'Druckerproblem', project: 'Netzwerk Umbau', minutes: 150, technologies: ['CUPS'] });
    const w = store.snapshot().byPath.get(p)!;
    expect(w.kind).toBe('worklog');
    if (w.kind !== 'worklog') return;
    expect(w.minutes).toBe(150);
    expect(w.project).toBe('netzwerk umbau');
    expect(w.date).toBe('2026-11-10');
    expect(p).toBe('02-Worklogs/2026/Druckerproblem.md');
  });
  it('edits frontmatter with undo', async () => {
    await actions.setFrontmatter('04-Projects/Netzwerk Umbau.md', { status: 'paused' });
    expect(store.snapshot().projects[0]!.status).toBe('paused');
    await actions.undo();
    expect(store.snapshot().projects[0]!.status).toBe('active');
  });
  it('ensures review and daily files idempotently', async () => {
    const a = await actions.ensureReview('weekly');
    const b = await actions.ensureReview('weekly');
    expect(a.created).toBe(true);
    expect(b).toEqual({ path: a.path, created: false });
    expect(a.path).toBe('06-Journal/Reviews/2026-W46 Weekly Review.md');
    const d = await actions.ensureDaily();
    expect(d).toBe('01-Daily/2026-11-10.md');
    expect(await actions.ensureDaily()).toBe(d);
  });
});

describe('worklogs & knowledge', () => {
  it('summarises a week and exports only work/school', () => {
    const s = store.snapshot();
    const sum = worklogWeek(s.worklogs, '2026-11-10');
    expect(sum.minutes).toBe(180 + 90 + 60);
    expect(sum.days).toBe(2);
    const md = exportTrainingRecord(sum, { locale: 'de-DE', projectTitle: (k) => k });
    expect(md).toContain('## Betriebliche Tätigkeiten');
    expect(md).toContain('## Berufsschule');
    expect(md).not.toContain('Homelab');
    expect(md).toContain('4,5 h an 2 Tagen');
    expect(skills(s.worklogs).map((k) => k.name)).toEqual(expect.arrayContaining(['VLAN', 'Cisco IOS', 'Subnetting']));
  });
  it('finds related notes with reasons', () => {
    const s = store.snapshot();
    const vlan = s.notes.find((n) => n.basename === 'VLAN')!;
    const r = related(s, vlan, port.backlinks(vlan.path));
    expect(r[0]!.entity.basename).toBe('Trunking');
    expect(r[0]!.reasons).toContain('linked');
  });
  it('searches titles, tags, body and tasks', () => {
    const s = store.snapshot();
    expect(search(s, 'vlan', { textOf: (p) => store.textOf(p) })[0]!.title).toBe('VLAN');
    expect(search(s, 'broadcast', { textOf: (p) => store.textOf(p) })[0]!.title).toBe('VLAN');
    expect(search(s, 'swtch konf').some((h) => h.type === 'task')).toBe(false);
    expect(search(s, 'switch konf').some((h) => h.type === 'task')).toBe(true);
    expect(search(s, 'ntzwrk')[0]!.title).toBe('Netzwerk Umbau'); // fuzzy
  });
  it('derives activity and streaks from real data', () => {
    const s = store.snapshot();
    const series = completedPerDay(s, '2026-11-01', '2026-11-10');
    expect(series.find((d) => d.date === '2026-11-08')!.value).toBe(1);
    expect(streak(series, '2026-11-10')).toBe(0);
    const ev = activity(s, 50, 30, NOW.getTime());
    expect(ev.some((e) => e.verb === 'completed' && e.title === 'Bestandsaufnahme')).toBe(true);
  });
});
