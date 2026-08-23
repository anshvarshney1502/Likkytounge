import { describe, it, expect, afterEach, vi } from "vitest";
import { attachContextAsFile, buildContextFile } from "../src/content/attach";

afterEach(() => {
  document.body.innerHTML = "";
});

/** A site that exposes a file input and renders a chip once it gets a file. */
function siteWithFileInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "file";
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";
    chip.textContent = input.files?.[0]?.name ?? "";
    document.body.appendChild(chip);
  });
  return input;
}

/**
 * A composer that converts a pasted file into an attachment chip showing a
 * preview of the file's first line — this is exactly what ChatGPT does, and
 * what the previous implementation failed to recognise as success.
 */
function composerThatPreviewsContent(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("contenteditable", "true");
  document.body.appendChild(el);
  el.addEventListener("paste", (e) => {
    const dt = (e as ClipboardEvent).clipboardData;
    const file = dt?.files?.[0];
    if (!file) return;
    const chip = document.createElement("div");
    chip.className = "pasted-card";
    // Deliberately shows content, NOT the filename.
    chip.textContent = "# Pikachu Context Ca..";
    document.body.appendChild(chip);
    e.preventDefault();
  });
  return el;
}

const MD = "# Pikachu Context Capture & LLM Chat Export Feature\n\nsome body text\n";

describe("buildContextFile", () => {
  it("produces a .md File named after the conversation", () => {
    const f = buildContextFile(MD, "My Chat: Notes/Draft");
    expect(f.name.endsWith(".md")).toBe(true);
    expect(f.type).toBe("text/markdown");
    expect(f.name).not.toMatch(/[\\/:*?"<>|]/);
  });

  it("falls back to a default name when the title is empty", () => {
    expect(buildContextFile(MD, "").name).toBe("conversation-context.md");
  });
});

/**
 * A site (modelled on the reported Claude bug) with BOTH a working file
 * input and a composer that also turns a paste into a real attachment.
 * The file input is slow — it renders its chip only after a delay, like a
 * server round-trip — while paste would resolve almost immediately if it
 * were ever tried. If both strategies are attempted, two separate chips
 * land; the fix is to commit to whichever strategy dispatched first and
 * never fall through to the second once that has happened.
 */
function siteWithSlowFileInputAndFastPaste(): { input: HTMLInputElement; composer: HTMLElement } {
  const input = document.createElement("input");
  input.type = "file";
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    const name = input.files?.[0]?.name ?? "";
    // Real sites typically read the file into their own state and clear
    // the input immediately, so `filesPresent()` can't be relied on for a
    // slow upload — confirmation has to come from the chip itself.
    input.files = null;
    setTimeout(() => {
      const chip = document.createElement("div");
      chip.className = "attachment-chip";
      chip.textContent = name;
      document.body.appendChild(chip);
    }, 900);
  });

  const composer = document.createElement("div");
  composer.setAttribute("contenteditable", "true");
  document.body.appendChild(composer);
  composer.addEventListener("paste", (e) => {
    const dt = (e as ClipboardEvent).clipboardData;
    if (!dt?.files?.[0]) return;
    const chip = document.createElement("div");
    chip.className = "pasted-card";
    document.body.appendChild(chip);
    e.preventDefault();
  });

  return { input, composer };
}

describe("attachContextAsFile", () => {
  it("commits to the first strategy that dispatches instead of racing a second one (Claude duplicate-attachment regression)", async () => {
    const { composer } = siteWithSlowFileInputAndFastPaste();
    const res = await attachContextAsFile(MD, "Dup test", composer, { timeoutMs: 4000 });

    expect(res.ok).toBe(true);
    expect(res.strategy).toBe("file-input");
    expect(document.querySelectorAll(".attachment-chip").length).toBe(1);
    expect(document.querySelectorAll(".pasted-card").length).toBe(0);
  });

  it("delivers the context through the site's file input", async () => {
    const input = siteWithFileInput();
    const res = await attachContextAsFile(MD, "Test chat", null, { timeoutMs: 4000 });

    expect(res.ok).toBe(true);
    expect(res.strategy).toBe("file-input");
    expect(input.files?.length).toBe(1);
    expect(input.files?.[0].name).toBe("Test chat.md");
  });

  it("recognises success when the site shows a CONTENT preview instead of the filename", async () => {
    // The exact regression from the bug report: ChatGPT accepted the file and
    // rendered "# Pikachu Context Ca..", but the old length-based check saw
    // the text box unchanged and wrongly fell through to typing the context.
    const composer = composerThatPreviewsContent();
    const res = await attachContextAsFile(MD, "Pikachu Context Capture", composer, { timeoutMs: 4000 });

    expect(res.ok).toBe(true);
    expect(res.strategy).toBe("paste");
    expect(document.querySelector(".pasted-card")).not.toBeNull();
  });

  it("never writes the context into the composer's text box", async () => {
    const composer = composerThatPreviewsContent();
    await attachContextAsFile(MD, "Pikachu Context Capture", composer, { timeoutMs: 4000 });

    expect(composer.textContent).toBe("");
    expect(document.body.textContent).not.toContain("some body text");
  });

  it("reports elapsed time so the UI can show a live timer", async () => {
    siteWithFileInput();
    const onTick = vi.fn();
    const res = await attachContextAsFile(MD, "Timer test", null, { timeoutMs: 4000, onTick });

    expect(onTick).toHaveBeenCalled();
    expect(res.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("fails honestly when the page offers nowhere to attach", async () => {
    const res = await attachContextAsFile(MD, "Nowhere", null, { timeoutMs: 1000 });

    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/no file input|composer/i);
  });

  it("reports a clear timeout when the site never acknowledges the file", async () => {
    // A composer that silently swallows the paste and shows nothing.
    const dead = document.createElement("div");
    dead.setAttribute("contenteditable", "true");
    document.body.appendChild(dead);

    const res = await attachContextAsFile(MD, "Silent", dead, { timeoutMs: 1200 });

    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/did not confirm/i);
  });
});
