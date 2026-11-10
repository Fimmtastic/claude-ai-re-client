import { h, clear, modKey } from '../dom';
import { modal, toast } from './overlay';
import { button, field, segmented, select, textArea, textInput } from './basic';
import { icon } from '../icons';
import type { AppContext, CaptureMode, CapturePreset } from '../../views/context';
import { parseQuickTask } from '../../core/quick-parse';
import { parseDuration } from '../../core/schema';
import { fmt } from '../../core/dates';
import type { GoalLevel, Priority, WorkContext } from '../../core/types';

/**
 * Quick Capture — one surface for creating anything. Autofocuses, ⌘⏎ saves,
 * remembers nothing it shouldn't, writes plain Markdown.
 */

const MODES: { id: CaptureMode; label: string; icon: string }[] = [
  { id: 'task', label: 'Task', icon: 'tasks' },
  { id: 'idea', label: 'Idea', icon: 'zap' },
  { id: 'note', label: 'Note', icon: 'knowledge' },
  { id: 'worklog', label: 'Worklog', icon: 'worklog' },
  { id: 'project', label: 'Project', icon: 'projects' },
  { id: 'goal', label: 'Goal', icon: 'goals' },
  { id: 'journal', label: 'Journal', icon: 'journal' },
  { id: 'learning', label: 'Learning', icon: 'learning' },
];

