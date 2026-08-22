import { APP_VERSION, APP_REPO } from "../shared/brand";

const FEATURES: Array<{ icon: string; t: string; d: string }> = [
  { icon: "⚡", t: "Full conversation capture", d: "Generate Context scrolls to load lazy/paginated history, then captures every message — never just what's on screen." },
  { icon: "📤", t: "Cross-LLM context transfer", d: "Upload Context auto-detects the destination platform and inserts the latest context — no files, no drag-and-drop." },
  { icon: "🗂️", t: "Context library", d: "Every generated context is saved and searchable, grouped by date, with the latest always clearly marked." },
  { icon: "📖", t: "Long conversation support", d: "Designed for a handful of messages or several thousand — nothing is truncated or summarized away." },
  { icon: "⬇️", t: "Markdown, text, HTML, ZIP", d: "Export any saved context in the format you need, or bundle everything into one archive." },
  { icon: "📋", t: "Copy & share", d: "Copy the full context to your clipboard, or share it natively where your browser supports it." },
];

export function renderAboutView(main: HTMLElement, onBack: () => void): void {
  main.innerHTML = `
    <div class="app-page">
      <div class="app-page-topbar"><span class="back-link" id="a-back">← Back</span><strong>About</strong></div>
      <div class="app-page-inner">
        <div class="about-hero">
          <div class="eyebrow">Likky Tounge</div>
          <h1>Likky Tounge</h1>
          <p class="lead">Likky Tounge helps you capture, preserve, and carry your AI conversations across the tools you use every day.</p>
        </div>

        <div class="about-quote">
          "Your AI conversations are valuable. Keep them organized, readable, portable, and accessible."
        </div>

        <h2 style="margin: 32px 0 4px;">Features</h2>
        <div class="about-features">
          ${FEATURES.map((f) => `<div class="about-feature"><span class="icon">${f.icon}</span><div class="t">${f.t}</div><div class="d">${f.d}</div></div>`).join("")}
        </div>

        <h2 style="margin: 32px 0 4px;">Connect</h2>
        <div class="connect-row">
          <a class="connect-link" href="${APP_REPO}" target="_blank" rel="noopener">⌘ GitHub — Project</a>
          <a class="connect-link" href="https://github.com/anshvarshney1502" target="_blank" rel="noopener">☺ GitHub — Author</a>
        </div>

        <p class="muted small" style="margin-top:40px;">Version ${APP_VERSION} · MIT licensed · 100% local, no account, no cloud sync, no analytics.</p>
      </div>
    </div>
  `;
  main.querySelector("#a-back")!.addEventListener("click", onBack);
}
