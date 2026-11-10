/**
 * Second Brain OS — canonical data models.
 *
 * Every entity is backed by a Markdown file (content) with YAML frontmatter
 * (metadata). Tasks are Markdown checkbox lines inside any file and carry a
 * stable block id (`^t-xxxxxx`) once the app touches them.
 *
 * These types are the public contract between the data layer (store) and all
 * feature modules / views. Modules must never read raw frontmatter directly.
 */

export type EntityKind =
  | 'note'
  | 'project'
  | 'goal'
  | 'worklog'
  | 'journal'
  | 'daily'
  | 'review'
  | 'learning'
  | 'resource';

export type ISODate = string; // YYYY-MM-DD

export interface FileRef {
  path: string;
  basename: string;
  /** milliseconds since epoch */
  mtime: number;
  ctime: number;
}

export interface BaseEntity extends FileRef {
  id: string;
  kind: EntityKind;
  title: string;
  tags: string[];
  /** Outgoing wikilinks, resolved to basenames (lower-cased) */
  links: string[];
  area?: string;
  archived: boolean;
  /** True for generated demo data — removable via command */
  testData: boolean;
  /** Validation warnings collected while normalizing metadata */
  issues: string[];
}

export type ProjectStatus = 'planned' | 'active' | 'paused' | 'done' | 'archived';
export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export interface Project extends BaseEntity {
  kind: 'project';
  status: ProjectStatus;
  priority: Priority;
  description: string;
  start?: ISODate;
  deadline?: ISODate;
  /** Goal basenames (lower-cased) this project advances */
  goals: string[];
}

export type GoalLevel = 'vision' | 'year' | 'quarter' | 'month' | 'week';
export type GoalStatus = 'active' | 'achieved' | 'paused' | 'dropped';

export interface Goal extends BaseEntity {
  kind: 'goal';
  level: GoalLevel;
  status: GoalStatus;
  parent?: string; // basename lower-cased
  due?: ISODate;
  /** Optional numeric measurement: current / target in `unit` */
  target?: number;
  current?: number;
  unit?: string;
  description: string;
}

export type WorkContext = 'work' | 'school' | 'private';

export interface WorklogSections {
  activity: string;
  learned: string[];
  problems: string[];
  solutions: string[];
  questions: string[];
  next: string[];
}

export interface Worklog extends BaseEntity {
  kind: 'worklog';
  date: ISODate;
  project?: string; // basename lower-cased
  /** duration in minutes, undefined when not recorded */
  minutes?: number;
  technologies: string[];
  context: WorkContext;
  sections: WorklogSections;
}

export interface JournalEntry extends BaseEntity {
  kind: 'journal';
  date: ISODate;
  mood?: number; // 1..5
  excerpt: string;
  highlights: string[];
}

export interface DailyNote extends BaseEntity {
  kind: 'daily';
  date: ISODate;
  focus?: string;
  focusProject?: string;
  motto?: string;
  habits: string[];
}

export type ReviewPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export interface Review extends BaseEntity {
  kind: 'review';
  period: ReviewPeriod;
  date: ISODate;
  periodKey: string; // e.g. 2026-W45, 2026-11, 2026-Q4
}

export interface Note extends BaseEntity {
  kind: 'note' | 'resource';
  topic?: string;
  favorite: boolean;
  collection?: string;
  url?: string;
  excerpt: string;
  wordCount: number;
}

export interface LearningItem extends BaseEntity {
  kind: 'learning';
  status: 'planned' | 'active' | 'done' | 'paused';
  progress?: number; // completed units
  total?: number;
  unit?: string;
  /** Dated session lines `- 2026-11-08 · 45min · Subnetting` */
  sessions: { date: ISODate; minutes?: number; text: string }[];
}

export type Entity =
  | Project
  | Goal
  | Worklog
  | JournalEntry
  | DailyNote
  | Review
  | Note
  | LearningItem;

export type TaskStatus = 'todo' | 'doing' | 'done' | 'cancelled';

export interface Task {
  /** Stable id: block id when present, otherwise path#line hash (volatile) */
  id: string;
  stable: boolean;
  path: string;
  line: number;
  /** Exact original line — used to verify before writing */
  raw: string;
  text: string;
  status: TaskStatus;
  due?: ISODate;
  scheduled?: ISODate;
  done?: ISODate;
  priority: Priority;
  recurrence?: string;
  tags: string[];
  /** lower-cased basenames of wikilinks inside the task line */
  links: string[];
  /** lower-cased basename of project the task belongs to (file or link) */
  project?: string;
  goal?: string;
  milestone: boolean;
  indent: number;
  testData: boolean;
}

export interface ActivityEvent {
  ts: number;
  date: ISODate;
  kind: EntityKind | 'task';
  title: string;
  path: string;
  verb: 'created' | 'edited' | 'completed';
}
