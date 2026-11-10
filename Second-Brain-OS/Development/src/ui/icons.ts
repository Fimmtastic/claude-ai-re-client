/**
 * Second Brain icon set — 20×20 grid, 1.6 stroke, round caps.
 * Hand-tuned to share one visual weight; no external icon dependency.
 */
const P: Record<string, string> = {
  home: 'M3.5 9.2 10 4l6.5 5.2V16a1 1 0 0 1-1 1h-3.2v-4.5H7.7V17H4.5a1 1 0 0 1-1-1z',
  today: 'M10 3v1.6M10 15.4V17M3 10h1.6M15.4 10H17M5.05 5.05l1.13 1.13M13.82 13.82l1.13 1.13M5.05 14.95l1.13-1.13M13.82 6.18l1.13-1.13M13 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  worklog: 'M7 3.5h6M6.5 5H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1.5M7 9.5h6M7 12.5h4',
  knowledge: 'M4 4.5c1.8-.7 4-.6 6 .8 2-1.4 4.2-1.5 6-.8V16c-1.8-.7-4-.6-6 .8-2-1.4-4.2-1.5-6-.8zM10 5.3v11.5',
  projects: 'M10 3.5 17 7l-7 3.5L3 7zM3 10.2l7 3.5 7-3.5M3 13.4l7 3.5 7-3.5',
  tasks: 'M16.5 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0M7.3 10.2l1.9 1.9 3.6-3.8',
  goals: 'M16.5 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0M13.5 10a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M10 10.01V10',
  learning: 'M2.8 7.6 10 4.3l7.2 3.3L10 10.9zM5.6 9v3.7c0 1.2 2 2.4 4.4 2.4s4.4-1.2 4.4-2.4V9M17.2 7.6v4.2',
  journal: 'M5.5 3.5h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1M7.5 3.5v13M10 7h2.5M10 9.5h2.5',
  reviews: 'M16 10a6 6 0 0 1-10.6 3.85M4 10a6 6 0 0 1 10.6-3.85M14.8 3.5v2.8H12M5.2 16.5v-2.8H8',
  archive: 'M3.5 5h13v3h-13zM4.5 8v7a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8M8.3 11h3.4',
  search: 'M14.5 9a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0M13 13l3.5 3.5',
  plus: 'M10 4.5v11M4.5 10h11',
  command: 'M7.5 7.5h5v5h-5zM7.5 7.5V6A1.5 1.5 0 1 0 6 7.5zM12.5 7.5V6A1.5 1.5 0 1 1 14 7.5zM7.5 12.5V14A1.5 1.5 0 1 1 6 12.5zM12.5 12.5V14a1.5 1.5 0 1 0 1.5-1.5z',
  'chevron-right': 'M8 5l5 5-5 5',
  'chevron-left': 'M12 5l-5 5 5 5',
  'chevron-down': 'M5 8l5 5 5-5',
  'chevron-up': 'M5 12l5-5 5 5',
  x: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  'panel-right': 'M3.5 4.5h13a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1M12.5 4.5v11',
  'panel-left': 'M3.5 4.5h13a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1M7.5 4.5v11',
  calendar: 'M4.5 5h11a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1M3.5 8.5h13M7 3.5v3M13 3.5v3',
  clock: 'M16.5 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0M10 6.5V10l2.3 1.6',
  flag: 'M5 17V4M5 4.5h8.5l-1.6 3 1.6 3H5',
  link: 'M8.6 11.4a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-.9.9M11.4 8.6a3 3 0 0 0-4.2 0L4.9 10.9a3 3 0 0 0 4.2 4.2l.9-.9',
  star: 'M10 3.6l1.95 3.95 4.35.63-3.15 3.07.74 4.33L10 13.53l-3.89 2.05.74-4.33L3.7 8.18l4.35-.63z',
  filter: 'M3.5 5h13M6 10h8M8.5 15h3',
  more: 'M5 10h.01M10 10h.01M15 10h.01',
  check: 'M4.5 10.5l3.5 3.5 7.5-8',
  settings: 'M10 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6M15.6 12.1l1 .8-1.4 2.4-1.2-.4a5.5 5.5 0 0 1-1.6.9l-.2 1.2H9.4l-.2-1.2a5.5 5.5 0 0 1-1.6-.9l-1.2.4L5 12.9l1-.8a5.6 5.6 0 0 1 0-1.8l-1-.8 1.4-2.4 1.2.4a5.5 5.5 0 0 1 1.6-.9l.2-1.2h2.8l.2 1.2c.6.2 1.1.5 1.6.9l1.2-.4 1.4 2.4-1 .8a5.6 5.6 0 0 1 0 1.8',
  edit: 'M12.6 4.6l2.8 2.8M4 16l.7-3.4 8.6-8.6a1.4 1.4 0 0 1 2 0l.7.7a1.4 1.4 0 0 1 0 2l-8.6 8.6z',
  external: 'M11 4h5v5M16 4l-7 7M14 11.5V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5',
  list: 'M7.5 5.5h9M7.5 10h9M7.5 14.5h9M3.8 5.5h.01M3.8 10h.01M3.8 14.5h.01',
  kanban: 'M3.5 4h3.6v12H3.5zM8.2 4h3.6v8H8.2zM12.9 4h3.6v10h-3.6z',
  timeline: 'M3.5 5.5h7M6.5 10h8M9.5 14.5h7',
  trash: 'M4 6h12M8 6V4.5h4V6M5.5 6l.7 10h7.6l.7-10',
  undo: 'M7 7.5H13a3.5 3.5 0 0 1 0 7H9.5M7 7.5l3-3M7 7.5l3 3',
  inbox: 'M3.5 11l2-6.5h9l2 6.5v4.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1zM3.5 11h4l1 2h3l1-2h4',
  zap: 'M11 3 4.5 11.2H10L9 17l6.5-8.2H10z',
  file: 'M11.5 3.5H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7zM11.5 3.5V7H15',
  tag: 'M3.5 4.5v5l7 7 6-6-7-7h-5a1 1 0 0 0-1 1M7 7.01V7',
  folder: 'M3.5 6a1 1 0 0 1 1-1h3.6l1.6 1.6h5.8a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z',
  grip: 'M8 5.5h.01M12 5.5h.01M8 10h.01M12 10h.01M8 14.5h.01M12 14.5h.01',
  eye: 'M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5M12.2 10a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0',
  'eye-off': 'M4 4l12 12M8.4 5.2A7.6 7.6 0 0 1 10 5c4.8 0 7.5 5 7.5 5a12.6 12.6 0 0 1-2 2.6M12.6 14.5A7 7 0 0 1 10 15c-4.8 0-7.5-5-7.5-5a12.7 12.7 0 0 1 3-3.4',
  download: 'M10 3.5v9M6.3 9l3.7 3.7L13.7 9M4 15.5h12',
  sun: 'M10 2.8v1.4M10 15.8v1.4M2.8 10h1.4M15.8 10h1.4M4.9 4.9l1 1M14.1 14.1l1 1M4.9 15.1l1-1M14.1 5.9l1-1M13.2 10a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0',
  moon: 'M15.8 12.6A6.5 6.5 0 0 1 7.4 4.2a6.5 6.5 0 1 0 8.4 8.4',
  arrow: 'M4.5 10h11M11 5.5l4.5 4.5-4.5 4.5',
  'arrow-up-right': 'M6 14l8-8M7 6h7v7',
  focus: 'M3.5 7V4.5a1 1 0 0 1 1-1H7M13 3.5h2.5a1 1 0 0 1 1 1V7M16.5 13v2.5a1 1 0 0 1-1 1H13M7 16.5H4.5a1 1 0 0 1-1-1V13',
  repeat: 'M4 9V8a3 3 0 0 1 3-3h8M13 3l2 2-2 2M16 11v1a3 3 0 0 1-3 3H5M7 17l-2-2 2-2',
  layers: 'M10 3.5 17 7l-7 3.5L3 7z',
  sparkle: 'M10 3.5l1.4 4.1 4.1 1.4-4.1 1.4L10 14.5l-1.4-4.1L4.5 9l4.1-1.4z',
  heart: 'M10 16s-6-3.6-6-8a3.4 3.4 0 0 1 6-2.2A3.4 3.4 0 0 1 16 8c0 4.4-6 8-6 8',
  play: 'M7 5l8 5-8 5z',
  back: 'M15.5 10h-11M9 5.5 4.5 10 9 14.5',
  forward: 'M4.5 10h11M11 5.5l4.5 4.5-4.5 4.5',
  dot: 'M10 10.01V10',
};

const cache = new Map<string, string>();

export function icon(name: string, size = 18, cls = ''): HTMLElement {
  const span = document.createElement('span');
  span.className = `sb-icon ${cls}`.trim();
  span.setAttribute('aria-hidden', 'true');
  let markup = cache.get(name + size);
  if (!markup) {
    const d = P[name] ?? P['dot']!;
    markup = `<svg width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
    cache.set(name + size, markup);
  }
  span.innerHTML = markup;
  return span;
}

export const ICON_NAMES = Object.keys(P);
