# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
semantic versioning once it reaches 1.0.

## [Unreleased]

### Planned
- Swap the placeholder inline-SVG Pikachu for the real provided artwork (`public/pikachu.png`) — one-line change once the asset is available.
- Additional site adapters for Generate/Upload Context (Copilot, Grok, Qwen).
- Per-context version history (currently only the single "latest" pointer is tracked; every generation is kept, but not edited-in-place history of the same context).
- Real text extraction from generated file attachments (PDF/PPT/DOCX) — currently out of scope to keep the extension dependency-free; only filenames/links and any artifact-panel text already visible in the page are captured.

## [0.5.4] — 2026-08-23

### Fixed — Upload Context froze the page *and* dumped raw markdown into the chat box
A user screenshot showed the actual failure precisely: ChatGPT **had**
accepted the pasted context and rendered it as an attachment card
("# Pikachu Context Ca.."), while the raw markdown — `<!-- lk-turn:user -->`
markers and all — was *also* being typed into the message box, taking 36
seconds and ending in "Partially transferred".

The cause was 0.5.3's success check. It confirmed a paste by measuring
whether the composer's **text** grew. When a site converts a large paste
into a *file attachment* the text box does not grow at all, so the check
reported failure and the code fell through to the slow chunked
`insertText` path — producing both the freeze and the wall of markdown.

Upload Context now attaches the context as a real `.md` file and never
types into the message box:
- Three delivery strategies, tried in order: the site's own
  `input[type="file"]`, a synthetic `paste` carrying the File, and a
  simulated drag-and-drop. All are instantaneous from our side — we hand
  the browser a File and the site's uploader takes over, so our code cannot
  block the page regardless of context size.
- The chunked-typing fallback is gone from this path entirely. If every
  attachment strategy fails, it now says so and points at Copy Context /
  the Library rather than degrading into a page-freezing type-out.

### Fixed — attachment detection was unsound
The first attempt at detecting success matched the file's content preview
or filename against page text. That is unusable here: the filename is
derived from the conversation title, which the page *already* displays in
its header and sidebar, so it would report success before anything was
attached. Detection now uses two content-agnostic signals — a file input
actually holding a file, and a `MutationObserver` scoped to the composer's
own `<form>`. Nodes added inside the editable itself are explicitly not
counted, since text landing in the message box is the outcome being
avoided.

### Added — live timer
The transfer step now shows elapsed seconds ("Attach context file… 12s") and
the success message reports how long it took, so a slow upload reads as
progress rather than a stalled UI. The attachment wait runs up to 60s.

### Notes
- 8 new tests cover the attach path, including a regression test built
  around the exact reported failure (a site that shows a truncated content
  preview instead of the filename) and an explicit assertion that the
  context is never written into the composer's text box.
- Test setup gained `DataTransfer.items.add`/`.files`, `DragEvent`, and a
  permissive `HTMLInputElement.files` setter. jsdom implements none of
  these — and its own `files` setter rejects anything that is not a real
  `FileList`, which jsdom offers no way to construct — so without them the
  attachment path cannot be exercised under test at all.

## [0.5.3] — 2026-08-23

### Fixed — Upload Context freezing the page (real root cause this time)
0.5.2 misdiagnosed this. That release *raised* the per-insert chunk size to
60,000 characters on the theory that fewer, larger operations would be
faster — which made the freeze worse, because the cost was never the number
of operations, it was the size of each one.

Every supported site backs its chat box with a rich-text editor
(ProseMirror / Lexical / Slate). `document.execCommand('insertText', …)`
goes through that editor's **typing** path, which does roughly
per-character work and blocks the main thread synchronously. Handing it a
60 KB string in a single call is what locked the tab for 7–10 seconds and
tripped Chrome's "page unresponsive" dialog — and because the main thread
was blocked, the extension's own progress panel could not even repaint,
which is why it appeared frozen on an early step.

