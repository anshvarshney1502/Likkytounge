import type { Capsule, Settings } from "../shared/types";
import { applyTheme } from "../shared/theme";
import { randomId } from "../utils/id";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

async function init(): Promise<void> {
  const settings = (await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })) as Settings;
  applyTheme(settings.theme);
  await refresh();

  $("new-save").addEventListener("click", saveNew);
  $("new-body").addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).ctrlKey && (e as KeyboardEvent).key === "Enter") saveNew();
  });
}

async function refresh(): Promise<void> {
  const capsules = (await chrome.runtime.sendMessage({ type: "LIST_CAPSULES" })) as Capsule[];
  const recent = capsules.slice(0, 6);
  $("count").textContent = String(capsules.length);
  const ul = $<HTMLUListElement>("recent");
  const empty = $("recent-empty");
  if (!recent.length) {
    ul.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  ul.innerHTML = recent
    .map(
      (c) => `
      <li>
        <a class="capsule-link" data-id="${escape(c.id)}" title="Open in library">
          <strong>${escape(c.title)}</strong>
          <span class="muted small block">${escape(preview(c.body))}</span>
        </a>
      </li>`,
    )
    .join("");
  ul.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(".capsule-link");
    if (target?.dataset.id) {
      window.open(chrome.runtime.getURL(`library.html#capsule=${target.dataset.id}`), "_blank");
    }
  }, { once: true });
}

function preview(text: string): string {
  return text.replace(/\s+/g, " ").slice(0, 80) + (text.length > 80 ? "…" : "");
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

async function saveNew(): Promise<void> {
  const title = ($("new-title") as HTMLInputElement).value.trim();
  const body = ($("new-body") as HTMLTextAreaElement).value.trim();
  if (!body) {
    ($("new-body") as HTMLTextAreaElement).focus();
    return;
  }
  const now = new Date().toISOString();
  const capsule: Capsule = {
    id: randomId("cap"),
    title: title || body.split("\n")[0].slice(0, 60) || "Untitled capsule",
    body,
    summary: body.slice(0, 140).replace(/\s+/g, " ").trim(),
    folderId: null,
    tags: [],
    useCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await chrome.runtime.sendMessage({ type: "UPSERT_CAPSULE", capsule });
  ($("new-title") as HTMLInputElement).value = "";
  ($("new-body") as HTMLTextAreaElement).value = "";
  await refresh();
}

void init();
