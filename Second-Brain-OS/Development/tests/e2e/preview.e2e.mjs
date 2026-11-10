// End-to-end QA of the real AppShell in Chromium (preview harness, in-memory vault).
// Run: npm run e2e   — screenshots land in tests/e2e/screenshots/
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // pre-installed globally or via npm i -D playwright
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const url = 'file://' + path.join(root, 'preview/dist/index.html');
const shots = path.join(root, 'tests/e2e/screenshots');
fs.mkdirSync(shots, { recursive: true });
const only = process.argv.includes('--quick');

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (e) {
    results.push(['FAIL', name, e.message.split('\n')[0]]);
  }
};
const assert = (c, msg) => { if (!c) throw new Error(msg); };

const browser = await chromium.launch();
const errors = [];
async function open(theme = 'dark', route = 'home', viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(`[${theme}/${route}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${theme}/${route}] console: ${m.text()}`); });
  // freeze clock to the demo date so screenshots are deterministic
  await page.clock.setFixedTime(new Date('2026-11-10T10:30:00'));
  await page.goto(`${url}?theme=${theme}&route=${encodeURIComponent(route)}`);
  await page.waitForFunction(() => window.__sbosReady === true);
  await page.waitForTimeout(250);
  return page;
}
const settle = (page, ms = 700) => page.waitForTimeout(ms);

const routes = ['home', 'today', 'tasks', 'worklogs', 'knowledge', 'projects', 'goals', 'learning', 'journal', 'reviews', 'archive'];

// 1. every page renders in both themes without errors
for (const theme of ['dark', 'light']) {
  const page = await open(theme);
  for (const r of only ? ['home'] : routes) {
    await check(`${theme}: render ${r}`, async () => {
      await page.evaluate((route) => window.__sbos.shell.navigate(route), r);
      await settle(page);
      const err = await page.$('.sb-error');
      assert(!err, 'page rendered error box');
      const h = await page.$eval('.sb-page', (el) => el.scrollHeight);
      assert(h > 200, 'page looks empty');
      if (theme === 'dark' || ['home', 'projects', 'worklogs'].includes(r)) await page.screenshot({ path: path.join(shots, `${theme}-${r}.png`) });
    });
  }
  await page.close();
}

const page = await open('dark');

// 2. dashboard widgets show real data
await check('dashboard: focus shows daily focus', async () => {
  const txt = await page.textContent('.sb-focus__text');
  assert(txt?.includes('VLAN-Konzept final'), `focus text was "${txt}"`);
});
await check('dashboard: all 9 widgets present', async () => {
  const n = await page.$$eval('.sb-widget', (els) => els.length);
  assert(n === 9, `found ${n}`);
});

// 3. complete a task from the Today widget, then undo
await check('task: complete + undo via keyboard', async () => {
  const before = await page.evaluate(() => window.__sbos.store.snapshot().tasks.filter((t) => t.status === 'done').length);
  await page.click('.sb-widget[data-widget="today"] .sb-task .sb-check');
  await settle(page, 600);
  const after = await page.evaluate(() => window.__sbos.store.snapshot().tasks.filter((t) => t.status === 'done').length);
  assert(after === before + 1, `done count ${before} → ${after}`);
  await page.click('.sb-hero__title');
  await page.keyboard.press('Control+z');
  await settle(page, 400);
  const undone = await page.evaluate(() => window.__sbos.store.snapshot().tasks.filter((t) => t.status === 'done').length);
  assert(undone === before, `after undo ${undone}`);
});

// 4. quick capture: natural-language task
await check('capture: add task with "tomorrow !high @Netzwerk"', async () => {
  await page.click('.sb-hero__title');
  await page.keyboard.press('c');
  await page.waitForSelector('.sb-capture input.sb-input--lg');
  await page.keyboard.type('E2E Testaufgabe tomorrow !high @Netzwerk');
  await page.keyboard.press('Enter');
  await settle(page, 500);
  const t = await page.evaluate(() => window.__sbos.store.snapshot().tasks.find((x) => x.text.startsWith('E2E Testaufgabe')));
  assert(t, 'task not created');
  assert(t.due === '2026-11-11' && t.priority === 'high' && t.project === 'netzwerk-umbau vlan', JSON.stringify(t));
  const content = await page.evaluate((p) => window.__sbos.port.files.get(p).content, t.path);
  assert(content.includes('E2E Testaufgabe ⏫ 📅 2026-11-11 ^t-'), 'line format');
});

// 5. palette search finds notes by full text
await check('palette: full-text search + open note', async () => {
  await page.keyboard.press('Control+k');
  await page.waitForSelector('.sb-palette__input');
  await page.keyboard.type('broadcast');
  await settle(page, 300);
  const first = await page.textContent('.sb-palette__item.is-active .sb-palette__title');
  assert(first === 'VLAN', `first hit ${first}`);
  await page.keyboard.press('Enter');
  await settle(page, 700);
  const title = await page.textContent('.sb-reader__title');
  assert(title === 'VLAN', `reader title ${title}`);
  await page.screenshot({ path: path.join(shots, 'dark-note-reader.png') });
});

