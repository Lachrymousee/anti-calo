import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const markdown = await readFile(new URL('README.md', root), 'utf8');
await writeFile(new URL('src/docs-content.js', root), 'export default ' + JSON.stringify(markdown) + ';\n');
await copyFile(fileURLToPath(new URL('README.md', root)), fileURLToPath(new URL('public/panduan.md', root)));
