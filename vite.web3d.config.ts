import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const SERVER_PORT = Number(process.env["SERVER_PORT"] ?? 5174);

// Vendor chunking: split heavy 3D/physics libs from react core so browsers
// can cache them independently across deploys.
function manualChunks(id: string): string | undefined {
  // vendor-three: three.js + all @react-three/* + postprocessing
  if (
    id.includes("/node_modules/three/") ||
    id.includes("/node_modules/@react-three/") ||
    id.includes("/node_modules/postprocessing/") ||
    id.includes("/node_modules/@dimforge/")
  ) {
    return "vendor-three";
  }
  // vendor-react: react runtime, scheduler, zustand
  if (
    id.includes("/node_modules/react/") ||
    id.includes("/node_modules/react-dom/") ||
    id.includes("/node_modules/scheduler/") ||
    id.includes("/node_modules/zustand/")
  ) {
    return "vendor-react";
  }
  return undefined;
}

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
    rolldownOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
