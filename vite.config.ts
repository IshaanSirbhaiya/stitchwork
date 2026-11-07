/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev and preview, /walnut is proxied to the Walnut stitches (python -m stitch_walnut). If the
// service is not running the browser falls back to its in-page engine and says so.
const walnut = process.env.STITCH_WALNUT_URL ?? "http://127.0.0.1:4711";
const callerKey = process.env.STITCH_WALNUT_CALLER_KEY;
const proxy = { "/walnut": { target: walnut, changeOrigin: false, ...(callerKey ? { headers: { "x-stitch-caller-key": callerKey } } : {}) } };

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
  test: {
    globals: true,
    environment: "node",
    testTimeout: 60000,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
