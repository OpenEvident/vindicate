import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const isProduction = process.env.NODE_ENV === "production";

/**
 * VS Code webview build: emit a separate main.css (linked from WebviewHtmlBuilder)
 * and a single IIFE main.js. Do not use @tailwindcss/vite here — it inlines CSS into
 * the JS bundle, which breaks the standard webview CSP + <link> pattern.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/webview")
    }
  },
  build: {
    outDir: "dist/webview",
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: "src/webview/main.tsx",
      output: {
        format: "iife",
        name: "VindicateWebview",
        entryFileNames: "main.js",
        assetFileNames: "main.[ext]",
        inlineDynamicImports: true
      }
    },
    sourcemap: !isProduction,
    minify: isProduction
  }
});
