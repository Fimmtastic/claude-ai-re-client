import { h } from '../../ui/dom';
import { icon } from '../../ui/icons';
import { button, card, pageHeader, segmented, slider, toggle } from '../../ui/components/basic';
import { confirm, toast } from '../../ui/components/overlay';
import type { AppContext, PageDef } from '../context';
import { ACCENTS, BG_PRESETS, THEMES, resolveMode } from '../appearance-apply';
import { DEFAULT_APPEARANCE, DEFAULT_BOTTOM_NAV, BottomNavItem } from '../../core/settings';
import { NAV } from '../meta';

/**
 * Appearance studio: every visual parameter, applied live. Changes only touch
 * CSS variables / data attributes, so nothing re-renders while dragging.
 */

type Shellish = AppContext & { applyAppearance?: () => void };

const BN_CHOICES: { id: BottomNavItem; label: string; icon: string }[] = [
  ...NAV.map((n) => ({ id: n.id as BottomNavItem, label: n.label, icon: n.icon })),
  { id: 'capture', label: 'Capture (+)', icon: 'plus' },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'more', label: 'More', icon: 'more' },
];

export const AppearancePage: PageDef = {
  id: 'appearance',
  nav: 'appearance',
  title: () => 'Appearance',
  render(ctx0, root) {
    const ctx = ctx0 as Shellish;
    const s = ctx.settings;
    const a = s.appearance;
    const live = () => { ctx.applyAppearance?.(); ctx.saveSettings(); };
    const rerender = () => { live(); ctx.refresh(); (ctx as unknown as { onHostChrome?: () => void }).onHostChrome?.(); };

    root.append(pageHeader({
      eyebrow: 'Personalisation',
      title: 'Appearance',
      subtitle: 'Themes, colours, backgrounds and the liquid-glass look. All changes apply live and are saved automatically.',
      actions: [button({ label: 'Reset all', icon: 'undo', variant: 'ghost', onClick: async () => {
        if (!(await confirm({ title: 'Reset appearance?', text: 'Theme, accent, background, glass, corner radius and bottom bar go back to their defaults.', confirm: 'Reset' }))) return;
        s.appearance = structuredClone(DEFAULT_APPEARANCE);
        s.bottomNav = structuredClone(DEFAULT_BOTTOM_NAV);
        s.accent = 'indigo';
        rerender();
      } })],
    }));

    // ── Mode & theme
    const mode = resolveMode(s);
    const themeGrid = h('div', { class: 'sb-swatches sb-swatches--themes' }, ...THEMES.map((t) => {
      const [bg, surf, text] = t[mode];
      const b = h('button', { class: ['sb-theme-swatch', a.theme === t.id && 'is-active'], attrs: { type: 'button', 'aria-pressed': String(a.theme === t.id) } },
        h('span', { class: 'sb-theme-swatch__preview', style: { background: bg } },
          h('span', { class: 'sb-theme-swatch__card', style: { background: surf } }, h('i', { style: { background: text } }), h('i', { style: { background: text, opacity: '.4' } }), h('b', { style: { background: 'var(--sb-accent)' } }))),
        h('span', { class: 'sb-theme-swatch__label' }, t.label));
      b.addEventListener('click', () => { a.theme = t.id; rerender(); });
      return b;
    }));
    root.append(card({ title: 'Theme', icon: 'sparkle' },
      h('div', { class: 'sb-appearance-row' }, h('span', { class: 'sb-appearance-row__label' }, 'Mode'),
        segmented([{ id: 'obsidian', label: 'Follow Obsidian' }, { id: 'light', label: 'Light', icon: 'sun' }, { id: 'dark', label: 'Dark', icon: 'moon' }], a.mode, (v) => { a.mode = v as typeof a.mode; rerender(); }, { size: 'sm' })),
      themeGrid));

    // ── Accent
    const custom = h('input', { class: 'sb-color', attrs: { type: 'color', 'aria-label': 'Custom accent colour' } });
    custom.value = a.accentCustom;
    custom.addEventListener('input', () => { a.accentCustom = custom.value; s.accent = 'custom'; live(); root.querySelectorAll('.sb-accent-dot').forEach((d) => d.classList.toggle('is-active', (d as HTMLElement).dataset.id === 'custom')); });
    root.append(card({ title: 'Accent colour', icon: 'heart' },
      h('div', { class: 'sb-swatches' },
        ...ACCENTS.map((x) => {
          const d = h('button', { class: ['sb-accent-dot', s.accent === x.id && 'is-active'], dataset: { id: x.id }, attrs: { type: 'button', 'aria-label': x.label, 'data-tip': x.label }, style: { '--c': x.color } });
          d.addEventListener('click', () => { s.accent = x.id; live(); root.querySelectorAll('.sb-accent-dot').forEach((e) => e.classList.toggle('is-active', e === d)); });
          return d;
        }),
        h('label', { class: ['sb-accent-dot', 'sb-accent-dot--custom', s.accent === 'custom' && 'is-active'], dataset: { id: 'custom' }, attrs: { 'data-tip': 'Custom colour' }, style: { '--c': a.accentCustom } }, custom, icon('edit', 13)))));

    // ── Background
    const bgGrid = h('div', { class: 'sb-swatches sb-swatches--bg' });
    const none = h('button', { class: ['sb-bg-swatch', a.background.kind === 'none' && 'is-active'], attrs: { type: 'button' } }, h('span', { class: 'sb-bg-swatch__preview is-none' }, icon('x', 16)), h('span', null, 'None'));
    none.addEventListener('click', () => { a.background.kind = 'none'; rerender(); });
    bgGrid.append(none);
    for (const [id, p] of Object.entries(BG_PRESETS)) {
      const b = h('button', { class: ['sb-bg-swatch', a.background.kind === 'preset' && a.background.preset === id && 'is-active'], attrs: { type: 'button' } }, h('span', { class: 'sb-bg-swatch__preview', style: { background: p.css } }), h('span', null, p.label));
      b.addEventListener('click', () => { a.background.kind = 'preset'; a.background.preset = id; rerender(); });
      bgGrid.append(b);
    }
    for (const path of ctx.port.listImages().slice(0, 24)) {
      const url = ctx.port.resourceUrl(path);
      if (!url) continue;
      const b = h('button', { class: ['sb-bg-swatch', a.background.kind === 'image' && a.background.image === path && 'is-active'], attrs: { type: 'button', title: path } }, h('span', { class: 'sb-bg-swatch__preview', style: { background: `center / cover url("${url.replace(/"/g, '%22')}")` } }), h('span', null, path.split('/').pop()!.replace(/\.[^.]+$/, '')));
      b.addEventListener('click', () => { a.background.kind = 'image'; a.background.image = path; rerender(); });
      bgGrid.append(b);
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
    const upload = h('button', { class: 'sb-bg-swatch', attrs: { type: 'button' } }, h('span', { class: 'sb-bg-swatch__preview is-none' }, icon('plus', 18)), h('span', null, 'Upload'));
    upload.addEventListener('click', () => file.click());
    bgGrid.append(upload, file);
    const hasBg = a.background.kind !== 'none';
    root.append(card({ title: 'Background', icon: 'layers', subtitle: 'Own images are stored in 00-System/Backgrounds inside your vault' },
      bgGrid,
      h('div', { class: 'sb-sliders' },
        slider({ label: 'Blur', min: 0, max: 40, step: 1, value: a.background.blur, format: (v) => `${v}px`, disabled: !hasBg, onInput: (v) => { a.background.blur = v; live(); } }),
        slider({ label: 'Dim', min: 0, max: 0.9, step: 0.05, value: a.background.dim, format: (v) => `${Math.round(v * 100)}%`, disabled: !hasBg, onInput: (v) => { a.background.dim = v; live(); } }))));

    // ── Liquid glass
    const g = a.glass;
    root.append(card({ title: 'Liquid glass', icon: 'sparkle', subtitle: 'Translucent, blurred surfaces with a soft light edge — best with a background' },
      switchRow('Enable glass surfaces', g.enabled, (v) => { g.enabled = v; rerender(); }),
      h('div', { class: 'sb-sliders' },
        slider({ label: 'Frost (blur)', min: 0, max: 48, step: 1, value: g.blur, format: (v) => `${v}px`, disabled: !g.enabled, onInput: (v) => { g.blur = v; live(); } }),
        slider({ label: 'Opacity', min: 0.1, max: 0.95, step: 0.05, value: g.opacity, format: (v) => `${Math.round(v * 100)}%`, disabled: !g.enabled, onInput: (v) => { g.opacity = v; live(); } }),
        slider({ label: 'Colour saturation', min: 1, max: 2.4, step: 0.1, value: g.saturation, format: (v) => `${Math.round(v * 100)}%`, disabled: !g.enabled, onInput: (v) => { g.saturation = v; live(); } }),
        slider({ label: 'Light edge', min: 0, max: 1, step: 0.05, value: g.highlight, format: (v) => `${Math.round(v * 100)}%`, disabled: !g.enabled, onInput: (v) => { g.highlight = v; live(); } })),
      g.enabled && !hasBg ? h('p', { class: 'sb-muted sb-small' }, 'Tip: glass shines over a colourful background — try Aurora or Nebula.') : null,
      h('p', { class: 'sb-muted sb-small' }, 'Blur effects use more GPU and battery, especially on phones. Lower “Frost” if scrolling feels slow.')));

    // ── Shape & density
    root.append(card({ title: 'Shape & density', icon: 'kanban' },
      h('div', { class: 'sb-sliders' },
        slider({ label: 'Corner radius', min: 0.4, max: 1.8, step: 0.1, value: a.radius, format: (v) => `${Math.round(v * 100)}%`, onInput: (v) => { a.radius = v; live(); } })),
      h('div', { class: 'sb-appearance-row' }, h('span', { class: 'sb-appearance-row__label' }, 'Density'),
        segmented([{ id: 'comfortable', label: 'Comfortable' }, { id: 'compact', label: 'Compact' }], s.density, (v) => { s.density = v as typeof s.density; ctx.saveSettings(); (ctx as unknown as { applySettings?: (x: typeof s) => void }).applySettings?.(s); }, { size: 'sm' })),
      h('div', { class: 'sb-appearance-row' }, h('span', { class: 'sb-appearance-row__label' }, 'Motion'),
        segmented([{ id: 'system', label: 'System' }, { id: 'off', label: 'Full' }, { id: 'on', label: 'Reduced' }], s.reduceMotion, (v) => { s.reduceMotion = v as typeof s.reduceMotion; ctx.saveSettings(); (ctx as unknown as { applySettings?: (x: typeof s) => void }).applySettings?.(s); }, { size: 'sm' }))));

    // ── Bottom navigation
    const bn = s.bottomNav;
    const picker = h('div', { class: 'sb-bn-picker' }, ...BN_CHOICES.map((c) => {
      const idx = bn.items.indexOf(c.id);
      const b = h('button', { class: ['sb-bn-choice', idx >= 0 && 'is-active'], attrs: { type: 'button', 'aria-pressed': String(idx >= 0) } }, icon(c.icon, 16), h('span', null, c.label), idx >= 0 ? h('span', { class: 'sb-bn-choice__n sb-num' }, String(idx + 1)) : null);
      b.addEventListener('click', () => {
        const i = bn.items.indexOf(c.id);
        if (i >= 0) { if (bn.items.length <= 2) { toast('Keep at least two items.'); return; } bn.items.splice(i, 1); }
        else { if (bn.items.length >= 6) { toast('Up to six items fit.'); return; } bn.items.push(c.id); }
        rerender();
      });
      return b;
    }));
    root.append(card({ title: 'Bottom navigation bar', icon: 'list', subtitle: 'Replaces Obsidian’s toolbar on phones and small windows' },
      h('div', { class: 'sb-appearance-row' }, h('span', { class: 'sb-appearance-row__label' }, 'Show'),
        segmented([{ id: 'auto', label: 'Phones & small windows' }, { id: 'always', label: 'Always' }, { id: 'off', label: 'Never' }], bn.mode, (v) => { bn.mode = v as typeof bn.mode; rerender(); }, { size: 'sm' })),
      switchRow('Hide Obsidian’s toolbar while the app is open', bn.hideObsidianBar, (v) => { bn.hideObsidianBar = v; rerender(); }),
      h('p', { class: 'sb-muted sb-small' }, 'Tap to add or remove; the order follows your taps. “More” always gives access to every section and Obsidian’s file list and command palette.'),
      picker));
  },
};

/** Whole row is the tap target (label wraps the switch). */
function switchRow(label: string, checked: boolean, onChange: (v: boolean) => void) {
  const el = toggle(checked, onChange, label);
  el.classList.add('sb-switch--row');
  return el;
}
