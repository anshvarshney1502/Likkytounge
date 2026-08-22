// Message protocol between popup / library / content / background.
import type { Capsule, Folder, Settings } from "./types";

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
  | { type: "BUMP_USAGE"; id: string };

export interface CapsulesData {
  capsules: Capsule[];
  folders: Folder[];
  settings: Settings;
}
