import { describe, expect, it } from 'vitest';
import { parseTaskLine, parseTasks, setLineStatus, nextOccurrence, formatTaskLine, setLineDue } from '../src/core/task-parser';
import { parseDuration, toEntity, DEFAULT_FOLDERS, parseWorklogBody, linkTarget } from '../src/core/schema';
import { extractInfo } from '../src/services/memory-port';
import { addMonths, weekKey, startOfWeek, isISODate } from '../src/core/dates';
import { stringifyYaml } from '../src/core/yaml-lite';
import { parse } from 'yaml';
import { insertUnderHeading } from '../src/core/actions';
import { mergeSettings } from '../src/core/settings';

const ctx = { path: 'a.md' };

describe('task parser', () => {
  it('parses emoji metadata and block ids', () => {
    const t = parseTaskLine('- [ ] Configure VLAN 20 [[Netzwerk]] #net ⏫ 🔁 every week 📅 2026-11-12 ^t-ab12cd', 3, ctx)!;
    expect(t.text).toBe('Configure VLAN 20 [[Netzwerk]] #net');
    expect(t.due).toBe('2026-11-12');
    expect(t.priority).toBe('high');
    expect(t.recurrence).toBe('every week');
    expect(t.id).toBe('t-ab12cd');
    expect(t.stable).toBe(true);
    expect(t.links).toEqual(['netzwerk']);
    expect(t.tags).toEqual(['net']);
    expect(t.line).toBe(3);
  });
  it('parses dataview inline fields and statuses', () => {
    const t = parseTaskLine('  * [/] Write docs [due:: 2026-01-02] [priority:: low]', 0, ctx)!;
    expect(t.status).toBe('doing');
    expect(t.due).toBe('2026-01-02');
    expect(t.priority).toBe('low');
    expect(t.indent).toBe(2);
    expect(parseTaskLine('- [-] x', 0, ctx)!.status).toBe('cancelled');
    expect(parseTaskLine('- [?] unknown status', 0, ctx)).toBeNull();
    expect(parseTaskLine('- not a task', 0, ctx)).toBeNull();
  });
  it('ignores tasks inside code blocks', () => {
    const ts = parseTasks('```\n- [ ] no\n```\n- [ ] yes', ctx);
    expect(ts.map((t) => t.text)).toEqual(['yes']);
  });
  it('sets status and done date while preserving block id', () => {
    const done = setLineStatus('- [ ] Task 📅 2026-11-12 ^t-aaaa11', 'done', '2026-11-10');
    expect(done).toBe('- [x] Task 📅 2026-11-12 ✅ 2026-11-10 ^t-aaaa11');
    expect(setLineStatus(done, 'todo', '2026-11-10')).toBe('- [ ] Task 📅 2026-11-12 ^t-aaaa11');
  });
  it('round-trips format → parse', () => {
    const line = formatTaskLine({ text: 'Backup prüfen', due: '2026-11-20', priority: 'urgent', recurrence: 'every month', projectLink: 'Server', blockId: 't-zz99zz' });
    const t = parseTaskLine(line, 0, ctx)!;
    expect(t.text).toBe('Backup prüfen [[Server]]');
    expect(t.priority).toBe('urgent');
    expect(t.recurrence).toBe('every month');
    expect(t.due).toBe('2026-11-20');
    expect(setLineDue(line, '2026-12-01')).toContain('📅 2026-12-01 ^t-zz99zz');
  });
  it('computes recurrence', () => {
    expect(nextOccurrence('every week', '2026-11-10')).toBe('2026-11-17');
    expect(nextOccurrence('every 2 days', '2026-11-10')).toBe('2026-11-12');
    expect(nextOccurrence('every month', '2026-01-31')).toBe('2026-02-28');
    expect(nextOccurrence('every weekday', '2026-11-13')).toBe('2026-11-16'); // Fri → Mon
    expect(nextOccurrence('monthly', '2026-03-15')).toBe('2026-04-15');
    expect(nextOccurrence('sometimes', '2026-03-15')).toBeUndefined();
  });
});

