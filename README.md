# Context-Bolt

**Capture any AI conversation and carry it to another LLM — one click.**

A free, open-source, privacy-first Chrome extension. Click Pikachu to capture your entire ChatGPT, Claude, Gemini, or DeepSeek conversation as Markdown. Switch to another LLM, click Upload Context, and it lands in the chat input automatically — no file picker, no drag-and-drop. Every generated context is saved in a searchable **Context Library** with full export support.

**No account. No cloud. No analytics. No API keys. 100% local.**

## Install

### Option 1: Download the release ZIP (recommended)

1. Download `context-bolt-v1.0.0.zip` from [Releases](https://github.com/anshvarshney1502/Likkytounge/releases)
2. Unzip the file
3. Open `chrome://extensions` in Chrome
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** and select the unzipped folder
6. Done — Pikachu appears on supported AI sites

### Option 2: Build from source

```bash
git clone https://github.com/anshvarshney1502/Likkytounge.git
cd Likkytounge
npm install
npm run build:prod
```

Then load `dist/` as an unpacked extension (same steps 3–6 above).

## How it works

### Generate Context
Click Pikachu on any supported AI site. The extension:
1. Detects the platform (ChatGPT, Claude, Gemini, DeepSeek)
2. Auto-scrolls to load the full conversation history (lazy/paginated/infinite-scroll)
3. Extracts every message in order with full formatting (headings, code blocks, tables, lists, bold/italic)
4. Saves it as Markdown to the local Context Library

If the conversation is extremely long and can't be fully loaded, it's honestly marked "possibly incomplete" rather than silently truncated.

### Upload Context
Switch to another supported LLM, click Upload Context. The latest generated context is attached to the chat input as a `.md` file — instantaneous, no matter how large the context is.

### Context Library
A full-featured app for browsing saved contexts:
- Sidebar grouped by Today / Yesterday / Earlier
- Formatted document viewer (not raw Markdown)
- Search across titles, platforms, dates, and message content
- Copy, Share, Export (Markdown / Plain Text / HTML / ZIP)
- Rename or delete any context
- Pikachu size and position are customizable

## Supported sites

| Site | Status |
| --- | --- |
| ChatGPT (`chatgpt.com`, `chat.openai.com`) | Fully supported |
| Claude (`claude.ai`) | Fully supported |
| Gemini (`gemini.google.com`) | Fully supported |
| DeepSeek (`chat.deepseek.com`) | Supported (best-effort selectors) |

## Privacy

- All data stays in your browser's local storage (IndexedDB + `chrome.storage.local`)
- Zero network requests — no servers, no telemetry, no error reporting
- Zero runtime dependencies in the shipped extension
- Generate Context reads the visible page text to capture it — nothing else
- Upload Context only writes your own context into the chat input
- Wipe everything anytime from Settings

## Permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Save settings (theme, hotkey, insert mode, density, Pikachu size) |
| `contextMenus` | Right-click "Save selection as Capsule" (legacy feature) |
| Host permissions | Attach the Pikachu launcher on the five supported AI sites only — no `<all_urls>` |

## Development

```bash
npm install          # install dev deps (zero runtime deps)
npm run watch        # rebuild on change
npm run typecheck    # tsc --noEmit
npm run test         # vitest (64 tests)
npm run build:prod   # minified production build
npm run check        # typecheck + tests + build
```

### Architecture

```
src/
  content/          Pikachu launcher (shadow DOM), input injection, drag system
  context/          Generate/Upload engine, extraction pipeline, IndexedDB store
    extract/        Per-platform selectors, scroll loader, DOM-to-Markdown serializer
  export/           ZIP writer, Markdown-to-HTML renderer, plaintext converter
  app/              Context Library SPA (sidebar, viewer, settings, about)
  background/       MV3 service worker — message routing, context menu
  storage/          Legacy Capsule/Folder IndexedDB
  popup/            Extension popup with latest-context preview
  shared/           Types, brand, theme, settings, download helper
  utils/            ID generation, logging, byte helpers
public/             HTML pages, CSS, icons, manifest.json
```

Context storage lives in the background service worker (extension origin) so it's shared across all AI sites — content scripts access it via message passing.

## License

[MIT](LICENSE)

## Author

Built by [Ansh Varshney](https://github.com/anshvarshney1502)
