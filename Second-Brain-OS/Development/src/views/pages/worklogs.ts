import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { button, card, chip, emptyState, pageHeader, sectionTitle, segmented, select, stat, textInput } from '../../ui/components/basic';
import { barChart, shareBars } from '../../ui/components/charts';
import { toast } from '../../ui/components/overlay';
import type { AppContext, PageDef } from '../context';
import type { Worklog } from '../../core/types';
import { exportTrainingRecord, skills, worklogWeek, weeklyTotals, worklogMinutesPerDay } from '../../core/queries';
import { addDays, fmt, parseISO, startOfWeek, toISO, weekKey, range } from '../../core/dates';
import { formatMinutes } from '../../core/schema';

interface WState { view: 'timeline' | 'calendar' | 'week' | 'skills'; project: string; tech: string; q: string; month: string; week: string; context: string; day?: string }

function wlCard(ctx: AppContext, w: Worklog) {
  const el = h('article', { class: 'sb-wl', dataset: { flip: `wl-${w.path}` }, attrs: { tabindex: '0' } },
    h('div', { class: 'sb-wl__rail' }, h('span', { class: 'sb-wl__dot' })),
    h('div', { class: 'sb-wl__body' },
      h('header', { class: 'sb-wl__head' },
        h('h3', { class: 'sb-wl__title' }, w.title),
        h('span', { class: 'sb-grow' }),
        w.minutes !== undefined ? h('span', { class: 'sb-wl__time sb-num' }, icon('clock', 13), formatMinutes(w.minutes)) : null),
      h('div', { class: 'sb-wl__meta' },
        w.project ? chip(ctx.projectTitle(w.project), { icon: 'projects', onClick: () => { const p = ctx.snap().byBasename.get(w.project!); if (p) ctx.open(p.path); } }) : null,
        chip(w.context === 'school' ? 'Berufsschule' : w.context === 'private' ? 'Privat' : 'Betrieb', { tone: w.context === 'private' ? 'warn' : 'neutral' }),
        ...w.technologies.slice(0, 5).map((t) => chip(t, { tone: 'accent' }))),
      w.sections.activity ? h('p', { class: 'sb-wl__text' }, w.sections.activity.replace(/\n+/g, ' ').slice(0, 280)) : null,
      w.sections.learned.length ? h('div', { class: 'sb-wl__learned' }, h('span', { class: 'sb-wl__label' }, icon('sparkle', 12), 'Gelernt'), h('ul', null, ...w.sections.learned.slice(0, 3).map((l) => h('li', null, l)))) : null,
      w.issues.length ? h('p', { class: 'sb-wl__warn' }, icon('flag', 12), w.issues[0]!) : null));
  el.addEventListener('click', () => ctx.open(w.path));
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') ctx.open(w.path); if (e.key === 'e') ctx.edit(w.path); });
  return el;
}

