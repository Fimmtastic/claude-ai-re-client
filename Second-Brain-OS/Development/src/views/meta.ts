import type { EntityKind } from '../core/types';

export const KIND_ICON: Record<EntityKind, string> = {
  note: 'knowledge',
  project: 'projects',
  goal: 'goals',
  worklog: 'worklog',
  journal: 'journal',
  daily: 'today',
  review: 'reviews',
  learning: 'learning',
  resource: 'link',
};

export const KIND_LABEL: Record<EntityKind, string> = {
  note: 'Note',
  project: 'Project',
  goal: 'Goal',
  worklog: 'Worklog',
  journal: 'Journal',
  daily: 'Daily',
  review: 'Review',
  learning: 'Learning',
  resource: 'Resource',
};

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  key?: string; // g + key shortcut
}

export const NAV: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'home', route: 'home', key: 'h' },
  { id: 'today', label: 'Today', icon: 'today', route: 'today', key: 'd' },
  { id: 'worklogs', label: 'Worklogs', icon: 'worklog', route: 'worklogs', key: 'w' },
  { id: 'knowledge', label: 'Knowledge', icon: 'knowledge', route: 'knowledge', key: 'k' },
  { id: 'projects', label: 'Projects', icon: 'projects', route: 'projects', key: 'p' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', route: 'tasks', key: 't' },
  { id: 'goals', label: 'Goals', icon: 'goals', route: 'goals', key: 'g' },
  { id: 'learning', label: 'Learning', icon: 'learning', route: 'learning', key: 'l' },
  { id: 'journal', label: 'Journal', icon: 'journal', route: 'journal', key: 'j' },
  { id: 'reviews', label: 'Reviews', icon: 'reviews', route: 'reviews', key: 'r' },
  { id: 'archive', label: 'Archive', icon: 'archive', route: 'archive', key: 'a' },
];

/** Which page shows an entity of a given kind */
export function routeForKind(kind: EntityKind, path: string): string {
  switch (kind) {
    case 'project': return `project/${path}`;
    case 'goal': return `goal/${path}`;
    default: return `note/${path}`;
  }
}
