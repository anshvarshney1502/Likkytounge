// Message protocol between popup <-> background <-> content script.
import type { Conversation, ExtractionResult } from "./types";

export type ExportFormat = "json" | "markdown" | "plaintext" | "html" | "zip";

export type AutoDownloadFormat = "off" | ExportFormat;

export interface Settings {
  autoSave: boolean;
  saveAttachments: boolean;
  maxAttachmentBytes: number;
  defaultExportFormat: ExportFormat;
  /** Automatically download a file after each save (in addition to the local vault). */
  autoDownloadOnSave: AutoDownloadFormat;
  /** Copy the saved conversation (plain-text) to the clipboard after saving. */
  copyOnSave: boolean;
  /** Include per-message timestamps in exports when the platform provided them. */
  includeTimestamps: boolean;
  /** Include extraction warnings in exports. */
  includeWarnings: boolean;
  theme: "system" | "light" | "dark";
  debugMode: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  autoSave: false, // MUST be off by default.
  saveAttachments: true,
  maxAttachmentBytes: 50 * 1024 * 1024,
  defaultExportFormat: "zip",
  autoDownloadOnSave: "off",
  copyOnSave: false,
  includeTimestamps: true,
  includeWarnings: true,
  theme: "system",
  debugMode: false,
};

// --- content script <- background ---
export interface ExtractRequest {
  type: "EXTRACT_CONVERSATION";
  saveAttachments: boolean;
  maxAttachmentBytes: number;
}

export interface DetectRequest {
  type: "DETECT_PLATFORM";
}

export interface DetectResponse {
  platform: string | null;
  platformId: string | null;
  generic: boolean;
  supported: boolean;
}

export type ContentRequest = ExtractRequest | DetectRequest;
export type ExtractResponse = ExtractionResult;

// --- popup -> background (port name) ---
export const SAVE_PORT = "lcv-save";

export type SaveProgressStage =
  | "detect"
  | "extract"
  | "attachments"
  | "archive"
  | "store"
  | "done";

export interface SaveProgressEvent {
  type: "progress";
  stage: SaveProgressStage;
  label: string;
  ok: boolean;
}

export interface SaveDoneEvent {
  type: "result";
  success: boolean;
  reason?: string;
  title?: string;
  conversationId?: string;
  messageCount?: number;
  attachmentCount?: number;
  generic?: boolean;
  updated?: boolean; // true when an existing snapshot was updated
  warnings?: string[];
}

export type SaveEvent = SaveProgressEvent | SaveDoneEvent;

export interface StartSaveMessage {
  type: "START_SAVE";
  tabId: number;
  mode: "new" | "update";
}

// --- generic runtime messages (popup/library/settings -> background) ---
export type RuntimeRequest =
  | { type: "GET_ACTIVE_DETECTION" }
  | { type: "GET_SETTINGS" }
  | { type: "SET_SETTINGS"; settings: Partial<Settings> };

export interface ActiveDetection {
  detection: DetectResponse | null;
  tabId: number | null;
  url: string | null;
  alreadySaved: boolean;
  lastSavedAt: string | null;
}

// Re-export for convenience.
export type { Conversation };
