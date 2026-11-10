import type { Settings, ThemeId } from '../core/settings';
import type { VaultPort } from '../core/ports';

/**
 * Appearance engine: everything visual is driven by data attributes and CSS
 * custom properties on the app root, so changes apply instantly without
 * re-rendering any page.
 */

export const THEMES: { id: ThemeId; label: string; dark: [string, string, string]; light: [string, string, string] }[] = [
  // [background, surface, text] — only used for swatch previews
  { id: 'graphite', label: 'Graphite', dark: ['#121315', '#1d1e22', '#ececee'], light: ['#f6f5f1', '#ffffff', '#1d1c1a'] },
  { id: 'midnight', label: 'Midnight', dark: ['#0b0e15', '#171d2a', '#e7ebf3'], light: ['#f2f4f8', '#ffffff', '#151a24'] },
  { id: 'forest', label: 'Forest', dark: ['#0e1210', '#1a201c', '#e6ece7'], light: ['#f1f3ee', '#fcfdfa', '#17201a'] },
  { id: 'sand', label: 'Sand', dark: ['#14120f', '#211e19', '#efe9df'], light: ['#f7f1e7', '#fffcf6', '#241f17'] },
  { id: 'plum', label: 'Plum', dark: ['#120f16', '#1f1a25', '#eee8f2'], light: ['#f6f2f7', '#fffcff', '#211a26'] },
  { id: 'mono', label: 'Mono', dark: ['#0f0f0f', '#1c1c1c', '#f0f0f0'], light: ['#fafafa', '#ffffff', '#111111'] },
];

export const ACCENTS: { id: Settings['accent']; label: string; color: string }[] = [
  { id: 'indigo', label: 'Indigo', color: '#7f81f2' },
  { id: 'blue', label: 'Blue', color: '#4b8ef5' },
  { id: 'teal', label: 'Teal', color: '#2aae98' },
  { id: 'amber', label: 'Amber', color: '#d99a3d' },
  { id: 'rose', label: 'Rose', color: '#e2687f' },
  { id: 'graphite', label: 'Graphite', color: '#8e8f98' },
];

/** Original gradient backgrounds — pure CSS, no assets, no network. */
export const BG_PRESETS: Record<string, { label: string; css: string; tone: 'dark' | 'light' }> = {
  aurora: { label: 'Aurora', tone: 'dark', css: 'radial-gradient(60% 50% at 15% 10%, #3c3f9e 0%, transparent 70%), radial-gradient(50% 45% at 85% 25%, #16736d 0%, transparent 70%), radial-gradient(60% 55% at 55% 95%, #74306f 0%, transparent 70%), #0b0c12' },
  dusk: { label: 'Dusk', tone: 'dark', css: 'radial-gradient(70% 60% at 80% 100%, #c8643f 0%, transparent 65%), radial-gradient(60% 60% at 10% 20%, #3d2a6b 0%, transparent 70%), linear-gradient(170deg, #17122a, #2b1730)' },
  ocean: { label: 'Ocean', tone: 'dark', css: 'radial-gradient(60% 55% at 25% 20%, #1c4f8c 0%, transparent 70%), radial-gradient(55% 50% at 85% 80%, #0c7f8c 0%, transparent 70%), #06111b' },
  ember: { label: 'Ember', tone: 'dark', css: 'radial-gradient(55% 50% at 20% 85%, #a3401f 0%, transparent 70%), radial-gradient(45% 45% at 80% 15%, #6b2416 0%, transparent 70%), #120a08' },
  nebula: { label: 'Nebula', tone: 'dark', css: 'radial-gradient(40% 40% at 30% 30%, #6d4bd8 0%, transparent 70%), radial-gradient(35% 35% at 70% 60%, #d64c9a 0%, transparent 70%), radial-gradient(45% 40% at 50% 100%, #2b7fd4 0%, transparent 70%), #0a0914' },
  mist: { label: 'Mist', tone: 'light', css: 'radial-gradient(60% 55% at 15% 15%, #dbe4f6 0%, transparent 70%), radial-gradient(55% 50% at 85% 75%, #f3dfe7 0%, transparent 70%), #f4f2ee' },
  meadow: { label: 'Meadow', tone: 'light', css: 'radial-gradient(60% 55% at 20% 80%, #d7ead0 0%, transparent 70%), radial-gradient(55% 50% at 80% 20%, #f3e8cc 0%, transparent 70%), #f5f3ec' },
  pastel: { label: 'Pastel', tone: 'light', css: 'radial-gradient(45% 45% at 25% 25%, #c9d6ff 0%, transparent 70%), radial-gradient(40% 40% at 75% 35%, #ffd1e8 0%, transparent 70%), radial-gradient(50% 45% at 50% 90%, #c8f1e5 0%, transparent 70%), #f7f6fb' },
};

export function resolveMode(s: Settings): 'light' | 'dark' {
  const m = s.appearance.mode;
  if (m === 'light' || m === 'dark') return m;
  return typeof document !== 'undefined' && document.body.classList.contains('theme-light') ? 'light' : 'dark';
}

export function applyAppearance(el: HTMLElement, s: Settings, _port: VaultPort) {
  const a = s.appearance;
  el.dataset.mode = resolveMode(s);
  el.dataset.theme = a.theme;
  el.dataset.accent = s.accent;
  const st = el.style;
  st.setProperty('--sb-accent-custom', a.accentCustom);
  st.setProperty('--sb-radius-scale', String(clamp(a.radius, 0.4, 1.8)));
  st.setProperty('--sb-glass-blur', `${clamp(a.glass.blur, 0, 60)}px`);
  st.setProperty('--sb-glass-opacity', String(clamp(a.glass.opacity, 0.05, 1)));
  st.setProperty('--sb-glass-sat', String(clamp(a.glass.saturation, 1, 2.5)));
  st.setProperty('--sb-glass-hl', String(clamp(a.glass.highlight, 0, 1)));
  el.classList.toggle('is-glass', a.glass.enabled);
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));
