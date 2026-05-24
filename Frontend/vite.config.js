import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("livekit-client")) return "livekit";
          if (id.includes("framer-motion") || id.includes("motion-dom") || id.includes("motion-utils")) return "motion";
          if (id.includes("socket.io-client") || id.includes("engine.io-client")) return "realtime";
          if (id.includes("react") || id.includes("react-dom") || id.includes("scheduler")) return "react";
          return "vendor";
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    host: true, // Allow access from network devices
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/socket.io": {
        target: "http://127.0.0.1:4000",
        ws: true
      }
    },
    allowedHosts: [
      'snooze-embroider-flying.ngrok-free.dev'
    ]
  }
});
