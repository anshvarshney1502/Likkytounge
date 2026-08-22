# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
semantic versioning once it reaches 1.0.

## [Unreleased]

### Planned
- Swap the placeholder inline-SVG Pikachu for the real provided artwork (`public/pikachu.png`) — one-line change once the asset is available.
- Per-Capsule versioning & rollback.
- Team folders with color labels.
- More Cook recipes (few-shot templates, tone/register presets).
- Additional site adapters (Copilot, Grok, Qwen).

## [0.4.0] — 2026-08-23

### Added — Generate Context / Upload Context
- **New on-page launcher:** the old capsule-picker circle is replaced by a Pikachu button. Clicking Pikachu directly runs **Generate Context**; a **+** button opens a menu with both **Generate Context** and **Upload Context**.
- **Generate Context:** detects the current LLM (ChatGPT, Claude, Gemini, DeepSeek), auto-scrolls the conversation container to load lazy/paginated/infinite-scroll history, extracts every user and assistant message in order, formats it as `# Conversation Context` Markdown, and stores it as the single "latest context" (shared across every AI site via the background service worker — not per-site, since content scripts can't share IndexedDB across origins).
- **Upload Context:** on a different supported LLM, retrieves the latest generated context automatically (no file picker, no drag-and-drop, no manual copy-paste) and inserts it into that platform's chat input via `insertIntoInput`, chunking automatically for very large contexts while preserving order and verifying the insertion actually landed.
- **Thunderbolt animation:** a short (~700ms) radiating-bolt burst plays on Pikachu only for Generate Context, with a pulsing "charging" state while extraction is in progress. It never plays for Upload Context.
- **Honest truncation reporting:** if the scroll-loader hits a safety cap (iteration or time limit) before confirming it reached the top of the conversation, the result is marked `truncated: true` with a human-readable reason — never silently reported as complete.
- **Honest transfer verification:** after inserting context into a destination input, the actual inserted length is compared against the expected length; a shortfall is reported as a partial transfer rather than a false success.
- Platform adapter architecture for context extraction/upload (`src/context/extract/platforms.ts`), separate from (and coexisting with) the existing Capsule adapters.
- New tests: Markdown formatting order/never-truncates, scroll-loader stabilization/time-cap/iteration-cap behavior, and chunk-splitting never drops characters.

### Changed
- Settings: removed the now-unused "auto-focus search" toggle (the picker's search box no longer exists); relabeled the hotkey and insert-mode settings for the Generate/Upload workflow.
- About page copy updated to accurately describe that Generate Context reads on-page conversation text (previously claimed the on-page UI was "read-nothing" — no longer true now that Context exists; still never leaves the device except into the extension's own local storage).

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
