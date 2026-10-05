import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "VERCEL_GIT_PULL_REQUEST_ID", "VERCEL_GIT_COMMIT_MESSAGE"],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
