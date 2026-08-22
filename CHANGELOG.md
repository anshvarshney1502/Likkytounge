# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
semantic versioning once it reaches 1.0.

## [Unreleased]

### Planned
- Additional adapters: Copilot, Grok, DeepSeek, Qwen.
- Optional automatic save (setting scaffolding already present, off by default).
- Multi-select export in the library.
- Snapshot history (keep multiple versions of the same conversation).

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
