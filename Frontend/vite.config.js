import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
