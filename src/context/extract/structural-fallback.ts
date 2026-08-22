// Structural fallback extraction: used when a platform's known assistant-
// message selector fails to find (enough) matches — e.g. the site renamed a
// CSS class. Rather than guess another class name, this locates the level of
// the DOM tree where message "turns" repeat as siblings, using only the
// *reliably known* user-message selector as an anchor, then classifies each
// sibling turn block as "user" (contains an anchor) or "assistant"
// (everything else with real text). This works even if the assistant
// wrapper's class name is completely unknown, as long as user and assistant
// turns are siblings under a common ancestor — true for essentially every
// chat UI's DOM shape.
import type { ContextMessage } from "../types";
import { elementToText } from "./serialize";

function textLen(el: Element): number {
  return (el.textContent ?? "").trim().length;
}

/**
 * Lowest common ancestor of a set of elements — a much more reliable BFS
 * starting point than guessing at a "scrollable container" (which can't be
 * detected at all in environments without real layout, like tests, and
 * isn't guaranteed to be the element that directly wraps every turn even in
 * a real browser). Starting the search here means a single anchor still
 * yields a tight starting point (its own parent), not the whole document.
 */
export function lowestCommonAncestor(nodes: Element[]): Element {
  if (nodes.length === 0) return document.body;
  if (nodes.length === 1) return nodes[0].parentElement ?? nodes[0];
  let chain: Element[] = [];
  let n: Element | null = nodes[0];
  while (n) {
    chain.push(n);
    n = n.parentElement;
  }
  for (const candidate of chain) {
    if (nodes.every((x) => candidate.contains(x))) return candidate;
  }
  return document.body;
}

/**
 * Breadth-first search down from `container` for the shallowest level whose
 * children (a) contain exactly one block per user anchor and (b) have at
 * least that many total blocks (extra assistant-only blocks are fine).
 * Returns null if no such level is found within a reasonable depth.
 */
function findTurnLevel(container: Element, userAnchors: Element[]): Element[] | null {
  let level: Element[] = [container];
  for (let depth = 0; depth < 8; depth++) {
    const next: Element[] = [];
    for (const el of level) next.push(...Array.from(el.children));
    if (next.length === 0) return null;

    const withUser = next.filter((b) => userAnchors.some((u) => b.contains(u)));
    const uniqueUserCoverage = new Set(
      withUser.map((b) => userAnchors.findIndex((u) => b.contains(u))),
    );
    // Require exactly one block per anchor (no anchor split or duplicated
    // across blocks) — this is what actually distinguishes "the level where
    // turns repeat as siblings" from an accidentally-matching ancestor.
    if (
      withUser.length === userAnchors.length &&
      uniqueUserCoverage.size === userAnchors.length &&
      next.length >= userAnchors.length
    ) {
      return next;
    }
    level = next;
  }
  return null;
}

export interface StructuralFallbackOptions {
  /** Minimum characters for a non-user block to count as a real assistant turn. */
  minAssistantChars?: number;
}

export function extractByStructuralPairing(
  container: Element,
  userAnchors: Element[],
  opts: StructuralFallbackOptions = {},
): ContextMessage[] {
  if (userAnchors.length === 0) return [];
  const minChars = opts.minAssistantChars ?? 1;

  const turnBlocks = findTurnLevel(container, userAnchors);
  if (!turnBlocks) return [];

  const out: ContextMessage[] = [];
  for (const block of turnBlocks) {
    const isUserBlock = userAnchors.some((u) => block.contains(u));
    if (isUserBlock) {
      const text = elementToText(block);
      if (text) out.push({ role: "user", text });
      continue;
    }
    if (textLen(block) < minChars) continue;
    const text = elementToText(block);
    if (text) out.push({ role: "assistant", text });
  }
  return out;
}

/** True if `found` looks too sparse relative to `expected` to trust the primary selector. */
export function looksIncomplete(found: number, expected: number): boolean {
  if (expected === 0) return false;
  return found < Math.max(1, Math.ceil(expected * 0.6));
}