export const WorklogsPage: PageDef = {
  id: 'worklogs',
  nav: 'worklogs',
  title: (_ctx, p) => (p === 'export' ? 'Export' : 'Worklogs'),
  crumbs: (_ctx, p) => (p === 'export' ? [{ label: 'Worklogs', route: 'worklogs' }] : []),
  actions: (ctx) => [button({ label: 'Export', icon: 'download', size: 'sm', variant: 'ghost', onClick: () => ctx.navigate('worklogs/export') })],
  render(ctx, root, param) {
    if (param === 'export') return renderExport(ctx, root);
    const t = ctx.today();
    const st = ctx.state<WState>('worklogs', { view: ctx.settings.ui.worklogView, project: '', tech: '', q: '', month: t.slice(0, 7), week: t, context: '' });
    const snap = ctx.snap();
    const all = snap.worklogs.filter((w) => !w.archived);
    const filtered = all.filter((w) =>
      (!st.project || w.project === st.project) &&
      (!st.tech || w.technologies.some((x) => x.toLowerCase() === st.tech)) &&
      (!st.context || w.context === st.context) &&
      (!st.q || `${w.title} ${w.sections.activity} ${w.sections.learned.join(' ')} ${w.technologies.join(' ')}`.toLowerCase().includes(st.q.toLowerCase())));

    const thisWeek = worklogWeek(all, t);
    const monthMin = all.filter((w) => w.date.startsWith(t.slice(0, 7))).reduce((a, w) => a + (w.minutes ?? 0), 0);
    root.append(pageHeader({ eyebrow: 'Ausbildung · Fachinformatiker Systemintegration', title: 'Worklogs', subtitle: 'Document what you did, learned and solved — every day.', actions: [button({ label: 'New worklog', icon: 'plus', variant: 'primary', shortcut: 'W', onClick: () => ctx.capture('worklog') })] }));
    root.append(h('div', { class: 'sb-stats sb-stats--wide' },
      stat({ label: 'This week', value: +(thisWeek.minutes / 60).toFixed(1), decimals: 1, suffix: ' h', hint: `${thisWeek.entries.length} ${thisWeek.entries.length === 1 ? 'entry' : 'entries'} · ${thisWeek.days} ${thisWeek.days === 1 ? 'day' : 'days'}` }),
      stat({ label: 'This month', value: +(monthMin / 60).toFixed(1), decimals: 1, suffix: ' h' }),
      stat({ label: 'Total entries', value: all.length }),
      stat({ label: 'Skills documented', value: skills(all).length })));

    const projOpts = [{ value: '', label: 'All projects' }, ...[...new Set(all.map((w) => w.project).filter((x): x is string => !!x))].map((k) => ({ value: k, label: ctx.projectTitle(k) }))];
    const techOpts = [{ value: '', label: 'All technologies' }, ...skills(all).map((s) => ({ value: s.name.toLowerCase(), label: s.name }))];
    root.append(h('div', { class: 'sb-toolbar' },
      segmented([{ id: 'timeline', label: 'Timeline', icon: 'timeline' }, { id: 'calendar', label: 'Calendar', icon: 'calendar' }, { id: 'week', label: 'Week', icon: 'reviews' }, { id: 'skills', label: 'Skills', icon: 'learning' }], st.view, (v) => { st.view = v as WState['view']; ctx.settings.ui.worklogView = st.view; ctx.saveSettings(); ctx.refresh(); }),
      h('span', { class: 'sb-grow' }),
      select(projOpts, st.project, (v) => { st.project = v; ctx.refresh(); }),
      select(techOpts, st.tech, (v) => { st.tech = v; ctx.refresh(); }),
      select([{ value: '', label: 'All contexts' }, { value: 'work', label: 'Betrieb' }, { value: 'school', label: 'Berufsschule' }, { value: 'private', label: 'Privat' }], st.context, (v) => { st.context = v; ctx.refresh(); }),
      textInput({ placeholder: 'Search worklogs…', value: st.q, class: 'sb-input--sm', props: { dataset: { focusKey: 'wl-q' } }, onInput: (v) => { st.q = v; ctx.refresh(); } })));

    if (!all.length) {
      root.append(emptyState({ icon: 'worklog', title: 'Start your first worklog', text: 'One entry per day or task: what you did, what you learned, what blocked you. Your weekly report writes itself.', action: button({ label: 'New worklog', variant: 'primary', onClick: () => ctx.capture('worklog') }) }));
      return;
    }

    if (st.view === 'timeline') {
      if (!filtered.length) { root.append(emptyState({ icon: 'filter', title: 'No worklogs match the filters' })); return; }
      let lastWeek = '';
      const list = h('div', { class: 'sb-wl-list' });
      for (const w of filtered.slice(0, 200)) {
        const wk = weekKey(w.date);
        if (wk !== lastWeek) {
          lastWeek = wk;
          const sum = worklogWeek(filtered, w.date);
          list.append(h('div', { class: 'sb-wl-week' }, h('span', null, `KW ${wk.slice(6)}`), h('span', { class: 'sb-muted' }, `${fmt(sum.from, ctx.settings.locale, { day: 'numeric', month: 'short' })} – ${fmt(sum.to, ctx.settings.locale, { day: 'numeric', month: 'short' })}`), h('span', { class: 'sb-grow' }), h('span', { class: 'sb-num sb-muted' }, formatMinutes(sum.minutes))));
        }
        list.append(h('div', { class: 'sb-wl-day' }, h('span', { class: 'sb-wl-day__date' }, h('b', { class: 'sb-num' }, w.date.slice(8)), fmt(w.date, ctx.settings.locale, { weekday: 'short' })), wlCard(ctx, w)));
      }
      if (filtered.length > 200) list.append(h('p', { class: 'sb-muted' }, `Showing 200 of ${filtered.length}. Use filters to narrow down.`));
      root.append(list);
    } else if (st.view === 'calendar') {
      root.append(calendar(ctx, filtered, st));
    } else if (st.view === 'week') {
      root.append(weekView(ctx, filtered, st));
    } else {
      root.append(skillsView(ctx, all));
    }
  },
  context(ctx, el) {
    const snap = ctx.snap();
    const t = ctx.today();
    const sum = worklogWeek(snap.worklogs, t);
    el.append(h('h4', { class: 'sb-context__title' }, `This week · ${sum.week}`),
      h('p', { class: 'sb-muted' }, `${formatMinutes(sum.minutes)} across ${sum.days} days`));
    if (sum.questions.length) el.append(h('h4', { class: 'sb-context__title' }, 'Open questions'), h('ul', { class: 'sb-bullets' }, ...sum.questions.map((q) => h('li', null, q))));
    if (sum.next.length) el.append(h('h4', { class: 'sb-context__title' }, 'Next steps'), h('ul', { class: 'sb-bullets' }, ...sum.next.map((q) => h('li', null, q))));
  },
};

