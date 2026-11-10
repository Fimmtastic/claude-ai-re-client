import { h, clear } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { button, card, emptyState, pageHeader, progressBar, sectionTitle, stat, textArea } from '../../ui/components/basic';
import { taskList } from '../../ui/components/task-row';
import { enter } from '../../ui/motion';
import type { AppContext, PageDef } from '../context';
import type { ISODate, ReviewPeriod } from '../../core/types';
import { bucketTasks, goalProgress, projectProgress, worklogWeek } from '../../core/queries';
import { addDays, addMonths, fmt, monthKey, quarterKey, startOfWeek, weekKey, toISO, parseISO } from '../../core/dates';
import { formatMinutes } from '../../core/schema';
import { entityRow } from './common';

const PERIODS: { id: ReviewPeriod; label: string; text: string; icon: string }[] = [
  { id: 'daily', label: 'Daily Review', text: '5 minutes · close the day, empty the inbox, set tomorrow’s focus.', icon: 'today' },
  { id: 'weekly', label: 'Weekly Review', text: '20 minutes · what moved, what you learned, next week’s priorities.', icon: 'calendar' },
  { id: 'monthly', label: 'Monthly Review', text: 'Projects and goals check-in, skills gained, adjustments.', icon: 'reviews' },
  { id: 'quarterly', label: 'Quarterly Review', text: 'Step back: goals, direction, what to start and stop.', icon: 'goals' },
];

export function periodRange(p: ReviewPeriod, d: ISODate): { from: ISODate; to: ISODate; key: string } {
  switch (p) {
    case 'daily': return { from: d, to: d, key: d };
    case 'weekly': { const f = startOfWeek(d); return { from: f, to: addDays(f, 6), key: weekKey(d) }; }
    case 'monthly': { const f = d.slice(0, 7) + '-01'; return { from: f, to: addDays(addMonths(f, 1), -1), key: monthKey(d) }; }
    case 'quarterly': {
      const q = Math.floor((Number(d.slice(5, 7)) - 1) / 3);
      const f = toISO(new Date(parseISO(d).getFullYear(), q * 3, 1));
      return { from: f, to: addDays(addMonths(f, 3), -1), key: quarterKey(d) };
    }
  }
}

const QUESTIONS: Record<ReviewPeriod, { id: string; q: string }[]> = {
  daily: [{ id: 'win', q: 'What went well today?' }, { id: 'learned', q: 'What did I learn?' }, { id: 'focus', q: 'Tomorrow’s single most important thing' }],
  weekly: [{ id: 'win', q: 'Biggest wins this week' }, { id: 'stuck', q: 'Where did I get stuck — and why?' }, { id: 'learned', q: 'Most valuable thing I learned' }, { id: 'priorities', q: 'Top 3 priorities for next week' }],
  monthly: [{ id: 'progress', q: 'Which goals moved forward?' }, { id: 'drop', q: 'What should I stop or drop?' }, { id: 'skills', q: 'Skills I built this month' }, { id: 'next', q: 'Focus for next month' }],
  quarterly: [{ id: 'direction', q: 'Am I heading in the right direction?' }, { id: 'proud', q: 'What am I most proud of?' }, { id: 'change', q: 'What will I do differently next quarter?' }, { id: 'goals', q: 'Goals for next quarter' }],
};

export const ReviewsPage: PageDef = {
  id: 'reviews',
  nav: 'reviews',
  title: () => 'Reviews',
  render(ctx, root) {
    const snap = ctx.snap();
    const t = ctx.today();
    root.append(pageHeader({ eyebrow: 'Reviews & Analytics', title: 'Reviews', subtitle: 'Guided reviews that pull in your real data and save a plain Markdown record.' }));
    root.append(h('div', { class: 'sb-review-grid' }, ...PERIODS.map((p) => {
      const r = periodRange(p.id, t);
      const done = snap.reviews.find((x) => x.period === p.id && x.periodKey === r.key);
      return card({ class: ['sb-review-card', done && 'is-done'].filter(Boolean).join(' '), onClick: () => ctx.navigate(`review/${p.id}`) },
        h('div', { class: 'sb-review-card__icon' }, icon(p.icon, 18)),
        h('h3', null, p.label),
        h('p', { class: 'sb-muted sb-small' }, p.text),
        h('div', { class: 'sb-review-card__foot' }, done ? h('span', { class: 'sb-ok' }, icon('check', 13), ` Done for ${r.key}`) : h('span', { class: 'sb-muted sb-small' }, `Due: ${r.key}`), h('span', { class: 'sb-grow' }), icon('arrow', 15)));
    })));
    root.append(sectionTitle('Past reviews', null, snap.reviews.length));
    root.append(snap.reviews.length ? h('div', { class: 'sb-list sb-list--card' }, ...snap.reviews.slice(0, 30).map((r) => entityRow(ctx, r, { meta: `${r.period} · ${r.periodKey}` }))) : emptyState({ compact: true, icon: 'reviews', title: 'No reviews yet', text: 'Start with a daily review tonight.' }));
  },
};

