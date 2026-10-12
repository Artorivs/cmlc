/**
 * Builds dist/app.js, the code index.html loads: src/ui/app.ts and everything it imports, bundled into one
 * plain script so the page works from GitHub Pages or when double-clicked. Run: npm run build
 */
import { build } from "esbuild";

await build({
  entryPoints: ["src/ui/app.ts"],
  outfile: "dist/app.js",
  bundle: true,
  format: "iife",
  target: "es2022",
  charset: "utf8",
  banner: { js: "// Built from src/ by build.ts. Edit the TypeScript, then run: npm run build" },
});
console.log("dist/app.js built");
