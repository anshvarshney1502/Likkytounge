import { describe, it, expect } from "vitest";
import { cook, ALL_RECIPES, rtcoRecipe, stepByStepRecipe, outputFormatRecipe } from "../src/cook/recipes";

describe("cook (prompt rewriter)", () => {
  it("passes through unchanged when no recipes are picked", () => {
    expect(cook("just a prompt", [])).toBe("just a prompt");
  });

  it("wraps a raw prompt with the RTCO template", () => {
    const out = rtcoRecipe.apply("Write a launch email.");
    expect(out).toContain("## Role");
    expect(out).toContain("## Task");
    expect(out).toContain("Write a launch email.");
    expect(out).toContain("## Constraints");
    expect(out).toContain("## Output format");
  });

  it("appends step-by-step instruction cleanly", () => {
    const out = stepByStepRecipe.apply("Explain B-trees.");
    expect(out.startsWith("Explain B-trees.")).toBe(true);
    expect(out.toLowerCase()).toContain("step by step");
  });

  it("pins output format from variables", () => {
    const out = outputFormatRecipe.apply("Give me tips.", { format: "a markdown table" });
    expect(out).toContain("Respond in a markdown table");
  });

  it("stacks recipes in order", () => {
    const out = cook("Explain gradients.", ["rtco", "no-fluff"]);
    expect(out).toContain("## Role");
    expect(out.toLowerCase()).toContain("no preamble");
  });

  it("exposes all recipes with unique ids", () => {
    const ids = new Set(ALL_RECIPES.map((r) => r.id));
    expect(ids.size).toBe(ALL_RECIPES.length);
    expect(ALL_RECIPES.every((r) => r.label && r.hint)).toBe(true);
  });
});
