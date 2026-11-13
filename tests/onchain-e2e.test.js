// E2E Tahap 2: transaksi lewat src/onchain.js ke kontrak asli (node Hardhat lokal) -> indexer backend -> REST API.
// Dilewati otomatis bila blockchain/ atau backend/ belum di-install (npm ci di keduanya).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ContractFactory, Contract, JsonRpcProvider, formatEther } from 'ethers';
import { createOnchain, waitForIndexer, ORGANIZER_ROLE } from '../src/onchain.js';
import { createApiClient } from '../src/api.js';

const root = path.resolve(import.meta.dirname, '..');
const backend = path.join(root, 'backend'), support = path.join(backend, 'test-support');
const bcModules = path.join(root, 'blockchain/node_modules');
const ready = fs.existsSync(path.join(bcModules, 'hardhat')) && fs.existsSync(path.join(backend, 'node_modules/express'));
const load = (p) => import(pathToFileURL(path.join(backend, p)).href);
const PORT = 18546, RPC = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function startNode() {
  if (!fs.existsSync(path.join(support, 'node_modules'))) fs.symlinkSync(bcModules, path.join(support, 'node_modules'), 'junction');
  const child = spawn(process.execPath, [path.join(support, 'node_modules/hardhat/internal/cli/cli.js'), 'node', '--config', path.join(support, 'hardhat.e2e.config.cjs'), '--port', String(PORT)], { cwd: support, stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) }); if (r.ok) return child; } catch { /* belum siap */ }
    await sleep(500);
  }
  child.kill(); throw new Error('Node Hardhat tidak siap.');
}