The fix routes insertion through the editor's **bulk** path instead:
- A synthetic `paste` event carrying a `DataTransfer` payload. Rich editors
  implement paste specifically to ingest a whole clipboard blob at once, so
  the entire context now transfers in **one** operation with **zero**
  blocking `insertText` calls. Verified by test: 120,000 characters → 1
  operation, 0 `insertText` calls.
- `<textarea>`/`<input>` keep using the native value setter (already O(n)).
- Only if an editor ignores the synthetic paste does it fall back to
  `insertText` — and then in **4,000**-character chunks (down from 60,000)
  with a yield between every chunk.
- A wall-clock budget aborts a pathologically slow editor into an honest
  partial result rather than an indefinitely hung page.

### Changed — Pikachu artwork and a real 3D Thunderbolt
- Replaced the placeholder inline SVG with the supplied 3D render. The
  source art had its "transparency" checkerboard **painted into the pixels**
  (its alpha channel was fully opaque), so a new dependency-free
  `scripts/make-pikachu.mjs` decodes the PNG with `node:zlib`, flood-fills
  the checkerboard away *inward from the border* (which preserves the white
  eye highlights, since those are not edge-connected), removes the
  full-width ledge bar, crops to the alpha bounding box, and downscales in
  premultiplied alpha. No image dependency added.
- The launcher now presents Pikachu **peeking** out of the corner — matching
  what the art actually depicts — instead of squeezing a wide image into a
  circle, and is substantially larger (132×82 vs. a 56 px circle).
- The Thunderbolt is now genuinely 3D: a `perspective` stage renders an
  expanding shockwave ring in Z, a core flash, and seven bolts that travel
  outward *and* toward the viewer via `translate3d`, while Pikachu lunges
  with `rotateX`/`rotateY`. Retriggering is handled correctly (classes are
  cleared and re-applied across a frame) so repeated generates always
  replay. Still Generate Context only — never Upload.

### Added — Share reachable from the page
Share/Copy previously existed only inside the full Context Library, so
there was no way to share from the page you were actually on. The on-page
menu now carries **Copy Context**, **Share Context**, and **Open Library**
alongside Generate/Upload. Share uses the Web Share API (sharing a real
`.md` file where the platform supports files, otherwise the text) and, when
the browser has no share support, says so plainly and copies the context
instead rather than failing silently.

### Notes
- 6 new tests pin the performance fix itself — including asserting that a
  large payload produces exactly one operation and no blocking
  `insertText` calls, and that the fallback path never exceeds 4,000
  characters per synchronous call or drops characters.
- jsdom implements neither `DataTransfer` nor `ClipboardEvent`, so minimal
  stand-ins were added to the test setup; without them the paste path
  cannot be exercised at all under test.

## [0.5.2] — 2026-08-23

### Fixed — Upload Context freezing the tab for several seconds
`upload.ts` inserted every chunk of a large context into the destination
input in a tight synchronous loop with no yield to the browser between
calls. Each `execCommand('insertText', …)` into a React-controlled editor
(ChatGPT/Claude/Gemini/DeepSeek all use one) is itself expensive — it drives
the framework's synchronous input/state-sync cycle — and stacking several of
those back-to-back with nothing in between is what froze the tab for 7–10
seconds and sometimes triggered Chrome's "page unresponsive" prompt.
- Raised the per-chunk size (20,000 → 60,000 chars) so most real
  conversations now transfer in a single call instead of several.
- When chunking is still needed for very large contexts, the loop now
  `await`s a double `requestAnimationFrame` between chunks so the browser
  gets to paint/process before the next heavy insert — the page stays
  responsive instead of freezing through the whole transfer.
- Progress now reports "(2/4)" etc. per chunk instead of a single static
  "Transferring…" label, so the extension's own panel doesn't look stalled
  either.

### Changed — interaction model
Per explicit request: **clicking Pikachu no longer auto-runs Generate
Context.** Both Pikachu and the `+` button now open the same
Generate/Upload menu — actions only ever fire from an explicit menu choice.

### Changed — Pikachu look and feel
- Enlarged the launcher (56px → 88px) and gave the placeholder artwork
  actual shading/gradients instead of flat circles (still a placeholder
  pending the real provided image — see Planned).
