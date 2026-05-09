import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const SERVER_PORT = Number(process.env["SERVER_PORT"] ?? 5174);

export default defineConfig({
  root: "web",
  publicDir: false,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": `http://localhost:${SERVER_PORT}`,
    },
  },
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
});
