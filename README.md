# LocalChatVault

**Save your AI chat conversations locally with one click.** Privacy-first, open-source, no account, no cloud, no telemetry.

Open a supported AI chat → click **Save Current Chat** → the whole conversation is captured and stored in your browser's local database. Everything stays on your machine.

---

## What it does

- **One-click save** of the current AI conversation from the toolbar popup.
- **Modular adapters** for ChatGPT, Claude, and Gemini, plus a **generic fallback** for other chat sites.
- Captures **messages, roles, ordering, code blocks (with language), links, images, and lists**, normalized into a single platform-independent schema.
- Best-effort **attachment capture** (images/files) into a local archive, with honest metadata when a file can't be accessed.
- **Local library** to search, filter, sort, open, export, and delete saved chats.
- **Exports**: JSON, Markdown, HTML, and a complete **ZIP** archive — all generated locally.
- **Backup / restore** your whole vault as a portable ZIP (move between machines, no cloud).
- **IndexedDB** storage with a **versioned, migratable schema**.

## Privacy architecture

LocalChatVault is designed so your conversation data **never leaves your device**.

**Stored locally (in your browser only):**
- Saved conversations and their messages (IndexedDB)
- Captured attachments (IndexedDB, as Blobs)
- Settings (`chrome.storage.local`, small values only)
- Search/library indexes (derived locally)

**Sent to external services:** *nothing.* The extension contains:
- ❌ no analytics, no telemetry (no Google Analytics / PostHog / Mixpanel / Sentry)
- ❌ no remote database, no cloud sync, no accounts
- ❌ no AI/API calls, no third-party network requests
- ❌ **zero runtime dependencies** — the ZIP writer/reader use the browser's native `CompressionStream`/`DecompressionStream`

