import type { Capsule, Settings } from "../shared/types";
import { applyTheme } from "../shared/theme";
import { ALL_RECIPES, cook } from "./recipes";
import { randomId } from "../utils/id";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const state = {
  picked: new Set<string>(["rtco"]),
  vars: { format: "", audience: "", context: "" },
};

function renderRecipes(): void {
  const el = $("recipes");
  el.innerHTML = ALL_RECIPES.map(
    (r) => `
    <label class="recipe">
      <input type="checkbox" data-id="${r.id}" ${state.picked.has(r.id) ? "checked" : ""}>
      <span>
        <strong>${escape(r.label)}</strong>
        <span class="muted small block">${escape(r.hint)}</span>
      </span>
    </label>`,
  ).join("");
  el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) =>
    cb.addEventListener("change", () => {
      const id = cb.dataset.id!;
      cb.checked ? state.picked.add(id) : state.picked.delete(id);
      renderVars();
    }),
  );
}

function renderVars(): void {
  const anyNeedsFormat = state.picked.has("output-format");
  const anyNeedsAudience = state.picked.has("audience");
  const anyNeedsContext = state.picked.has("context-inject");
  const show = anyNeedsFormat || anyNeedsAudience || anyNeedsContext;
  $("vars-wrap").hidden = !show;
  $("vars").innerHTML =
    (anyNeedsFormat
      ? `<label class="field"><span>Output format</span><input id="var-format" type="text" placeholder="markdown table, JSON, bullet list, …" value="${escape(state.vars.format)}"></label>`
      : "") +
    (anyNeedsAudience
      ? `<label class="field"><span>Audience</span><input id="var-audience" type="text" placeholder="a curious beginner, an exec, a senior engineer" value="${escape(state.vars.audience)}"></label>`
      : "") +
    (anyNeedsContext
      ? `<label class="field"><span>Background context</span><textarea id="var-context" rows="4" placeholder="Project background, constraints, prior decisions…">${escape(state.vars.context)}</textarea></label>`
      : "");
  const bind = (id: string, key: keyof typeof state.vars) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
    if (el) el.addEventListener("input", () => (state.vars[key] = el.value));
  };
  bind("var-format", "format");
  bind("var-audience", "audience");
  bind("var-context", "context");
}

function runCook(): void {
  const input = ($("cook-in") as HTMLTextAreaElement).value;
  const ids = ALL_RECIPES.map((r) => r.id).filter((id) => state.picked.has(id));
  ($("cook-out") as HTMLTextAreaElement).value = cook(input, ids, state.vars);
}

async function copyOut(): Promise<void> {
  const text = ($("cook-out") as HTMLTextAreaElement).value;
  if (!text) return;
  try { await navigator.clipboard.writeText(text); } catch { /* denied */ }
  const btn = $<HTMLButtonElement>("cook-copy");
  const t = btn.textContent; btn.textContent = "Copied ✓";
  setTimeout(() => (btn.textContent = t), 1000);
}

async function saveOutAsCapsule(): Promise<void> {
  const body = ($("cook-out") as HTMLTextAreaElement).value.trim();
  if (!body) return;
  const now = new Date().toISOString();
  const capsule: Capsule = {
    id: randomId("cap"),
    title: body.split("\n")[0].slice(0, 60) || "Cooked prompt",
    body,
    summary: body.slice(0, 140).replace(/\s+/g, " ").trim(),
    folderId: null,
    tags: ["cooked"],
    useCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await chrome.runtime.sendMessage({ type: "UPSERT_CAPSULE", capsule });
  const btn = $<HTMLButtonElement>("cook-save");
  const t = btn.textContent; btn.textContent = "Saved ✓";
  setTimeout(() => (btn.textContent = t), 1000);
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

async function init(): Promise<void> {
  const settings = (await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })) as Settings;
  applyTheme(settings.theme);
  renderRecipes();
  renderVars();
  $("cook-run").addEventListener("click", runCook);
  $("cook-clear").addEventListener("click", () => {
    ($("cook-in") as HTMLTextAreaElement).value = "";
    ($("cook-out") as HTMLTextAreaElement).value = "";
  });
  $("cook-copy").addEventListener("click", copyOut);
  $("cook-save").addEventListener("click", saveOutAsCapsule);
}

void init();
