import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const SERVER_PORT = Number(process.env["SERVER_PORT"] ?? 5174);

export default defineConfig({
  root: "web3d",
  base: "/game/",
  plugins: [react()],
  css: {
    transformer: "lightningcss",
  },
  server: {
    port: 5175,
    proxy: {
      "/game/api": {
        target: `http://localhost:${SERVER_PORT}`,
        rewrite: (path) => path.replace(/^\/game/, ""),
      },
    },
  },
  build: {
    // nested under dist/site so Workers Assets serves the app at /game/*
    outDir: "../dist/site/game",
    emptyOutDir: true,
    cssMinify: "lightningcss",
  },
});