// 6. context panel with smart connections
await check('context panel: backlinks + smart connections', async () => {
  await page.click('.sb-page__title, .sb-reader__title');
  await page.keyboard.press(']');
  await settle(page, 500);
  const txt = await page.textContent('.sb-context__body');
  assert(/Backlinks · [1-9]/.test(txt), 'no backlinks');
  assert(txt.includes('Smart connections'), 'no smart connections');
  await page.screenshot({ path: path.join(shots, 'dark-note-context.png') });
  await page.keyboard.press(']');
});

// 7. worklog creation through the form
await check('worklog: create via form', async () => {
  await page.evaluate(() => window.__sbos.shell.capture('worklog'));
  await page.waitForSelector('.sb-capture input.sb-input--lg');
  await page.fill('.sb-capture input.sb-input--lg', 'E2E Firewall Regeln');
  await page.fill('.sb-capture input[placeholder="e.g. 2h 30m"]', '2h 15m');
  await page.fill('.sb-capture input[placeholder^="Comma separated"]', 'pfSense, Firewall');
  await page.fill('.sb-capture textarea[placeholder^="Tätigkeit"]', 'Regeln geprüft');
  await page.fill('.sb-capture textarea[placeholder^="Gelernt"]', 'Stateful Inspection\nAliases');
  await page.keyboard.press('Control+Enter');
  await settle(page, 700);
  const w = await page.evaluate(() => window.__sbos.store.snapshot().worklogs.find((x) => x.title === 'E2E Firewall Regeln'));
  assert(w && w.minutes === 135 && w.technologies.length === 2 && w.sections.learned.length === 2, JSON.stringify(w));
  const title = await page.textContent('.sb-reader__title');
  assert(title === 'E2E Firewall Regeln', 'did not open created worklog');
});

// 8. project detail + kanban move
await check('project: kanban drag todo → doing', async () => {
  const p = await page.evaluate(() => window.__sbos.store.snapshot().projects.find((x) => x.basename === 'Active Directory Migration').path);
  await page.evaluate((path) => window.__sbos.shell.navigate(`project/${path}`), p);
  await settle(page);
  await page.screenshot({ path: path.join(shots, 'dark-project-detail.png'), fullPage: false });
  await page.evaluate(() => document.querySelector('.sb-board').scrollIntoView({ block: 'start' }));
  await settle(page, 200);
  const card = page.locator('.sb-board__col').nth(0).locator('.sb-board__card').first();
  const text = (await card.locator('.sb-task__text').textContent()).trim();
  await card.dragTo(page.locator('.sb-board__col').nth(1));
  await settle(page, 700);
  const st = await page.evaluate((t) => window.__sbos.store.snapshot().tasks.find((x) => x.text === t)?.status, text);
  assert(st === 'doing', `status ${st} for ${text}`);
});

// 9. projects kanban by status
await check('projects: board view renders 4 columns', async () => {
  await page.evaluate(() => { window.__sbos.settings.ui.projectView = 'kanban'; window.__sbos.shell.navigate('projects'); });
  await settle(page);
  const n = await page.$$eval('.sb-board__col', (e) => e.length);
  assert(n === 4, `cols ${n}`);
  await page.screenshot({ path: path.join(shots, 'dark-projects-board.png') });
  await page.evaluate(() => { window.__sbos.settings.ui.projectView = 'timeline'; window.__sbos.shell.refresh(); });
  await settle(page);
  await page.screenshot({ path: path.join(shots, 'dark-projects-timeline.png') });
});

// 10. worklog views + export
await check('worklogs: calendar, week, skills, export', async () => {
  for (const v of ['calendar', 'week', 'skills']) {
    await page.evaluate((view) => { window.__sbos.settings.ui.worklogView = view; window.__sbos.shell.navigate('home'); window.__sbos.shell.navigate('worklogs'); }, v);
    await page.evaluate((view) => { const s = window.__sbos.shell.state('worklogs', {}); s.view = view; window.__sbos.shell.refresh(); }, v);
    await settle(page);
    assert(!(await page.$('.sb-error')), `${v} errored`);
    await page.screenshot({ path: path.join(shots, `dark-worklogs-${v}.png`) });
  }
  await page.evaluate(() => window.__sbos.shell.navigate('worklogs/export'));
  await settle(page, 900);
  const txt = await page.textContent('.sb-export__preview');
  assert(txt.includes('Ausbildungsnachweis') && txt.includes('Betriebliche Tätigkeiten'), 'export content');
  assert(!txt.includes('Homelab pfSense'), 'private entry leaked into export');
  await page.screenshot({ path: path.join(shots, 'dark-worklogs-export.png') });
});

