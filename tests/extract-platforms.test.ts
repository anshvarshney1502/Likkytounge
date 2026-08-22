import { describe, it, expect } from "vitest";
import { PLATFORM_ADAPTERS } from "../src/context/extract/platforms";

function findAdapter(id: string) {
  const a = PLATFORM_ADAPTERS.find((p) => p.id === id);
  if (!a) throw new Error(`no adapter ${id}`);
  return a;
}

function setDoc(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe("Claude extraction — known selector present", () => {
  it("captures both user and assistant turns when .font-claude-message matches", () => {
    setDoc(`
      <div id="scroller" style="overflow-y:auto;height:100px;">
        <div data-testid="user-message"><p>How do I sort a list?</p></div>
        <div class="font-claude-message"><div class="prose"><p>Use sorted() or .sort().</p></div></div>
        <div data-testid="user-message"><p>Show an example.</p></div>
        <div class="font-claude-message"><div class="prose"><p>sorted([3,1,2]) returns [1,2,3].</p></div></div>
      </div>`);
    const claude = findAdapter("claude");
    const messages = claude.extractMessages(document);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(messages[1].text).toContain("sorted()");
    expect(messages[3].text).toContain("[1,2,3]");
  });
});

describe("Claude extraction — assistant class renamed (the reported bug)", () => {
  it("still captures assistant replies via structural fallback when the known class is absent", () => {
    // Simulates Claude shipping a UI update that renames the assistant
    // wrapper class to something extraction has never seen before. Only the
    // user-message selector (which is known to be reliable) still matches.
    setDoc(`
      <div id="scroller" style="overflow-y:auto;height:100px;">
        <div data-testid="user-message"><p>How do I sort a list?</p></div>
        <div class="totally-renamed-wrapper-xyz"><div><p>Use sorted() or .sort().</p></div></div>
        <div data-testid="user-message"><p>Show an example.</p></div>
        <div class="totally-renamed-wrapper-xyz"><div><p>sorted([3,1,2]) returns [1,2,3].</p></div></div>
      </div>`);
    const claude = findAdapter("claude");
    const messages = claude.extractMessages(document);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(messages.some((m) => m.text.includes("sorted()"))).toBe(true);
    expect(messages.some((m) => m.text.includes("[1,2,3]"))).toBe(true);
  });

  it("never returns only user messages when assistant replies are present in the DOM", () => {
    setDoc(`
      <div id="scroller" style="overflow-y:auto;height:100px;">
        <div data-testid="user-message"><p>Question one</p></div>
        <div class="unknown-future-class"><p>Answer one, fairly long so it clears the char threshold.</p></div>
        <div data-testid="user-message"><p>Question two</p></div>
        <div class="unknown-future-class"><p>Answer two, also fairly long so it clears the threshold.</p></div>
      </div>`);
    const claude = findAdapter("claude");
    const messages = claude.extractMessages(document);
    const roles = messages.map((m) => m.role);
    expect(roles).toContain("assistant");
    expect(roles.filter((r) => r === "assistant").length).toBe(
      roles.filter((r) => r === "user").length,
    );
  });
});

describe("Gemini extraction — tag renamed", () => {
  it("falls back structurally when model-response is replaced by an unknown wrapper", () => {
    setDoc(`
      <div id="scroller" style="overflow-y:auto;height:100px;">
        <user-query><div class="query-text">What is precision?</div></user-query>
        <div class="some-new-response-wrapper"><p>Precision measures relevance of selected items.</p></div>
      </div>`);
    const gemini = findAdapter("gemini");
    const messages = gemini.extractMessages(document);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[1].text).toContain("Precision measures");
  });
});

describe("ChatGPT extraction — unaffected (role attribute is symmetric)", () => {
  it("still captures both roles via data-message-author-role", () => {
    setDoc(`
      <div>
        <div data-message-author-role="user"><div class="whitespace-pre-wrap">Hi</div></div>
        <div data-message-author-role="assistant"><div class="markdown"><p>Hello there.</p></div></div>
      </div>`);
    const chatgpt = findAdapter("chatgpt");
    const messages = chatgpt.extractMessages(document);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });
});
