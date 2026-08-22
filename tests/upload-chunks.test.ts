import { describe, it, expect } from "vitest";

import { splitIntoChunks } from "../src/context/upload";

describe("splitIntoChunks", () => {
  it("returns the whole text as one chunk when under the limit", () => {
    const text = "short text";
    expect(splitIntoChunks(text, 100)).toEqual([text]);
  });

  it("never drops characters when splitting", () => {
    const text = "a".repeat(50_000);
    const chunks = splitIntoChunks(text, 12_000);
    expect(chunks.join("")).toBe(text);
  });

  it("prefers to break on a paragraph boundary", () => {
    const text = "para one\n\n" + "x".repeat(9990) + "\n\npara two";
    const chunks = splitIntoChunks(text, 10_000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].endsWith("\n\n") || !chunks[0].includes("para two")).toBe(true);
    expect(chunks.join("")).toBe(text);
  });
});
