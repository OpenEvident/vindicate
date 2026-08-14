import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const webviewDir = resolve("dist", "webview");
const jsPath = resolve(webviewDir, "main.js");
const cssPath = resolve(webviewDir, "main.css");

function requireFile(path, minBytes) {
  const stat = statSync(path);
  if (stat.size < minBytes) {
    throw new Error(`${path} is too small (${stat.size} bytes); expected at least ${minBytes}`);
  }
}

requireFile(cssPath, 4096);
requireFile(jsPath, 50_000);

const js = readFileSync(jsPath, "utf8");
if (js.includes("tailwindcss v4") && js.includes("document.createElement(`style`)")) {
  throw new Error(
    "main.js still injects Tailwind via <style> — use PostCSS + extracted main.css for VS Code webviews"
  );
}

console.log("Webview build OK: dist/webview/main.css and dist/webview/main.js");
