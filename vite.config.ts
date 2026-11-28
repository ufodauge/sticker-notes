import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vite-plus";

// GitHub Pages project sites live under "/<repo>/": set BASE_PATH at build time.
// The service worker scope follows `base`, so both stay in sync.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  test: {
    include: ["src/**/*.test.ts", "tools/**/*.test.ts"],
  },
  fmt: {
    ignorePatterns: ["docs/**", "AGENTS.md", "test/vectors/**"],
  },
  lint: {
    plugins: ["react", "typescript", "oxc"],
    jsPlugins: ["./lint/plugin.js"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": ["warn", { allowConstantExport: true }],
      "prefer-const": "error",
      "local/effect-location": "error",
      "local/effect-cleanup": "error",
      "local/no-set-in-effect": "error",
    },
    overrides: [
      {
        files: ["src/core/**"],
        rules: {
          "no-restricted-globals": [
            "error",
            "window",
            "document",
            "navigator",
            "localStorage",
            "sessionStorage",
            "indexedDB",
            "location",
            "history",
          ],
        },
      },
      {
        files: ["src/ui/**"],
        rules: {
          "local/no-let": "error",
          "no-restricted-imports": [
            "warn",
            {
              paths: [
                {
                  name: "react",
                  importNames: ["useState"],
                  message:
                    "useState より useReducer のステートマシンを優先する (ui-conventions §6)",
                },
              ],
            },
          ],
        },
      },
    ],
    options: {
      // oxlint's type-aware engine cannot run TS content mappers (it fails on tsconfig.app.json).
      // Types are checked by `tsc -b --runExternalCode` (vp run typecheck).
      typeAware: false,
      typeCheck: false,
    },
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset({ panicThreshold: "all_errors" })] }),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "ステッカー帳",
        short_name: "ステッカー帳",
        description: "ドット絵ステッカーをQRで交換して集める",
        lang: "ja",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#f6f4ef",
        theme_color: "#f6f4ef",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,webmanifest}"],
        // the 3D desk's models and textures (debug builds' `?room`) are not kept offline
        globIgnores: ["room/**"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
