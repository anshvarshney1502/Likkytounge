// Message protocol between popup / library / content / background.
import type { Capsule, Folder, Settings } from "./types";
import type { LatestContext } from "../context/types";

export type RuntimeRequest =
  | { type: "GET_SETTINGS" }
  | { type: "SET_SETTINGS"; settings: Partial<Settings> }
  | { type: "LIST_CAPSULES" }
  | { type: "LIST_FOLDERS" }
  | { type: "GET_CAPSULE"; id: string }
  | { type: "UPSERT_CAPSULE"; capsule: Capsule }
  | { type: "DELETE_CAPSULE"; id: string }
  | { type: "UPSERT_FOLDER"; folder: Folder }
  | { type: "DELETE_FOLDER"; id: string }
  | { type: "BUMP_USAGE"; id: string }
  // Latest-context storage lives in the extension's own (background) origin
  // — NOT in the content script's page origin — so it's shared across every
  // AI site instead of being isolated per-domain.
  | { type: "GET_LATEST_CONTEXT" }
  | { type: "SET_LATEST_CONTEXT"; context: LatestContext };

export interface CapsulesData {
  capsules: Capsule[];
  folders: Folder[];
  settings: Settings;
}
