import { describe, expect, it } from 'vitest';
import { MemoryPort } from '../src/services/memory-port';
import { DataStore } from '../src/core/store';
import { search } from '../src/core/search';
import { activity, bucketTasks, goalProgress, projectProgress, related, skills, worklogWeek } from '../src/core/queries';

/**
 * Benchmarks with a synthetic vault: 5 000 notes, 300 projects, 1 000 worklogs,
 * ~10 000 tasks. Budgets are deliberately generous for CI noise; actual numbers
 * are printed so regressions are visible.
 */

const N_NOTES = 5000;
const N_PROJECTS = 300;
const N_WORKLOGS = 1000;
const TASKS_PER_PROJECT = 30;

function build(): Record<string, string> {
  const seed: Record<string, string> = {};
  const topics = ['Netzwerk', 'Linux', 'Windows', 'Security', 'Cloud', 'Dev', 'Hardware', 'Misc'];
  const words = 'vlan subnet router switch firewall dns dhcp ldap kerberos docker kubernetes ansible python bash powershell backup restore monitoring grafana proxmox'.split(' ');
  for (let i = 0; i < N_NOTES; i++) {
    const t = topics[i % topics.length]!;
    const w = (k: number) => words[(i * 7 + k) % words.length];
    seed[`03-Knowledge/${t}/Note ${i}.md`] = `---\nid: nt-${i}\ntags: [${w(1)}, ${w(2)}]\n---\n# Note ${i}\n${Array.from({ length: 40 }, (_, k) => w(k)).join(' ')} see [[Note ${(i + 1) % N_NOTES}]] and [[Note ${(i * 3) % N_NOTES}]].\n`;
  }
  for (let p = 0; p < N_PROJECTS; p++) {
    const tasks = Array.from({ length: TASKS_PER_PROJECT }, (_, k) => `- [${k % 3 === 0 ? 'x' : ' '}] Task ${p}-${k} ${k % 5 === 0 ? '⏫' : ''} 📅 2026-${String((k % 12) + 1).padStart(2, '0')}-1${k % 9} ${k % 3 === 0 ? '✅ 2026-11-0' + ((k % 9) + 1) : ''} ^t-p${p}k${k}`).join('\n');
    seed[`04-Projects/Project ${p}.md`] = `---\nid: pr-${p}\ntype: project\nstatus: ${p % 4 === 0 ? 'done' : 'active'}\npriority: high\ngoals: ["[[Goal ${p % 20}]]"]\n---\n# Project ${p}\n## Tasks\n${tasks}\n`;
  }
  for (let g = 0; g < 20; g++) seed[`05-Goals/Goal ${g}.md`] = `---\nid: gl-${g}\ntype: goal\nlevel: year\n---\n`;
  for (let w = 0; w < N_WORKLOGS; w++) {
    const d = new Date(2026, 0, 1 + (w % 310));
    const iso = d.toISOString().slice(0, 10);
    seed[`02-Worklogs/2026/${iso} WL ${w}.md`] = `---\nid: wl-${w}\ntype: worklog\ndate: ${iso}\nproject: "[[Project ${w % N_PROJECTS}]]"\nduration: 3h\ntechnologies: [VLAN, Linux]\n---\n## Tätigkeit\nWork ${w}\n## Gelernt\n- Learned ${w}\n`;
  }
  return seed;
}

const time = async <T>(fn: () => Promise<T> | T): Promise<[T, number]> => {
  const t0 = performance.now();
  const r = await fn();
  return [r, performance.now() - t0];
};

describe('performance (5k notes / 9k tasks)', () => {
  it('indexes, queries and searches within budget', async () => {
    const port = new MemoryPort(build());
    const [, tMeta] = await time(() => { port.listFiles(); }); // yaml parse cost (Obsidian does this natively)
    const store = new DataStore(port, { batchSize: 200 });
    const [, tInit] = await time(() => store.init({ awaitBodies: true }));
    (store as unknown as { snap: unknown }).snap = null; // force a cold snapshot build
    const [snap, tSnap] = await time(() => store.snapshot());
    expect(snap.notes.length).toBe(N_NOTES);
    expect(snap.tasks.length).toBe(N_PROJECTS * TASKS_PER_PROJECT);

    const [, tCached] = await time(() => store.snapshot());

    const [hits, tSearch] = await time(() => search(snap, 'firewall dns', { textOf: (p) => store.textOf(p) }));
    const [, tSearchFuzzy] = await time(() => search(snap, 'nte 123'));
    expect(hits.length).toBeGreaterThan(0);

    const [, tDash] = await time(() => {
      bucketTasks(snap.tasks, '2026-11-10');
      for (const p of snap.projects) projectProgress(snap, p);
      for (const g of snap.goals) goalProgress(snap, g);
      activity(snap, 20, 14);
      worklogWeek(snap.worklogs, '2026-11-10');
      skills(snap.worklogs);
    });
    const [, tRelated] = await time(() => related(snap, snap.notes[42]!, port.backlinks(snap.notes[42]!.path)));

    // incremental update: one file changes
    const target = '04-Projects/Project 7.md';
    const [, tIncr] = await time(async () => {
      await port.process(target, (c) => c.replace('- [ ] Task 7-1 ', '- [x] Task 7-1 '));
      await store.reindex(target);
      store.snapshot();
    });

    const report = { metaParse: tMeta, initAll: tInit, snapshot: tSnap, snapshotCached: tCached, search: tSearch, searchFuzzy: tSearchFuzzy, dashboardQueries: tDash, related: tRelated, incrementalUpdate: tIncr };
    console.log('PERF(ms)', JSON.stringify(Object.fromEntries(Object.entries(report).map(([k, v]) => [k, +v.toFixed(1)]))));

    expect(tSnap).toBeLessThan(250);
    expect(tCached).toBeLessThan(1);
    expect(tSearch).toBeLessThan(60);
    expect(tSearchFuzzy).toBeLessThan(60);
    expect(tDash).toBeLessThan(400);
    expect(tIncr).toBeLessThan(150);
  });
});