- Reworked the Thunderbolt animation: a radial screen-flash plus 7
  (was 5) bolts on a smoother, longer, `cubic-bezier` easing with a subtle
  3D tilt (`rotate3d`) on the charging/burst states, only ever on Generate
  Context — Upload Context still never triggers it.

### Changed — conversation structure
Per explicit request that generated contexts "read like the actual chat":
- **Markdown** (`context/markdown.ts`): the conversation's own title is now
  the document heading; turns are labeled `**You**` / `**{PlatformLabel}**`
  (e.g. `**ChatGPT**`, `**Claude**`) instead of generic `## User` / `##
  Assistant` headings, with a rule between turns — closer to a real chat
  transcript than a documentation-style block of headings.
- Turn boundaries are marked with an invisible `<!-- lk-turn:role -->`
  comment immediately before each label, so the app's own parser
  (`export/markdown-render.ts`, used by the Context Viewer and HTML export)
  can split turns unambiguously — a bold-label-alone heuristic would
  misfire if a message legitimately contained a standalone bolded line
  like "**Note:**". Covered by a regression test for exactly that case.
- **Plain text export** (`export/to-plaintext.ts`) rewritten to use the
  same markers: a divider + `SPEAKER` line per turn instead of a generic
  strip-all-markdown pass, so `.txt` reads as a labeled chat log too.
- HTML export inherits the fix automatically (it's built from the same
  parser).

### Added
- **Share and Copy in the popup**, not just the full Context Viewer — the
  "latest context" card now has both, backed by a new small `app/share.ts`
  module so the popup doesn't have to bundle the Export menu's heavier
  zip/archive dependencies just to get Copy/Share.
- 10 new tests: chunk-splitting-adjacent upload behavior, the standalone-
  bold-line ambiguity case, paragraph-break preservation across the new
  parser, and the plain-text transcript format.

Generate/Upload logic, the Pikachu launcher, and the Thunderbolt animation
were modified in this release at the user's explicit request (previously
treated as protected during the UI redesign in 0.5.0) — `insert.ts`,
`content/index.ts`, and `context/extract/` were not touched.

## [0.5.1] — 2026-08-23

### Fixed
- **Assistant replies missing from Generate Context on Claude (and, latently, any platform).** The Claude adapter's assistant-message selector was a single guessed CSS class with no fallback — when it didn't match, user messages (found via a separate, reliable selector) kept working while every assistant reply silently vanished, producing a context with only prompts and no responses. Fixed with a two-part change:
  - Broadened the candidate selector list for Claude's assistant messages.
  - Added a new **structural fallback** (`src/context/extract/structural-fallback.ts`): using only the *reliable* user-message anchors, it finds the DOM depth where conversation turns repeat as siblings via a lowest-common-ancestor + breadth-first search, and classifies each sibling block as user (contains an anchor) or assistant (everything else with real text) — independent of any specific class name. Wired into Claude, Gemini, and DeepSeek's adapters, all of which had the same single-selector fragility.
  - Covered by 5 new tests, including one that reproduces the exact reported failure (assistant wrapper class renamed to something never seen before) and asserts replies are still captured.
- **Export/More dropdown menus silently stopped closing on outside-click after the first interaction.** The click-outside handler was registered with `{once: true}` on every `renderViewer()` call, so it self-removed after the first bubbling click and was never replaced until the viewer re-rendered — meaning after one menu interaction, clicking away no longer closed the Export or More menu for the rest of that session. Replaced with a single persistent handler registered once at app boot.
- **Sidebar's `⋯` context menu never closed on outside-click at all** (no handler existed for that case previously) — now covered by the same persistent handler above.
- Fixed a dead code path in the background service worker that still opened the deleted `library.html` (from the v0.3 pivot) instead of `app.html` — unreachable today (nothing currently sends that message), but a landmine for future callers.
- Best-effort capture of AI-generated files/artifacts that render outside the normal message flow (e.g. a side panel): filename/title and any visible text are appended to the captured context. This does not fetch binary file contents (PDF/DOCX/etc.) — see Planned.

