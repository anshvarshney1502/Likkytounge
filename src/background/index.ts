import { db } from "../storage/db";
import { getSettings, setSettings } from "../shared/settings-store";
import type { Capsule, Folder } from "../shared/types";
import { randomId } from "../utils/id";

// --- context menu: right-click selected text -> save as capsule ---
const MENU_ID = "likky-save-selection";

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Save selection as Capsule',
      contexts: ["selection"],
    });
  } catch { /* menu may already exist on reload */ }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;
  const now = new Date().toISOString();
  const title = info.selectionText.slice(0, 60).replace(/\s+/g, " ").trim() || "Untitled capsule";
  const capsule: Capsule = {
    id: randomId("cap"),
    title,
    body: info.selectionText,
    summary: info.selectionText.slice(0, 140).replace(/\s+/g, " ").trim(),
    folderId: null,
    tags: [],
    useCount: 0,
    createdAt: now,
    updatedAt: now,
    sourceUrl: tab?.url,
  };
  await db.upsertCapsule(capsule);
  await chrome.action.setBadgeText({ text: "＋" });
  await chrome.action.setBadgeBackgroundColor({ color: "#4f46e5" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
});

// --- message routing ---
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case "GET_SETTINGS":
          return sendResponse(await getSettings());
        case "SET_SETTINGS":
          return sendResponse(await setSettings(msg.settings));
        case "LIST_CAPSULES":
          return sendResponse(await db.listCapsules());
        case "LIST_FOLDERS":
          return sendResponse(await db.listFolders());
        case "GET_CAPSULE":
          return sendResponse(await db.getCapsule(msg.id));
        case "UPSERT_CAPSULE": {
          const c = msg.capsule as Capsule;
          c.updatedAt = new Date().toISOString();
          await db.upsertCapsule(c);
          return sendResponse({ ok: true });
        }
        case "DELETE_CAPSULE":
          await db.deleteCapsule(msg.id);
          return sendResponse({ ok: true });
        case "UPSERT_FOLDER": {
          const f = msg.folder as Folder;
          await db.upsertFolder(f);
          return sendResponse({ ok: true });
        }
        case "DELETE_FOLDER":
          await db.deleteFolder(msg.id);
          return sendResponse({ ok: true });
        case "BUMP_USAGE":
          await db.bumpUsage(msg.id);
          return sendResponse({ ok: true });
        case "OPEN_LIBRARY":
          await chrome.tabs.create({ url: chrome.runtime.getURL("library.html") });
          return sendResponse({ ok: true });
        default:
          return sendResponse({ error: "unknown" });
      }
    } catch (e) {
      sendResponse({ error: e instanceof Error ? e.message : "internal error" });
    }
  })();
  return true; // async
});
