import { defineConfig } from "vite";

// Relative base so the build works on GitHub Pages under /ask-for-a-gift/ and on any static host.
export default defineConfig({ base: "./", build: { target: "es2020" } });
