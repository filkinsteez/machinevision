import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// API target is configurable so the dev server can coexist with other tools on
// 8000 (e.g. ComfyUI). Set VITE_API_TARGET=http://127.0.0.1:8010 and run the API
// there. Defaults to 8000.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_TARGET || "http://127.0.0.1:8000";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": target,
        "/storage": target,
      },
    },
  };
});
