import type { DataStore, Snapshot } from '../core/store';
import type { Actions } from '../core/actions';
import type { VaultPort } from '../core/ports';
import type { Settings } from '../core/settings';
import type { ISODate } from '../core/types';

/**
 * AppContext — the documented public interface every page/module receives.
 * Pages never import the store, actions or port directly.
 */
export interface AppContext {
  readonly store: DataStore;
  readonly actions: Actions;
  readonly port: VaultPort;
  readonly host: 'obsidian' | 'preview';
  settings: Settings;
  saveSettings(): void;
  snap(): Snapshot;
  today(): ISODate;
  now(): Date;
  /** route like "projects" or "project/04-Projects/X.md" */
  navigate(route: string, opts?: { replace?: boolean }): void;
  back(): void;
  /** Opens an entity in the app's reader (or the right module page). */
  open(path: string): void;
  /** Opens the file in Obsidian's markdown editor. */
  edit(path: string, opts?: { newLeaf?: boolean; line?: number }): void;
  /** Runs a write with error handling + undo toast. */
  run(label: string, fn: () => Promise<unknown>, opts?: { silent?: boolean; undoable?: boolean }): Promise<boolean>;
  capture(mode?: CaptureMode, preset?: Partial<CapturePreset>): void;
  palette(initial?: string): void;
  /** Page-scoped persistent UI state (filters, tabs) */
  state<T extends object>(key: string, init: T): T;
  /** Re-render current page (e.g. after local UI state change) */
  refresh(): void;
  toggleContextPanel(force?: boolean): void;
  projectTitle(key: string | undefined): string;
}

export type CaptureMode = 'task' | 'note' | 'idea' | 'worklog' | 'project' | 'goal' | 'journal' | 'learning';

export interface CapturePreset {
  project: string;
  goal: string;
  due: ISODate;
  topic: string;
  text: string;
}

export interface PageDef {
  id: string;
  /** nav section id this page highlights */
  nav: string;
  title(ctx: AppContext, param?: string): string;
  crumbs?(ctx: AppContext, param?: string): { label: string; route?: string }[];
  render(ctx: AppContext, root: HTMLElement, param?: string): void;
  /** Optional right panel contents */
  context?(ctx: AppContext, el: HTMLElement, param?: string): void;
  /** Page-specific actions in the top bar */
  actions?(ctx: AppContext, param?: string): HTMLElement[];
  /** Cleanup when leaving the page */
  dispose?(): void;
}
