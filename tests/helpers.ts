import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export function loadFixtureDoc(rel: string): Document {
  const html = readFileSync(join(here, "fixtures", rel), "utf8");
  return new DOMParser().parseFromString(html, "text/html");
}
