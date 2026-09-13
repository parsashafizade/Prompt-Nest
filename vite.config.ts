import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function replaceExactCount(
  source: string,
  target: string,
  replacement: string,
  expectedCount: number,
  dependency: string,
) {
  const count = source.split(target).length - 1;
  if (count !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} ${dependency} HTML sink(s), found ${count}. Review the security transform before building.`,
    );
  }
  return source.replaceAll(target, replacement);
}

/**
 * React DOM ships two generic dangerouslySetInnerHTML branches even when an app never
 * uses that prop. DOMPurify also ships a legacy parser fallback that writes untrusted
 * markup to innerHTML when DOMParser is unavailable. Prompt Nest never needs those
 * branches, so make each one fail closed without patching installed dependencies.
 */
const hardenThirdPartyHtmlSinks = (): Plugin => ({
  name: "harden-third-party-html-sinks",
  enforce: "pre",
  transform(source, id) {
    if (id.startsWith("\0")) return null;
    const normalizedId = id.split("?", 1)[0].replaceAll("\\", "/");

    if (normalizedId.endsWith("/react-dom/cjs/react-dom-client.production.js")) {
      return {
        code: replaceExactCount(
          source,
          "domElement.innerHTML = key;",
          "domElement.textContent = key;",
          2,
          "React DOM",
        ),
        map: null,
      };
    }

    if (normalizedId.endsWith("/dompurify/dist/purify.es.mjs")) {
      return {
        code: replaceExactCount(
          source,
          "doc.documentElement.innerHTML = IS_EMPTY_INPUT ? emptyHTML : dirtyPayload;",
          "doc.documentElement.textContent = IS_EMPTY_INPUT ? '' : String(dirtyPayload);",
          1,
          "DOMPurify",
        ),
        map: null,
      };
    }

    return null;
  },
});

const copyManifest = () => ({
  name: "copy-manifest",
  closeBundle() {
    const destination = resolve(__dirname, "dist/manifest.json");
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(__dirname, "manifest.json"), destination);
  },
});

export default defineConfig({
  plugins: [hardenThirdPartyHtmlSinks(), react(), copyManifest()],
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
