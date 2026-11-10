import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Relative base so the same build works at any GitHub Pages path.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      // custom service worker (src/sw.ts): offline cache + daily reminder push
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      includeAssets: ["icon-192.png", "icon-512.png", "data/*.json"],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,json}"],
      },
      manifest: {
        name: "JLPT 한자",
        short_name: "JLPT 한자",
        description: "N5·N4·N3 한자 단어 복습 앱",
        lang: "ko",
        start_url: ".",
        scope: ".",
        display: "standalone",
        background_color: "#f6f5f1",
        theme_color: "#1f2a44",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
