import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Note: proxy only applies during local `npm run dev`.
    // In production builds (`npm run build`), API communication uses `src/config.js` (`API_BASE_URL`).
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
