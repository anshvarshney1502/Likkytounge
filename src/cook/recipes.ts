// "Cook This Prompt" — local, rules-based prompt enhancement.
// Everything runs on-device. There is no LLM call and no API key.
//
// Each recipe takes a raw prompt and returns an improved version. Recipes
// stack: you can apply multiple in order.

export interface Recipe {
  id: string;
  label: string;
  hint: string;
  apply(prompt: string, vars?: Record<string, string>): string;
}

const trim = (s: string) => s.replace(/\s+$/g, "").trim();

/** Wrap the user's raw prompt in a Role / Task / Constraints / Output template. */
export const rtcoRecipe: Recipe = {
  id: "rtco",
  label: "Structure as Role · Task · Constraints · Output",
  hint: "Turns any short prompt into a clear brief the AI can follow reliably.",
  apply(prompt) {
    const p = trim(prompt);
    return [
      "You are an expert assistant. Follow this brief exactly.",
      "",
      "## Role",
      "Act as a domain-expert helper for the task below.",
      "",
      "## Task",
      p || "(describe the task here)",
      "",
      "## Constraints",
      "- Be concrete and specific; avoid vague advice.",
      "- Ask a clarifying question only if a required detail is missing.",
      "- Prefer bullet points and short paragraphs over walls of text.",
      "",
      "## Output format",
      "Return: (1) a one-line TL;DR, then (2) the full answer with clear headings.",
    ].join("\n");
  },
};

export const stepByStepRecipe: Recipe = {
  id: "step-by-step",
  label: "Ask for step-by-step reasoning",
  hint: "Adds an explicit 'think step by step, show your work' instruction.",
  apply(prompt) {
    const p = trim(prompt);
    return `${p}\n\nWork through this step by step. Show your reasoning as short bullet points before the final answer, then give the final answer clearly labeled.`;
  },
};

export const examplesRecipe: Recipe = {
  id: "examples",
  label: "Ask for concrete examples",
  hint: "Requests worked examples so the answer isn't purely abstract.",
  apply(prompt) {
    const p = trim(prompt);
    return `${p}\n\nInclude at least 2 concrete, realistic examples that show how this applies in practice.`;
  },
};

export const outputFormatRecipe: Recipe = {
  id: "output-format",
  label: "Pin output format",
  hint: "Forces a specific structure (headings, bullets, table, or JSON).",
  apply(prompt, vars = {}) {
    const p = trim(prompt);
    const format = (vars.format || "markdown with headings and bullet points").trim();
    return `${p}\n\nRespond in ${format}. Do not deviate from this format.`;
  },
};

export const audienceRecipe: Recipe = {
  id: "audience",
  label: "Set the audience",
  hint: "Tunes tone and depth to a specific reader (beginner, executive, etc.).",
  apply(prompt, vars = {}) {
    const p = trim(prompt);
    const audience = (vars.audience || "a smart non-expert").trim();
    return `${p}\n\nWrite for ${audience}. Match their vocabulary and level of detail; explain jargon on first use.`;
  },
};

export const noFluffRecipe: Recipe = {
  id: "no-fluff",
  label: "Cut fluff",
  hint: "Prepends an anti-verbose directive.",
  apply(prompt) {
    const p = trim(prompt);
    return `${p}\n\nBe concise. No preamble, no filler, no apologies. Start with the answer.`;
  },
};

export const criticRecipe: Recipe = {
  id: "self-critique",
  label: "Add a self-critique pass",
  hint: "Asks the model to draft, critique, then revise.",
  apply(prompt) {
    const p = trim(prompt);
    return `${p}\n\nAfter drafting your answer, critique it in 3 bullet points (what could be wrong, weak, or missing), then produce a revised final answer that fixes those issues. Label the sections: DRAFT, CRITIQUE, FINAL.`;
  },
};

export const contextInjectRecipe: Recipe = {
  id: "context-inject",
  label: "Prepend background context",
  hint: "Adds project background you paste in, so the AI has grounding.",
  apply(prompt, vars = {}) {
    const context = (vars.context || "").trim();
    const p = trim(prompt);
    if (!context) return p;
    return [
      "## Background",
      context,
      "",
      "## Task",
      p,
      "",
      "Use the background above as ground truth. If it contradicts something you'd normally assume, prefer the background.",
    ].join("\n");
  },
};

export const ALL_RECIPES: Recipe[] = [
  rtcoRecipe,
  stepByStepRecipe,
  examplesRecipe,
  outputFormatRecipe,
  audienceRecipe,
  noFluffRecipe,
  criticRecipe,
  contextInjectRecipe,
];

export function cook(
  prompt: string,
  recipeIds: string[],
  vars: Record<string, string> = {},
): string {
  return recipeIds.reduce((out, id) => {
    const r = ALL_RECIPES.find((r) => r.id === id);
    return r ? r.apply(out, vars) : out;
  }, prompt);
}
