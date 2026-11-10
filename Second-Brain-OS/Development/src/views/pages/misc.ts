import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { button, card, chip, emptyState, pageHeader, progressBar, sectionTitle, segmented, stat, statusDot } from '../../ui/components/basic';
import { heatmap, sparkline } from '../../ui/components/charts';
import type { AppContext, PageDef } from '../context';
import type { Entity, LearningItem } from '../../core/types';
import { learningActivity, streak } from '../../core/queries';
import { addDays, fmt, relativeTime } from '../../core/dates';
import { formatMinutes } from '../../core/schema';
import { entityRow } from './common';
import { KIND_LABEL } from '../meta';

// ───────────────────────── Learning ─────────────────────────

export const LearningPage: PageDef = {
  id: 'learning',
  nav: 'learning',
  title: () => 'Learning',
  actions: (ctx) => [button({ label: 'New learning item', icon: 'plus', size: 'sm', variant: 'ghost', onClick: () => ctx.capture('learning') })],
  render(ctx, root) {
    const snap = ctx.snap();
    const t = ctx.today();
    const items = snap.learning.filter((l) => !l.archived);
    const series = learningActivity(snap, addDays(t, -7 * 26 + 1), t);
    const sessions = items.flatMap((l) => l.sessions.map((s) => ({ ...s, item: l }))).sort((a, b) => (a.date < b.date ? 1 : -1));
    const minutes30 = sessions.filter((s) => s.date >= addDays(t, -29)).reduce((a, s) => a + (s.minutes ?? 0), 0);
    const learned = snap.worklogs.flatMap((w) => w.sections.learned.map((x) => ({ text: x, date: w.date, path: w.path }))).slice(0, 12);
    root.append(pageHeader({ eyebrow: 'Learning & Development', title: 'Learning', subtitle: 'Courses, certifications and books — plus everything your worklogs say you learned.' }));
    root.append(h('div', { class: 'sb-stats sb-stats--wide' },
      stat({ label: 'Active items', value: items.filter((i) => i.status === 'active').length }),
      stat({ label: 'Learning streak', value: streak(series, t), suffix: ' d' }),
      stat({ label: 'Active days (26w)', value: series.filter((d) => d.value > 0).length }),
      h('div', { class: 'sb-stat' }, h('span', { class: 'sb-stat__label' }, 'Study time (30d)'), h('span', { class: 'sb-stat__value sb-num' }, minutes30 ? formatMinutes(minutes30) : '—'))));
    root.append(card({ title: 'Consistency', subtitle: 'Sessions, worklog learnings and new notes · 26 weeks' }, heatmap(series, { ariaLabel: 'Learning activity heatmap', locale: ctx.settings.locale, unit: 'activities' })));
    root.append(sectionTitle('Courses & certifications', null, items.length));
    if (!items.length) root.append(emptyState({ icon: 'learning', title: 'Nothing tracked yet', text: 'Track a course like “CCNA” or “LPIC-1” with total units and log sessions inside the note.', action: button({ label: 'Add learning item', onClick: () => ctx.capture('learning') }) }));
    else root.append(h('div', { class: 'sb-learn-grid' }, ...items.sort((a, b) => (a.status === 'active' ? -1 : 1) - (b.status === 'active' ? -1 : 1)).map((l) => learningCard(ctx, l))));
    const two = h('div', { class: 'sb-grid' });
    two.append(card({ title: 'Recent sessions', icon: 'clock', class: 'span-6' }, sessions.length ? h('div', { class: 'sb-list' }, ...sessions.slice(0, 8).map((s) => entityRow(ctx, s.item, { meta: `${fmt(s.date, ctx.settings.locale, { day: 'numeric', month: 'short' })} · ${s.text}` }))) : h('p', { class: 'sb-muted sb-small' }, 'Log sessions as “- 2026-11-10 · 45min · Topic” inside a learning note.')));
    two.append(card({ title: 'Learned at work', icon: 'sparkle', class: 'span-6' }, learned.length ? h('ul', { class: 'sb-learned' }, ...learned.map((l) => { const li = h('li', null, h('span', null, l.text), h('span', { class: 'sb-muted sb-num' }, fmt(l.date, ctx.settings.locale, { day: 'numeric', month: 'short' }))); li.addEventListener('click', () => ctx.open(l.path)); return li; })) : h('p', { class: 'sb-muted sb-small' }, 'Fill “Gelernt” in your worklogs.')));
    root.append(two);
  },
};