function calendar(ctx: AppContext, logs: Worklog[], st: WState) {
  const [y, m] = st.month.split('-').map(Number) as [number, number];
  const first = toISO(new Date(y, m - 1, 1));
  const last = toISO(new Date(y, m, 0));
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 6);
  const byDate = new Map<string, Worklog[]>();
  for (const w of logs) (byDate.get(w.date) ?? byDate.set(w.date, []).get(w.date)!).push(w);
  const nav = h('div', { class: 'sb-cal__nav' },
    button({ icon: 'chevron-left', title: 'Previous month', variant: 'ghost', size: 'sm', onClick: () => { st.month = toISO(new Date(y, m - 2, 1)).slice(0, 7); ctx.refresh(); } }),
    h('h3', null, fmt(first, ctx.settings.locale, { month: 'long', year: 'numeric' })),
    button({ icon: 'chevron-right', title: 'Next month', variant: 'ghost', size: 'sm', onClick: () => { st.month = toISO(new Date(y, m, 1)).slice(0, 7); ctx.refresh(); } }),
    button({ label: 'Today', variant: 'ghost', size: 'sm', onClick: () => { st.month = ctx.today().slice(0, 7); ctx.refresh(); } }));
  const grid = h('div', { class: 'sb-cal' });
  for (const d of range(start, addDays(start, 6))) grid.append(h('div', { class: 'sb-cal__wd' }, fmt(d, ctx.settings.locale, { weekday: 'short' })));
  const maxMin = Math.max(60, ...[...byDate.values()].map((a) => a.reduce((s, w) => s + (w.minutes ?? 0), 0)));
  for (const d of range(start, end)) {
    const items = byDate.get(d) ?? [];
    const min = items.reduce((s, w) => s + (w.minutes ?? 0), 0);
    const inMonth = d.slice(0, 7) === st.month;
    const cell = h('div', { class: ['sb-cal__day', !inMonth && 'is-out', d === ctx.today() && 'is-today', items.length > 0 && 'has-items', st.day === d && 'is-selected'], style: { '--load': String(min / maxMin) }, attrs: { role: 'button', tabindex: '0', 'aria-label': `${d}: ${items.length} worklogs` } },
      h('div', { class: 'sb-cal__num sb-num' }, String(Number(d.slice(8)))),
      ...items.slice(0, 3).map((w) => {
        const a = h('a', { class: 'sb-cal__item', attrs: { href: '#', title: w.title } }, w.title);
        a.addEventListener('click', (e) => { e.preventDefault(); ctx.open(w.path); });
        return a;
      }),
      items.length > 3 ? h('span', { class: 'sb-cal__more' }, `+${items.length - 3}`) : null,
      min ? h('span', { class: 'sb-cal__min sb-num' }, formatMinutes(min)) : null,
      items.length ? h('span', { class: 'sb-cal__dots' }, ...items.slice(0, 3).map(() => h('i'))) : null);
    cell.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('.sb-cal__item')) return; st.day = st.day === d ? undefined : d; ctx.refresh(); });
    cell.addEventListener('keydown', (e) => { if (e.key === 'Enter') { st.day = d; ctx.refresh(); } });
    cell.addEventListener('dblclick', () => ctx.capture('worklog', { due: d }));
    grid.append(cell);
  }
  const sel = st.day ? byDate.get(st.day) ?? [] : [];
  const dayPanel = st.day
    ? h('div', { class: 'sb-cal__panel' },
        h('div', { class: 'sb-cal__panel-head' },
          h('h3', null, fmt(st.day, ctx.settings.locale, { weekday: 'long', day: 'numeric', month: 'long' })),
          h('span', { class: 'sb-grow' }),
          button({ label: 'Log work', icon: 'plus', size: 'sm', variant: 'subtle', onClick: () => ctx.capture('worklog', { due: st.day }) })),
        sel.length ? h('div', { class: 'sb-wl-list' }, ...sel.map((w) => wlCard(ctx, w))) : h('p', { class: 'sb-muted sb-small' }, 'No worklog on this day.'))
    : h('p', { class: 'sb-muted sb-small' }, 'Tap a day to see its entries · double-click to log work.');
  return h('div', { class: 'sb-cal-wrap' }, nav, grid, dayPanel);
}

