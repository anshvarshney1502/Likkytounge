import type { Settings } from "../shared/types";
import { getSettings, setSettings } from "../shared/settings-store";
import { listContexts, clearAllContexts, clearOldContexts } from "../context/store";
import { db as capsuleDb } from "../storage/db";
import { applyDensity, applyReduceMotion } from "../shared/theme";
import { showToast } from "./toast";
import { APP_VERSION, APP_REPO } from "../shared/brand";

function switchHtml(id: string, checked: boolean): string {
  return `<button class="switch" id="${id}" role="switch" aria-checked="${checked}"></button>`;
}
function wireSwitch(root: HTMLElement, id: string, onChange: (v: boolean) => void): void {
  const el = root.querySelector<HTMLButtonElement>(`#${id}`)!;
  el.addEventListener("click", () => {
    const next = el.getAttribute("aria-checked") !== "true";
    el.setAttribute("aria-checked", String(next));
    onChange(next);
  });
}

export async function renderSettingsView(
  main: HTMLElement,
  onBack: () => void,
  onDataChanged: () => Promise<void> | void = () => {},
): Promise<void> {
  const settings = await getSettings();
  const ctxList = await listContexts();

  main.innerHTML = `
    <div class="app-page">
      <div class="app-page-topbar"><span class="back-link" id="s-back">← Back</span><strong>Settings</strong></div>
      <div class="app-page-inner">

        <section class="settings-section">
          <h2>Pikachu launcher</h2>
          <p class="desc">Controls the on-page launcher used for Generate Context and Upload Context. This does not change how generation or upload themselves work.</p>
          <div class="settings-card">
            <div class="settings-row switch-row">
              <div><div class="label">Show the Pikachu launcher</div><div class="desc">Appears on supported AI sites.</div></div>
              ${switchHtml("sw-launcher", settings.showLauncher)}
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h2>Context</h2>
          <p class="desc">How captured conversations are titled, stored, and uploaded.</p>
          <div class="settings-card">
            <div class="settings-row switch-row">
              <div><div class="label">Automatic titles</div><div class="desc">Use the source conversation's own title where available.</div></div>
              ${switchHtml("sw-titles", settings.autoGenerateTitles)}
            </div>
            <div class="settings-row switch-row">
              <div><div class="label">Show latest context on the popup</div><div class="desc">Display a preview card the moment you open the extension.</div></div>
              ${switchHtml("sw-preview", settings.showLastContextPreview)}
            </div>
            <div class="settings-row field" style="margin:0;">
              <label for="insertMode">Upload Context insert behavior</label>
              <select id="insertMode">
                <option value="append">Append at end (recommended)</option>
                <option value="prepend">Prepend at start</option>
                <option value="replace">Replace whatever is there</option>
              </select>
            </div>
            <div class="settings-row">
              <p class="hint" style="margin:0;">Conversations are always captured in full — no summarization, no truncation, no message limit. If a very long conversation's history can't be fully confirmed as loaded, the saved context is honestly marked "possibly incomplete."</p>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h2>Export</h2>
          <div class="settings-card">
            <div class="settings-row field" style="margin:0;">
              <label for="exportFmt">Default export format</label>
              <select id="exportFmt">
                <option value="zip">ZIP (all formats bundled)</option>
                <option value="markdown">Markdown (.md)</option>
                <option value="plaintext">Plain Text (.txt)</option>
                <option value="html">HTML (.html)</option>
              </select>
              <p class="hint">Used by the sidebar's quick ⋯ → Export action. The viewer's Export menu always lets you pick any format.</p>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h2>Appearance</h2>
          <div class="settings-card">

            <div class="settings-row field" style="margin:0;">
              <label for="density">Interface density</label>
              <select id="density">
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </div>
            <div class="settings-row switch-row">
              <div><div class="label">Reduce motion</div><div class="desc">Turns off decorative animations. Core feedback (like the Thunderbolt burst) still plays briefly.</div></div>
              ${switchHtml("sw-motion", settings.reduceMotion)}
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h2>Privacy</h2>
          <div class="settings-card">
            <div class="settings-row">
              <p style="margin:0; font-size:13px; line-height:1.6;" class="muted">
                Every context and setting lives in this browser's local storage (IndexedDB and
                <code>chrome.storage.local</code>) — nothing is uploaded to any server. Generate Context reads the
                conversation text on the page you're viewing in order to capture it; that's the feature working as
                intended. Upload Context only writes the context you already generated into the current page's chat
                input. No analytics, no telemetry, no third-party requests, no account.
              </p>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h2>Data</h2>
          <div class="settings-card danger-zone">
            <div class="settings-row row wrap gap-2">
              <button class="btn" id="clear-old">Clear contexts older than 30 days</button>
              <button class="btn btn-danger" id="clear-all">Delete all local data</button>
            </div>
            <p class="hint" style="margin:8px 0 0;">Deleting is permanent and cannot be undone. The latest context is never removed by "Clear old contexts."</p>
          </div>
        </section>

        <section class="settings-section">
          <h2>About</h2>
          <div class="settings-card">
            <div class="settings-row row spread">
              <span class="muted small">Version ${APP_VERSION} · <a href="${APP_REPO}" target="_blank" rel="noopener">GitHub ↗</a></span>
              <span class="nav-link" id="s-open-about" style="cursor:pointer;">View About page →</span>
            </div>
          </div>
        </section>

      </div>
    </div>
  `;

  main.querySelector("#s-back")!.addEventListener("click", onBack);
  main.querySelector("#s-open-about")!.addEventListener("click", () => (location.hash = "#/about"));

  (main.querySelector("#insertMode") as HTMLSelectElement).value = settings.insertMode;
  (main.querySelector("#exportFmt") as HTMLSelectElement).value = settings.defaultExportFormat;
  (main.querySelector("#density") as HTMLSelectElement).value = settings.density;

  const save = (patch: Partial<Settings>) => void setSettings(patch);

  wireSwitch(main, "sw-launcher", (v) => save({ showLauncher: v }));
  wireSwitch(main, "sw-titles", (v) => save({ autoGenerateTitles: v }));
  wireSwitch(main, "sw-preview", (v) => save({ showLastContextPreview: v }));
  wireSwitch(main, "sw-motion", (v) => {
    save({ reduceMotion: v });
    applyReduceMotion(v);
  });

  main.querySelector("#insertMode")!.addEventListener("change", (e) => {
    save({ insertMode: (e.target as HTMLSelectElement).value as Settings["insertMode"] });
  });
  main.querySelector("#exportFmt")!.addEventListener("change", (e) => {
    save({ defaultExportFormat: (e.target as HTMLSelectElement).value as Settings["defaultExportFormat"] });
  });
  main.querySelector("#density")!.addEventListener("change", (e) => {
    const density = (e.target as HTMLSelectElement).value as Settings["density"];
    save({ density });
    applyDensity(density);
  });

  main.querySelector("#clear-old")!.addEventListener("click", async () => {
    const deleted = await clearOldContexts(30);
    showToast(deleted > 0 ? `Cleared ${deleted} context(s) older than 30 days.` : "Nothing older than 30 days to clear.");
    if (deleted > 0) await onDataChanged();
  });
  main.querySelector("#clear-all")!.addEventListener("click", async () => {
    if (!confirm(`Delete ALL ${ctxList.length} saved context(s) and any legacy data? This cannot be undone.`)) return;
    await clearAllContexts();
    try {
      await capsuleDb.clearAll();
    } catch {
      /* legacy store may not exist */
    }
    // The sidebar's context list is cached in app/index.ts module state and
    // is not refetched on a plain hash navigation — without this, the
    // library kept showing the just-deleted contexts until a manual
    // reload, which read as "delete all" silently not working.
    await onDataChanged();
    showToast("All local data deleted.");
    location.hash = "#/";
  });
}
