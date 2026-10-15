import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({build:{rollupOptions:{input:Object.fromEntries(['index','tickets','organizer','admin','gate','guide','integration','docs'].map(p=>[p,resolve(import.meta.dirname,`${p}.html`)]))}}});
