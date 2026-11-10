import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { button, chip, pageHeader, progressBar, segmented, slider, toggle } from '../../ui/components/basic';
import { confirm, toast } from '../../ui/components/overlay';
import type { AppContext, PageDef } from '../context';
import { ACCENTS, BG_PRESETS, THEMES, resolveMode } from '../appearance-apply';
import { DEFAULT_APPEARANCE, DEFAULT_BOTTOM_NAV, BottomNavItem, Settings } from '../../core/settings';
import { NAV } from '../meta';

/**
 * Appearance studio. Every control shows what it does: a live preview at the
 * top renders real components over the current background, theme tiles are
 * miniature app windows, background tiles show the actual image/gradient.
 * Changes only touch CSS variables / data attributes → no re-render while dragging.
 */

type Shellish = AppContext & { applyAppearance?: () => void; onHostChrome?: () => void; applySettings?: (s: Settings) => void };

const BN_CHOICES: { id: BottomNavItem; label: string; icon: string }[] = [
  ...NAV.map((n) => ({ id: n.id as BottomNavItem, label: n.label, icon: n.icon })),
  { id: 'capture', label: 'Capture', icon: 'plus' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'more', label: 'More', icon: 'more' },
];

function backgroundCss(ctx: AppContext): string {
  const b = ctx.settings.appearance.background;
  if (b.kind === 'preset') return BG_PRESETS[b.preset]?.css ?? '';
  if (b.kind === 'image' && b.image) {
    const url = ctx.port.resourceUrl(b.image);
    return url ? `center / cover no-repeat url("${url.replace(/"/g, '%22')}")` : '';
  }
  return '';
}

/** Live preview: real components (card, tasks, progress, chips, buttons) over the real background. */
function livePreview(ctx: AppContext) {
  const bg = h('div', { class: 'sb-preview__bg' });
  const dim = h('div', { class: 'sb-preview__dim' });
  const update = () => {
    const css = backgroundCss(ctx);
    const b = ctx.settings.appearance.background;
    bg.style.background = css || 'var(--sb-bg)';
    bg.style.filter = css && b.blur ? `blur(${Math.round(b.blur / 2)}px)` : '';
    dim.style.opacity = String(css ? b.dim : 0);
  };
  update();
  const task = (text: string, done: boolean, chipText?: string) =>
    h('div', { class: ['sb-task', 'sb-task--compact', done ? 'is-done' : 'is-todo'] },
      h('span', { class: ['sb-check', done ? 'is-done' : 'is-todo'] }, h('span', { class: 'sb-check__box' }, icon('check', 12, 'sb-check__mark'))),
      h('div', { class: 'sb-task__body' }, h('span', { class: 'sb-task__text' }, text), chipText ? h('span', { class: 'sb-task__meta' }, chip(chipText, { icon: 'calendar', tone: 'accent' })) : null));
  const el = h('div', { class: 'sb-preview', attrs: { 'aria-label': 'Live preview', role: 'img' } }, bg, dim,
    h('div', { class: 'sb-preview__stage' },
      h('section', { class: 'sb-card sb-preview__card' },
        h('header', { class: 'sb-card__header' }, h('div', { class: 'sb-card__titles' }, h('h3', { class: 'sb-card__title' }, 'Today'), h('span', { class: 'sb-card__subtitle' }, 'Preview'))),
        h('div', { class: 'sb-tasklist' }, task('Review VLAN concept', false, 'Today'), task('Update documentation', true)),
        h('div', { class: 'sb-preview__row' }, progressBar(0.62, { size: 'sm', label: true })),
        h('div', { class: 'sb-preview__row' }, chip('#network'), chip('Active', { tone: 'accent' }),
          h('span', { class: 'sb-grow' }),
          h('span', { class: 'sb-btn sb-btn--primary sb-btn--sm' }, h('span', { class: 'sb-btn__label' }, 'Continue'))))));
  return { el, update };
}

