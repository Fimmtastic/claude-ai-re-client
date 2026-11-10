// Smoke test of the plugin entry (main.ts) against an Obsidian API mock in Chromium.
import * as esbuild from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const out = path.join(root, 'preview/dist');
const seed = JSON.parse(fs.readFileSync(path.join(out, 'seed.json'), 'utf8'));
await esbuild.build({
  entryPoints: [path.join(root, 'tests/e2e/plugin-harness.ts')], bundle: true, format: 'iife', outfile: path.join(out, 'plugin-harness.js'),
  alias: { obsidian: path.join(root, 'tests/e2e/obsidian-mock.ts') }, define: { __SEED__: JSON.stringify(seed) }, logLevel: 'warning',
});
fs.writeFileSync(path.join(out, 'plugin.html'), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="styles.css"><body><script src="plugin-harness.js"></script></body>');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto('file://' + path.join(out, 'plugin.html'));
await p.waitForFunction(() => window.__pluginReady || window.__pluginError, null, { timeout: 15000 });
const res = [];
const ok = (name, cond, extra = '') => res.push([cond ? 'PASS' : 'FAIL', name, extra]);
ok('plugin onload without error', !(await p.evaluate(() => window.__pluginError)), await p.evaluate(() => window.__pluginError ?? ''));
await p.waitForTimeout(1500);
ok('view opened on startup', await p.evaluate(() => !!document.querySelector('.sbos-view .sb-app')));
ok('commands registered', await p.evaluate(() => window.__plugin.commands.length >= 15), String(await p.evaluate(() => window.__plugin.commands.length)));
ok('immersive classes on body', await p.evaluate(() => document.body.classList.contains('sbos-immersive') && document.body.classList.contains('sbos-app-active')));
ok('sidebars collapsed in immersive mode', await p.evaluate(() => window.__app.workspace.leftSplit.collapsed));
ok('dashboard rendered with data', await p.evaluate(() => document.querySelectorAll('.sb-widget').length === 9));
await p.screenshot({ path: path.join(root, 'tests/e2e/screenshots/plugin-mock-home.png') });
// open a note in the editor → immersive off + back action added
await p.evaluate(() => { const f = window.__app.vault.getMarkdownFiles().find((x) => x.basename === 'VLAN'); window.__plugin.port.openFile(f.path); });
await p.waitForTimeout(300);
ok('editor leaf: immersive removed', await p.evaluate(() => !document.body.classList.contains('sbos-immersive')));
ok('editor leaf: "Back to Second Brain" action', await p.evaluate(() => window.__app.workspace.active.view.actions?.includes('Back to Second Brain')));
ok('app view not replaced by editor', await p.evaluate(() => window.__app.workspace.getLeavesOfType('second-brain-os').length === 1));
// task toggle through plugin actions writes via vault.process + backup via adapter
const r = await p.evaluate(async () => {
  const pl = window.__plugin;
  const t = pl.store.snapshot().tasks.find((x) => x.status === 'todo');
  await pl.actions.setTaskStatus(t, 'done');
  const content = window.__app.vault.files.get(t.path).content;
  return { done: content.split('\n').some((l) => l.includes('[x]') && l.includes(t.text.slice(0, 10))), backup: [...window.__app.vault.adapter ? window.__app.vault.raw.keys() : []].some((k) => k.startsWith('.sbos/backups/')) };
});
ok('task write via vault.process', r.done);
ok('backup written via adapter', r.backup);
await p.waitForTimeout(500);
ok('settings persisted via saveData', await p.evaluate(() => !!window.__plugin.data?.ui?.route));
await p.evaluate(() => window.__plugin.scaffold());
ok('scaffold creates only missing folders', await p.evaluate(() => window.__notice.log.some((m) => m.includes('Second Brain'))), await p.evaluate(() => window.__notice.log.join(' | ')));
// obsidian://second-brain URI actions (iOS Shortcuts / share sheet)
const uri = await p.evaluate(async () => {
  const pl = window.__plugin;
  await pl.handleUri({ add: 'task', text: 'URI Testaufgabe morgen !high' });
  await pl.handleUri({ add: 'idea', text: 'Idee aus dem Share Sheet' });
  await pl.handleUri({ route: 'tasks', capture: 'task', text: 'vorbefüllt' });
  const t = pl.store.snapshot().tasks.find((x) => x.text === 'URI Testaufgabe');
  return { task: t && { due: t.due, prio: t.priority }, idea: pl.store.snapshot().notes.some((n) => n.title.startsWith('Idee – Idee aus')), capture: document.querySelector('.sb-capture input.sb-input--lg')?.value, route: pl.settings.ui.route };
});
const tomorrow = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
ok('URI add=task (quick-add syntax)', uri.task?.due === tomorrow && uri.task?.prio === 'high', JSON.stringify(uri.task));
ok('URI add=idea', uri.idea);
ok('URI route + capture prefilled', uri.route === 'tasks' && uri.capture === 'vorbefüllt', JSON.stringify(uri));
await b.close();
for (const r of res) console.log(r.join('  '));
if (errors.length) console.log('errors:', errors);
const failed = res.filter((r) => r[0] === 'FAIL').length;
console.log(`${res.length - failed}/${res.length} passed, ${errors.length} runtime errors`);
process.exit(failed || errors.length ? 1 : 0);
