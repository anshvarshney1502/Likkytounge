import type { Backup, Capsule, Folder, Settings } from "../shared/types";
import { SCHEMA_VERSION } from "../shared/types";
import { applyTheme } from "../shared/theme";
import { db } from "../storage/db";
import { downloadBlob } from "../shared/download";
import { makeBlob } from "../utils/bytes";
import { APP_VERSION } from "../shared/brand";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function loadSettings(): Promise<Settings> {
  return (await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })) as Settings;
}
async function save(patch: Partial<Settings>): Promise<Settings> {
  return (await chrome.runtime.sendMessage({ type: "SET_SETTINGS", settings: patch })) as Settings;
}

function bind(settings: Settings): void {
  ($("showLauncher") as HTMLInputElement).checked = settings.showLauncher;
  ($("launcherHotkey") as HTMLInputElement).value = settings.launcherHotkey;
  ($("insertMode") as HTMLSelectElement).value = settings.insertMode;
  ($("theme") as HTMLSelectElement).value = settings.theme;
  $("about-version").textContent = APP_VERSION;
}
function wire(): void {
  $("showLauncher").addEventListener("change", (e) =>
    save({ showLauncher: (e.target as HTMLInputElement).checked }),
  );
  $("launcherHotkey").addEventListener("change", (e) =>
    save({ launcherHotkey: (e.target as HTMLInputElement).value.trim() || "Alt+K" }),
  );
  $("insertMode").addEventListener("change", (e) =>
    save({ insertMode: (e.target as HTMLSelectElement).value as Settings["insertMode"] }),
  );
  $("theme").addEventListener("change", async (e) => {
    const theme = (e.target as HTMLSelectElement).value as Settings["theme"];
    await save({ theme });
    applyTheme(theme);
  });
}

async function exportJson(): Promise<void> {
  const capsules = (await chrome.runtime.sendMessage({ type: "LIST_CAPSULES" })) as Capsule[];
  const folders = (await chrome.runtime.sendMessage({ type: "LIST_FOLDERS" })) as Folder[];
  const backup: Backup = {
    app: "likky-tounge",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    capsules,
    folders,
  };
  const blob = makeBlob([JSON.stringify(backup, null, 2)], "application/json");
  downloadBlob(blob, `likky-tounge-backup-${new Date().toISOString().slice(0, 10)}.json`);
  $("io-status").textContent = `Exported ${capsules.length} capsule(s) and ${folders.length} folder(s).`;
}

async function importJson(file: File): Promise<void> {
  const text = await file.text();
  let parsed: Backup;
  try {
    parsed = JSON.parse(text);
  } catch {
    $("io-status").textContent = "Import failed: not valid JSON.";
    return;
  }
  if (parsed.app !== "likky-tounge" || !Array.isArray(parsed.capsules) || !Array.isArray(parsed.folders)) {
    $("io-status").textContent = "Import failed: file is not a Likky Tounge backup.";
    return;
  }
  const result = await db.mergeImport(parsed.capsules, parsed.folders);
  $("io-status").textContent = `Imported ${result.capsulesAdded} new capsule(s) and ${result.foldersAdded} new folder(s). (Existing items were kept.)`;
}

async function clearAll(): Promise<void> {
  if (!confirm("Delete every capsule and folder from this browser? This cannot be undone.")) return;
  await db.clearAll();
  $("io-status").textContent = "All capsules and folders deleted.";
}

async function init(): Promise<void> {
  const settings = await loadSettings();
  applyTheme(settings.theme);
  bind(settings);
  wire();

  $("export-json").addEventListener("click", exportJson);
  $("clear-all").addEventListener("click", clearAll);
  ($("import-file") as HTMLInputElement).addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) await importJson(file);
  });
}
void init();
