import { defineConfig } from "vite";
import { resolve } from "node:path";

const pages = [
  "index",
  "marketplace",
  "account",
  "tickets",
  "organizer",
  "admin",
  "gate",
  "integration",
  "backend",
];

export default defineConfig({
  base: "/anti-calo/",
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        pages.map((page) => [
          page,
          resolve(import.meta.dirname, `${page}.html`),
        ]),
      ),
    },
  },
});