// 11. guided review saves note
await check('review: daily review saves + sets tomorrow focus', async () => {
  await page.evaluate(() => window.__sbos.shell.navigate('review/daily'));
  await settle(page);
  await page.screenshot({ path: path.join(shots, 'dark-review-step1.png') });
  await page.click('text=Next'); await settle(page, 300);
  await page.click('text=Next'); await settle(page, 300);
  await page.fill('textarea[placeholder="Tomorrow’s single most important thing"]', 'DHCP-Scopes anlegen');
  await page.click('text=Save review');
  await settle(page, 800);
  const r = await page.evaluate(() => ({ rev: window.__sbos.store.snapshot().reviews.find((x) => x.period === 'daily'), tomorrow: window.__sbos.store.snapshot().daily.find((d) => d.date === '2026-11-11') }));
  assert(r.rev && r.tomorrow?.focus === 'DHCP-Scopes anlegen', JSON.stringify(r));
});

// 12. goal metric update writes history
await check('goal: metric +1 writes current + Verlauf', async () => {
  const p = await page.evaluate(() => window.__sbos.store.snapshot().goals.find((g) => g.basename === '12 Fachbücher lesen').path);
  await page.evaluate((path) => window.__sbos.shell.navigate(`goal/${path}`), p);
  await settle(page);
  await page.click('button[aria-label="Increase"]');
  await settle(page, 600);
  const g = await page.evaluate((path) => ({ cur: window.__sbos.store.snapshot().byPath.get(path).current, c: window.__sbos.port.files.get(path).content }), p);
  assert(g.cur === 10 && g.c.includes(': 9 → 10 Bücher'), JSON.stringify(g.cur));
  await page.screenshot({ path: path.join(shots, 'dark-goal-detail.png') });
});

// 13. dashboard customisation: hide + persist order
await check('dashboard: customise hides widget', async () => {
  await page.evaluate(() => window.__sbos.shell.navigate('home'));
  await settle(page);
  await page.click('button[aria-label="Customize dashboard"]');
  await settle(page, 300);
  await page.screenshot({ path: path.join(shots, 'dark-home-customize.png') });
  await page.click('.sb-widget[data-widget="habits"] button[aria-label="Hide widget"]');
  await settle(page, 300);
  await page.click('text=Done');
  await settle(page, 400);
  const n = await page.$$eval('.sb-widget', (e) => e.length);
  assert(n === 8, `widgets ${n}`);
});

// 14. keyboard navigation chords
await check('keyboard: g t → tasks, g p → projects', async () => {
  await page.click('.sb-hero__title');
  await page.keyboard.press('g'); await page.keyboard.press('t');
  await settle(page, 400);
  assert((await page.textContent('.sb-crumbs')).includes('Tasks'), 'not on tasks');
  await page.click('.sb-page__title');
  await page.keyboard.press('g'); await page.keyboard.press('p');
  await settle(page, 400);
  assert((await page.textContent('.sb-crumbs')).includes('Projects'), 'not on projects');
  await page.keyboard.press('Alt+ArrowLeft');
  await settle(page, 400);
  assert((await page.textContent('.sb-crumbs')).includes('Tasks'), 'back failed');
});

// 15. capture modal screenshot
await check('capture modal renders', async () => {
  await page.evaluate(() => window.__sbos.shell.capture('worklog'));
  await settle(page, 400);
  await page.screenshot({ path: path.join(shots, 'dark-capture-worklog.png') });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('>');
  await settle(page, 300);
  await page.screenshot({ path: path.join(shots, 'dark-palette-commands.png') });
  await page.keyboard.press('Escape');
});
await page.close();

// 16. responsive: narrow window + light mode
await check('responsive: 720px width renders without horizontal scroll', async () => {
  const p = await open('light', 'home', { width: 720, height: 900 });
  await settle(p);
  const overflow = await p.evaluate(() => document.querySelector('.sb-main').scrollWidth - document.querySelector('.sb-main').clientWidth);
  assert(overflow <= 1, `overflow ${overflow}px`);
  await p.screenshot({ path: path.join(shots, 'light-home-narrow.png') });
  await p.close();
});

// 17. reduced motion
await check('reduced motion: no running animations after navigation', async () => {
  const p = await open('dark', 'home');
  await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.evaluate(() => window.__sbos.shell.navigate('projects'));
  await p.waitForTimeout(50);
  const running = await p.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().duration > 50).length);
  assert(running === 0, `${running} animations running`);
  await p.close();
});

// 18. performance: navigation render times on demo data
await check('perf: page render < 50ms (demo vault)', async () => {
  const p = await open('dark', 'home');
  const times = await p.evaluate(async (rs) => {
    const out = {};
    for (const r of rs) {
      const t0 = performance.now();
      window.__sbos.shell.navigate(r);
      out[r] = +(performance.now() - t0).toFixed(1);
    }
    return out;
  }, routes);
  console.log('render ms', JSON.stringify(times));
  const worst = Math.max(...Object.values(times));
  assert(worst < 50, `worst ${worst}ms`);
  await p.close();
});

await browser.close();
for (const r of results) console.log(r.join('  '));
if (errors.length) { console.log('\nRuntime errors:'); for (const e of errors) console.log('  ' + e); }
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed, ${errors.length} runtime errors`);
process.exit(failed || errors.length ? 1 : 0);
