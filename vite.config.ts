import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // the worker lazy-loads shpjs, which needs code splitting (not available in the default iife format)
  worker: { format: "es" },
});
