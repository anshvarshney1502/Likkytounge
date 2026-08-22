# Likky Tounge

**Capsules of context, ready in any AI chat.** A free, open-source, privacy-first Chrome extension in the spirit of Capsule Hub — save reusable context blocks ("Capsules"), organize them into folders, and drop them into ChatGPT / Claude / Gemini / DeepSeek with one click.

Repository: <https://github.com/anshvarshney1502/Likkytounge>

- No account. No cloud sync. No analytics. No API keys.
- Everything lives in this browser's IndexedDB and never leaves it.
- MIT licensed.

## What it does

- **Capsules** — reusable context blocks (goals, project background, style guides, personas). Create once, reuse forever.
- **Folders** — group Capsules however you like (Engineering, Marketing, Personal…).
- **One-click inject** — on ChatGPT, Claude, Gemini, and DeepSeek, hit `Alt+K` (customizable), pick a Capsule, and its text lands in the chat input.
- **Drag & drop** — grab a Capsule tile from the picker and drop it onto any chat input.
- **Right-click to save** — highlight any text on any page → *Save selection as Capsule* (works on Gmail too).
- **Cook This Prompt** — a local, rules-based prompt enhancer. Structures your prompt as *Role · Task · Constraints · Output*, adds step-by-step reasoning, pins output format, sets audience, and more — **no LLM call, no API keys, no network**.
- **Search + filter** — full-text search across every Capsule, filter by folder, sort by recent/used/title.
- **Portable JSON backup** — export the whole vault, import it on another machine.

## Supported sites (for the on-page picker)

| Site | Purpose |
| --- | --- |
| ChatGPT (`chatgpt.com`, `chat.openai.com`) | Injects Capsules into the chat input |
| Claude (`claude.ai`) | Injects Capsules into the chat input |
| Gemini (`gemini.google.com`) | Injects Capsules into the chat input |
| DeepSeek (`chat.deepseek.com`) | Injects Capsules into the chat input |
| Gmail (`mail.google.com`) | Right-click text → *Save selection as Capsule* |

The right-click *Save selection as Capsule* works on **any page** — Gmail is highlighted because it's Capsule Hub's marquee use case.

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
  content/          floating launcher + capsule picker overlay + input injection
    overlay.ts      shadow-DOM UI (picker, drag/drop, hotkey)
    insert.ts       finds the chat input and inserts text (textarea + contenteditable)
  background/       MV3 service worker: routes messages, runs the context menu
  storage/          IndexedDB (capsules + folders) with CRUD + import merge
  cook/             "Cook This Prompt" local rewriter (8 stackable recipes)
  popup/            quick create + recent list
  library/          full-page manager: folders / capsules / editor
  settings/         settings + JSON import/export + about
  shared/           types, brand, theme, settings-store, download helper
  utils/            id, log, bytes
public/             HTML pages, styles, icons, manifest.json
```

Data model (see [src/shared/types.ts](src/shared/types.ts)):

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