### Changed — visual simplification
Per direct feedback that the interface read as generic "AI-generated" UI, stripped the decorative flourishes and tightened the visual language:
- Removed the popup's decorative radial-gradient blob and the CTA button's hover-slide arrow animation.
- Reduced shadow blur/spread and border-radius scale throughout (was glossier/rounder than intended).
- Removed emoji from the sidebar's `⋯` item menu, the viewer toolbar (Copy/Share/Export are now plain text), empty states, and the About page's feature grid and Connect links — icons only where they carry real meaning (the latest-context dot, the warning triangle).
- About page: removed the redundant "LIKKY TOUNGE" eyebrow sitting directly above an "Likky Tounge" heading, and the marketing-style pull quote.

## [0.5.0] — 2026-08-23

### Changed — premium UI & Context Library redesign
Full redesign of every surface except the Pikachu launcher, Generate/Upload Context flow, and Thunderbolt animation, which are **unchanged** (verified via `git diff` against the previous release — zero diff on `src/content/overlay.ts`, `insert.ts`, `pikachu-icon.ts`, `thunderbolt-icon.ts`, `overlay.css`, and all of `src/context/{generate,upload}.ts` + `extract/`).

- **New visual language:** Wine Red (`#7F021F`) + Light Sand (`#F6EAD0`) editorial design system (`public/styles.css`) — serif display type, generous whitespace, restrained borders/shadows, light and dark themes, adjustable density and reduced-motion.
- **New popup:** replaces the old Quick Create / Save Capsule interface entirely. First screen is a single headline ("Your conversations, remembered.") and one primary action ("Check your previous context"), plus a live preview of the latest generated context.
- **New Context Library** (`app.html`, a single-page app with hash routing): persistent sidebar of every successfully generated context, grouped by Today/Yesterday/Earlier, with the latest context clearly marked (dot + "Latest" badge) — Upload Context always uses this one, confirmed by dedicated tests.
- **Context Viewer:** conversations render as a formatted document (headings, lists, tables, code blocks, blockquotes, links) via a new dependency-free Markdown renderer — never raw Markdown syntax. User/Assistant turns are visually distinct. Inline title rename. Toolbar: Copy, Share (native Web Share API with clipboard fallback), Export, and a delete action.
- **Export system:** Markdown (.md), Plain Text (.txt), HTML (.html), and ZIP (bundles all three plus metadata.json) — rebuilt `src/export/` module (zip writer, Markdown-to-HTML renderer, Markdown-to-plaintext) since the prior export code was removed in the v0.3 pivot.
- **Search:** instant metadata search (title/platform/date) across the whole library; falls back to a body-text scan for libraries under 300 contexts so very large libraries stay fast.
- **Settings:** rebuilt as a dedicated in-app view — Pikachu launcher, Context (titles, insert behavior), Export defaults, Appearance (theme/density/reduced motion), Privacy (plain-language storage explanation), and Storage (usage, clear-old, clear-all with confirmation).
- **About:** dedicated brand page — features grid, pull quote, and Connect links (GitHub project + author only — no invented social links).
- **Responsive layout:** full sidebar above 860px, a trimmed 200px rail with icon-only actions between 640–860px, and an off-canvas drawer with backdrop below 640px. No horizontal overflow at any width.
- **Data model:** the single-slot "latest context" store was extended into a full library — every generated context is now persisted (`meta`/`bodies`/`kv` IndexedDB stores) instead of only the most recent one being kept. Deleting the current latest context safely falls back to the next-newest survivor; deleting an older context never changes what Upload Context uses. Covered by 10 new store tests.
- **Removed:** the Capsules quick-create popup UI, the old capsule-manager Library page, and the Cook This Prompt page/navigation (per explicit redesign scope — "no unnecessary features"). The underlying Capsule IndexedDB data from earlier versions is not deleted automatically; Settings → Storage surfaces a count and a "Delete all local data" action that clears it alongside the context library.
- +19 new tests (Markdown rendering, plaintext conversion, context-store latest/delete/rename semantics); 39/39 total tests pass.

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
