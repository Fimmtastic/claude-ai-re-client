import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { button, card, chip, emptyState, pageHeader, sectionTitle, select, textInput, skeleton, progressBar } from '../../ui/components/basic';
import { confirm } from '../../ui/components/overlay';
import type { AppContext, PageDef } from '../context';
import type { Entity, Note } from '../../core/types';
import { related } from '../../core/queries';
import { fmt, relativeTime } from '../../core/dates';
import { formatMinutes } from '../../core/schema';
import { search } from '../../core/search';
import { KIND_ICON, KIND_LABEL } from '../meta';
import { entityRow, plural, propList, virtualList } from './common';

export const KnowledgePage: PageDef = {
  id: 'knowledge',
  nav: 'knowledge',
  title: () => 'Knowledge',
  actions: (ctx) => [button({ label: 'New note', icon: 'plus', size: 'sm', variant: 'ghost', onClick: () => ctx.capture('note') })],
  render(ctx, root) {
    const st = ctx.state('knowledge', { topic: '', tag: '', q: '', collection: '', sort: 'recent' as 'recent' | 'title' | 'connected' });
    const snap = ctx.snap();
    const notes = snap.notes.filter((n) => !n.archived);
    root.append(pageHeader({ eyebrow: 'Knowledge Hub', title: 'Knowledge', subtitle: `${plural(notes.length, 'note')} · ${plural(new Set(notes.map((n) => n.topic).filter(Boolean)).size, 'topic')} · ${plural(notes.filter((n) => n.favorite).length, 'favorite')}` }));

    const searchBox = textInput({ placeholder: 'Search your knowledge — titles, tags and full text…', value: st.q, class: 'sb-input--lg', props: { dataset: { focusKey: 'k-q' } }, onInput: (v) => { st.q = v; ctx.refresh(); } });
    root.append(h('div', { class: 'sb-searchbar' }, icon('search', 18), searchBox));

    if (st.q.trim()) {
      const hits = search(snap, st.q, { kinds: ['note', 'resource', 'learning'], limit: 60, textOf: (p) => ctx.store.textOf(p) });
      root.append(sectionTitle('Results', null, hits.length));
      if (!snap.bodiesLoaded) root.append(h('p', { class: 'sb-muted sb-small' }, 'Full-text index is still loading — title and tag matches shown.'));
      root.append(hits.length ? h('div', { class: 'sb-results' }, ...hits.map((hit) => {
        const e = hit.entity!;
        const row = entityRow(ctx, e, { meta: hit.snippet ?? [('topic' in e && e.topic) || '', relativeTime(e.mtime)].filter(Boolean).join(' · ') });
        return row;
      })) : emptyState({ icon: 'search', title: 'Nothing found', text: `No note matches “${st.q}”.`, action: button({ label: `Create “${st.q}”`, onClick: () => ctx.run('Note created', async () => ctx.open(await ctx.actions.create({ kind: 'note', title: st.q.trim() }))) }) }));
      return;
    }
    if (!notes.length) {
      root.append(emptyState({ icon: 'knowledge', title: 'Start your knowledge base', text: 'Notes live as Markdown in 03-Knowledge, organised by topic folders. Link them with [[wikilinks]] — connections appear automatically.', action: button({ label: 'Write first note', variant: 'primary', onClick: () => ctx.capture('note') }) }));
      return;
    }

    // topics
    const topics = new Map<string, Note[]>();
    for (const n of notes) {
      const k = n.topic ?? 'Unsorted';
      (topics.get(k) ?? topics.set(k, []).get(k)!).push(n);
    }
    root.append(sectionTitle('Topics', null, topics.size));
    root.append(h('div', { class: 'sb-topic-grid' }, ...[...topics.entries()].sort((a, b) => b[1].length - a[1].length).map(([topic, arr]) => {
      const last = Math.max(...arr.map((n) => n.mtime));
      const tags = new Map<string, number>();
      for (const n of arr) for (const t of n.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
      const c = card({ class: ['sb-topic', st.topic === topic && 'is-active'].filter(Boolean).join(' '), onClick: () => { st.topic = st.topic === topic ? '' : topic; ctx.refresh(); } },
        h('div', { class: 'sb-topic__icon' }, icon('folder', 16)),
        h('div', { class: 'sb-topic__name' }, topic),
        h('div', { class: 'sb-topic__meta sb-num' }, `${plural(arr.length, 'note')} · ${relativeTime(last)}`),
        h('div', { class: 'sb-topic__tags' }, ...[...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => h('span', null, `#${t}`))));
      return c;
    })));

    const favorites = notes.filter((n) => n.favorite);
    const collections = new Map<string, Note[]>();
    for (const n of notes) if (n.collection) (collections.get(n.collection) ?? collections.set(n.collection, []).get(n.collection)!).push(n);
    const backlinkCount = new Map<string, number>();
    for (const e of snap.entities) for (const l of e.links) backlinkCount.set(l, (backlinkCount.get(l) ?? 0) + 1);
    const hubs = [...notes].sort((a, b) => (backlinkCount.get(b.basename.toLowerCase()) ?? 0) + b.links.length - ((backlinkCount.get(a.basename.toLowerCase()) ?? 0) + a.links.length)).slice(0, 5);

    root.append(h('div', { class: 'sb-grid' },
      card({ title: 'Favorites', icon: 'star', class: 'span-4' }, favorites.length ? h('div', { class: 'sb-list' }, ...favorites.slice(0, 6).map((n) => entityRow(ctx, n))) : h('p', { class: 'sb-muted sb-small' }, 'Star notes from the reader to pin them here.')),
      card({ title: 'Most connected', icon: 'link', class: 'span-4' }, h('div', { class: 'sb-list' }, ...hubs.map((n) => entityRow(ctx, n, { meta: `${plural(backlinkCount.get(n.basename.toLowerCase()) ?? 0, 'backlink')} · ${plural(n.links.length, 'link')}` })))),
      card({ title: 'Collections', icon: 'layers', class: 'span-4' }, collections.size ? h('div', { class: 'sb-list' }, ...[...collections.entries()].map(([c, arr]) => h('button', { class: 'sb-row', attrs: { type: 'button' }, on: { click: () => { st.q = ''; st.tag = ''; st.topic = ''; st.collection = st.collection === c ? '' : c; ctx.refresh(); } } }, h('span', { class: 'sb-row__icon' }, icon('layers', 15)), h('span', { class: 'sb-row__main' }, h('span', { class: 'sb-row__title' }, c), h('span', { class: 'sb-row__meta' }, plural(arr.length, 'note')))))) : h('p', { class: 'sb-muted sb-small' }, 'Group notes with a “collection” property.'))));

    // all notes list
    const tagOptions = [{ value: '', label: 'All tags' }, ...[...new Set(notes.flatMap((n) => n.tags))].sort().map((t) => ({ value: t, label: `#${t}` }))];
    let list = notes.filter((n) => (!st.topic || (n.topic ?? 'Unsorted') === st.topic) && (!st.tag || n.tags.includes(st.tag)) && (!st.collection || n.collection === st.collection));
    list = list.sort((a, b) => st.sort === 'title' ? a.title.localeCompare(b.title) : st.sort === 'connected' ? (b.links.length - a.links.length) : b.mtime - a.mtime);
    root.append(sectionTitle(st.collection || st.topic || 'All notes', h('div', { class: 'sb-inline' },
      st.collection ? chip(`${st.collection} ×`, { tone: 'accent', onClick: () => { st.collection = ''; ctx.refresh(); } }) : null,
      st.topic ? chip(`${st.topic} ×`, { tone: 'accent', onClick: () => { st.topic = ''; ctx.refresh(); } }) : null,
      select(tagOptions, st.tag, (v) => { st.tag = v; ctx.refresh(); }),
      select([{ value: 'recent', label: 'Recently edited' }, { value: 'title', label: 'Title' }, { value: 'connected', label: 'Most links' }], st.sort, (v) => { st.sort = v as typeof st.sort; ctx.refresh(); })), list.length));
    root.append(virtualList(list, 56, (n) => entityRow(ctx, n, { meta: [n.topic, n.tags.slice(0, 3).map((t) => '#' + t).join(' '), relativeTime(n.mtime)].filter(Boolean).join(' · ') }), { key: 'notes', height: 600 }));
  },
};

// ───────────────────────── Reader (any entity) ─────────────────────────

export const NotePage: PageDef = {
  id: 'note',
  nav: 'knowledge',
  crumbs(ctx, path) {
    const e = ctx.snap().byPath.get(path ?? '');
    if (!e) return [];
    const map: Partial<Record<Entity['kind'], [string, string]>> = { worklog: ['Worklogs', 'worklogs'], journal: ['Journal', 'journal'], daily: ['Today', 'today'], review: ['Reviews', 'reviews'], learning: ['Learning', 'learning'], resource: ['Knowledge', 'knowledge'], note: ['Knowledge', 'knowledge'] };
    const [label, route] = map[e.kind] ?? ['Knowledge', 'knowledge'];
    const crumbs = [{ label, route }];
    if ('topic' in e && e.topic) crumbs.push({ label: e.topic, route: 'knowledge' });
    return crumbs;
  },
  title: (ctx, path) => ctx.snap().byPath.get(path ?? '')?.title ?? (path?.split('/').pop()?.replace(/\.md$/, '') ?? 'Note'),
  actions(ctx, path) {
    const e = ctx.snap().byPath.get(path ?? '');
    const st = ctx.state('reader', { focus: false });
    return [
      button({ icon: 'focus', title: st.focus ? 'Exit focus mode' : 'Focus mode', size: 'sm', variant: st.focus ? 'subtle' : 'ghost', onClick: () => { st.focus = !st.focus; document.querySelector('.sb-app')?.classList.toggle('is-focus', st.focus); ctx.refresh(); } }),
      e && (e.kind === 'note' || e.kind === 'resource') ? button({ icon: 'star', title: (e as Note).favorite ? 'Remove favorite' : 'Add to favorites', size: 'sm', variant: (e as Note).favorite ? 'subtle' : 'ghost', class: (e as Note).favorite ? 'is-fav' : '', onClick: () => ctx.run((e as Note).favorite ? 'Removed from favorites' : 'Added to favorites', () => ctx.actions.setFrontmatter(e.path, { favorite: (e as Note).favorite ? undefined : true }, 'Toggle favorite'), { undoable: true }) }) : null,
      e ? button({ icon: 'archive', title: e.archived ? 'Unarchive' : 'Archive', size: 'sm', variant: 'ghost', onClick: async () => {
        if (!e.archived && !(await confirm({ title: 'Archive this note?', text: 'It stays in place but is hidden from active views (sets “archived: true”).', confirm: 'Archive' }))) return;
        await ctx.run(e.archived ? 'Unarchived' : 'Archived', () => ctx.actions.setFrontmatter(e.path, { archived: e.archived ? undefined : true }, 'Archive'), { undoable: true });
      } }) : null,
      button({ icon: 'edit', label: 'Edit', size: 'sm', variant: 'secondary', onClick: () => path && ctx.edit(path) }),
    ].filter((x): x is HTMLButtonElement => !!x);
  },
  render(ctx, root, path) {
    const snap = ctx.snap();
    const e = snap.byPath.get(path ?? '');
    const st = ctx.state('reader', { focus: false });
    document.querySelector('.sb-app')?.classList.toggle('is-focus', st.focus);
    if (!path || !ctx.port.exists(path)) {
      root.append(emptyState({ icon: 'file', title: 'Note not found', text: 'It may have been moved or deleted.', action: button({ label: 'Back', onClick: () => ctx.back() }) }));
      return;
    }
    const article = h('article', { class: ['sb-reader', st.focus && 'is-focus'] });
    const head = h('header', { class: 'sb-reader__head' });
    if (e) {
      head.append(h('div', { class: 'sb-eyebrow' }, icon(KIND_ICON[e.kind], 13), KIND_LABEL[e.kind], 'topic' in e && e.topic ? ` · ${e.topic}` : ''),
        h('h1', { class: 'sb-reader__title' }, e.title));
      const meta = h('div', { class: 'sb-reader__meta' });
      if (e.kind === 'worklog') {
        meta.append(chip(fmt(e.date, ctx.settings.locale, { weekday: 'short', day: 'numeric', month: 'long' }), { icon: 'calendar' }));
        if (e.minutes !== undefined) meta.append(chip(formatMinutes(e.minutes), { icon: 'clock' }));
        if (e.project) meta.append(chip(ctx.projectTitle(e.project), { icon: 'projects', onClick: () => { const p = snap.byBasename.get(e.project!); if (p) ctx.open(p.path); } }));
        for (const t of e.technologies) meta.append(chip(t, { tone: 'accent' }));
      } else if (e.kind === 'learning') {
        if (e.total) meta.append(h('div', { class: 'sb-reader__progress' }, progressBar(e.progress !== undefined ? Math.min(1, e.progress / e.total) : null, { label: true, size: 'sm' }), h('span', { class: 'sb-muted sb-small' }, `${e.progress ?? 0} / ${e.total} ${e.unit ?? ''}`)));
      } else {
        meta.append(h('span', { class: 'sb-muted sb-small' }, `Edited ${relativeTime(e.mtime)} · created ${fmt(new Date(e.ctime).toISOString().slice(0, 10), ctx.settings.locale, { day: 'numeric', month: 'short', year: 'numeric' })}`));
      }
      for (const t of e.tags.slice(0, 8)) meta.append(chip(`#${t}`, { onClick: () => ctx.palette(`#${t}`) }));
      head.append(meta);
    }
    const body = h('div', { class: 'sb-reader__body markdown-rendered' }, skeleton(6));
    article.append(head, body);
    root.append(article);
    void (async () => {
      try {
        const content = await ctx.port.read(path);
        const md = stripFmAndTitle(content, e?.title);
        if (!body.isConnected) return;
        await ctx.port.renderMarkdown(md, body, path);
        if (!md.trim()) body.append(emptyState({ compact: true, icon: 'edit', title: 'This note is empty', action: button({ label: 'Start writing', onClick: () => ctx.edit(path) }) }));
        // make checkboxes in rendered markdown route through our safe task writer
        body.querySelectorAll<HTMLInputElement>('input.task-list-item-checkbox, li.task-list-item > input[type=checkbox]').forEach((cb) => (cb.disabled = true));
      } catch (err) {
        body.replaceChildren(h('p', { class: 'sb-error' }, `Could not render: ${err instanceof Error ? err.message : err}`));
      }
    })();
  },
  context(ctx, el, path) {
    const snap = ctx.snap();
    const e = snap.byPath.get(path ?? '');
    if (!e) return;
    const back = ctx.port.backlinks(e.path);
    el.append(h('h4', { class: 'sb-context__title' }, 'Properties'), propList([
      ['Type', KIND_LABEL[e.kind]], ['Area', e.area], ['ID', h('code', null, e.id)], ['Path', e.path],
    ]));
    if (e.issues.length) el.append(h('h4', { class: 'sb-context__title' }, 'Metadata warnings'), ...e.issues.map((i) => h('p', { class: 'sb-warn sb-small' }, i)));
    el.append(h('h4', { class: 'sb-context__title' }, `Backlinks · ${back.length}`));
    el.append(back.length ? h('div', { class: 'sb-list' }, ...back.slice(0, 12).map((p) => { const be = snap.byPath.get(p); return be ? entityRow(ctx, be, { showKind: true }) : h('div', { class: 'sb-muted sb-small' }, p); })) : h('p', { class: 'sb-muted sb-small' }, 'No notes link here yet.'));
    const rel = related(snap, e, back, 8).filter((r) => !back.includes(r.entity.path));
    el.append(h('h4', { class: 'sb-context__title' }, 'Smart connections'));
    el.append(rel.length ? h('div', { class: 'sb-list' }, ...rel.map((r) => entityRow(ctx, r.entity, { meta: r.reasons.join(' · ') }))) : h('p', { class: 'sb-muted sb-small' }, 'Add tags or links to discover related notes. Connections are computed from your metadata only — nothing is changed.'));
  },
};

export function stripFmAndTitle(content: string, title?: string): string {
  let body = content;
  if (body.startsWith('---')) {
    const end = body.indexOf('\n---', 3);
    if (end > 0) body = body.slice(body.indexOf('\n', end + 4) + 1);
  }
  const lines = body.replace(/^\s+/, '').split('\n');
  if (title && lines[0]?.replace(/^#\s+/, '').trim() === title.trim() && lines[0]?.startsWith('# ')) lines.shift();
  return lines.join('\n');
}
