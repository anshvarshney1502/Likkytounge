import { describe, it, expect } from "vitest";
import { insertIntoInput, findChatInput } from "../src/content/insert";

describe("insertIntoInput", () => {
  it("appends to a textarea and fires an input event", () => {
    const ta = document.createElement("textarea");
    ta.value = "hello";
    document.body.appendChild(ta);
    let fired = false;
    ta.addEventListener("input", () => (fired = true));

    const ok = insertIntoInput(ta, "world", "append");
    expect(ok).toBe(true);
    expect(ta.value).toBe("hello\n\nworld");
    expect(fired).toBe(true);
    ta.remove();
  });

  it("replaces textarea contents in replace mode", () => {
    const ta = document.createElement("textarea");
    ta.value = "old";
    document.body.appendChild(ta);
    insertIntoInput(ta, "new", "replace");
    expect(ta.value).toBe("new");
    ta.remove();
  });

  it("prepends into a textarea", () => {
    const ta = document.createElement("textarea");
    ta.value = "tail";
    document.body.appendChild(ta);
    insertIntoInput(ta, "head", "prepend");
    expect(ta.value).toBe("head\n\ntail");
    ta.remove();
  });
});

describe("findChatInput", () => {
  it("returns null when no editable is present", () => {
    document.body.innerHTML = "<div>nothing here</div>";
    expect(findChatInput()).toBeNull();
  });

  it("finds a visible textarea", () => {
    document.body.innerHTML = `<textarea id="t"></textarea>`;
    const ta = document.getElementById("t") as HTMLTextAreaElement;
    // jsdom returns 0-size rects; monkey-patch to look "visible".
    ta.getBoundingClientRect = () => ({ width: 400, height: 60, bottom: 700, top: 640, left: 0, right: 400, x: 0, y: 640, toJSON() { return {}; } });
    const found = findChatInput();
    expect(found).toBe(ta);
  });
});
