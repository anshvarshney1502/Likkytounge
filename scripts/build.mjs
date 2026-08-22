import esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const prod = process.argv.includes("--prod");
const watch = process.argv.includes("--watch");

// Content scripts must be classic scripts (IIFE). Other entries are also
// bundled to self-contained IIFE files for simplicity and small size.
const entries = {
  content: "src/content/index.ts",
  background: "src/background/index.ts",
  popup: "src/popup/index.ts",
  library: "src/library/index.ts",
  settings: "src/settings/index.ts",
};

async function copyStatic() {
  await mkdir(dist, { recursive: true });
  // Ensure icons exist.
  if (!existsSync(join(root, "public/icons/icon16.png"))) {
    execFileSync("node", ["scripts/gen-icons.mjs"], { cwd: root, stdio: "inherit" });
  }
  await cp(join(root, "public"), dist, { recursive: true });
}

const common = {
  bundle: true,
  format: "iife",
  target: ["chrome110"],
  sourcemap: !prod,
  minify: prod,
  logLevel: "info",
  legalComments: "none",
  define: { "process.env.NODE_ENV": JSON.stringify(prod ? "production" : "development") },
};

async function run() {
  await rm(dist, { recursive: true, force: true });
  await copyStatic();

  const buildOptions = Object.entries(entries).map(([name, entry]) => ({
    ...common,
    entryPoints: [join(root, entry)],
    outfile: join(dist, `${name}.js`),
  }));

  if (watch) {
    const ctxs = await Promise.all(buildOptions.map((o) => esbuild.context(o)));
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log("[build] watching for changes...");
  } else {
    await Promise.all(buildOptions.map((o) => esbuild.build(o)));
    console.log(`[build] done (${prod ? "production" : "development"}) -> dist/`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