export function openCapture(ctx: AppContext, mode: CaptureMode = 'task', preset: Partial<CapturePreset> = {}) {
  const m = modal({ title: 'Quick Capture', width: 700, class: 'sb-capture', position: 'top' });
  const formHost = h('div', { class: 'sb-capture__form' });
  let submit: () => Promise<void> = async () => {};
  const footerHint = h('span', { class: 'sb-capture__hint' });
  const saveBtn = button({ label: 'Save', variant: 'primary', shortcut: `${modKey}⏎`, onClick: () => doSubmit() });
  const doSubmit = async () => {
    try {
      await submit();
      m.close();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { tone: 'error' });
    }
  };

  const projects = ctx.snap().projects.filter((p) => !p.archived && p.status !== 'done');
  const projectOptions = [{ value: '', label: 'No project' }, ...projects.map((p) => ({ value: p.basename, label: p.title }))];
  const goals = ctx.snap().goals.filter((g) => g.status === 'active');

  const build = (mode: CaptureMode) => {
    clear(formHost);
    switch (mode) {
      case 'task': {
        const preview = h('div', { class: 'sb-capture__preview' });
        const input = textInput({ placeholder: 'e.g. Switch-Ports dokumentieren morgen !high @Netzwerk', value: preset.text, autofocus: true, class: 'sb-input--lg', onEnter: () => void doSubmit() });
        let project = preset.project ?? '';
        const projSel = select(projectOptions, project, (v) => (project = v));
        const update = () => {
          const q = parseQuickTask(input.value, ctx.today(), projects.map((p) => p.basename));
          clear(preview);
          const parts: (string | null)[] = [
            q.due ? `📅 ${fmt(q.due, ctx.settings.locale, { weekday: 'short', day: 'numeric', month: 'short' })}` : null,
            q.priority ? `⚑ ${q.priority}` : null,
            q.project ? `▦ ${q.project}` : null,
            q.recurrence ? `↻ ${q.recurrence}` : null,
          ];
          for (const p of parts) if (p) preview.append(h('span', { class: 'sb-chip sb-chip--accent' }, p));
        };
        input.addEventListener('input', update);
        update();
        formHost.append(input, preview, h('div', { class: 'sb-capture__row' }, field('Project', projSel)));
        footerHint.textContent = 'today · tomorrow · fri · 20.11. · !high · @project · every week';
        submit = async () => {
          const q = parseQuickTask(input.value, ctx.today(), projects.map((p) => p.basename));
          if (!q.text) throw new Error('Write something first.');
          await ctx.run('Task added', () => ctx.actions.addTask({ text: q.text, due: q.due ?? preset.due, priority: q.priority, recurrence: q.recurrence, project: q.project ?? (project || undefined) }), { undoable: true });
        };
        break;
      }
      case 'idea': {
        const t = textArea({ placeholder: 'Capture the thought before it’s gone…', rows: 4, value: preset.text });
        requestAnimationFrame(() => t.focus());
        formHost.append(t);
        footerHint.textContent = 'Saved to your Inbox as a note. Process during the daily review.';
        submit = async () => {
          const text = t.value.trim();
          if (!text) throw new Error('Write something first.');
          const title = text.split('\n')[0]!.slice(0, 60);
          await ctx.run('Idea captured', () => ctx.actions.create({ kind: 'note', title: `Idee – ${title}`, body: text, topic: 'Inbox', extra: { tags: ['idea'] } }), { undoable: true });
        };
        break;
      }
      case 'note':
      case 'learning': {
        const title = textInput({ placeholder: mode === 'note' ? 'Note title' : 'Course, book or certification', autofocus: true, class: 'sb-input--lg', value: preset.text });
        const topics = [...new Set(ctx.snap().notes.map((n) => n.topic).filter((x): x is string => !!x))].sort();
        const topic = textInput({ placeholder: 'Topic (folder)', value: preset.topic ?? '' });
        topic.setAttribute('list', 'sb-topics');
        const dl = h('datalist', { attrs: { id: 'sb-topics' } }, ...topics.map((t) => h('option', { attrs: { value: t } })));
        const body = textArea({ placeholder: mode === 'note' ? 'Start writing (Markdown)…' : 'What do you want to learn and why?', rows: 5 });
        const total = textInput({ placeholder: 'e.g. 24', type: 'number' });
        const unit = textInput({ placeholder: 'chapters / modules / hours' });
        formHost.append(title, mode === 'note' ? h('div', { class: 'sb-capture__row' }, field('Topic', topic), dl) : h('div', { class: 'sb-capture__row' }, field('Total', total), field('Unit', unit)), body);
        footerHint.textContent = mode === 'note' ? 'Plain Markdown in 03-Knowledge.' : 'Log sessions as “- 2026-11-10 · 45min · Topic”.';
        submit = async () => {
          if (!title.value.trim()) throw new Error('Give it a title.');
          await ctx.run(mode === 'note' ? 'Note created' : 'Learning item created', async () => {
            const p = await ctx.actions.create(mode === 'note'
              ? { kind: 'note', title: title.value.trim(), topic: topic.value.trim() || undefined, body: body.value }
              : { kind: 'learning', title: title.value.trim(), body: body.value, extra: { total: total.value ? Number(total.value) : undefined, unit: unit.value || undefined } });
            ctx.open(p);
          }, { undoable: true });
        };
        break;
      }
      case 'worklog':
        buildWorklogForm(ctx, formHost, preset, (s) => (submit = s), projectOptions);
        footerHint.textContent = 'Stored in 02-Worklogs/<year>. Lines become bullet points.';
        break;
      case 'project': {
        const title = textInput({ placeholder: 'Project name', autofocus: true, class: 'sb-input--lg', value: preset.text });
        const desc = textArea({ placeholder: 'What does “done” look like?', rows: 3 });
        let priority: Priority = 'medium';
        let goal = preset.goal ?? '';
        let status = 'active';
        const deadline = textInput({ type: 'date' });
        const area = textInput({ placeholder: 'Career, Personal…' });
        formHost.append(title, desc, h('div', { class: 'sb-capture__row' },
          field('Status', select([{ value: 'active', label: 'Active' }, { value: 'planned', label: 'Planned' }], 'active', (v) => (status = v))),
          field('Priority', select<Priority>([{ value: 'urgent', label: 'Urgent' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }], priority, (v) => (priority = v))),
          field('Deadline', deadline)),
          h('div', { class: 'sb-capture__row' },
            field('Goal', select([{ value: '', label: 'No goal' }, ...goals.map((g) => ({ value: g.basename, label: g.title }))], goal, (v) => (goal = v))),
            field('Area', area)));
        footerHint.textContent = 'Add milestones with #milestone tasks.';
        submit = async () => {
          if (!title.value.trim()) throw new Error('Give the project a name.');
          await ctx.run('Project created', async () => {
            const p = await ctx.actions.create({ kind: 'project', title: title.value.trim(), description: desc.value.trim() || undefined, priority, status, due: deadline.value || undefined, goal: goal || undefined, area: area.value.trim() || undefined });
            ctx.open(p);
          }, { undoable: true });
        };
        break;
      }
      case 'goal': {
        const title = textInput({ placeholder: 'Goal', autofocus: true, class: 'sb-input--lg', value: preset.text });
        let level: GoalLevel = 'quarter';
        let parent = '';
        const area = textInput({ placeholder: 'Career, Finance, Health…' });
        const due = textInput({ type: 'date' });
        const target = textInput({ type: 'number', placeholder: 'optional' });
        const unit = textInput({ placeholder: 'e.g. books, €' });
        formHost.append(title, h('div', { class: 'sb-capture__row' },
          field('Level', select<GoalLevel>([{ value: 'vision', label: 'Long-term vision' }, { value: 'year', label: 'Yearly' }, { value: 'quarter', label: 'Quarterly' }, { value: 'month', label: 'Monthly milestone' }, { value: 'week', label: 'Weekly action' }], level, (v) => (level = v))),
          field('Parent', select([{ value: '', label: 'None' }, ...ctx.snap().goals.map((g) => ({ value: g.basename, label: g.title }))], '', (v) => (parent = v))),
          field('Area', area)),
          h('div', { class: 'sb-capture__row' }, field('Due', due), field('Target', target, 'Measurable goals track current / target'), field('Unit', unit)));
        submit = async () => {
          if (!title.value.trim()) throw new Error('Name your goal.');
          await ctx.run('Goal created', async () => {
            const p = await ctx.actions.create({ kind: 'goal', title: title.value.trim(), level, parent: parent || undefined, area: area.value.trim() || undefined, due: due.value || undefined, extra: target.value ? { target: Number(target.value), current: 0, unit: unit.value || undefined } : undefined });
            ctx.open(p);
          }, { undoable: true });
        };
        break;
      }
      case 'journal': {
        const thoughts = textArea({ placeholder: 'How was your day?', rows: 5, value: preset.text });
        requestAnimationFrame(() => thoughts.focus());
        const highlights = textArea({ placeholder: 'Highlights (one per line)', rows: 2 });
        let mood = 0;
        const moods = h('div', { class: 'sb-mood', attrs: { role: 'radiogroup', 'aria-label': 'Mood' } }, ...[1, 2, 3, 4, 5].map((n) => {
          const b = h('button', { class: 'sb-mood__item', attrs: { type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': `Mood ${n}` } }, ['😞', '😕', '😐', '🙂', '😄'][n - 1]!);
          b.addEventListener('click', () => { mood = n; moods.querySelectorAll('button').forEach((x, i) => { x.classList.toggle('is-active', i === n - 1); x.setAttribute('aria-checked', String(i === n - 1)); }); });
          return b;
        }));
        formHost.append(thoughts, field('Highlights', highlights), field('Mood', moods));
        footerHint.textContent = 'Private. Hidden from search in privacy mode.';
        submit = async () => {
          const existing = ctx.snap().journal.find((j) => j.date === ctx.today());
          await ctx.run('Journal saved', async () => {
            if (existing) {
              await ctx.actions.appendToSection(existing.path, ['gedanken', 'thoughts'], thoughts.value.trim());
              if (highlights.value.trim()) for (const l of highlights.value.split('\n').filter((x) => x.trim())) await ctx.actions.appendToSection(existing.path, ['highlights'], `- ${l.trim()}`);
              if (mood) await ctx.actions.setFrontmatter(existing.path, { mood });
            } else {
              await ctx.actions.create({ kind: 'journal', title: ctx.today(), filename: ctx.today(), sections: { thoughts: thoughts.value.trim(), highlights: highlights.value }, extra: mood ? { mood } : undefined });
            }
          }, { undoable: true });
        };
        break;
      }
    }
  };

  const seg = segmented(MODES.map((x) => ({ id: x.id, label: x.label, icon: x.icon })), mode, (id) => build(id), { size: 'sm', ariaLabel: 'Capture type' });
  m.body.append(h('div', { class: 'sb-capture__modes' }, seg), formHost, h('footer', { class: 'sb-modal__footer' }, footerHint, saveBtn));
  m.el.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void doSubmit(); }
    if (e.altKey && /^[1-8]$/.test(e.key)) {
      e.preventDefault();
      const target = seg.querySelectorAll<HTMLButtonElement>('.sb-seg__item')[Number(e.key) - 1];
      target?.click();
    }
  });
  build(mode);
  // focus synchronously so keystrokes typed right after the shortcut land in the form
  formHost.querySelector<HTMLElement>('input, textarea')?.focus();
}

