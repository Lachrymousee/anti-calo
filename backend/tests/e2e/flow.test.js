

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ContractFactory, Contract, JsonRpcProvider, id as keccakId } from 'ethers';
import { compileContracts } from '../../test-support/compile.mjs';
import { openDb } from '../../src/db.js';
import { loadConfig } from '../../src/config.js';
import { createApp } from '../../src/api/app.js';
import { syncOnce } from '../../src/indexer/sync.js';
import { startIndexer, buildInterfaces } from '../../src/indexer/run.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '../..');
const support = path.join(backend, 'test-support');
const bcModules = path.resolve(backend, '../blockchain/node_modules');
const hardhatCli = path.join(support, 'node_modules/hardhat/internal/cli/cli.js');
const PORT = 18545;
const URL_RPC = `http://127.0.0.1:${PORT}`;
const ready = fs.existsSync(path.join(bcModules, 'hardhat'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function startNode() {

  if (!fs.existsSync(path.join(support, 'node_modules'))) fs.symlinkSync(bcModules, path.join(support, 'node_modules'), 'junction');
  const child = spawn(process.execPath, [hardhatCli, 'node', '--config', path.join(support, 'hardhat.e2e.config.cjs'), '--port', String(PORT)],
    { cwd: support, stdio: 'ignore' });
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(URL_RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) });
      if (r.ok) return child;
    } catch {                  }
    await sleep(500);
  }
  child.kill();
  throw new Error('Node Hardhat tidak siap.');
}

const snap = (db) => JSON.stringify({
  events: db.prepare('SELECT * FROM events ORDER BY event_id').all(),
  tickets: db.prepare('SELECT * FROM tickets ORDER BY CAST(token_id AS INTEGER)').all(),
  listings: db.prepare('SELECT * FROM listings ORDER BY token_id').all(),
  sales: db.prepare('SELECT token_id, event_id, buyer, seller, price, fee FROM sales ORDER BY token_id').all(),
  roles: db.prepare('SELECT * FROM roles ORDER BY role, account').all(),
  gate: db.prepare('SELECT * FROM gate_checkers ORDER BY event_id, checker').all(),
});