function learningCard(ctx: AppContext, l: LearningItem) {
  const ratio = l.total ? Math.min(1, (l.progress ?? 0) / l.total) : null;
  const t = ctx.today();
  const last = l.sessions.map((s) => s.date).sort().pop();
  const weekly = Array.from({ length: 8 }, (_, i) => {
    const from = addDays(t, -7 * (8 - i) + 1);
    const to = addDays(from, 6);
    return l.sessions.filter((s) => s.date >= from && s.date <= to).length;
  });
  const c = card({ class: 'sb-learn', onClick: () => ctx.open(l.path) },
    h('div', { class: 'sb-learn__head' }, h('h3', null, l.title), statusDot(l.status)),
    h('div', { class: 'sb-learn__progress' }, progressBar(ratio, { size: 'sm' }), h('span', { class: 'sb-num sb-muted sb-small' }, l.total ? `${l.progress ?? 0}/${l.total} ${l.unit ?? ''}` : 'No total set')),
    h('div', { class: 'sb-learn__foot' }, h('span', { class: 'sb-muted sb-small' }, last ? `Last session ${fmt(last, ctx.settings.locale, { day: 'numeric', month: 'short' })}` : 'No sessions yet'), h('span', { class: 'sb-grow' }), sparkline(weekly, { width: 72, height: 20, ariaLabel: 'Sessions per week' })));
  if (l.total) {
    const inc = button({ icon: 'plus', title: `+1 ${l.unit ?? 'unit'}`, size: 'sm', variant: 'subtle', onClick: (e) => { e.stopPropagation(); void ctx.run('Progress +1', async () => { await ctx.actions.setFrontmatter(l.path, { progress: (l.progress ?? 0) + 1 }, 'Learning progress'); await ctx.actions.appendToSection(l.path, ['sessions'], `- ${t} · ${l.unit ?? 'unit'} ${(l.progress ?? 0) + 1} abgeschlossen`); }, { undoable: true }); } });
    c.querySelector('.sb-learn__head')!.append(inc);
  }
  return c;
}

// ───────────────────────── Journal ─────────────────────────

