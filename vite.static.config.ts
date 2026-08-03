import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

/**
 * 純 HTML + JS 靜態成品（無 Electron / 無 SSR）
 * 產物：dist-static/  → 可 zip 後任意靜態主機部署
 */
export default defineConfig({
  root: path.resolve(__dirname, "web"),
  base: "./",
  publicDir: path.resolve(__dirname, "public"),
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist-static"),
    emptyOutDir: true,
    sourcemap: false,
    assetsDir: "assets",
  },
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
});