test('alur lengkap: beli, resale, check-in, pembatalan, dan pencabutan role per role', { skip: !ready && 'blockchain/node_modules belum terpasang', timeout: 120_000 }, async (t) => {
  const node = await startNode();
  t.after(() => node.kill());

  const provider = new JsonRpcProvider(URL_RPC, undefined, { cacheTimeout: -1 });
  const [admin, organizer, buyer, buyer2, gate, outsider] = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => provider.getSigner(i)));
  const A = Object.fromEntries(await Promise.all(Object.entries({ admin, organizer, buyer, buyer2, gate, outsider })
    .map(async ([k, s]) => [k, (await s.getAddress()).toLowerCase()])));


  const art = compileContracts();
  const ticketDeploy = await new ContractFactory(art.TicketNFT.abi, art.TicketNFT.bytecode, admin).deploy(A.admin);
  await ticketDeploy.waitForDeployment();
  const ticketAddr = await ticketDeploy.getAddress();
  const marketDeploy = await new ContractFactory(art.Marketplace.abi, art.Marketplace.bytecode, admin).deploy(ticketAddr, 250);
  await marketDeploy.waitForDeployment();
  const marketAddr = await marketDeploy.getAddress();
  const ticket = (s) => new Contract(ticketAddr, art.TicketNFT.abi, s);
  const market = (s) => new Contract(marketAddr, art.Marketplace.abi, s);
  const ORGANIZER_ROLE = keccakId('ORGANIZER_ROLE');
  await (await ticket(admin).grantRole(ORGANIZER_ROLE, A.organizer)).wait();
  await (await ticket(admin).grantRole(await ticket(admin).MARKETPLACE_ROLE(), marketAddr)).wait();


  const config = { ...loadConfig({}), authMode: 'dev', chainId: 31337, rpcUrl: URL_RPC, ticketAddress: ticketAddr,
    marketplaceAddress: marketAddr, startBlock: 0, confirmations: 0, batchSize: 500, reorgDepth: 4, pollMs: 100,
    uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'anti-calo-e2e-')) };
  const db = openDb();
  const interfaces = buildInterfaces(config);
  const sync = () => syncOnce({ db, provider, interfaces, config });
  const server = createApp({ db, config }).listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (p, { who, method = 'GET', body } = {}) => {
    const r = await fetch(`${base}${p}`, { method, headers: { ...(who ? { 'x-wallet-address': A[who] } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };


  const details = { title: 'Nusa Sound Festival', description: 'Satu panggung, beragam suara untuk semua orang.', category: 'Musik', location: 'Gelora Bung Karno, Jakarta' };
  const { body: { detailsHash } } = await call('/api/details/hash', { method: 'POST', body: details });
  const now = (await provider.getBlock('latest')).timestamp;
  const price = 10n ** 16n;
  await (await ticket(organizer).createEvent({ ticketPrice: price, maxSupply: 10, maxPerWallet: 4, saleStart: now - 10, saleEnd: now + 3600,
    eventTime: now + 7200, resaleCapBps: 11000, detailsHash })).wait();
  await sync();
  const eventId = (await call('/api/events')).body.items[0].id;
  assert.equal((await call(`/api/events/${eventId}`)).body.details, null);
  assert.equal((await call(`/api/events/${eventId}/details`, { who: 'organizer', method: 'POST', body: details })).status, 201);
  assert.equal((await call(`/api/events/${eventId}/details`)).body.hashStatus, 'match');


  for (const who of ['admin', 'buyer', 'gate', 'outsider']) {
    assert.equal((await call(`/api/events/${eventId}/details`, { who, method: 'PUT', body: details })).status, 403, who);
  }


  await (await ticket(buyer).buyTicket(eventId, 2, { value: price * 2n })).wait();
  await assert.rejects(ticket(buyer).buyTicket(eventId, 3, { value: price * 3n }));
  await sync();
  const owned = (await call(`/api/tickets?owner=${A.buyer}`)).body.items;
  assert.equal(owned.length, 2);
  const [tokenA, tokenB] = owned.map((x) => x.tokenId);


  const resale = (price * 110n) / 100n;
  await assert.rejects(market(buyer).listTicket(tokenA, (price * 120n) / 100n));
  await assert.rejects(ticket(buyer).transferFrom(A.buyer, A.buyer2, tokenA));
  await (await market(buyer).listTicket(tokenA, resale)).wait();
  await (await market(buyer).listTicket(tokenB, resale)).wait();
  await sync();
  assert.equal((await call(`/api/listings?eventId=${eventId}&buyable=1`)).body.total, 2);
  await (await market(buyer2).buyListing(tokenA, { value: resale })).wait();
  await sync();
  const tA = (await call(`/api/tickets/${tokenA}`)).body;
  assert.equal(tA.owner, A.buyer2); assert.equal(tA.listing, null);


  await (await ticket(organizer).assignGateChecker(eventId, A.gate)).wait();
  await assert.rejects(ticket(outsider).checkIn(eventId, tokenA));
  await (await ticket(gate).checkIn(eventId, tokenA)).wait();
  await assert.rejects(ticket(gate).checkIn(eventId, tokenA));
  await sync();
  assert.equal((await call(`/api/tickets/${tokenA}`)).body.status, 'used');
  assert.equal((await call(`/api/tickets/${tokenA}`)).body.owner, A.buyer2);
  assert.equal((await call(`/api/roles/${A.gate}`)).body.gateCheckerEventIds[0], eventId);


  const rep = await call(`/api/events/${eventId}/report`, { who: 'organizer' });
  assert.equal(rep.status, 200);
  assert.equal(rep.body.sold, 2); assert.equal(rep.body.checkedIn, 1);
  assert.equal(rep.body.primaryRevenueWei, (price * 2n).toString());
  assert.equal(rep.body.resale.count, 1); assert.equal(rep.body.resale.volumeWei, resale.toString());
  assert.equal(rep.body.resale.organizerFeesWei, ((resale * 250n) / 10000n).toString());
  assert.equal((await call(`/api/events/${eventId}/report`, { who: 'admin' })).status, 200);
  for (const who of ['buyer', 'gate', 'outsider']) assert.equal((await call(`/api/events/${eventId}/report`, { who })).status, 403, who);
  assert.equal((await call(`/api/events/${eventId}/report`)).status, 401);
  assert.equal((await call(`/api/roles/${A.admin}`)).body.admin, true);
  assert.equal((await call(`/api/roles/${A.buyer}`)).body.organizer, false);


  await (await ticket(organizer).cancelEvent(eventId)).wait();
  await sync();
  assert.equal((await call(`/api/events/${eventId}`)).body.status, 'canceled');
  assert.equal((await call(`/api/listings?buyable=1`)).body.total, 0);
  assert.equal((await call(`/api/listings`)).body.items[0].stale, true);
  await assert.rejects(market(buyer2).buyListing(tokenB, { value: resale }));


  assert.equal((await call(`/api/events/${eventId}/details`, { who: 'organizer', method: 'PUT', body: { ...details, title: 'Judul baru' } })).status, 200);
  await (await ticket(admin).revokeRole(ORGANIZER_ROLE, A.organizer)).wait();
  await sync();
  assert.equal((await call(`/api/events/${eventId}/details`, { who: 'organizer', method: 'PUT', body: details })).status, 403);
  assert.equal((await call(`/api/events/${eventId}/details`, { who: 'admin', method: 'DELETE' })).status, 204);


  const db2 = openDb();
  const head = await provider.getBlockNumber();
  const handle = startIndexer({ db: db2, provider, config });
  for (let i = 0; i < 100; i += 1) {
    const row = db2.prepare("SELECT value FROM sync_state WHERE key = 'last_block'").get();
    if (row && Number(row.value) >= head) break;
    await sleep(100);
  }
  handle.stop();
  assert.equal(snap(db2), snap(db));
});
