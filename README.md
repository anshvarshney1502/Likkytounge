# Likky Tounge

**Pikachu remembers your conversation, and carries it to any other AI chat.** A free, open-source, privacy-first Chrome extension. Click Pikachu to capture your entire current ChatGPT/Claude/Gemini/DeepSeek conversation; switch to another supported LLM, click **Upload Context**, and the whole thing lands in the new chat's input automatically — no file picker, no drag-and-drop, no copy-paste. Every generated context is saved in a searchable, premium **Context Library**, rendered as a readable document rather than raw Markdown.

Repository: <https://github.com/anshvarshney1502/Likkytounge>

- No account. No cloud sync. No analytics. No API keys.
- Everything lives in this browser's local storage and never leaves it.
- MIT licensed.

## What it does

### ⚡ Generate Context / Upload Context (the headline feature)
- **Generate Context** — click Pikachu (or `+` → Generate Context). It auto-scrolls the conversation to load lazy/paginated/infinite-scroll history, extracts every message in order, and saves the whole thing as Markdown.
- **Upload Context** — switch to another supported LLM, click `+` → Upload Context. The **latest** generated context is automatically detected and typed into that page's chat input. Generating a new context (A → B → C) always makes the newest one the one Upload Context uses — older ones stay safely in the library but never get uploaded by mistake.
- Handles very long conversations: extraction isn't limited to what's on-screen, and if the extractor can't confirm it reached the true start of the conversation it reports that honestly ("possibly incomplete") instead of silently pretending it got everything.
- Large contexts are chunked automatically on upload, in order, with the actual inserted length verified afterward — a partial transfer is reported as partial, never as a false success.
- The Thunderbolt animation plays only for Generate Context, never for Upload Context.

### 🗂️ Context Library
- **Full-window app** — click "Check your previous context" in the popup to open it, or `Cmd/Ctrl+click` a tab.
- **Sidebar** of every successfully generated context, grouped by Today / Yesterday / Earlier, with the current latest context clearly marked (dot + "Latest" badge).
- **Context Viewer** — conversations render as a formatted document (headings, lists, tables, code blocks, blockquotes, links, syntax-tagged code), not raw Markdown. User and Assistant turns are visually distinct.
- **Copy, Share, Export** — copy the full context to your clipboard, share it via the native Web Share API (with a clipboard fallback), or export as Markdown / Plain Text / HTML / ZIP.
- **Search** across titles, platforms, and dates instantly; falls back to scanning message content for libraries under 300 saved contexts.
- **Rename** any context inline; **delete** individually or in bulk from Settings.

### 🧩 Capsules (reusable snippets) — legacy feature, data preserved
An earlier version of Likky Tounge included "Capsules" (reusable text snippets) with their own popup and library UI. That UI has been retired in favor of the Context Library above, per the product's current direction. Any Capsule data from an earlier install is not deleted automatically — Settings → Storage shows a count and lets you clear it.

## Supported sites

| Site | Generate / Upload Context |
| --- | --- |
| ChatGPT (`chatgpt.com`, `chat.openai.com`) | ✅ |
| Claude (`claude.ai`) | ✅ |
| Gemini (`gemini.google.com`) | ✅ |
| DeepSeek (`chat.deepseek.com`) | ✅ (best-effort selectors) |

> **Note on the Pikachu artwork:** the launcher currently ships with a placeholder inline-SVG Pikachu face. Dropping the real provided artwork at `public/pikachu.png` and swapping one line in `src/content/pikachu-icon.ts` is all that's needed to use it — see the comment at the top of that file.

## Privacy

- ❌ No servers. No account. No login. No cloud sync.
- ❌ No analytics, telemetry, error reporters, or tracking pixels.
- ❌ **Zero runtime dependencies** in the shipped extension.
- ✅ Every context lives in `IndexedDB` on this device. Wipe it any time from Settings.

The extension never bypasses site authentication, CSP, CORS, or any security mechanism. Generate Context reads the visible conversation text on the page in order to capture it — that's the feature working as intended; nothing is transmitted anywhere except this browser's own local storage. Upload Context only writes the context you already generated into the current page's input.

## Install (unpacked)

```bash
npm install
npm run build:prod
```

Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select **`dist/`**.

## Development

```bash
npm install          # install dev deps (no runtime deps)
npm run watch        # rebuild on change into dist/
npm run typecheck    # tsc --noEmit
npm run test         # vitest
npm run build:prod   # minified production build
npm run check        # typecheck + tests + build
```

