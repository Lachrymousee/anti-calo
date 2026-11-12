// Mengisi node Hardhat lokal dengan data contoh agar indexer dan API punya data sungguhan.
//   node scripts/seed-local.mjs chain     -> deploy kontrak, beri role, buat 2 event, beli tiket, listing resale
//   node scripts/seed-local.mjs details   -> simpan detail off-chain kedua event lewat API (backend harus berjalan)
// Hanya untuk node lokal (akun Hardhat bawaan yang kuncinya publik). Jangan dipakai untuk jaringan sungguhan.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContractFactory, Contract, JsonRpcProvider, id as keccakId } from 'ethers';
import { compileContracts } from '../test-support/compile.mjs';
import { computeDetailsHash } from '../src/api/validate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545';
const API = process.env.API_URL || 'http://localhost:3001';
const ORGANIZER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // akun Hardhat #1

const DETAILS = [
  { title: 'Nusa Sound Festival', description: 'Satu panggung, beragam suara untuk semua orang.', category: 'Musik', location: 'Gelora Bung Karno, Jakarta' },
  { title: 'Workshop Smart Contract', description: 'Belajar membuat dan mengaudit smart contract dari nol.', category: 'Teknologi', location: 'BINUS Anggrek, Jakarta' },
];

async function chain() {
  const provider = new JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
  const [admin, organizer, buyer, gate] = await Promise.all([0, 1, 2, 3].map((i) => provider.getSigner(i)));
  const art = compileContracts();

  const ticketF = await new ContractFactory(art.TicketNFT.abi, art.TicketNFT.bytecode, admin).deploy(await admin.getAddress());
  await ticketF.waitForDeployment();
  const ticketAddr = await ticketF.getAddress();
  const deployBlock = (await provider.getTransactionReceipt(ticketF.deploymentTransaction().hash)).blockNumber;
  const marketF = await new ContractFactory(art.Marketplace.abi, art.Marketplace.bytecode, admin).deploy(ticketAddr, 250);
  await marketF.waitForDeployment();
  const marketAddr = await marketF.getAddress();

  const ticket = (s) => new Contract(ticketAddr, art.TicketNFT.abi, s);
  const market = (s) => new Contract(marketAddr, art.Marketplace.abi, s);
  await (await ticket(admin).grantRole(keccakId('ORGANIZER_ROLE'), await organizer.getAddress())).wait();
  await (await ticket(admin).grantRole(await ticket(admin).MARKETPLACE_ROLE(), marketAddr)).wait();

  const now = (await provider.getBlock('latest')).timestamp;
  const price = 10n ** 16n; // 0,01 ETH
  const base = { ticketPrice: price, maxSupply: 100, maxPerWallet: 4, saleStart: now - 10, saleEnd: now + 30 * 86400, resaleCapBps: 11000 };
  // Event 1: hash on-chain cocok dengan detail contoh -> hashStatus "match". Event 2: hash kosong -> "unset".
  await (await ticket(organizer).createEvent({ ...base, eventTime: now + 31 * 86400, detailsHash: computeDetailsHash(DETAILS[0], '') })).wait();
  await (await ticket(organizer).createEvent({ ...base, eventTime: now + 45 * 86400, detailsHash: `0x${'00'.repeat(32)}` })).wait();

  await (await ticket(buyer).buyTicket(1, 2, { value: price * 2n })).wait();
  await (await market(buyer).listTicket(1, (price * 110n) / 100n)).wait();
  await (await ticket(organizer).assignGateChecker(1, await gate.getAddress())).wait();

  const env = ['NODE_ENV=development', 'AUTH_MODE=dev', `RPC_URL=${RPC}`, 'CHAIN_ID=31337', `TICKET_NFT_ADDRESS=${ticketAddr}`,
    `MARKETPLACE_ADDRESS=${marketAddr}`, `START_BLOCK=${deployBlock}`, 'CONFIRMATIONS=0', 'POLL_INTERVAL_MS=2000'];
  const envFile = path.resolve(here, '../.env');
  fs.writeFileSync(envFile, `${env.join('\n')}\n`);
  console.log(`Selesai. Kontrak di-deploy, 2 event dibuat, 2 tiket dibeli, 1 tiket dilisting.\n.env ditulis ke ${envFile}:\n\n${env.join('\n')}\n`);
  console.log('Langkah berikutnya: jalankan "npm start", lalu di terminal lain "npm run seed:details".');
}

async function details() {
  for (const [i, d] of DETAILS.entries()) {
    const r = await fetch(`${API}/api/events/${i + 1}/details`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-wallet-address': ORGANIZER }, body: JSON.stringify(d) });
    console.log(`Event ${i + 1}: HTTP ${r.status}`, await r.text());
  }
}

const cmd = process.argv[2];
if (cmd === 'chain') await chain();
else if (cmd === 'details') await details();
else { console.error('Pakai: node scripts/seed-local.mjs chain|details'); process.exit(1); }
