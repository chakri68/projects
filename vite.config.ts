import { defineConfig } from "vite";

// base defaults to "/" (custom domain at root, e.g. projects.chakri.me). If you
// deploy to a project-pages subpath instead (chakri68.github.io/projects/), set
// VITE_BASE=/projects/ in the deploy workflow.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
});
