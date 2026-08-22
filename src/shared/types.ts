// Core data model for the Capsule Hub-style Likky Tounge.

export const SCHEMA_VERSION = 1 as const;

/** A reusable context snippet you can inject into any AI chat. */
export interface Capsule {
  id: string;
  title: string;
  /** Plain-text body — this is what gets inserted into the chat input. */
  body: string;
  /** Optional short caption shown in lists (auto-derived if empty). */
  summary: string;
  folderId: string | null;
  tags: string[];
  /** Times this capsule was inserted into a chat. */
  useCount: number;
  createdAt: string;
  updatedAt: string;
  /** Origin URL if the capsule was captured from a page (context menu). */
  sourceUrl?: string;
}

/** A grouping of capsules. */
export interface Folder {
  id: string;
  name: string;
  color?: string;
  order: number;
  createdAt: string;
}

export interface Settings {
  theme: "system" | "light" | "dark";
  /** Show the on-page launcher button on supported AI sites. */
  showLauncher: boolean;
  /** Keyboard shortcut to open the picker on the page. */
  launcherHotkey: string; // e.g. "Alt+K"
  /** Insert mode: replace input, or append at cursor. */
  insertMode: "replace" | "append" | "prepend";
  /** Auto-focus the search box when the picker opens. */
  focusSearchOnOpen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  showLauncher: true,
  launcherHotkey: "Alt+K",
  insertMode: "append",
  focusSearchOnOpen: true,
};

/** Portable backup shape (JSON). */
export interface Backup {
  app: "likky-tounge";
  schemaVersion: number;
  exportedAt: string;
  capsules: Capsule[];
  folders: Folder[];
}
