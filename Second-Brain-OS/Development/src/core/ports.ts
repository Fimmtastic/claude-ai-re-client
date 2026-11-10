/**
 * VaultPort — the only boundary between Second Brain OS and its storage.
 *
 * The Obsidian implementation lives in `services/obsidian-port.ts`, an
 * in-memory implementation for tests/preview in `services/memory-port.ts`.
 * Nothing outside those two files may touch `app.vault` / `metadataCache`.
 */

export interface FileInfo {
  path: string;
  basename: string;
  mtime: number;
  ctime: number;
  frontmatter: Record<string, unknown> | null;
  /** lower-cased tags without '#', from body + frontmatter */
  tags: string[];
  /** lower-cased basenames of outgoing links */
  links: string[];
  headings: string[];
  /** first level-1 heading, if any (used as display title) */
  h1?: string;
  /** true if the file contains at least one checkbox list item */
  hasTasks: boolean;
}

export type VaultEvent =
  | { type: 'upsert'; path: string }
  | { type: 'delete'; path: string }
  | { type: 'rename'; path: string; oldPath: string }
  | { type: 'ready' };

export interface VaultPort {
  listFiles(): FileInfo[];
  getFile(path: string): FileInfo | null;
  exists(path: string): boolean;
  read(path: string): Promise<string>;
  /** Fails if the file already exists — never overwrites. */
  create(path: string, content: string): Promise<void>;
  /** Atomic read-modify-write. `fn` receives current content. */
  process(path: string, fn: (current: string) => string): Promise<string>;
  processFrontMatter(path: string, fn: (fm: Record<string, unknown>) => void): Promise<void>;
  trash(path: string): Promise<void>;
  ensureFolder(path: string): Promise<void>;
  /** Raw adapter writes for hidden technical files (backups). */
  writeRaw(path: string, content: string): Promise<void>;
  readRaw(path: string): Promise<string | null>;
  listRaw(folder: string): Promise<string[]>;
  removeRaw(path: string): Promise<void>;
  openFile(path: string, opts?: { newLeaf?: boolean; line?: number }): void;
  renderMarkdown(markdown: string, el: HTMLElement, sourcePath: string): Promise<void>;
  subscribe(listener: (ev: VaultEvent) => void): () => void;
  /** Resolves a link text to a vault path, or null */
  resolveLink(link: string, fromPath: string): string | null;
  /** Image files in the vault (vault-relative paths) — for custom backgrounds */
  listImages(): string[];
  /** URL the webview can load for a vault file, or null */
  resourceUrl(path: string): string | null;
  /** Create a binary file (fails if it exists) */
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  /** Backlinks: paths linking to `path` */
  backlinks(path: string): string[];
}
