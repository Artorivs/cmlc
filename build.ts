/**
 * Builds index.html: the page template with the app bundled inline, so the page is one file
 * that works from GitHub Pages or when double-clicked. Run: npm run build
 */
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

const { outputFiles } = await build({
  entryPoints: ["src/ui/app.ts"],
  bundle: true,
  format: "iife",
  target: "es2022",
  charset: "utf8",
  write: false,
  banner: { js: "// Built from src/ by build.ts. Edit the TypeScript, then run: npm run build" },
});
const page = readFileSync("src/ui/page.html", "utf8");
const script = outputFiles[0]!.text.replaceAll("</script", "<\\/script");
writeFileSync("index.html", page.replace("/* cmlc:app */", () => script.trimEnd()));
console.log("index.html built");