**Honest caveats** (we don't make unrealistic "zero network activity" claims):
- Reading a conversation happens on the AI website you're already visiting; that page's own network activity is outside our control.
- When "Save attachments" is enabled, the extension fetches attachment URLs **from the site you're on** to copy the bytes locally. It never uploads them anywhere. If a fetch is blocked (auth/CORS), the file is recorded as unavailable with a reason — we never bypass site security.
- Chrome itself may perform its own background activity unrelated to this extension.

See [PRIVACY.md](PRIVACY.md) for the full policy.

## Supported platforms

| Platform | Adapter | Status |
| --- | --- | --- |
| ChatGPT (`chatgpt.com`, `chat.openai.com`) | `chatgpt` | ✅ Tested |
| Claude (`claude.ai`) | `claude` | ✅ Tested |
| Gemini (`gemini.google.com`) | `gemini` | ✅ Tested |
| Other chat sites | `generic` | ⚠️ Best-effort |

The generic adapter uses semantic heuristics (role attributes, ARIA, class hints, DOM structure) to extract conversations from unknown sites. When it's used, the UI clearly shows **"Generic extraction — some content may not be available."**

> **Real-world limitation:** we do not promise this works with *every* LLM site. Supported platforms are those with tested adapters; unknown platforms get best-effort generic extraction. AI sites change their DOM frequently, so adapters may occasionally need maintenance. This is documented honestly by design.

Planned next: Copilot, Grok, DeepSeek, Qwen (see [CHANGELOG.md](CHANGELOG.md)).

## Installation (load unpacked)

1. Build the extension:
   ```bash
   npm install
   npm run build:prod
   ```
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select the generated **`dist/`** folder.
5. Pin the LocalChatVault icon, open a supported AI chat, and click **Save Current Chat**.

## Development

```bash
npm install          # install dev dependencies (no runtime deps)
npm run watch        # rebuild on change into dist/
npm run typecheck    # tsc --noEmit
npm run test         # vitest (unit tests + fixtures)
npm run build:prod   # minified production build
npm run check        # typecheck + test + build
```

Then load `dist/` as an unpacked extension (see above). Reload the extension from `chrome://extensions` after each rebuild.

## Architecture

```
src/
  adapters/        modular per-platform extractors (base/ + chatgpt/claude/gemini/generic)
  content/         content script: adapter selection, streaming stabilization, attachment capture
  background/      MV3 service worker: orchestrates save, owns IndexedDB writes, streams progress
  storage/         StorageProvider interface + IndexedDB impl + versioned migrations
  export/          json / markdown / html / zip(+unzip) / archive assembly
  popup/ library/ settings/   lightweight vanilla-TS UI pages
  shared/          types, message protocol, settings, theme
  utils/           DOM→ContentBlock normalizer, ids, bytes, logging
```

Data flow for a save:

```
popup ──(Port: START_SAVE)──▶ background
                               │  DETECT_PLATFORM ─▶ content script
                               │  EXTRACT_CONVERSATION ─▶ content script (adapter + capture)
                               │◀── normalized Conversation
                               ▼
                          IndexedDB (conversation + attachment blobs)
                               │
        library / settings ◀───┘  (read directly, same extension origin)
```

Every adapter implements the same contract:

```ts
interface ChatAdapter {
  getConversationMetadata(): AdapterMeta;
  getMessages(): ChatMessage[];
  getAttachments(): Attachment[];
  isStreaming(): boolean;
}
```

Everything is normalized into a platform-independent model (`ChatMessage` / `ContentBlock`) so exports and storage never depend on a specific site.

## Adding a new platform adapter

See [docs/ADAPTERS.md](docs/ADAPTERS.md) for the full guide. In short:

1. Create `src/adapters/<name>/{selectors.ts, parser.ts, adapter.ts}`.
2. Reuse `parseRoleMessages` (role-attribute sites) or `parseInterleavedMessages` (separate user/assistant selectors).
3. Export an `AdapterModule` with `matches(url)` and `create(doc, url)`.
4. Register it in `src/adapters/registry.ts`.
5. Add host permissions + a content-script match in `public/manifest.json`.
6. Add a fixture in `tests/fixtures/<name>/` and a test in `tests/adapters/`.

## Permissions (and why)

| Permission | Why |
| --- | --- |
| `storage` | Save small settings via `chrome.storage.local`. |
| `scripting` | Inject the content script on demand for generic sites / pages opened before install. |
| `activeTab` | Access the current tab **only when you click the extension** — this is how generic extraction works on arbitrary sites without requesting `<all_urls>`. |
| `host_permissions` (chatgpt.com, chat.openai.com, claude.ai, gemini.google.com) | Auto-inject the content script on supported sites and fetch same-site attachment bytes for local saving. |

We deliberately **avoid `<all_urls>`**. No unrelated permissions are requested.

## Storage format

Each conversation is stored as a record keyed by a stable `conversationId`. Exported archives use an open, future-proof layout:

```
<Conversation_Title>/
  metadata.json      # schemaVersion, platform, title, url, savedAt, messageCount, ...
  messages.json      # normalized messages + attachment metadata
  conversation.md    # readable Markdown
  conversation.html  # standalone readable HTML
  README.txt
  attachments/       # locally-captured files (when accessible)
```

`schemaVersion` is versioned; migrations live in `src/storage/migrations/`.

## Troubleshooting

- **"No supported conversation detected."** — You're not on a supported chat page, or the page had no messages. Open a conversation first.
- **"Generic extraction was used."** — The site has no dedicated adapter; results are best-effort.
- **"Some messages could not be extracted."** / **"Platform structure changed…"** — The site changed its DOM; the adapter may need an update. Please open an issue.
- **Response still generating** — If you save mid-stream, the extension waits briefly for it to settle, then saves; it will warn if the content may be incomplete.
- **Attachments not saved** — The site may not expose file bytes to the page, or blocks the fetch. Metadata is still recorded with a reason. We never bypass site security.
- **Nothing happens on a generic site** — Make sure you clicked the extension icon (that grants `activeTab`), then click **Save Current Chat**.

## License

[MIT](LICENSE).
