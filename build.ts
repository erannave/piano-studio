import tailwind from "bun-plugin-tailwind";
import { rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const publicDir = join(process.cwd(), "public");

// Clean previously built static assets in public/ while preserving public/songs/
if (existsSync(publicDir)) {
  for (const entry of readdirSync(publicDir)) {
    if (entry === "songs") continue;
    rmSync(join(publicDir, entry), { recursive: true, force: true });
  }
}

const result = await Bun.build({
  entrypoints: ["./src/index.html"],
  outdir: "./public",
  target: "browser",
  minify: true,
  sourcemap: "linked",
  plugins: [tailwind],
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`Built ${result.outputs.length} production files into public/:`);
for (const output of result.outputs) {
  console.log(`  - ${output.path}`);
}
