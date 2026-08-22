# Privacy Policy

LocalChatVault is built to keep your AI conversations **entirely on your own device**.

## Summary

- We do **not** collect, transmit, sell, or share any of your data.
- There is **no server, no account, no cloud, no analytics, no telemetry**.
- All conversation data, attachments, settings, and indexes are stored locally in your browser.

## What is stored locally

| Data | Where | Purpose |
| --- | --- | --- |
| Conversations & messages | IndexedDB (this browser) | The saved chats you can view/export |
| Attachments (images/files) | IndexedDB (this browser) | Local copies included in exports |
| Settings | `chrome.storage.local` | Small preferences (theme, toggles) |
| Library/search indexes | Derived locally | Fast search & filtering |

You can delete everything at any time from **Settings → Clear all local data**, or per-conversation from the **Library**.

## What is never transmitted

The extension never sends any of the following to any external service:
conversation text, prompts, AI responses, uploaded/downloaded files, attachments,
metadata, URLs, or settings. There are no third-party SDKs, analytics, or error-reporting
services bundled.

## Honest network caveats

We avoid unrealistic "zero network activity" claims:

1. **The AI website itself.** You save conversations while visiting a site like ChatGPT or Claude. That site's own network requests are part of your normal browsing and are outside this extension's control.
2. **Attachment capture.** When you enable "Save attachments", the extension fetches attachment URLs **from the site you are already on** to copy the bytes into your local archive. These fetches go to that site only, never to us or any third party, and the bytes are stored locally. If a fetch is blocked, the file is recorded as unavailable — we never bypass authentication, CORS, or other site security.
3. **Chrome platform.** The browser may perform its own background activity (updates, sync of your own Chrome settings if you enabled it) unrelated to this extension.

## Permissions

See the README "Permissions" section for each permission and its justification. We use `activeTab` instead of `<all_urls>` to minimize access, and request host permissions only for the supported AI domains.

## Changes

Any change to this policy will be reflected in this file and in [CHANGELOG.md](CHANGELOG.md).
