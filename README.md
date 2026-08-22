# Likky Tounge

**Pikachu remembers your conversation, and carries it to any other AI chat.** A free, open-source, privacy-first Chrome extension. Click Pikachu to capture your entire current ChatGPT/Claude/Gemini/DeepSeek conversation; switch to another supported LLM, click **Upload Context**, and the whole thing lands in the new chat's input automatically — no file picker, no drag-and-drop, no copy-paste.

Repository: <https://github.com/anshvarshney1502/Likkytounge>

- No account. No cloud sync. No analytics. No API keys.
- Everything lives in this browser's local storage and never leaves it.
- MIT licensed.

## What it does

### ⚡ Generate Context / Upload Context (the headline feature)
- **Generate Context** — click Pikachu (or `+` → Generate Context). It auto-scrolls the conversation to load lazy/paginated/infinite-scroll history, extracts every message in order, and saves the whole thing as Markdown — the "latest context."
- **Upload Context** — switch to another supported LLM, click `+` → Upload Context. The latest generated context is automatically detected and typed into that page's chat input. Only the most recent generation is ever used.
- Handles very long conversations: extraction isn't limited to what's on-screen, and if the extractor can't confirm it reached the true start of the conversation it reports that honestly ("possibly incomplete") instead of silently pretending it got everything.
- Large contexts are chunked automatically on upload, in order, with the actual inserted length verified afterward — a partial transfer is reported as partial, never as a false success.
- The Thunderbolt animation plays only for Generate Context, never for Upload Context.

### 🧩 Capsules (reusable snippets)
- **Capsules** — reusable context blocks (goals, project background, style guides, personas). Create once, reuse forever, from the popup or Library.
- **Folders** — group Capsules however you like (Engineering, Marketing, Personal…).
- **Right-click to save** — highlight any text on any page → *Save selection as Capsule* (works on Gmail too).
- **Search + filter** — full-text search across every Capsule, filter by folder, sort by recent/used/title.
- **Portable JSON backup** — export the whole vault, import it on another machine.

### 🧑‍🍳 Cook This Prompt
A local, rules-based prompt enhancer. Structures your prompt as *Role · Task · Constraints · Output*, adds step-by-step reasoning, pins output format, sets audience, and more — **no LLM call, no API keys, no network**.

## Supported sites

| Site | Generate / Upload Context | Capsule right-click save |
| --- | --- | --- |
| ChatGPT (`chatgpt.com`, `chat.openai.com`) | ✅ | ✅ |
| Claude (`claude.ai`) | ✅ | ✅ |
| Gemini (`gemini.google.com`) | ✅ | ✅ |
| DeepSeek (`chat.deepseek.com`) | ✅ (best-effort selectors) | ✅ |
| Gmail (`mail.google.com`) | — | ✅ |

The right-click *Save selection as Capsule* works on **any page**, not just the list above.

> **Note on the Pikachu artwork:** the launcher currently ships with a placeholder inline-SVG Pikachu face. Dropping the real provided artwork at `public/pikachu.png` and swapping one line in `src/content/pikachu-icon.ts` is all that's needed to use it — see the comment at the top of that file.

## Privacy

- ❌ No servers. No account. No login. No cloud sync.
- ❌ No analytics, telemetry, error reporters, or tracking pixels.
- ❌ **Zero runtime dependencies** in the shipped extension.
- ✅ Every Capsule stays in `IndexedDB` on this device. Wipe it any time from Settings.