test('Tahap 2: beli, resale, check-in, refund, withdraw, dan role lewat transaksi wallet', { skip: !ready && 'blockchain/ atau backend/ belum di-install', timeout: 180_000 }, async (t) => {
  const node = await startNode(); t.after(() => node.kill());
  const [{ openDb }, { loadConfig }, { createApp }, { syncOnce }, { buildInterfaces }, { compileContracts }] = await Promise.all(
    ['src/db.js', 'src/config.js', 'src/api/app.js', 'src/indexer/sync.js', 'src/indexer/run.js', 'test-support/compile.mjs'].map(load));
  const provider = new JsonRpcProvider(RPC, undefined, { cacheTimeout: -1 });
  const names = ['admin', 'organizer', 'buyer', 'buyer2', 'gate', 'outsider'];
  const S = Object.fromEntries(await Promise.all(names.map(async (n, i) => [n, await provider.getSigner(i)])));
  const A = Object.fromEntries(await Promise.all(names.map(async (n) => [n, (await S[n].getAddress()).toLowerCase()])));

  // --- deploy (kontrak asli) ---
  const art = compileContracts();
  const tk = await new ContractFactory(art.TicketNFT.abi, art.TicketNFT.bytecode, S.admin).deploy(A.admin); await tk.waitForDeployment();
  const mk = await new ContractFactory(art.Marketplace.abi, art.Marketplace.bytecode, S.admin).deploy(await tk.getAddress(), 250); await mk.waitForDeployment();
  const ticketAddress = await tk.getAddress(), marketplaceAddress = await mk.getAddress();
  await (await new Contract(ticketAddress, art.TicketNFT.abi, S.admin).grantRole(await tk.MARKETPLACE_ROLE(), marketplaceAddress)).wait();

  // --- backend: DB + API + sinkronisasi indexer ---
  const config = { ...loadConfig({}), authMode: 'dev', chainId: 31337, ticketAddress, marketplaceAddress, startBlock: 0, confirmations: 0, batchSize: 500, reorgDepth: 4,
    uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'anti-calo-t2-')) };
  const db = openDb(), interfaces = buildInterfaces(config);
  const sync = () => syncOnce({ db, provider, interfaces, config });
  const server = createApp({ db, config }).listen(0); t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const api = (who) => createApiClient({ baseUrl, wallet: { address: A[who], signMessage: async () => '' } });
  const apiAs = (who) => createApiClient({ baseUrl, wallet: { address: A[who], signMessage: async () => '' } });
  const indexerClient = { status: async () => { await sync(); return (await api('admin').status()); } };
  const cfg = await api('admin').config();
  assert.equal(cfg.chainId, 31337); assert.equal(cfg.ticketAddress.toLowerCase(), ticketAddress.toLowerCase());
  const chain = (who) => createOnchain({ signer: S[who], ticketAddress: cfg.ticketAddress, marketplaceAddress: cfg.marketplaceAddress });
  const settle = async (r) => assert.equal(await waitForIndexer(indexerClient, r.blockNumber, { timeoutMs: 5000, intervalMs: 10 }), true);
  const rejects = (promise, pattern) => assert.rejects(promise, (e) => { assert.match(e.message, pattern); return true; });

  // --- Admin: beri role Organizer ---
  await rejects(chain('outsider').grantOrganizer(A.organizer), /role yang dibutuhkan/);
  await settle(await chain('admin').grantOrganizer(A.organizer));
  assert.equal((await apiAs('admin').roles(A.organizer)).organizer, true);
  await rejects(chain('admin').grantOrganizer('bukan-alamat'), /alamat wallet yang valid/);

  // --- Organizer: buat event (validasi di klien dan di kontrak) ---
  const now = (await provider.getBlock('latest')).timestamp;
  const base = { priceEth: '0.01', maxSupply: 50, maxPerWallet: 4, saleStart: now - 10, saleEnd: now + 3600, eventTime: now + 7200, resaleCapBps: 11000 };
  await rejects(chain('organizer').createEvent({ ...base, priceEth: '0' }), /harus lebih dari 0/);
  await rejects(chain('organizer').createEvent({ ...base, priceEth: '0,0x1' }), /angka ETH/);
  await rejects(chain('organizer').createEvent({ ...base, saleEnd: now + 9000 }), /berakhir sebelum atau tepat saat event/);
  await rejects(chain('buyer').createEvent(base), /role yang dibutuhkan/);
  const created = await chain('organizer').createEvent(base);
  assert.equal(created.eventId, '1'); await settle(created);
  const ev1 = (await apiAs('buyer').events())[0];
  assert.equal(ev1.id, '1'); assert.equal(ev1.price, '0.01'); assert.equal(ev1.organizer, A.organizer);

  // --- Buyer: beli tiket (harga dibaca dari kontrak, batas per wallet ditolak) ---
  await rejects(chain('buyer').buyTicket('1', 5), /batas per wallet/);
  await rejects(chain('buyer').buyTicket('1', 0), /1–10/);
  await rejects(chain('buyer').buyTicket('99', 1), /Event #99 tidak ditemukan/);
  await settle(await chain('buyer').buyTicket('1', 3));
  const mine = await apiAs('buyer').tickets(A.buyer);
  assert.equal(mine.length, 3);
  const [tokenA, tokenB, tokenC] = mine.map((x) => x.tokenId);

  // --- Resale: batas harga, beli listing sendiri ditolak, beli oleh buyer2, biaya organizer ---
  const quote = await chain('buyer').quoteResale(tokenA, '0.011');
  assert.equal(formatEther(quote.capWei), '0.011'); assert.equal(quote.withinCap, true); assert.equal(formatEther(quote.feeWei), '0.000275');
  assert.equal((await chain('buyer').quoteResale(tokenA, '0.012')).withinCap, false);
  await rejects(chain('buyer').listTicket(tokenA, '0.012'), /melebihi batas 0.011 ETH/);
  await rejects(chain('buyer2').listTicket(tokenA, '0.011'), /bukan pemilik tiket/);
  await chain('buyer').listTicket(tokenA, '0.011');
  await settle(await chain('buyer').listTicket(tokenB, '0.011'));
  assert.equal((await apiAs('buyer2').listings()).length, 2);
  await rejects(chain('buyer').buyListing(tokenA), /listing milikmu sendiri/);
  await rejects(chain('buyer2').buyListing(tokenC), /tidak sedang dijual/);
  await settle(await chain('buyer2').buyListing(tokenA));
  assert.equal((await apiAs('buyer2').tickets(A.buyer2)).map((x) => x.tokenId)[0], tokenA);
  await rejects(chain('buyer2').cancelListing(tokenB), /Hanya penjual/);
  await settle(await chain('buyer').cancelListing(tokenB));
  assert.equal((await apiAs('buyer2').listings()).length, 0);

  // --- Gate Checker: penugasan, check-in satu kali ---
  await rejects(chain('buyer').assignGateChecker('1', A.gate), /organizer pemilik event atau Admin/);
  await chain('organizer').assignGateChecker('1', A.gate);
  await rejects(chain('organizer').assignGateChecker('1', A.gate), /sudah menjadi Gate Checker/);
  await rejects(chain('outsider').checkIn('1', tokenA), /bukan Gate Checker/);
  await settle(await chain('gate').checkIn('1', tokenA));
  await rejects(chain('gate').checkIn('1', tokenA), /tidak valid \(sudah dipakai/);
  await rejects(chain('gate').checkIn('1', 'abc'), /harus berupa angka/);
  assert.equal((await apiAs('gate').tickets(A.buyer2))[0].status, 'used');
  await rejects(chain('buyer2').listTicket(tokenA, '0.01'), /tidak dapat dipindahkan/);

  // --- detailsHash: detail off-chain dikunci on-chain, status menjadi "match" ---
  const details = { title: 'Nusa Sound Festival', description: 'Satu panggung, beragam suara untuk semua orang.', category: 'Musik', location: 'Gelora Bung Karno, Jakarta' };
  const saved = await apiAs('organizer').saveDetails('1', details, false);
  assert.equal(saved.hashStatus, 'unset');
  await rejects(chain('buyer').updateEventHash('1', saved.computedHash), /organizer pemilik event/);
  await rejects(chain('organizer').updateEventHash('1', '0x1234'), /32 byte/);
  await settle(await chain('organizer').updateEventHash('1', saved.computedHash));
  assert.equal((await apiAs('buyer').events())[0].hashStatus, 'match');

  // --- Event kedua: pencabutan tiket oleh organizer dan refund; pembatalan event dan refund ---
  const now2 = (await provider.getBlock('latest')).timestamp;
  const e2 = await chain('organizer').createEvent({ ...base, saleStart: now2 - 10, saleEnd: now2 + 3600, eventTime: now2 + 7200 });
  await chain('buyer').buyTicket(e2.eventId, 2);
  await settle(await chain('buyer2').buyTicket(e2.eventId, 1));
  const t2 = (await apiAs('buyer').tickets(A.buyer)).filter((x) => x.eventId === e2.eventId).map((x) => x.tokenId);
  const t2b2 = (await apiAs('buyer2').tickets(A.buyer2)).filter((x) => x.eventId === e2.eventId).map((x) => x.tokenId);
  await rejects(chain('buyer').claimRefund(t2[0]), /Refund hanya untuk/);
  await rejects(chain('buyer').revokeTicket(t2[0]), /organizer pemilik event atau Admin/);
  await settle(await chain('organizer').revokeTicket(t2[0]));
  assert.equal((await apiAs('buyer').tickets(A.buyer)).find((x) => x.tokenId === t2[0]).status, 'revoked');
  await rejects(chain('buyer').listTicket(t2[0], '0.01'), /tidak dapat dipindahkan/);
  const before = await provider.getBalance(A.buyer);
  await settle(await chain('buyer').claimRefund(t2[0]));
  assert.ok((await provider.getBalance(A.buyer)) > before - 10n ** 15n);              // refund 0.01 ETH dikurangi gas
  assert.equal((await (await fetch(`${baseUrl}/api/tickets/${t2[0]}`)).json()).status, 'burned');   // dibakar: pemilik menjadi alamat nol, tidak lagi di daftar wallet
  assert.equal((await apiAs('buyer').tickets(A.buyer)).some((x) => x.tokenId === t2[0]), false);
  await settle(await chain('organizer').cancelEvent(e2.eventId));
  assert.equal((await apiAs('buyer').events()).find((e) => e.id === e2.eventId).status, 'cancelled');
  await rejects(chain('buyer2').buyTicket(e2.eventId, 1), /tidak aktif/);
  await settle(await chain('buyer2').claimRefund(t2b2[0]));
  await rejects(chain('organizer').cancelEvent(e2.eventId), /tidak aktif/);

  // --- Penarikan dana: ditolak sebelum event, berhasil sesudahnya (organizer: pendapatan + fee resale; penjual: hasil resale) ---
  await rejects(chain('organizer').withdraw('1'), /setelah event dimulai/);
  await provider.send('evm_increaseTime', [8000]); await provider.send('evm_mine', []);
  await rejects(chain('outsider').withdraw('1'), /organizer pemilik event/);
  const bal = await chain('organizer').balances('1', A.buyer);
  assert.equal(formatEther(bal.revenueWei), '0.03'); assert.equal(formatEther(bal.resaleFeesWei), '0.000275'); assert.equal(formatEther(bal.pendingProceedsWei), '0.010725');
  const orgBefore = await provider.getBalance(A.organizer);
  await settle(await chain('organizer').withdraw('1'));
  assert.ok((await provider.getBalance(A.organizer)) > orgBefore + 29n * 10n ** 15n);
  await rejects(chain('organizer').withdraw('1'), /Tidak ada dana/);
  await settle(await chain('buyer').withdrawProceeds());
  await rejects(chain('buyer').withdrawProceeds(), /Tidak ada hasil penjualan/);
  await rejects(chain('organizer').cancelEvent('1'), /sudah dimulai/);

  // --- Admin mencabut role Organizer: transaksi organizer ditolak dan API ikut berubah ---
  await settle(await chain('admin').revokeOrganizer(A.organizer));
  assert.equal((await apiAs('admin').roles(A.organizer)).organizer, false);
  await rejects(chain('organizer').createEvent(base), /role yang dibutuhkan/);
  assert.ok(ORGANIZER_ROLE.startsWith('0x'));
});
