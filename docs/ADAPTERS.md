# Writing a platform adapter

Adapters are the only place platform-specific knowledge lives. Everything else
(storage, export, UI) works on the normalized model, so a new adapter is all
that's needed to support a new site.

## The contract

```ts
interface ChatAdapter {
  readonly id: string;        // machine id, e.g. "copilot"
  readonly label: string;     // display name, e.g. "Copilot"
  readonly generic: boolean;  // true only for the fallback
  getConversationMetadata(): AdapterMeta;   // { title, platformConversationId }
  getMessages(): ChatMessage[];             // ordered, normalized
  getAttachments(): Attachment[];           // declared file attachments
  isStreaming(): boolean;                   // is a response generating right now?
}
```

An adapter is registered via an `AdapterModule`:

```ts
interface AdapterModule {
  id: string;
  label: string;
  generic: boolean;
  matches(url: string): boolean;
  create(doc: Document, url: string): ChatAdapter;
}
```

Adapters receive the `Document` and `url` explicitly (not globals) so they are
unit-testable against fixture HTML.

## Two reusable parsers

Most sites fall into one of two shapes:

### 1. Role-attribute sites (e.g. ChatGPT)

Each message element carries a role attribute. Use `parseRoleMessages`:

```ts
import { parseRoleMessages } from "../base/role-parser";

parseRoleMessages(doc, url, {
  platformId: "chatgpt",
  messageSelectors: ["[data-message-author-role]"],
  roleAttr: "data-message-author-role",
  idAttr: "data-message-id",
  contentSelectors: [".markdown", ".whitespace-pre-wrap"],
  attachmentLinkSelectors: ["a[download]"],
});
```

### 2. Interleaved sites (e.g. Claude, Gemini)

User and assistant turns use *different* selectors. Use
`parseInterleavedMessages`, which collects both, drops wrapper elements, and
orders everything by DOM position:

```ts
import { parseInterleavedMessages } from "../base/interleave-parser";

parseInterleavedMessages(doc, url, {
  platformId: "claude",
  userSelectors: ["[data-testid='user-message']"],
  assistantSelectors: [".font-claude-message"],
  contentSelectors: [".prose"],
});
```

Both funnel content through `elementToBlocks`, the DOM→`ContentBlock[]`
normalizer that extracts code (with language), images, links, headings, lists,
and prose while skipping UI chrome (buttons, `aria-hidden`, svg).

## Selector strategy

Put selectors in `selectors.ts` as **ordered arrays**, most-semantic first. The
parsers try each until one matches, so a single upstream DOM tweak doesn't break
extraction. Prefer, in order:

1. Semantic attributes (`data-message-author-role`, `data-testid`)
2. Accessibility info (`role`, `aria-label`)
3. Structural relationships
4. Known platform class names
5. Heuristic fallbacks

## Steps to add "Foo"

1. `src/adapters/foo/selectors.ts` — host list + selector arrays.
2. `src/adapters/foo/parser.ts` — `getFooMessages(doc, url)` and `getFooMeta(doc, url)`.
3. `src/adapters/foo/adapter.ts` — a `BaseAdapter` subclass + exported `fooModule: AdapterModule`.
4. Register in `src/adapters/registry.ts` (`PLATFORM_MODULES`).
5. Add host permission + content-script match in `public/manifest.json`.
6. `tests/fixtures/foo/basic.html` + a test in `tests/adapters/extraction.test.ts`.
7. `npm run check`.

## Streaming

Return `true` from `isStreaming()` when a response is generating (e.g. a "Stop"
button or a streaming marker is present). The content-script extractor uses this
to wait for the response to stabilize before saving, and warns the user if it
times out mid-generation.

## Failure, not silence

If no messages can be identified, return an empty array — the orchestrator turns
that into a structured error (`"Conversation messages could not be identified"`).
Never save an empty conversation.
