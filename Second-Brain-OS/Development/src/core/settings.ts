import { DEFAULT_FOLDERS, FolderConfig } from './schema';

export type WidgetId =
  | 'focus'
  | 'today'
  | 'quick'
  | 'projects'
  | 'goals'
  | 'knowledge'
  | 'habits'
  | 'analytics'
  | 'timeline';

export const WIDGET_LABELS: Record<WidgetId, string> = {
  focus: 'Today Focus',
  today: 'Today Overview',
  quick: 'Quick Actions',
  projects: 'Projects',
  goals: 'Goals',
  knowledge: 'Knowledge',
  habits: 'Habits',
  analytics: 'Personal Analytics',
  timeline: 'Activity Timeline',
};

export interface DashboardWidget {
  id: WidgetId;
  visible: boolean;
}

export type ThemeId = 'graphite' | 'midnight' | 'forest' | 'sand' | 'plum' | 'mono';
export type AccentId = 'indigo' | 'blue' | 'teal' | 'amber' | 'rose' | 'graphite' | 'custom';
export type BottomNavItem = 'home' | 'today' | 'worklogs' | 'knowledge' | 'projects' | 'tasks' | 'goals' | 'learning' | 'journal' | 'reviews' | 'archive' | 'capture' | 'search' | 'more';

export interface Appearance {
  /** follow Obsidian's light/dark, or force one */
  mode: 'obsidian' | 'light' | 'dark';
  theme: ThemeId;
  accentCustom: string;
  background: {
    kind: 'none' | 'preset' | 'image';
    preset: string;
    /** vault-relative path of an image */
    image: string;
    blur: number; // px
    dim: number; // 0..0.9
  };
  glass: {
    enabled: boolean;
    blur: number; // px
    opacity: number; // 0.15..0.95 surface opacity
    saturation: number; // 1..2.2
    highlight: number; // 0..1 specular edge strength
  };
  radius: number; // 0.5..1.6 scale
}

export interface BottomNavSettings {
  mode: 'auto' | 'always' | 'off';
  items: BottomNavItem[];
  /** hide Obsidian's own mobile toolbar while the app is active */
  hideObsidianBar: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'obsidian',
  theme: 'graphite',
  accentCustom: '#7c7ff2',
  background: { kind: 'none', preset: 'aurora', image: '', blur: 0, dim: 0.35 },
  glass: { enabled: false, blur: 22, opacity: 0.55, saturation: 1.6, highlight: 0.55 },
  radius: 1,
};

export const DEFAULT_BOTTOM_NAV: BottomNavSettings = { mode: 'auto', items: ['home', 'today', 'capture', 'tasks', 'more'], hideObsidianBar: true };

export interface Settings {
  schemaVersion: number;
  userName: string;
  locale: string;
  motto: string;
  /** Hide Obsidian chrome while the app view is active */
  immersive: boolean;
  openOnStartup: boolean;
  accent: AccentId;
  appearance: Appearance;
  bottomNav: BottomNavSettings;
  density: 'comfortable' | 'compact';
  reduceMotion: 'system' | 'on' | 'off';
  folders: FolderConfig;
  inboxFile: string;
  habits: string[];
  dashboard: DashboardWidget[];
  worklogDefaultMinutes: number;
  traineeName: string;
  /** Hide journal content on dashboard and in search */
  privacyMode: boolean;
  backupRetentionDays: number;
  debug: boolean;
  /** Persisted UI state */
  ui: {
    route: string;
    sidebarCollapsed: boolean;
    contextOpen: boolean;
    taskView: string;
    projectView: 'list' | 'kanban' | 'timeline';
    worklogView: 'timeline' | 'calendar' | 'week' | 'skills';
  };
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  userName: '',
  locale: 'en-GB',
  motto: '',
  immersive: true,
  openOnStartup: true,
  accent: 'indigo',
  appearance: structuredClone(DEFAULT_APPEARANCE),
  bottomNav: structuredClone(DEFAULT_BOTTOM_NAV),
  density: 'comfortable',
  reduceMotion: 'system',
  folders: { ...DEFAULT_FOLDERS },
  inboxFile: '00-System/Inbox.md',
  habits: ['Lesen', 'Sport', 'Lernen'],
  dashboard: (['focus', 'today', 'quick', 'projects', 'goals', 'analytics', 'knowledge', 'habits', 'timeline'] as WidgetId[]).map((id) => ({ id, visible: true })),
  worklogDefaultMinutes: 480,
  traineeName: '',
  privacyMode: false,
  backupRetentionDays: 14,
  debug: false,
  ui: { route: 'home', sidebarCollapsed: false, contextOpen: false, taskView: 'today', projectView: 'list', worklogView: 'timeline' },
};

/** Merge stored data with defaults (forward-compatible migration). */
export function mergeSettings(stored: unknown): Settings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<Settings>;
  const merged: Settings = {
    ...DEFAULT_SETTINGS,
    ...s,
    folders: { ...DEFAULT_SETTINGS.folders, ...(s.folders ?? {}) },
    ui: { ...DEFAULT_SETTINGS.ui, ...(s.ui ?? {}) },
    appearance: {
      ...DEFAULT_APPEARANCE,
      ...(s.appearance ?? {}),
      background: { ...DEFAULT_APPEARANCE.background, ...(s.appearance?.background ?? {}) },
      glass: { ...DEFAULT_APPEARANCE.glass, ...(s.appearance?.glass ?? {}) },
    },
    bottomNav: { ...DEFAULT_BOTTOM_NAV, ...(s.bottomNav ?? {}), items: Array.isArray(s.bottomNav?.items) && s.bottomNav!.items.length ? s.bottomNav!.items.slice(0, 6) : [...DEFAULT_BOTTOM_NAV.items] },
    habits: Array.isArray(s.habits) ? s.habits.filter((h) => typeof h === 'string') : DEFAULT_SETTINGS.habits,
    dashboard: DEFAULT_SETTINGS.dashboard,
  };
  // dashboard: keep user order, drop unknown, append new widgets
  const known = new Set(DEFAULT_SETTINGS.dashboard.map((w) => w.id));
  const fromUser = Array.isArray(s.dashboard) ? s.dashboard.filter((w) => w && known.has(w.id)) : [];
  const seen = new Set(fromUser.map((w) => w.id));
  merged.dashboard = [...fromUser.map((w) => ({ id: w.id, visible: w.visible !== false })), ...DEFAULT_SETTINGS.dashboard.filter((w) => !seen.has(w.id))];
  return merged;
}
