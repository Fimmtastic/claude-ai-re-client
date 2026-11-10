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

export interface Settings {
  schemaVersion: number;
  userName: string;
  locale: string;
  motto: string;
  /** Hide Obsidian chrome while the app view is active */
  immersive: boolean;
  openOnStartup: boolean;
  accent: 'indigo' | 'blue' | 'teal' | 'amber' | 'rose' | 'graphite';
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
