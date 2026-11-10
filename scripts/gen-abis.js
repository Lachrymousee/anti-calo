// scripts/gen-abis.js
// Generate src/abis.js dari shared/abi/*.json
// Jalankan setelah kontrak di-compile: node scripts/gen-abis.js
// Diperlukan karena Node.js v22+ butuh "type: json" import attribute
// yang belum didukung semua toolchain, sedangkan Vite mendukung JSON import langsung.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');

const nftJson = JSON.parse(readFileSync(resolve(root, 'shared/abi/TicketNFT.json'), 'utf8'));
const mktJson = JSON.parse(readFileSync(resolve(root, 'shared/abi/Marketplace.json'), 'utf8'));

const output = [
  '// AUTO-GENERATED — jalankan "node scripts/gen-abis.js" setelah kontrak diupdate.',
  '// Jangan edit file ini secara manual.',
  `export const TICKET_NFT_ABI = ${JSON.stringify(nftJson.abi)};`,
  `export const MARKETPLACE_ABI = ${JSON.stringify(mktJson.abi)};`,
  '',
].join('\n');

writeFileSync(resolve(root, 'src/abis.js'), output);
console.log('✓ src/abis.js diperbarui dari shared/abi/*.json');
