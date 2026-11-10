import { h, clear, modKey } from '../dom';
import { icon } from '../icons';
import { modal } from './overlay';
import { search, debounce } from '../../core/search';
import type { AppContext } from '../../views/context';
import { KIND_ICON, KIND_LABEL } from '../../views/meta';

/**
 * Command palette + global search in one surface.
 *   type to search everything · ">" commands only · "#" tags · ↑↓ ⏎ · ⌘⏎ open in editor
 */

export interface PaletteCommand {
  id: string;
  label: string;
  icon: string;
  section: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

interface Item {
  icon: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  hint?: string;
  run: (alt: boolean) => void;
}

export function openPalette(ctx: AppContext, commands: PaletteCommand[], initial = '') {
  const m = modal({ position: 'top', width: 640, class: 'sb-palette' });
  const input = h('input', { class: 'sb-palette__input', attrs: { type: 'text', placeholder: 'Search notes, tasks, projects… or type > for commands', 'aria-label': 'Search or run a command', spellcheck: 'false', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'sb-palette-list' } });
  input.value = initial;
  const list = h('div', { class: 'sb-palette__list', attrs: { role: 'listbox', id: 'sb-palette-list' }, dataset: { scrollKey: 'palette' } });
  const footer = h('div', { class: 'sb-palette__footer' },
    h('span', null, h('kbd', { class: 'sb-kbd' }, '↑↓'), ' navigate'),
    h('span', null, h('kbd', { class: 'sb-kbd' }, '⏎'), ' open'),
    h('span', null, h('kbd', { class: 'sb-kbd' }, `${modKey}⏎`), ' edit source'),
    h('span', null, h('kbd', { class: 'sb-kbd' }, '>'), ' commands'),
    h('span', null, h('kbd', { class: 'sb-kbd' }, 'esc'), ' close'));
  m.body.append(h('div', { class: 'sb-palette__bar' }, icon('search', 18), input), list, footer);

  let items: Item[] = [];
  let active = 0;

  const commandItems = (q: string): Item[] => {
    const query = q.toLowerCase();
    return commands
      .map((c) => ({ c, s: score(query, `${c.label} ${c.keywords ?? ''} ${c.section}`.toLowerCase()) }))
      .filter((x) => !query || x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(({ c }) => ({ icon: c.icon, title: c.label, subtitle: c.section, hint: c.hint, run: () => c.run() }));
  };

  const compute = () => {
    const q = input.value;
    if (q.startsWith('>')) {
      items = commandItems(q.slice(1).trim());
    } else if (!q.trim()) {
      // recent + suggested commands
      const recent = [...ctx.snap().entities].filter((e) => !e.archived).sort((a, b) => b.mtime - a.mtime).slice(0, 6);
      items = [
        ...recent.map<Item>((e) => ({ icon: KIND_ICON[e.kind], title: e.title, subtitle: `${KIND_LABEL[e.kind]} · recently edited`, run: (alt) => (alt ? ctx.edit(e.path) : ctx.open(e.path)) })),
        ...commandItems('').slice(0, 8),
      ];
    } else {
      const snap = ctx.snap();
      const hits = search(snap, q.replace(/^#/, ''), { limit: 24, textOf: (p) => ctx.store.textOf(p), includePrivate: !ctx.settings.privacyMode });
      items = hits.map<Item>((hit) => {
        if (hit.type === 'task' && hit.task) {
          const t = hit.task;
          return { icon: t.status === 'done' ? 'check' : 'tasks', title: t.text, subtitle: `Task · ${t.path.split('/').pop()!.replace(/\.md$/, '')}`, run: (alt) => (alt ? ctx.edit(t.path, { line: t.line }) : ctx.open(t.path)) };
        }
        const e = hit.entity!;
        return { icon: KIND_ICON[e.kind], title: e.title, subtitle: `${KIND_LABEL[e.kind]}${e.archived ? ' · archived' : ''} · ${e.path.split('/').slice(0, -1).join(' / ')}`, snippet: hit.snippet, run: (alt) => (alt ? ctx.edit(e.path) : ctx.open(e.path)) };
      });
      items.push(...commandItems(q).slice(0, 4));
      items.push({ icon: 'plus', title: `Create note “${q.trim()}”`, subtitle: 'Knowledge', run: () => ctx.run('Note created', async () => ctx.open(await ctx.actions.create({ kind: 'note', title: q.trim() }))) });
      items.push({ icon: 'tasks', title: `Add task “${q.trim()}”`, subtitle: 'Inbox', run: () => ctx.capture('task', { text: q.trim() }) });
    }
    active = 0;
    render();
  };

  const render = () => {
    clear(list);
    if (!items.length) {
      list.append(h('div', { class: 'sb-palette__empty' }, 'No results'));
      return;
    }
    let lastSection = '';
    items.forEach((it, i) => {
      const section = it.subtitle?.split(' · ')[0] ?? '';
      if (input.value.startsWith('>') && section !== lastSection) {
        list.append(h('div', { class: 'sb-palette__section' }, section));
        lastSection = section;
      }
      const row = h('div', { class: ['sb-palette__item', i === active && 'is-active'], attrs: { role: 'option', 'aria-selected': String(i === active), id: `sb-pal-${i}` } },
        h('span', { class: 'sb-palette__icon' }, icon(it.icon, 16)),
        h('span', { class: 'sb-palette__text' },
          h('span', { class: 'sb-palette__title' }, it.title),
          it.snippet ? h('span', { class: 'sb-palette__snippet' }, it.snippet) : it.subtitle ? h('span', { class: 'sb-palette__subtitle' }, it.subtitle) : null),
        it.hint ? h('kbd', { class: 'sb-kbd' }, it.hint) : null);
      row.addEventListener('mousemove', () => { if (active !== i) { active = i; highlight(); } });
      row.addEventListener('click', (e) => choose(i, e.metaKey || e.ctrlKey));
      list.append(row);
    });
    input.setAttribute('aria-activedescendant', `sb-pal-${active}`);
  };
  const highlight = () => {
    list.querySelectorAll('.sb-palette__item').forEach((el, i) => {
      el.classList.toggle('is-active', i === active);
      el.setAttribute('aria-selected', String(i === active));
      if (i === active) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
    });
    input.setAttribute('aria-activedescendant', `sb-pal-${active}`);
  };
  const choose = (i: number, alt: boolean) => {
    const it = items[i];
    if (!it) return;
    m.close();
    it.run(alt);
  };
  const debounced = debounce(compute, 60);
  input.addEventListener('input', () => (input.value.startsWith('>') || !input.value ? compute() : debounced()));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); highlight(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active, e.metaKey || e.ctrlKey); }
  });
  m.onClose(() => debounced.cancel());
  compute();
  // focus synchronously so fast typing right after the shortcut is never lost
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function score(q: string, target: string): number {
  if (!q) return 1;
  if (target.startsWith(q)) return 3;
  if (target.includes(q)) return 2;
  let qi = 0;
  for (let i = 0; i < target.length && qi < q.length; i++) if (target[i] === q[qi]) qi++;
  return qi === q.length ? 1 : 0;
}