function weekView(ctx: AppContext, logs: Worklog[], st: WState) {
  const sum = worklogWeek(logs, st.week);
  const wrap = h('div', { class: 'sb-weekview' });
  wrap.append(h('div', { class: 'sb-cal__nav' },
    button({ icon: 'chevron-left', title: 'Previous week', variant: 'ghost', size: 'sm', onClick: () => { st.week = addDays(st.week, -7); ctx.refresh(); } }),
    h('h3', null, `KW ${sum.week.slice(6)} · ${fmt(sum.from, ctx.settings.locale, { day: 'numeric', month: 'short' })} – ${fmt(sum.to, ctx.settings.locale, { day: 'numeric', month: 'short', year: 'numeric' })}`),
    button({ icon: 'chevron-right', title: 'Next week', variant: 'ghost', size: 'sm', onClick: () => { st.week = addDays(st.week, 7); ctx.refresh(); } }),
    h('span', { class: 'sb-grow' }),
    button({ label: 'Export week', icon: 'download', size: 'sm', onClick: () => { ctx.state('wl-export', { week: st.week }).week = st.week; ctx.navigate('worklogs/export'); } })));
  if (!sum.entries.length) {
    wrap.append(emptyState({ icon: 'calendar', title: 'No worklogs this week' }));
    return wrap;
  }
  const days = worklogMinutesPerDay({ worklogs: logs }, sum.from, sum.to);
  wrap.append(h('div', { class: 'sb-grid' },
    card({ title: 'Summary', class: 'span-6' },
      h('div', { class: 'sb-stats' }, stat({ label: 'Hours', value: +(sum.minutes / 60).toFixed(1), decimals: 1 }), stat({ label: 'Days', value: sum.days }), stat({ label: 'Entries', value: sum.entries.length })),
      barChart(days.map((d) => ({ label: fmt(d.date, ctx.settings.locale, { weekday: 'short' }), value: d.value, tip: `${d.date}: ${formatMinutes(d.value)}` })), { ariaLabel: 'Minutes per weekday', height: 80 })),
    card({ title: 'Time by project', class: 'span-6' }, sum.byProject.length ? shareBars(sum.byProject.map((p) => ({ label: p.project === '—' ? 'No project' : ctx.projectTitle(p.project), value: p.minutes, display: formatMinutes(p.minutes) }))) : h('p', { class: 'sb-muted' }, '—')),
    card({ title: 'Learned', icon: 'sparkle', class: 'span-6' }, sum.learned.length ? h('ul', { class: 'sb-bullets' }, ...sum.learned.map((l) => h('li', null, l))) : h('p', { class: 'sb-muted' }, 'Nothing recorded under “Gelernt”.')),
    card({ title: 'Technologies', icon: 'tag', class: 'span-6' }, sum.technologies.length ? h('div', { class: 'sb-chips' }, ...sum.technologies.map((x) => chip(`${x.name} · ${x.count}`, { tone: 'accent' }))) : h('p', { class: 'sb-muted' }, '—')),
    sum.problems.length ? card({ title: 'Problems → Solutions', class: 'span-12' }, h('div', { class: 'sb-two' }, h('ul', { class: 'sb-bullets' }, ...sum.problems.map((x) => h('li', null, x))), h('ul', { class: 'sb-bullets' }, ...sum.entries.flatMap((e) => e.sections.solutions).map((x) => h('li', null, x))))) : null));
  wrap.append(sectionTitle('Entries', null, sum.entries.length), h('div', { class: 'sb-wl-list' }, ...sum.entries.map((w) => wlCard(ctx, w))));
  return wrap;
}

