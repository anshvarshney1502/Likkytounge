import type { SavedContext } from "../context/store";
import { splitConversationMarkdown } from "./markdown-render";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ROLE_LABEL: Record<string, string> = { user: "User", assistant: "Assistant", system: "System" };

/** Standalone, self-contained HTML document — no external assets, no network. */
export function contextToHtmlDocument(ctx: SavedContext): string {
  const sections = splitConversationMarkdown(ctx.markdown);
  const body = sections
    .filter((s) => s.role !== "meta")
    .map((s) => `<article class="msg ${s.role}"><header>${ROLE_LABEL[s.role] ?? "Message"}</header><div class="content">${s.html}</div></article>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ctx.title)}</title>
<style>
  :root { color-scheme: light dark; --wine:#7F021F; --sand:#F6EAD0; --cream:#FFFBF3; --ink:#2b0a10; }
  body { font: 16px/1.65 ui-serif, Georgia, "Times New Roman", serif; max-width: 760px; margin: 0 auto; padding: 48px 24px; background: var(--cream); color: var(--ink); }
  h1 { font-size: 30px; margin: 0 0 6px; letter-spacing: -0.01em; }
  .meta { font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; color: #8a6a6f; margin-bottom: 36px; }
  .msg { border-radius: 18px; padding: 20px 24px; margin: 18px 0; }
  .msg.user { background: rgba(127,2,31,0.06); }
  .msg.assistant { background: rgba(127,2,31,0.03); border: 1px solid rgba(127,2,31,0.08); }
  .msg header { font: 700 11px/1 ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; letter-spacing: .08em; color: var(--wine); margin-bottom: 10px; }
  .msg .content p { margin: 0 0 12px; }
  .msg .content p:last-child { margin-bottom: 0; }
  pre { background: #241016; color: #f6ead0; padding: 14px 16px; border-radius: 10px; overflow: auto; font-size: 13px; }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .content code:not(pre code) { background: rgba(127,2,31,0.08); padding: 1px 6px; border-radius: 5px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 14px; }
  th, td { border: 1px solid rgba(127,2,31,0.15); padding: 6px 10px; text-align: left; }
  blockquote { border-left: 3px solid var(--wine); margin: 12px 0; padding: 2px 16px; color: #6b4a4f; }
  a { color: var(--wine); }
  hr { border: none; border-top: 1px solid rgba(127,2,31,0.15); margin: 24px 0; }
  .warn { background: #fff4e5; border: 1px solid #ffcf99; padding: 10px 14px; border-radius: 10px; font: 14px ui-sans-serif, system-ui, sans-serif; margin-bottom: 24px; }
</style>
</head>
<body>
  <h1>${esc(ctx.title)}</h1>
  <div class="meta">${esc(ctx.platformLabel)} · Generated ${esc(new Date(ctx.capturedAt).toLocaleString())} · ${ctx.messageCount} messages</div>
  ${ctx.truncated ? `<div class="warn">⚠ This context may be incomplete: ${esc(ctx.truncatedReason ?? "")}</div>` : ""}
  ${body}
</body>
</html>`;
}
