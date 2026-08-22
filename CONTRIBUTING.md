# Contributing to LocalChatVault

Thanks for your interest! LocalChatVault is a lightweight, privacy-first, dependency-minimal project. Contributions that keep it that way are very welcome.

## Ground rules

- **Privacy is non-negotiable.** No telemetry, analytics, remote endpoints, accounts, or cloud sync. No code that transmits conversation data anywhere.
- **Prefer native browser APIs** over adding dependencies. Before adding a dependency, ask: "Can this be done with a native Web API?" (Runtime dependencies are currently **zero**.)
- **No security bypasses.** Never attempt to defeat CSP, auth, CORS, DRM, or site protections. Report limitations gracefully.
- Keep the bundle small and the UI fast.

## Getting started

```bash
npm install
npm run watch        # build to dist/ on change
npm run check        # typecheck + tests + prod build
```

Load `dist/` as an unpacked extension at `chrome://extensions` (Developer mode → Load unpacked).

## Adding a platform adapter

See [docs/ADAPTERS.md](docs/ADAPTERS.md). Every adapter must:

- Live in its own `src/adapters/<name>/` folder (`selectors.ts`, `parser.ts`, `adapter.ts`).
- Normalize into the shared `ChatMessage` / `ContentBlock` model (do not invent new shapes).
- Prefer semantic selectors (roles, ARIA, data-attributes) over brittle CSS classes, with fallbacks.
- Ship a fixture in `tests/fixtures/<name>/` and a test in `tests/adapters/`.
- Add host permissions + a content-script match in `public/manifest.json` and document the "why".

## Pull requests

- Run `npm run check` and make sure it's green.
- Keep PRs focused. Describe what changed and why.
- Update `CHANGELOG.md` under "Unreleased".
- Don't include real conversation data in fixtures — use synthetic examples.

## Code style

- TypeScript, `strict` mode. No `any` unless truly unavoidable (and commented).
- Small, composable functions. Comment the non-obvious "why", not the obvious "what".