export const JournalPage: PageDef = {
  id: 'journal',
  nav: 'journal',
  title: () => 'Journal',
  actions: (ctx) => [button({ label: 'Write', icon: 'edit', size: 'sm', variant: 'ghost', onClick: () => ctx.capture('journal') })],
  render(ctx, root) {
    const snap = ctx.snap();
    const t = ctx.today();
    const entries = snap.journal.filter((j) => !j.archived);
    const todayEntry = entries.find((j) => j.date === t);
    root.append(pageHeader({ eyebrow: 'Personal Journal', title: 'Journal', subtitle: 'Private by design. Stored as plain Markdown in 06-Journal.' }));
    if (ctx.settings.privacyMode) root.append(h('div', { class: 'sb-banner' }, icon('eye-off', 15), 'Privacy mode is on — excerpts are blurred. Hover to reveal.'));
    root.append(card({ class: 'sb-journal-today' },
      h('div', { class: 'sb-journal-today__date' }, fmt(t, ctx.settings.locale, { weekday: 'long', day: 'numeric', month: 'long' })),
      todayEntry ? h('p', { class: ['sb-journal-today__text', ctx.settings.privacyMode && 'is-private'] }, todayEntry.excerpt || 'Entry started — keep writing.') : h('p', { class: 'sb-journal-today__prompt' }, randomPrompt(t)),
      h('div', { class: 'sb-inline' },
        button({ label: todayEntry ? 'Continue writing' : 'Write today’s entry', icon: 'edit', variant: 'primary', onClick: () => ctx.capture('journal') }),
        todayEntry ? button({ label: 'Open full entry', variant: 'ghost', onClick: () => ctx.edit(todayEntry.path) }) : null)));
    const moods = entries.slice(0, 30).reverse().map((j) => j.mood ?? 0);
    if (moods.some((m) => m)) root.append(card({ title: 'Mood', subtitle: 'Last 30 entries' }, h('div', { class: 'sb-spark-fluid' }, sparkline(moods, { width: 600, height: 44, ariaLabel: 'Mood trend' }))));
    root.append(sectionTitle('Entries', null, entries.length));
    if (!entries.length) { root.append(emptyState({ icon: 'journal', title: 'Your journal is empty', text: 'Two sentences a day is enough.' })); return; }
    let lastMonth = '';
    const list = h('div', { class: 'sb-journal-list' });
    for (const j of entries.slice(0, 120)) {
      const m = j.date.slice(0, 7);
      if (m !== lastMonth) { lastMonth = m; list.append(h('div', { class: 'sb-journal-month' }, fmt(m + '-01', ctx.settings.locale, { month: 'long', year: 'numeric' }))); }
      const el = h('a', { class: 'sb-journal-entry', attrs: { href: '#' }, dataset: { flip: `j-${j.path}` } },
        h('div', { class: 'sb-journal-entry__date' }, h('b', { class: 'sb-num' }, j.date.slice(8)), h('span', null, fmt(j.date, ctx.settings.locale, { weekday: 'short' }))),
        h('div', { class: 'sb-journal-entry__body' },
          h('p', { class: ['sb-excerpt', ctx.settings.privacyMode && 'is-private'] }, j.excerpt || '—'),
          j.highlights.length ? h('div', { class: 'sb-chips' }, ...j.highlights.slice(0, 3).map((x) => chip(x, { icon: 'sparkle' }))) : null),
        j.mood ? h('span', { class: 'sb-journal-entry__mood', attrs: { 'aria-label': `Mood ${j.mood}` } }, ['😞', '😕', '😐', '🙂', '😄'][j.mood - 1]!) : null);
      el.addEventListener('click', (e) => { e.preventDefault(); ctx.open(j.path); });
      list.append(el);
    }
    root.append(list);
  },
};

function randomPrompt(seed: string) {
  const prompts = ['What gave you energy today?', 'What did you learn that surprised you?', 'What would make tomorrow great?', 'Which problem are you still thinking about?', 'What are you grateful for today?', 'What did you avoid — and why?'];
  let n = 0;
  for (const c of seed) n += c.charCodeAt(0);
  return prompts[n % prompts.length]!;
}

// ───────────────────────── Archive ─────────────────────────

export const ArchivePage: PageDef = {
  id: 'archive',
  nav: 'archive',
  title: () => 'Archive',
  render(ctx, root) {
    const st = ctx.state('archive', { kind: '' });
    const snap = ctx.snap();
    const archived = snap.entities.filter((e) => e.archived || (e.kind === 'project' && e.status === 'done') || (e.kind === 'goal' && (e.status === 'achieved' || e.status === 'dropped')));
    root.append(pageHeader({ eyebrow: 'Archive', title: 'Archive', subtitle: 'Finished projects, achieved goals and archived notes. Nothing is deleted.' }));
    const kinds = [...new Set(archived.map((e) => e.kind))];
    root.append(h('div', { class: 'sb-toolbar' }, segmented([{ id: '', label: 'All', count: archived.length }, ...kinds.map((k) => ({ id: k, label: KIND_LABEL[k], count: archived.filter((e) => e.kind === k).length }))], st.kind, (v) => { st.kind = v; ctx.refresh(); })));
    const list = archived.filter((e) => !st.kind || e.kind === st.kind).sort((a, b) => b.mtime - a.mtime);
    root.append(list.length ? h('div', { class: 'sb-list sb-list--card' }, ...list.map((e: Entity) => entityRow(ctx, e, { showKind: true, meta: `${'status' in e ? (e as { status: string }).status + ' · ' : ''}${relativeTime(e.mtime)}` }))) : emptyState({ icon: 'archive', title: 'Archive is empty' }));
  },
};