## Architecture

```
src/
  content/          Pikachu launcher overlay + generic input-injection helper
    overlay.ts      shadow-DOM UI (Pikachu, + menu, progress panel, hotkey)
    insert.ts       finds a chat input and inserts text (textarea + contenteditable)
    pikachu-icon.ts placeholder Pikachu SVG (swap for public/pikachu.png later)
    thunderbolt-icon.ts  bolt glyph used by the Generate-only animation
  context/          Generate Context / Upload Context engine + storage
    types.ts        LatestContext, progress/result shapes
    markdown.ts      "# Conversation Context" formatter
    store.ts         Context Library storage (IndexedDB: meta / bodies / kv)
    generate.ts      orchestrates detect -> scroll-load -> extract -> format -> store
    upload.ts         orchestrates detect -> locate input -> chunked insert -> verify
    extract/
      platforms.ts    per-LLM selectors: scroll container, messages, input, title
      scroll-loader.ts auto-scrolls to load lazy/paginated/infinite-scroll history
      serialize.ts     DOM element -> markdown-ish text (code fences, links, lists)
  export/           dependency-free ZIP writer, Markdown->HTML renderer, plaintext
  app/              the Context Library single-page app (sidebar, viewer, settings, about)
  background/       MV3 service worker: routes messages, owns Context Library storage,
                    runs the "Save selection as Capsule" context menu (legacy)
  storage/          legacy Capsule/Folder IndexedDB (kept only for Settings' "clear" action)
  popup/            premium first screen: headline, "Check your previous context", latest preview
  shared/           types, brand, theme, settings-store, download helper
  utils/            id, log, bytes
public/             HTML pages (popup.html, app.html), styles.css, icons, manifest.json
```

**Why Context Library storage lives in the background, not the content script:** a content script's `indexedDB` is scoped to the *page's* origin (e.g. `chatgpt.com`), so a context generated there would be invisible on `claude.ai`. The background service worker — and any extension page like `app.html`/`popup.html` — runs at the extension's own origin, so they all share the same storage. Content scripts reach it via `GET_LATEST_CONTEXT` / `SET_LATEST_CONTEXT` messages; the app and popup pages import `src/context/store.ts` directly.

Data model (see [src/context/store.ts](src/context/store.ts) and [src/context/types.ts](src/context/types.ts)):

```ts
interface SavedContextMeta {
  id: string;
  title: string;
  platformId: string;
  platformLabel: string;
  conversationUrl: string;
  messageCount: number;
  capturedAt: string;
  truncated: boolean;         // true if the scroll-loader hit a safety cap
  truncatedReason?: string;
  approxSizeBytes: number;
}
interface SavedContext extends SavedContextMeta { markdown: string; } // never truncated
```

Only one context is ever "latest" (a separate pointer in the `kv` store, updated only by a successful Generate). Deleting the current latest context falls back to the next-newest survivor; deleting any older context never changes what Upload Context uses.

## Using Generate / Upload Context

```
1. On ChatGPT (or Claude/Gemini/DeepSeek), click Pikachu.
     -> Detect platform -> scroll to load full history -> extract every
        message -> format as Markdown -> save to the Context Library
        as the new "latest context"
     -> Thunderbolt animation plays, then a result summary appears
        ("Captured 42 messages from ChatGPT.")

2. Switch tabs to Claude (or any other supported LLM).

3. Click the + button next to Pikachu -> Upload Context.
     -> Detect platform -> locate the chat input -> insert the latest
        context (chunked automatically if very large) -> verify it landed
     -> No Thunderbolt animation for this step.

4. Anytime: open the popup -> "Check your previous context" -> browse,
   read, search, rename, copy, share, export, or delete any saved context.
```

If no context has been generated yet, Upload Context reports
*"No generated context is available yet. Generate a context first."*
rather than doing nothing silently. If a conversation is so long the
extractor can't confirm it reached the very start, Generate Context still
saves what it found but marks it "possibly incomplete" with a reason.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save small settings (theme, hotkey, insert mode, density). |
| `scripting` | Content-script injection fallback when a supported site loads before install. |
| `activeTab` | The launcher only touches the tab you're actively on. |
| `contextMenus` | The right-click *Save selection as Capsule* item (legacy). |
| Host permissions (chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, chat.deepseek.com) | Attach the Pikachu launcher on those AI sites. No `<all_urls>`. |

## License

[MIT](LICENSE).
