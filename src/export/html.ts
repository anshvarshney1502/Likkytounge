import type { Conversation, ContentBlock, Role } from "../shared/types";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ROLE_LABEL: Record<Role, string> = {
  user: "User",
  assistant: "Assistant",
  system: "System",
  unknown: "Message",
};

function blockToHtml(b: ContentBlock): string {
  switch (b.type) {
    case "text":
      return `<p>${esc(b.text).replace(/\n/g, "<br>")}</p>`;
    case "code":
      return `<pre><code class="lang-${esc(b.language ?? "")}">${esc(b.code)}</code></pre>`;
    case "image":
      return `<figure><img alt="${esc(b.alt ?? "")}" src="${esc(b.localPath ?? b.url ?? "")}"></figure>`;
    case "link":
      return `<p><a href="${esc(b.url)}">${esc(b.text ?? b.url)}</a></p>`;
  }
}

/** Standalone, self-contained, readable HTML document. No external assets. */
export function conversationToHtml(conv: Conversation): string {
  const m = conv.metadata;
  const body = conv.messages
    .map((msg) => {
      const attach =
        msg.attachments && msg.attachments.length
          ? `<div class="attachments"><strong>Attachments:</strong><ul>${msg.attachments
              .map(
                (a) =>
                  `<li>${esc(a.filename)} — ${
                    a.availableLocally
                      ? `<a href="${esc(a.localPath ?? "")}">local</a>`
                      : `not saved (${esc(a.reason ?? "unavailable")})`
                  }</li>`,
              )
              .join("")}</ul></div>`
          : "";
      return `<article class="msg ${msg.role}">
        <header>${ROLE_LABEL[msg.role]}${msg.timestamp ? ` · <time>${esc(msg.timestamp)}</time>` : ""}</header>
        <div class="content">${msg.content.map(blockToHtml).join("\n")}</div>
        ${attach}
      </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.conversationTitle)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.6 system-ui, sans-serif; max-width: 820px; margin: 0 auto; padding: 24px; }
  h1 { margin-bottom: 4px; }
  .meta { color: #666; font-size: 14px; margin-bottom: 24px; }
  .msg { border-radius: 12px; padding: 12px 16px; margin: 12px 0; }
  .msg.user { background: rgba(79,70,229,0.08); }
  .msg.assistant { background: rgba(0,0,0,0.04); }
  .msg header { font-weight: 600; margin-bottom: 6px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #4f46e5; }
  pre { background: #0d1117; color: #e6edf3; padding: 12px; border-radius: 8px; overflow: auto; }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; }
  img { max-width: 100%; border-radius: 8px; }
  .attachments { font-size: 14px; color: #555; margin-top: 8px; }
  .warn { background: #fff4e5; border: 1px solid #ffcf99; padding: 8px 12px; border-radius: 8px; }
</style>
</head>
<body>
  <h1>${esc(m.conversationTitle)}</h1>
  <div class="meta">
    ${esc(m.platform)} · Saved ${esc(new Date(m.savedAt).toISOString())} · ${m.messageCount} messages
    ${m.conversationUrl ? `· <a href="${esc(m.conversationUrl)}">source</a>` : ""}
  </div>
  ${m.generic ? `<p class="warn">⚠️ Generic extraction — some content may not be available.</p>` : ""}
  ${body}
</body>
</html>`;
}
