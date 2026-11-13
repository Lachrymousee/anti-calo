import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const bc = path.resolve(here, '../../blockchain');
const require = createRequire(import.meta.url);
const solc = require('solc');

// Mengompilasi TicketNFT dan Marketplace dengan pengaturan yang sama seperti blockchain/hardhat.config.js.
export function compileContracts() {
  const sources = {};
  for (const n of ['TicketNFT', 'Marketplace']) sources[`contracts/${n}.sol`] = { content: fs.readFileSync(path.join(bc, 'contracts', `${n}.sol`), 'utf8') };
  const input = { language: 'Solidity', sources,
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } };
  const findImports = (p) => {
    const candidates = [path.join(bc, p), path.join(bc, 'node_modules', p)];
    const hit = candidates.find((c) => fs.existsSync(c));
    return hit ? { contents: fs.readFileSync(hit, 'utf8') } : { error: `File tidak ditemukan: ${p}` };
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errors = (out.errors || []).filter((e) => e.severity === 'error');
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join('\n'));
  const pick = (n) => { const c = out.contracts[`contracts/${n}.sol`][n]; return { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` }; };
  return { TicketNFT: pick('TicketNFT'), Marketplace: pick('Marketplace') };
}
