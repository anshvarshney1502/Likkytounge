# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
semantic versioning once it reaches 1.0.

## [Unreleased]

### Planned
- Per-Capsule versioning & rollback.
- Team folders with color labels.
- More Cook recipes (few-shot templates, tone/register presets).
- Additional site adapters (Copilot, Grok, Qwen).

## [0.3.0] — 2026-08-23

### Changed — full product pivot
- **New product direction:** Likky Tounge is now a Capsule Hub-style tool. It manages reusable **Capsules** of context and injects them into ChatGPT / Claude / Gemini / DeepSeek chat inputs with one click. The chat-save / archive functionality from 0.1–0.2 has been removed.

### Added
- **Floating on-page launcher + capsule picker** (Shadow-DOM overlay). Search Capsules, click to insert into the chat input, or drag & drop them onto the input.
- **Keyboard shortcut** (`Alt+K` by default, customizable) to open the picker on any supported AI site.
- **Right-click "Save selection as Capsule"** context menu — works on Gmail and every other page.
- **Library page:** three-column manager (folders / capsule list / editor). Create, edit, delete, tag, move between folders, search, sort by recent/used/title.
- **Popup:** quick-create a Capsule in seconds, see recent Capsules, jump to Library / Cook / Settings.
- **Cook This Prompt** page — a fully local, rules-based prompt enhancer with 8 stackable recipes (RTCO structure, step-by-step, examples, output format, audience, no-fluff, self-critique, context inject). No LLM call, no API keys.
- **JSON backup import / export** — portable vault backup that only merges new items (never overwrites your existing Capsules).
- **Delete all data** button that clears IndexedDB.
- New IndexedDB store: `likky-tounge` with `capsules` + `folders` object stores.
- New tests for Cook recipes, IndexedDB CRUD + merge-import, and input insertion.


## [0.2.0] — 2026-08-22

### Added
- **Plain-text export** (`.txt`) — no markdown, no hashes; the ZIP archive now includes it alongside `.md`, `.html`, and `.json`.
- **Hero rebrand:** the extension is now called **Likky Tounge**. Internal storage/adapter ids unchanged for backward compatibility.
- Improved **attachment capture** for ChatGPT (uploaded images inside user turns + file tiles) and Claude (uploaded images). Host permissions extended to `oaiusercontent.com`, `anthropic.com`, and `googleusercontent.com` CDNs so cross-origin attachment fetches succeed.
- Original attachment **quality/size/format preserved** — bytes are stored verbatim; filenames keep their real extension.
- Expanded **Settings**: max-attachment-size slider, auto-download-after-save, copy-to-clipboard-on-save, include-timestamps and include-warnings in exports, richer export-format menu.
- **About** section in Settings: name, version, license, GitHub repo, feature list, privacy pillars, safety guarantees, credits.
- Popup and library UI polish: tagline, top navigation bar, stats row, per-item "Copy" action.
- New `clipboardWrite` permission (required for the copy features; user-triggered only).

## [0.1.0] — 2026-08-22

Initial MVP.

### Added
- Manifest V3 Chrome extension in TypeScript with an esbuild build (zero runtime dependencies).
- One-click **Save Current Chat** from the popup, with live save progress.
- Modular adapter architecture with a shared `ChatAdapter` contract.
- Adapters: **ChatGPT**, **Claude**, **Gemini**, and a **generic fallback** using semantic heuristics.
- Platform-independent normalization (`ChatMessage` / `ContentBlock`) preserving roles, ordering, code blocks with language, links, images, and lists.
- Streaming stabilization: waits for a generating response to settle, warns if content may be incomplete.
- Best-effort attachment capture with honest unavailable-file metadata (no security bypasses).
- IndexedDB storage behind a `StorageProvider` interface, with a versioned, migratable schema.
- Stable conversation ids for duplicate prevention (re-saving updates in place).
- Exports: **JSON**, **Markdown**, **HTML**, and complete **ZIP** archives — using native `CompressionStream`/`DecompressionStream`.
- Backup / restore the whole vault as a portable ZIP.
- **Library** page: search, filter by platform, sort, open, export, delete, delete-all.
- **Settings** page: auto-save toggle (off by default), save-attachments toggle, default export format, theme, debug mode, storage usage, export/import/clear.
- Accessibility: keyboard-navigable controls, focus states, ARIA labels, theme-aware contrast.
- Unit tests (Vitest + jsdom) with HTML fixtures for adapters, exports, ZIP round-trip, and storage.
- Documentation: README, PRIVACY, SECURITY, CONTRIBUTING, and an adapter authoring guide.
