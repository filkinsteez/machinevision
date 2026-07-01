import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// API target is configurable so the dev server can coexist with other tools on
// 8000 (e.g. ComfyUI). Set VITE_API_TARGET=http://127.0.0.1:8010 and run the API
// there. Defaults to 8000.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // shell env var wins, then .env files, then default
  const target = process.env.VITE_API_TARGET || env.VITE_API_TARGET || "http://127.0.0.1:8000";
  return {
    plugins: [react()],
    server: {
      // honor a harness-assigned PORT (preview_start autoPort); default 5173
      port: process.env.PORT ? Number(process.env.PORT) : 5173,
      proxy: {
        "/api": target,
        "/storage": target,
      },
    },
  };
});