function skillsView(ctx: AppContext, logs: Worklog[]) {
  const list = skills(logs);
  if (!list.length) return emptyState({ icon: 'learning', title: 'No technologies recorded yet', text: 'Add technologies to your worklogs to build a skill map.' });
  const t = ctx.today();
  const learned = logs.flatMap((w) => w.sections.learned.map((l) => ({ text: l, date: w.date, path: w.path }))).slice(0, 30);
  const weeks = weeklyTotals(worklogMinutesPerDay({ worklogs: logs }, addDays(t, -7 * 12 + 1), t));
  return h('div', { class: 'sb-grid' },
    card({ title: 'Skill map', subtitle: `${list.length} technologies`, class: 'span-7' },
      h('div', { class: 'sb-skills' }, ...list.slice(0, 40).map((s) => {
        const fresh = parseISO(t).getTime() - parseISO(s.first).getTime() < 30 * 86400000;
        return h('div', { class: 'sb-skill' },
          h('div', { class: 'sb-skill__head' }, h('span', { class: 'sb-skill__name' }, s.name), fresh ? chip('new', { tone: 'accent' }) : null, h('span', { class: 'sb-grow' }), h('span', { class: 'sb-num sb-muted' }, `${s.count}×${s.minutes ? ' · ' + formatMinutes(s.minutes) : ''}`)),
          h('div', { class: 'sb-skill__bar' }, h('span', { style: { transform: `scaleX(${s.count / list[0]!.count})` } })),
          h('div', { class: 'sb-skill__dates sb-muted sb-small' }, `since ${fmt(s.first, ctx.settings.locale, { day: 'numeric', month: 'short', year: 'numeric' })} · last ${fmt(s.last, ctx.settings.locale, { day: 'numeric', month: 'short' })}`));
      }))),
    card({ title: 'Recently learned', icon: 'sparkle', class: 'span-5' },
      learned.length ? h('ul', { class: 'sb-learned' }, ...learned.map((l) => {
        const li = h('li', null, h('span', null, l.text), h('span', { class: 'sb-muted sb-num' }, fmt(l.date, ctx.settings.locale, { day: 'numeric', month: 'short' })));
        li.addEventListener('click', () => ctx.open(l.path));
        return li;
      })) : h('p', { class: 'sb-muted' }, '—')),
    card({ title: 'Hours per week', class: 'span-12' }, barChart(weeks.map((w) => ({ label: w.week.slice(6), value: Math.round(w.value / 6) / 10, tip: `${w.week}: ${formatMinutes(w.value)}`, highlight: w.week === weekKey(t) })), { ariaLabel: 'Hours per week, last 12 weeks', height: 90 })));
}

function renderExport(ctx: AppContext, root: HTMLElement) {
  const st = ctx.state('wl-export', { week: ctx.today() });
  const snap = ctx.snap();
  const sum = worklogWeek(snap.worklogs, st.week);
  const md = exportTrainingRecord(sum, { name: ctx.settings.traineeName || undefined, locale: ctx.settings.locale, projectTitle: (k) => ctx.projectTitle(k) });
  root.append(pageHeader({ eyebrow: 'Worklogs', title: 'Ausbildungsnachweis', subtitle: 'Weekly training record generated only from your real entries. Private entries are excluded. Nothing leaves your device.' }));
  const preview = h('div', { class: 'sb-export__preview sb-reader' });
  void ctx.port.renderMarkdown(md, preview, '');
  root.append(h('div', { class: 'sb-cal__nav' },
    button({ icon: 'chevron-left', title: 'Previous week', variant: 'ghost', size: 'sm', onClick: () => { st.week = addDays(st.week, -7); ctx.refresh(); } }),
    h('h3', null, `KW ${sum.week.slice(6)} · ${sum.from} – ${sum.to}`),
    button({ icon: 'chevron-right', title: 'Next week', variant: 'ghost', size: 'sm', onClick: () => { st.week = addDays(st.week, 7); ctx.refresh(); } }),
    h('span', { class: 'sb-grow' }),
    button({ label: 'Copy Markdown', icon: 'file', onClick: async () => { await navigator.clipboard.writeText(md); toast('Copied to clipboard', { tone: 'ok' }); } }),
    button({ label: 'Save as note', icon: 'download', variant: 'primary', disabled: !sum.entries.length, onClick: () => ctx.run('Export saved', async () => {
      const folder = `${ctx.settings.folders.worklogs}/Nachweise`;
      await ctx.port.ensureFolder(folder);
      const path = ctx.actions.uniquePath(folder, `Ausbildungsnachweis ${sum.week}`);
      await ctx.port.create(path, `---\ntype: note\ncreated: ${ctx.today()}\ntags: [ausbildungsnachweis]\n---\n${md}\n`);
      await ctx.store.reindex(path);
      ctx.edit(path);
    }) })));
  root.append(sum.entries.length ? card({ class: 'sb-export' }, preview) : emptyState({ icon: 'worklog', title: 'No worklogs in this week' }));
}
