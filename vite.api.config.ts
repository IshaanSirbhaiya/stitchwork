// Bundles server/handler.ts and everything it imports (engine and synthetic dataset) into one
// self-contained ES module, so Vercel's Node runtime never has to resolve extensionless imports.
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    ssr: "server/handler.ts",
    outDir: "api/_lib",
    emptyOutDir: false,
    minify: false,
    target: "node20",
    rollupOptions: { output: { entryFileNames: "stitchwork-api.mjs", format: "es" } },
  },
  ssr: { noExternal: true },
});