describe('schema', () => {
  it('parses durations', () => {
    expect(parseDuration('1h 30m')).toBe(90);
    expect(parseDuration('2,5h')).toBe(150);
    expect(parseDuration('01:15')).toBe(75);
    expect(parseDuration(90)).toBe(90);
    expect(parseDuration(7.5)).toBe(450);
    expect(parseDuration('45min')).toBe(45);
    expect(parseDuration('abc')).toBeUndefined();
  });
  it('builds a worklog with sections and validation issues', () => {
    const md = `---\ntype: worklog\ndate: 2026-11-09\nproject: "[[Netzwerk Umbau]]"\nduration: 3h\ntechnologies: [VLAN, Cisco IOS]\ncontext: betrieb\n---\n# Switch\n## Tätigkeit\nSwitch konfiguriert\n## Gelernt\n- Trunk Ports\n- 802.1Q\n## Probleme\n- Native VLAN mismatch\n`;
    const info = extractInfo('02-Worklogs/2026/x.md', md, 1, 2);
    const w = toEntity(info, DEFAULT_FOLDERS, md);
    expect(w?.kind).toBe('worklog');
    if (w?.kind !== 'worklog') throw new Error();
    expect(w.minutes).toBe(180);
    expect(w.project).toBe('netzwerk umbau');
    expect(w.technologies).toEqual(['VLAN', 'Cisco IOS']);
    expect(w.sections.learned).toEqual(['Trunk Ports', '802.1Q']);
    expect(w.sections.activity).toBe('Switch konfiguriert');
    expect(w.context).toBe('work');
    expect(w.issues.join()).toContain('context');
  });
  it('detects kinds by folder and type', () => {
    const a = toEntity(extractInfo('04-Projects/P.md', '# P', 0, 0), DEFAULT_FOLDERS);
    expect(a?.kind).toBe('project');
    const b = toEntity(extractInfo('random/x.md', '---\ntype: goal\n---\n', 0, 0), DEFAULT_FOLDERS);
    expect(b?.kind).toBe('goal');
    expect(toEntity(extractInfo('00-System/Inbox.md', '', 0, 0), DEFAULT_FOLDERS)).toBeNull();
  });
  it('resolves link targets', () => {
    expect(linkTarget('[[Folder/My Goal|alias]]')).toBe('my goal');
    expect(linkTarget('Plain')).toBe('plain');
  });
  it('parses english worklog headings too', () => {
    const s = parseWorklogBody('## Activity\nDid stuff\n## Learned\n- A\n## Next steps\n- B');
    expect(s.learned).toEqual(['A']);
    expect(s.next).toEqual(['B']);
  });
});

describe('dates', () => {
  it('handles ISO weeks and month math', () => {
    expect(weekKey('2026-11-10')).toBe('2026-W46');
    expect(weekKey('2027-01-01')).toBe('2026-W53');
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09');
    expect(addMonths('2026-12-31', 2)).toBe('2027-02-28');
    expect(isISODate('2026-02-30')).toBe(false);
  });
});

describe('yaml-lite', () => {
  it('emits YAML that a real parser reads back identically', () => {
    const obj = { id: 'pr-1', title: 'Hello: world', goals: ['[[A]]', '[[B c]]'], n: 3, flag: true, date: '2026-11-10', yes: 'yes', num: '123', empty: [] };
    expect(parse(stringifyYaml(obj))).toEqual(obj);
  });
});

describe('insertUnderHeading', () => {
  it('inserts at end of the matching section', () => {
    const out = insertUnderHeading('# P\n\n## Tasks\n- [ ] a\n\n## Notes\ntext\n', ['tasks'], '- [ ] b');
    expect(out).toBe('# P\n\n## Tasks\n- [ ] a\n- [ ] b\n\n## Notes\ntext\n');
  });
  it('handles empty sections and missing headings', () => {
    expect(insertUnderHeading('## Tasks\n\n## Notes\n', ['tasks'], '- [ ] x')).toBe('## Tasks\n\n- [ ] x\n\n## Notes\n');
    expect(insertUnderHeading('Hello', ['tasks'], '- [ ] x')).toBe('Hello\n\n- [ ] x\n');
  });
});

describe('settings', () => {
  it('merges stored data forward-compatibly', () => {
    const s = mergeSettings({ userName: 'Alex', dashboard: [{ id: 'goals', visible: false }, { id: 'bogus', visible: true }] });
    expect(s.userName).toBe('Alex');
    expect(s.dashboard[0]).toEqual({ id: 'goals', visible: false });
    expect(s.dashboard.some((w) => (w.id as string) === 'bogus')).toBe(false);
    expect(s.dashboard.length).toBe(9);
    expect(s.folders.projects).toBe('04-Projects');
  });
});

import { parseQuickTask } from '../src/core/quick-parse';
describe('quick add parser', () => {
  const today = '2026-11-10'; // Tuesday
  it('parses dates, priority, project and recurrence (en + de)', () => {
    expect(parseQuickTask('Switch tauschen morgen !high @netz every week', today, ['Netzwerk-Umbau VLAN'])).toEqual({ text: 'Switch tauschen', due: '2026-11-11', priority: 'high', project: 'Netzwerk-Umbau VLAN', recurrence: 'every week' });
    expect(parseQuickTask('Call fri', today).due).toBe('2026-11-13');
    expect(parseQuickTask('Bericht am montag', today).due).toBe('2026-11-16');
    expect(parseQuickTask('Prüfung 20.11.', today).due).toBe('2026-11-20');
    expect(parseQuickTask('Alt 01.02.', today).due).toBe('2027-02-01'); // past date without year → next year
    expect(parseQuickTask('in 3 tagen erledigen', today).due).toBe('2026-11-13');
    expect(parseQuickTask('x !1 wöchentlich', today)).toMatchObject({ priority: 'urgent', recurrence: 'every week' });
  });
  it('leaves unknown @mentions and plain text alone', () => {
    expect(parseQuickTask('Mail an @unbekannt schreiben', today, ['Homelab'])).toEqual({ text: 'Mail an @unbekannt schreiben' });
    expect(parseQuickTask('Mondlandung recherchieren', today).due).toBeUndefined();
  });
});
