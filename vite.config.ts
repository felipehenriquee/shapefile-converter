import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // relative asset URLs, so the build works under /shapefile-converter/ on GitHub Pages or at any other path
  base: "./",
  // the worker lazy-loads shpjs, which needs code splitting (not available in the default iife format)
  worker: { format: "es" },
});