The extension never bypasses site authentication, CSP, CORS, or any security mechanism. The content script is UI-only — it does **not** read chat contents.

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
  context/          Generate Context / Upload Context engine
    types.ts        LatestContext, progress/result shapes
    markdown.ts      "# Conversation Context" formatter
    store.ts         single-slot latest-context storage (IndexedDB, background-only)
    generate.ts      orchestrates detect -> scroll-load -> extract -> format -> store
    upload.ts         orchestrates detect -> locate input -> chunked insert -> verify
    extract/
      platforms.ts    per-LLM selectors: scroll container, messages, input, title
      scroll-loader.ts auto-scrolls to load lazy/paginated/infinite-scroll history
      serialize.ts     DOM element -> markdown-ish text (code fences, links, lists)
  background/       MV3 service worker: routes messages, owns latest-context storage,
                    runs the "Save selection as Capsule" context menu
  storage/          IndexedDB (capsules + folders) with CRUD + import merge
  cook/             "Cook This Prompt" local rewriter (8 stackable recipes)
  popup/            quick capsule create + recent list
  library/          full-page manager: folders / capsules / editor
  settings/         settings + JSON import/export + about
  shared/           types, brand, theme, settings-store, download helper
  utils/            id, log, bytes
public/             HTML pages, styles, icons, manifest.json
```

**Why latest-context storage lives in the background, not the content script:** a content script's `indexedDB` is scoped to the *page's* origin (e.g. `chatgpt.com`), so a context generated there would be invisible on `claude.ai`. The background service worker runs at the extension's own origin, so `GET_LATEST_CONTEXT` / `SET_LATEST_CONTEXT` messages give every site a shared view of the same "latest context."

Data models (see [src/shared/types.ts](src/shared/types.ts) and [src/context/types.ts](src/context/types.ts)):

```ts
interface Capsule {
  id: string;
  title: string;
  body: string;         // <- what gets inserted into the chat input
  summary: string;
  folderId: string | null;
  tags: string[];
  useCount: number;     // increments each time you insert it
  createdAt: string;
  updatedAt: string;
  sourceUrl?: string;   // when captured via right-click
}
interface Folder { id: string; name: string; color?: string; order: number; createdAt: string; }

interface LatestContext {
  markdown: string;           // never truncated
  platformId: string;
  platformLabel: string;
  conversationUrl: string;
  conversationTitle: string;
  messageCount: number;
  capturedAt: string;
  truncated: boolean;         // true if the scroll-loader hit a safety cap
  truncatedReason?: string;
}
```

## Cook This Prompt — recipes

All local, no API calls. Stack any subset:

- **Structure as Role · Task · Constraints · Output** — wraps a raw prompt in a clear brief.
- **Step-by-step reasoning** — asks the AI to show its work.
- **Concrete examples** — requests worked examples.
- **Pin output format** — forces a specific structure (Markdown table, JSON, bullets…).
- **Set audience** — tunes tone/depth to a specific reader.
- **Cut fluff** — anti-verbose directive.
- **Self-critique pass** — DRAFT → CRITIQUE → FINAL.
- **Prepend background context** — grounds the AI in project background you paste in.

## Using Generate / Upload Context

```
1. On ChatGPT (or Claude/Gemini/DeepSeek), click Pikachu.
     -> Detect platform -> scroll to load full history -> extract every
        message -> format as Markdown -> save as "latest context"
     -> Thunderbolt animation plays, then a result summary appears
        ("Captured 42 messages from ChatGPT.")

2. Switch tabs to Claude (or any other supported LLM).

3. Click the + button next to Pikachu -> Upload Context.
     -> Detect platform -> locate the chat input -> insert the latest
        context (chunked automatically if very large) -> verify it landed
     -> No Thunderbolt animation for this step.
```

If no context has been generated yet, Upload Context reports
*"No generated context is available yet. Generate a context first."*
rather than doing nothing silently. If a conversation is so long the
extractor can't confirm it reached the very start, Generate Context still
saves what it found but marks it "possibly incomplete" with a reason.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save small settings (theme, hotkey, insert mode). Capsules live in IndexedDB. |
| `scripting` | Content-script injection fallback when a supported site loads before install. |
| `activeTab` | The picker only touches the tab you're actively on. |
| `contextMenus` | The right-click *Save selection as Capsule* item. |
| Host permissions (chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, chat.deepseek.com, mail.google.com) | Attach the launcher on those AI sites. No `<all_urls>`. |

## License

[MIT](LICENSE).