export const AppearancePage: PageDef = {
  id: 'appearance',
  nav: 'appearance',
  title: () => 'Appearance',
  render(ctx0, root) {
    const ctx = ctx0 as Shellish;
    const s = ctx.settings;
    const a = s.appearance;
    const preview = livePreview(ctx);
    const live = () => { ctx.applyAppearance?.(); preview.update(); ctx.saveSettings(); };
    const rerender = () => { live(); ctx.refresh(); ctx.onHostChrome?.(); };
    const mode = resolveMode(s);

    root.append(pageHeader({
      eyebrow: 'Personalisation',
      title: 'Appearance',
      subtitle: 'Changes apply instantly and are saved automatically.',
      actions: [button({ label: 'Reset', icon: 'undo', variant: 'ghost', size: 'sm', onClick: async () => {
        if (!(await confirm({ title: 'Reset appearance?', text: 'Theme, accent, background, glass, corners and navigation go back to their defaults.', confirm: 'Reset' }))) return;
        s.appearance = structuredClone(DEFAULT_APPEARANCE);
        s.bottomNav = structuredClone(DEFAULT_BOTTOM_NAV);
        s.accent = 'indigo';
        rerender();
      } })],
    }));

    const controls = h('div', { class: 'sb-ap__controls' });
    const section = (title: string, hint: string | null, ...body: (Node | null)[]) =>
      h('section', { class: 'sb-ap__section' }, h('header', { class: 'sb-ap__head' }, h('h2', null, title), hint ? h('p', null, hint) : null), ...body.filter((x): x is Node => !!x));

    // ── Theme
    const themeTiles = h('div', { class: 'sb-ap__grid sb-ap__grid--themes' }, ...THEMES.map((t) => {
      const [bg, surf, text] = t[mode];
      const tile = h('div', { class: ['sb-ap__tile', a.theme === t.id && 'is-active'], attrs: { role: 'radio', tabindex: '0', 'aria-checked': String(a.theme === t.id), 'aria-label': t.label } },
        h('div', { class: 'sb-mock', style: { background: bg, color: text } },
          h('div', { class: 'sb-mock__side', style: { background: `color-mix(in srgb, ${surf} 55%, ${bg})` } }, h('i'), h('i'), h('i', { class: 'is-on' })),
          h('div', { class: 'sb-mock__main' },
            h('div', { class: 'sb-mock__title', style: { background: text } }),
            h('div', { class: 'sb-mock__card', style: { background: surf } }, h('i', { style: { background: text } }), h('i', { style: { background: text } }), h('b')))),
        h('div', { class: 'sb-ap__label' }, h('span', null, t.label), a.theme === t.id ? icon('check', 13) : null));
      pressable(tile, () => { a.theme = t.id; rerender(); });
      return tile;
    }));
    controls.append(section('Theme', null,
      h('div', { class: 'sb-ap__row' }, h('span', null, 'Mode'),
        segmented([{ id: 'obsidian', label: 'Auto' }, { id: 'light', label: 'Light', icon: 'sun' }, { id: 'dark', label: 'Dark', icon: 'moon' }], a.mode, (v) => { a.mode = v as typeof a.mode; rerender(); }, { size: 'sm' })),
      themeTiles));

    // ── Accent
    const accentName = h('span', { class: 'sb-ap__value' }, s.accent === 'custom' ? 'Custom' : ACCENTS.find((x) => x.id === s.accent)?.label ?? '');
    const dots = h('div', { class: 'sb-ap__dots', attrs: { role: 'radiogroup', 'aria-label': 'Accent colour' } });
    const markActive = (id: string) => dots.querySelectorAll<HTMLElement>('.sb-ap__dot').forEach((d) => { d.classList.toggle('is-active', d.dataset.id === id); d.setAttribute('aria-checked', String(d.dataset.id === id)); });
    for (const x of ACCENTS) {
      const d = h('div', { class: ['sb-ap__dot', s.accent === x.id && 'is-active'], dataset: { id: x.id }, style: { '--c': x.color }, attrs: { role: 'radio', tabindex: '0', 'aria-label': x.label, 'aria-checked': String(s.accent === x.id) } });
      pressable(d, () => { s.accent = x.id; accentName.textContent = x.label; markActive(x.id); live(); });
      dots.append(d);
    }
    const colorInput = h('input', { class: 'sb-ap__color', attrs: { type: 'color', 'aria-label': 'Custom accent colour' } });
    colorInput.value = a.accentCustom;
    const customDot = h('label', { class: ['sb-ap__dot', 'sb-ap__dot--custom', s.accent === 'custom' && 'is-active'], dataset: { id: 'custom' }, style: { '--c': a.accentCustom } }, colorInput, icon('edit', 12));
    colorInput.addEventListener('input', () => { a.accentCustom = colorInput.value; customDot.style.setProperty('--c', colorInput.value); s.accent = 'custom'; accentName.textContent = 'Custom'; markActive('custom'); live(); });
    dots.append(customDot);
    controls.append(section('Accent colour', null, h('div', { class: 'sb-ap__row' }, dots, accentName)));

    // ── Background
    const bgGrid = h('div', { class: 'sb-ap__grid sb-ap__grid--bg' });
    const bgTile = (label: string, css: string | null, active: boolean, onPick: () => void, extra?: Node) => {
      const tile = h('div', { class: ['sb-ap__tile', active && 'is-active'], attrs: { role: 'radio', tabindex: '0', 'aria-checked': String(active), 'aria-label': label } },
        h('div', { class: ['sb-ap__swatch', !css && 'is-empty'], style: css ? { background: css } : {} }, extra ?? null),
        h('div', { class: 'sb-ap__label' }, h('span', null, label), active ? icon('check', 13) : null));
      pressable(tile, onPick);
      return tile;
    };
    bgGrid.append(bgTile('None', null, a.background.kind === 'none', () => { a.background.kind = 'none'; rerender(); }, icon('x', 16)));
    for (const [id, p] of Object.entries(BG_PRESETS)) bgGrid.append(bgTile(p.label, p.css, a.background.kind === 'preset' && a.background.preset === id, () => { a.background.kind = 'preset'; a.background.preset = id; rerender(); }));
    for (const path of ctx.port.listImages().slice(0, 24)) {
      const url = ctx.port.resourceUrl(path);
      if (!url) continue;
      bgGrid.append(bgTile(path.split('/').pop()!.replace(/\.[^.]+$/, ''), `center / cover no-repeat url("${url.replace(/"/g, '%22')}")`, a.background.kind === 'image' && a.background.image === path, () => { a.background.kind = 'image'; a.background.image = path; rerender(); }));
    }
    const file = h('input', { attrs: { type: 'file', accept: 'image/*', hidden: true } });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      if (f.size > 15 * 1024 * 1024) { toast('Image is larger than 15 MB — please pick a smaller one.', { tone: 'error' }); return; }
      await ctx.run('Background added', async () => {
        const folder = `${s.folders.system}/Backgrounds`;
        await ctx.port.ensureFolder(folder);
        const safe = f.name.replace(/[\\/:*?"<>|#^[\]]/g, '-');
        let path = `${folder}/${safe}`;
        for (let i = 2; ctx.port.exists(path); i++) path = `${folder}/${safe.replace(/(\.[^.]+)?$/, ` ${i}$1`)}`;
        await ctx.port.writeBinary(path, await f.arrayBuffer());
        a.background.kind = 'image';
        a.background.image = path;
        rerender();
      });
    });
    const upload = bgTile('Your photo', null, false, () => file.click(), icon('plus', 18));
    upload.classList.add('is-upload');
    bgGrid.append(upload, file);
    const hasBg = a.background.kind !== 'none';
    controls.append(section('Background', 'Photos you add are stored in 00-System/Backgrounds in your vault.',
      bgGrid,
      hasBg ? h('div', { class: 'sb-ap__sliders' },
        slider({ label: 'Blur', min: 0, max: 40, step: 1, value: a.background.blur, format: (v) => `${v}px`, onInput: (v) => { a.background.blur = v; live(); } }),
        slider({ label: 'Dim', min: 0, max: 0.9, step: 0.05, value: a.background.dim, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { a.background.dim = v; live(); } })) : null));

    // ── Liquid glass
    const g = a.glass;
    controls.append(section('Liquid glass', g.enabled ? null : 'Frosted, translucent surfaces with a soft light edge. Looks best over a background.',
      switchRow('Glass surfaces', g.enabled, (v) => { g.enabled = v; rerender(); }),
      g.enabled ? h('div', { class: 'sb-ap__sliders' },
        slider({ label: 'Frost', min: 0, max: 48, step: 1, value: g.blur, format: (v) => `${v}px`, onInput: (v) => { g.blur = v; live(); } }),
        slider({ label: 'Opacity', min: 0.1, max: 0.95, step: 0.05, value: g.opacity, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { g.opacity = v; live(); } }),
        slider({ label: 'Saturation', min: 1, max: 2.4, step: 0.1, value: g.saturation, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { g.saturation = v; live(); } }),
        slider({ label: 'Light edge', min: 0, max: 1, step: 0.05, value: g.highlight, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { g.highlight = v; live(); } })) : null,
      g.enabled ? switchRow('Battery-friendly on phones', g.mobileLite !== false, (v) => { g.mobileLite = v; live(); }) : null,
      g.enabled ? h('p', { class: 'sb-ap__note' }, 'On phones, only bars, sidebar and sheets are blurred; cards stay translucent. Turn off for full glass everywhere (uses more battery).') : null));

    // ── Shape & feel
    controls.append(section('Shape & feel', null,
      h('div', { class: 'sb-ap__sliders' },
        slider({ label: 'Corner radius', min: 0.4, max: 1.8, step: 0.1, value: a.radius, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { a.radius = v; live(); } })),
      h('div', { class: 'sb-ap__row' }, h('span', null, 'Density'),
        segmented([{ id: 'comfortable', label: 'Comfortable' }, { id: 'compact', label: 'Compact' }], s.density, (v) => { s.density = v as Settings['density']; ctx.saveSettings(); ctx.applySettings?.(s); }, { size: 'sm' })),
      h('div', { class: 'sb-ap__row' }, h('span', null, 'Motion'),
        segmented([{ id: 'system', label: 'Auto' }, { id: 'off', label: 'Full' }, { id: 'on', label: 'Reduced' }], s.reduceMotion, (v) => { s.reduceMotion = v as Settings['reduceMotion']; ctx.saveSettings(); ctx.applySettings?.(s); }, { size: 'sm' }))));

    // ── Navigation
    const bn = s.bottomNav;
    controls.append(section('Navigation', 'On phones the sidebar opens from the menu button. A bottom bar is optional.',
      switchRow('Hide Obsidian’s toolbar in the app', bn.hideObsidianBar, (v) => { bn.hideObsidianBar = v; rerender(); }),
      h('div', { class: 'sb-ap__row' }, h('span', null, 'Bottom bar'),
        segmented([{ id: 'off', label: 'Off' }, { id: 'auto', label: 'Phones' }, { id: 'always', label: 'Always' }], bn.mode, (v) => { bn.mode = v as typeof bn.mode; rerender(); }, { size: 'sm' })),
      bn.mode !== 'off' ? h('div', { class: 'sb-ap__chips' }, ...BN_CHOICES.map((c) => {
        const idx = bn.items.indexOf(c.id);
        const el = h('div', { class: ['sb-ap__choice', idx >= 0 && 'is-active'], attrs: { role: 'checkbox', tabindex: '0', 'aria-checked': String(idx >= 0) } }, icon(c.icon, 15), h('span', null, c.label), idx >= 0 ? h('b', { class: 'sb-num' }, String(idx + 1)) : null);
        pressable(el, () => {
          const i = bn.items.indexOf(c.id);
          if (i >= 0) { if (bn.items.length <= 2) { toast('Keep at least two items.'); return; } bn.items.splice(i, 1); }
          else { if (bn.items.length >= 6) { toast('Up to six items fit.'); return; } bn.items.push(c.id); }
          rerender();
        });
        return el;
      })) : null));

    root.append(h('div', { class: 'sb-ap' }, h('aside', { class: 'sb-ap__preview' }, preview.el), controls));
  },
};

/** div-based control: immune to host button styling, keyboard accessible. */
function pressable(el: HTMLElement, run: () => void) {
  el.addEventListener('click', (e) => { if ((e.target as HTMLElement).tagName !== 'INPUT') run(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); } });
}

function switchRow(label: string, checked: boolean, onChange: (v: boolean) => void) {
  const el = toggle(checked, onChange, label);
  el.classList.add('sb-switch--row');
  return el;
}
