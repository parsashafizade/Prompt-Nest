import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const copyManifest = () => ({
  name: "copy-manifest",
  closeBundle() {
    const destination = resolve(__dirname, "dist/manifest.json");
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(__dirname, "manifest.json"), destination);
  },
});

export default defineConfig({
  plugins: [react(), copyManifest()],
  publicDir: "public",
  build: {
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        background: resolve(__dirname, "src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js",
      },
    },
  },
});