export function buildWorklogForm(ctx: AppContext, host: HTMLElement, preset: Partial<CapturePreset>, setSubmit: (fn: () => Promise<void>) => void, projectOptions: { value: string; label: string }[], existing?: { path: string }) {
  const title = textInput({ placeholder: 'What did you work on?', autofocus: true, class: 'sb-input--lg', value: preset.text });
  const date = textInput({ type: 'date', value: preset.due ?? ctx.today() });
  let project = preset.project ?? '';
  const duration = textInput({ placeholder: 'e.g. 2h 30m', value: '' });
  const tech = textInput({ placeholder: 'Comma separated: VLAN, PowerShell, Active Directory' });
  const knownTech = [...new Set(ctx.snap().worklogs.flatMap((w) => w.technologies))].sort();
  tech.setAttribute('list', 'sb-tech');
  const dl = h('datalist', { attrs: { id: 'sb-tech' } }, ...knownTech.map((t) => h('option', { attrs: { value: t } })));
  let context: WorkContext = 'work';
  const activity = textArea({ placeholder: 'Tätigkeit — what did you do?', rows: 3 });
  const learned = textArea({ placeholder: 'Gelernt — one insight per line', rows: 2 });
  const more = h('div', { class: 'sb-capture__more', attrs: { hidden: true } });
  const problems = textArea({ placeholder: 'Probleme', rows: 2 });
  const solutions = textArea({ placeholder: 'Lösungen', rows: 2 });
  const questions = textArea({ placeholder: 'Offene Fragen', rows: 2 });
  const next = textArea({ placeholder: 'Nächste Schritte', rows: 2 });
  more.append(h('div', { class: 'sb-capture__grid' }, problems, solutions, questions, next));
  const toggleMore = h('button', { class: 'sb-linkbtn', attrs: { type: 'button' } }, icon('chevron-down', 14), 'Problems, solutions, questions, next steps');
  toggleMore.addEventListener('click', () => { more.hidden = !more.hidden; toggleMore.classList.toggle('is-open', !more.hidden); });
  host.append(title,
    h('div', { class: 'sb-capture__row' },
      field('Date', date),
      field('Project', select(projectOptions, project, (v) => (project = v))),
      field('Duration', duration),
      field('Context', select<WorkContext>([{ value: 'work', label: 'Betrieb' }, { value: 'school', label: 'Berufsschule' }, { value: 'private', label: 'Privat' }], context, (v) => (context = v)))),
    field('Technologies', tech), dl, activity, learned, toggleMore, more);
  setSubmit(async () => {
    if (!title.value.trim()) throw new Error('Give the worklog a title.');
    const minutes = duration.value.trim() ? parseDuration(duration.value) : undefined;
    if (duration.value.trim() && minutes === undefined) throw new Error('Duration not understood — try “2h 30m” or “90m”.');
    const d = date.value || ctx.today();
    await ctx.run('Worklog saved', async () => {
      const p = await ctx.actions.create({
        kind: 'worklog', title: title.value.trim(), filename: `${d} ${title.value.trim()}`, date: d, project: project || undefined, minutes,
        technologies: tech.value.split(',').map((x) => x.trim()).filter(Boolean), context,
        sections: { activity: activity.value.trim(), learned: learned.value, problems: problems.value, solutions: solutions.value, questions: questions.value, next: next.value },
      });
      if (!existing) ctx.open(p);
    }, { undoable: true });
  });
}
