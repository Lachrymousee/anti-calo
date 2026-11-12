import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Interface } from 'ethers';
import { isTracked } from './handlers.js';

const ABI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../shared/abi');

export function loadInterface(name, abiDir = ABI_DIR) {
  const json = JSON.parse(fs.readFileSync(path.join(abiDir, `${name}.json`), 'utf8'));
  return new Interface(json.abi ?? json);
}

// Mengubah hasil decode ethers menjadi objek biasa: bigint -> string desimal, address -> huruf kecil.
function plain(param, value) {
  if (param.baseType === 'tuple') return Object.fromEntries(param.components.map((c, i) => [c.name, plain(c, value[i])]));
  if (param.baseType === 'array') return Array.from(value, (v) => plain(param.arrayChildren, v));
  if (typeof value === 'bigint') return value.toString();
  if (param.type === 'address') return String(value).toLowerCase();
  if (param.type === 'bytes32') return String(value).toLowerCase();
  return value;
}

export function decodeLog(iface, log) {
  let parsed;
  try {
    parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
  } catch {
    return null;
  }
  if (!parsed || !isTracked(parsed.name)) return null;
  const args = Object.fromEntries(parsed.fragment.inputs.map((p, i) => [p.name, plain(p, parsed.args[i])]));
  return { name: parsed.name, args };
}
