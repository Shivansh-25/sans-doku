import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  build: {
    outDir: "dist/client",
    rollupOptions: { input: { app: "index.html", admin: "admin.html" } },
  },
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  plugins: [
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "SansDoku",
        short_name: "SansDoku",
        description: "A little moment for you. Calm, offline Sudoku.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f7f5ef",
        theme_color: "#f7f5ef",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        globIgnores: ["admin.html", "assets/admin-*.js", "assets/admin-*.css"],
        navigateFallbackDenylist: [/^\/admin(?:[/.]|$)/, /^\/api\//],
        navigateFallback: "/index.html",
      },
    }),
  ],
});