export const ReviewSessionPage: PageDef = {
  id: 'review',
  nav: 'reviews',
  crumbs: () => [{ label: 'Reviews', route: 'reviews' }],
  title: (_c, p) => PERIODS.find((x) => x.id === p)?.label ?? 'Review',
  render(ctx, root, param) {
    const period = (PERIODS.find((p) => p.id === param)?.id ?? 'weekly') as ReviewPeriod;
    const t = ctx.today();
    const r = periodRange(period, t);
    const st = ctx.state(`review:${period}:${r.key}`, { step: 0, answers: {} as Record<string, string> });
    const snap = ctx.snap();
    const inRange = (d?: string) => !!d && d >= r.from && d <= r.to;
    const completed = snap.tasks.filter((x) => x.status === 'done' && inRange(x.done));
    const wls = snap.worklogs.filter((w) => inRange(w.date));
    const minutes = wls.reduce((a, w) => a + (w.minutes ?? 0), 0);
    const learned = wls.flatMap((w) => w.sections.learned);
    const journal = snap.journal.filter((j) => inRange(j.date));
    const notesCreated = snap.notes.filter((n) => inRange(toISO(new Date(n.ctime))));
    const b = bucketTasks(snap.tasks, t, ctx.settings.inboxFile);
    const activeProjects = snap.projects.filter((p) => p.status === 'active' && !p.archived);
    const goals = snap.goals.filter((g) => g.status === 'active');
    const existing = snap.reviews.find((x) => x.period === period && x.periodKey === r.key);

    root.append(pageHeader({
      eyebrow: `${PERIODS.find((p) => p.id === period)!.label} · ${r.key}`,
      title: period === 'daily' ? fmt(t, ctx.settings.locale, { weekday: 'long', day: 'numeric', month: 'long' }) : `${fmt(r.from, ctx.settings.locale, { day: 'numeric', month: 'short' })} – ${fmt(r.to, ctx.settings.locale, { day: 'numeric', month: 'short', year: 'numeric' })}`,
      subtitle: existing ? 'A review for this period exists — saving appends to it.' : 'Walk through the steps. Your answers are saved as a Markdown note.',
      actions: existing ? [button({ label: 'Open saved review', variant: 'ghost', onClick: () => ctx.edit(existing.path) })] : [],
    }));

    const steps: { title: string; render: (el: HTMLElement) => void }[] = [
      {
        title: 'Look back',
        render: (el) => {
          el.append(h('div', { class: 'sb-stats sb-stats--wide' },
            stat({ label: 'Tasks completed', value: completed.length }),
            h('div', { class: 'sb-stat' }, h('span', { class: 'sb-stat__label' }, 'Time logged'), h('span', { class: 'sb-stat__value sb-num' }, minutes ? formatMinutes(minutes) : '—'), h('span', { class: 'sb-stat__hint' }, `${wls.length} worklogs`)),
            stat({ label: 'Notes created', value: notesCreated.length }),
            stat({ label: 'Journal entries', value: journal.length })));
          el.append(sectionTitle('Completed', null, completed.length), taskList(ctx, completed.slice(0, 30), { compact: true, empty: h('p', { class: 'sb-muted' }, 'No completed tasks in this period.') }));
          if (learned.length) el.append(sectionTitle('Learned (from worklogs)', null, learned.length), h('ul', { class: 'sb-bullets' }, ...learned.map((l) => h('li', null, l))));
          if (period !== 'daily' && wls.length) {
            const sum = worklogWeek(wls, r.from);
            const byProject = period === 'weekly' ? sum.byProject : [...wls.reduce((m, w) => m.set(w.project ?? '—', (m.get(w.project ?? '—') ?? 0) + (w.minutes ?? 0)), new Map<string, number>())].map(([project, mins]) => ({ project, minutes: mins }));
            el.append(sectionTitle('Time by project'), h('ul', { class: 'sb-bullets' }, ...byProject.map((p) => h('li', null, `${p.project === '—' ? 'No project' : ctx.projectTitle(p.project)}: ${formatMinutes(p.minutes)}`))));
          }
        },
      },
      period === 'daily'
        ? {
            title: 'Process inbox',
            render: (el) => {
              el.append(h('p', { class: 'sb-muted' }, 'Give every inbox task a date or project — or delete it. Use the ⋯ menu or right-click.'));
              el.append(taskList(ctx, b.inbox, { empty: h('div', { class: 'sb-ok-box' }, icon('check', 16), ' Inbox is empty.') }));
              if (b.overdue.length) el.append(sectionTitle('Overdue', button({ label: 'Move all to tomorrow', size: 'sm', variant: 'ghost', onClick: () => ctx.run('Rescheduled', async () => { for (const x of b.overdue) await ctx.actions.setTaskDue(x, addDays(t, 1)); }) }), b.overdue.length), taskList(ctx, b.overdue));
            },
          }
        : {
            title: 'Projects & goals',
            render: (el) => {
              el.append(sectionTitle('Active projects', null, activeProjects.length));
              el.append(h('div', { class: 'sb-review-progress' }, ...activeProjects.map((p) => {
                const pr = projectProgress(snap, p);
                const moved = completed.filter((x) => x.project === p.basename.toLowerCase()).length;
                return h('div', { class: 'sb-review-progress__row' }, h('a', { attrs: { href: '#' }, on: { click: (e: Event) => { e.preventDefault(); ctx.navigate(`project/${p.path}`); } } }, p.title), progressBar(pr.ratio, { size: 'sm', label: true }), h('span', { class: 'sb-muted sb-small' }, moved ? `+${moved} this period` : 'no movement'));
              })));
              el.append(sectionTitle('Goals', null, goals.length));
              el.append(h('div', { class: 'sb-review-progress' }, ...goals.map((g) => h('div', { class: 'sb-review-progress__row' }, h('a', { attrs: { href: '#' }, on: { click: (e: Event) => { e.preventDefault(); ctx.navigate(`goal/${g.path}`); } } }, g.title), progressBar(goalProgress(snap, g).ratio, { size: 'sm', label: true }), h('span', { class: 'sb-muted sb-small' }, g.level)))));
              const stale = activeProjects.filter((p) => !completed.some((x) => x.project === p.basename.toLowerCase()) && !wls.some((w) => w.project === p.basename.toLowerCase()));
              if (stale.length) el.append(h('div', { class: 'sb-banner' }, icon('flag', 14), `${stale.length} active project${stale.length > 1 ? 's' : ''} had no activity: ${stale.map((p) => p.title).join(', ')}. Pause or plan a next action?`));
            },
          },
      {
        title: 'Reflect',
        render: (el) => {
          for (const q of QUESTIONS[period]) {
            const ta = textArea({ placeholder: q.q, rows: 3, value: st.answers[q.id] ?? '', onInput: (v) => (st.answers[q.id] = v) });
            el.append(h('label', { class: 'sb-field' }, h('span', { class: 'sb-field__label sb-field__label--lg' }, q.q), ta));
          }
        },
      },
    ];

    const stepper = h('ol', { class: 'sb-stepper' }, ...steps.map((s, i) => {
      const li = h('li', { class: [i === st.step && 'is-active', i < st.step && 'is-done'] }, h('span', { class: 'sb-stepper__n sb-num' }, i < st.step ? '✓' : String(i + 1)), s.title);
      li.addEventListener('click', () => { st.step = i; ctx.refresh(); });
      return li;
    }));
    const body = h('div', { class: 'sb-review-body' });
    steps[st.step]!.render(body);
    const isLast = st.step === steps.length - 1;
    const nav = h('div', { class: 'sb-review-nav' },
      st.step > 0 ? button({ label: 'Back', icon: 'chevron-left', variant: 'ghost', onClick: () => { st.step--; ctx.refresh(); } }) : h('span'),
      isLast
        ? button({ label: existing ? 'Append to review' : 'Save review', icon: 'check', variant: 'primary', onClick: () => save() })
        : button({ label: 'Next', icon: 'chevron-right', variant: 'primary', onClick: () => { st.step++; ctx.refresh(); } }));
    root.append(stepper, card({ class: 'sb-review-card-body' }, body), nav);
    enter(body, 0, 4);

    const save = () => ctx.run('Review saved', async () => {
      const md = [
        `## Summary`,
        `- Tasks completed: ${completed.length}`,
        `- Time logged: ${minutes ? formatMinutes(minutes) : '—'} (${wls.length} worklogs)`,
        `- Notes created: ${notesCreated.length}`,
        completed.length ? `\n### Completed\n${completed.slice(0, 50).map((x) => `- ${x.text}`).join('\n')}` : '',
        learned.length ? `\n### Learned\n${learned.map((l) => `- ${l}`).join('\n')}` : '',
        period !== 'daily' && activeProjects.length ? `\n### Projects\n${activeProjects.map((p) => { const pr = projectProgress(snap, p); return `- [[${p.basename}]] — ${pr.ratio === null ? 'no tasks' : Math.round(pr.ratio * 100) + '%'}`; }).join('\n')}` : '',
        `\n## Reflection`,
        ...QUESTIONS[period].map((q) => `### ${q.q}\n${(st.answers[q.id] ?? '').trim() || '—'}`),
      ].filter(Boolean).join('\n');
      const res = await ctx.actions.ensureReview(period, t, md);
      if (!res.created) await ctx.actions.appendToSection(res.path, ['__end__'], `\n---\n*Updated ${new Date().toLocaleString(ctx.settings.locale)}*\n\n${md}`);
      if (period === 'daily' && st.answers['focus']?.trim()) {
        const tomorrow = addDays(t, 1);
        const p = await ctx.actions.ensureDaily(tomorrow);
        await ctx.actions.setFrontmatter(p, { focus: st.answers['focus'].trim() }, 'Set tomorrow’s focus');
      }
      st.step = 0;
      st.answers = {};
      ctx.navigate('reviews');
    });
    void clear;
  },
};
