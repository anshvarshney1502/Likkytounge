import { describe, it, expect } from "vitest";
import { scrollToLoadAll } from "../src/context/extract/scroll-loader";

function fakeContainer(): Element {
  const obj: { scrollTop: number } = { scrollTop: 100 };
  return obj as unknown as Element;
}

describe("scrollToLoadAll", () => {
  it("stops once message count stabilizes near the top", async () => {
    let count = 2;
    let calls = 0;
    const container = fakeContainer();
    const result = await scrollToLoadAll(container, {
      countMessages: () => {
        calls++;
        if (calls <= 3) count += 5; // simulate history loading in on early scrolls
        return count;
      },
      settleMs: 1,
      stableRoundsRequired: 2,
      maxIterations: 100,
      maxTimeMs: 5000,
    });
    expect(result.truncated).toBe(false);
    expect(result.finalCount).toBe(count);
  });

  it("reports truncated when the iteration cap is hit", async () => {
    // Count keeps growing forever — simulates a page that never reaches the top
    // (or a broken scroll listener) so we must not claim completeness.
    let count = 0;
    const container = fakeContainer();
    const result = await scrollToLoadAll(container, {
      countMessages: () => ++count,
      settleMs: 1,
      maxIterations: 5,
      maxTimeMs: 5000,
    });
    expect(result.truncated).toBe(true);
    expect(result.reason).toBeTruthy();
  });

  it("reports truncated when the time cap is hit", async () => {
    const container = fakeContainer();
    const result = await scrollToLoadAll(container, {
      countMessages: () => 1,
      settleMs: 20,
      maxIterations: 100000,
      maxTimeMs: 30,
    });
    expect(result.truncated).toBe(true);
    expect(result.reason).toMatch(/\d+s/);
  });
});
