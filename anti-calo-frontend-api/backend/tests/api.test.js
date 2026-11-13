import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { syncOnce } from '../src/indexer/sync.js';
import { createApp } from '../src/api/app.js';
import { authMessage, sha256Hex } from '../src/api/auth.js';
import { FakeChain, emit, interfaces, wallets, addr, params, TICKET, ORGANIZER_ROLE } from './helpers/fake-chain.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const PNG2 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 2)]);
const GOOD = { title: 'Nusa Sound Festival', description: 'Satu panggung, beragam suara untuk semua.', category: 'Musik', location: 'Gelora Bung Karno, Jakarta' };

async function setup({ authMode = 'dev', now = 2500 } = {}) {
  const db = openDb();
  const c = new FakeChain();
  emit.admin(c, 1); emit.organizerRole(c, 1);
  emit.eventCreated(c, 2, 1n); emit.eventCreated(c, 2, 2n, params({ ticketPrice: 500n }));
  emit.assigned(c, 2, 1n);
  emit.purchased(c, 3, 1n, 1n, 2n); emit.listed(c, 4, 1n, 1100n); emit.checkedIn(c, 5, 2n);
  c.head = 20;
  await syncOnce({ db, provider: c, interfaces, config: { startBlock: 1, confirmations: 2, batchSize: 100, reorgDepth: 4 } });
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-calo-up-'));
  const config = { ...loadConfig({}), authMode, uploadDir, maxPosterBytes: 4096 };
  const server = createApp({ db, config, now: () => now }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  return { db, base, server, uploadDir, close: () => server.close() };
}
const dev = (k) => ({ 'x-wallet-address': wallets[k].address });
const json = (k, body) => ({ method: 'POST', headers: { 'content-type': 'application/json', ...(k ? dev(k) : {}) }, body: JSON.stringify(body) });
const call = async (url, init) => { const r = await fetch(url, init); const t = await r.text(); return { status: r.status, body: t ? JSON.parse(t) : null, headers: r.headers }; };
const withMethod = (m, init) => ({ ...init, method: m });
const upload = (k, buf, type = 'image/png', name = 'p.png') => {
  const fd = new FormData(); fd.append('poster', new Blob([buf], { type }), name);
  return { method: 'POST', headers: dev(k), body: fd };
};

test('GET event publik: data on-chain terindeks, detail off-chain null sebelum dibuat', async (t) => {
  const s = await setup(); t.after(s.close);
  const list = await call(`${s.base}/api/events`);
  assert.equal(list.body.total, 2);
  assert.equal(list.body.items[0].details, null);
  assert.equal(list.body.items[0].sold, 2);
  const one = await call(`${s.base}/api/events/1`);
  assert.equal(one.body.organizer, addr('organizer'));
  assert.deepEqual(one.body.gateCheckers, [addr('gate')]);
  assert.equal((await call(`${s.base}/api/events/99`)).status, 404);
  assert.equal((await call(`${s.base}/api/events/abc`)).status, 400);
});

test('CRUD detail event: izin per role, validasi, soft delete, buat ulang', async (t) => {
  const s = await setup(); t.after(s.close);
  const url = `${s.base}/api/events/1/details`;
  assert.equal((await call(url, json(null, GOOD))).status, 401);               // tanpa login
  for (const who of ['buyer', 'gate', 'other', 'admin']) {                      // role lain tidak boleh membuat
    assert.equal((await call(url, json(who, GOOD))).status, 403, who);
  }
  const created = await call(url, json('organizer', GOOD));
  assert.equal(created.status, 201); assert.equal(created.body.title, GOOD.title);
  assert.equal((await call(url, json('organizer', GOOD))).status, 409);        // duplikat
  assert.equal((await call(`${s.base}/api/events/2/details`, json('organizer', GOOD))).status, 201); // organizer sama, event lain miliknya
  const bad = await call(`${s.base}/api/events/1/details`, withMethod('PUT', json('organizer', { ...GOOD, category: 'Olahraga' })));
  assert.equal(bad.status, 400);
  assert.equal((await call(url, withMethod('PUT', json('organizer', { ...GOOD, extra: 1 })))).status, 400);
  assert.equal((await call(url, withMethod('PUT', json('organizer', { ...GOOD, title: 'x' })))).status, 400);
  const put = await call(url, withMethod('PUT', json('organizer', { ...GOOD, title: 'Nusa Sound Festival 2026' })));
  assert.equal(put.body.title, 'Nusa Sound Festival 2026');
  assert.equal((await call(url, withMethod('PUT', json('buyer', GOOD)))).status, 403);
  assert.equal((await call(url, { method: 'DELETE', headers: dev('buyer') })).status, 403);
  assert.equal((await call(url)).body.title, 'Nusa Sound Festival 2026');
  const list = await call(`${s.base}/api/events?category=Musik&q=nusa`);
  assert.equal(list.body.total, 2);
  assert.equal((await call(url, { method: 'DELETE', headers: dev('admin') })).status, 204);  // moderasi Admin
  assert.equal((await call(url)).status, 404);
  assert.equal((await call(`${s.base}/api/events/1`)).body.details, null);
  assert.equal((await call(url, json('organizer', GOOD))).status, 201);                       // dapat dibuat ulang
});

test('organizer yang role-nya dicabut tidak dapat mengubah detail event', async (t) => {
  const s = await setup(); t.after(s.close);
  s.db.prepare('UPDATE roles SET active = 0 WHERE role = ? AND account = ?').run(ORGANIZER_ROLE, addr('organizer'));
  assert.equal((await call(`${s.base}/api/events/1/details`, json('organizer', GOOD))).status, 403);
  assert.equal((await call(`${s.base}/api/roles/${wallets.organizer.address}`)).body.organizer, false);
});

test('detailsHash: unset / match / mismatch terhadap komitmen on-chain', async (t) => {
  const s = await setup(); t.after(s.close);
  const url = `${s.base}/api/events/1/details`;
  const h = await call(`${s.base}/api/details/hash`, json(null, GOOD));
  assert.match(h.body.detailsHash, /^0x[0-9a-f]{64}$/);
  const created = await call(url, json('organizer', GOOD));
  assert.equal(created.body.hashStatus, 'unset');
  assert.equal(created.body.computedHash, h.body.detailsHash);
  s.db.prepare('UPDATE events SET details_hash = ? WHERE event_id = ?').run(h.body.detailsHash, '1');
  assert.equal((await call(url)).body.hashStatus, 'match');
  const changed = await call(url, withMethod('PUT', json('organizer', { ...GOOD, description: 'Deskripsi diubah setelah komitmen on-chain.' })));
  assert.equal(changed.body.hashStatus, 'mismatch');
});

test('upload poster: hanya gambar valid, batas ukuran, izin, dan hash ikut berubah', async (t) => {
  const s = await setup(); t.after(s.close);
  const url = `${s.base}/api/events/1/poster`;
  assert.equal((await call(url, upload('organizer', PNG))).status, 404);       // detail belum ada
  await call(`${s.base}/api/events/1/details`, json('organizer', GOOD));
  assert.equal((await call(url, upload('buyer', PNG))).status, 403);
  assert.equal((await call(url, upload('organizer', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml', 'x.svg'))).status, 400);
  assert.equal((await call(url, upload('organizer', Buffer.from('bukan gambar'), 'image/png', 'x.png'))).status, 400); // Content-Type bohong
  assert.equal((await call(url, upload('organizer', Buffer.concat([PNG, Buffer.alloc(5000)])))).status, 400);          // > 4096
  const before = (await call(`${s.base}/api/events/1/details`)).body.computedHash;
  const ok = await call(url, upload('organizer', PNG, 'image/png', '../../evil.png'));
  assert.equal(ok.status, 201);
  assert.match(ok.body.posterUrl, /^\/uploads\/1-[0-9a-f]{16}\.png$/);
  assert.notEqual(ok.body.computedHash, before);
  const file = await fetch(`${s.base}${ok.body.posterUrl}`);
  assert.equal(file.status, 200); assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), PNG);
  const second = await call(url, upload('organizer', PNG2));                   // poster lama dihapus
  assert.equal(fs.readdirSync(s.uploadDir).length, 1);
  assert.notEqual(second.body.posterUrl, ok.body.posterUrl);
  assert.equal(fs.readdirSync(s.uploadDir)[0], second.body.posterUrl.split('/').pop());
});

test('tiket, listing (stale vs buyable), dan laporan', async (t) => {
  const s = await setup(); t.after(s.close);
  const mine = await call(`${s.base}/api/tickets?owner=${wallets.buyer.address}`);
  assert.equal(mine.body.total, 2);
  const used = (await call(`${s.base}/api/tickets/2`)).body;
  assert.equal(used.status, 'used'); assert.equal(used.listing, null);
  const l = await call(`${s.base}/api/listings?buyable=1`);
  assert.equal(l.body.total, 1); assert.equal(l.body.items[0].stale, false);
  s.db.prepare("UPDATE events SET status = 'canceled' WHERE event_id = '1'").run();
  assert.equal((await call(`${s.base}/api/listings?buyable=1`)).body.total, 0);
  const all = await call(`${s.base}/api/listings`);
  assert.equal(all.body.items[0].stale, true);

  const url = `${s.base}/api/events/1/report`;
  assert.equal((await call(url)).status, 401);
  assert.equal((await call(url, { headers: dev('buyer') })).status, 403);
  assert.equal((await call(url, { headers: dev('gate') })).status, 403);
  const rep = await call(url, { headers: dev('organizer') });
  assert.equal(rep.status, 200);
  assert.equal(rep.body.sold, 2); assert.equal(rep.body.checkedIn, 1); assert.equal(rep.body.primaryRevenueWei, '2000');
  assert.equal((await call(url, { headers: dev('admin') })).status, 200);
  const role = await call(`${s.base}/api/roles/${wallets.gate.address}`);
  assert.deepEqual(role.body.gateCheckerEventIds, ['1']);
});

// ----- mode signature -----
const signed = async (s, wallet, method, p, { body, file, ts = Math.floor(Date.now() / 1000), shaOverride } = {}) => {
  const raw = body !== undefined ? Buffer.from(JSON.stringify(body)) : file;
  const sha = shaOverride ?? (raw ? sha256Hex(raw) : '');
  const sig = await wallet.signMessage(authMessage({ method, path: p, timestamp: ts, contentSha256: sha }));
  const headers = { authorization: `AntiCalo ${wallet.address}:${ts}:${sig}` };
  if (sha) headers['x-content-sha256'] = sha;
  let b;
  if (body !== undefined) { headers['content-type'] = 'application/json'; b = raw; }
  if (file) { const fd = new FormData(); fd.append('poster', new Blob([file], { type: 'image/png' }), 'p.png'); b = fd; }
  return { init: { method, headers, body: b }, sig };
};

test('AUTH_MODE=signature: tanda tangan valid, replay, body diganti, kedaluwarsa, penanda tangan salah', async (t) => {
  const s = await setup({ authMode: 'signature' }); t.after(s.close);
  const p = '/api/events/1/details';
  assert.equal((await call(`${s.base}${p}`, json('organizer', GOOD))).status, 401);          // header dev diabaikan
  const ok = await signed(s, wallets.organizer, 'POST', p, { body: GOOD });
  assert.equal((await call(`${s.base}${p}`, ok.init)).status, 201);
  assert.equal((await call(`${s.base}${p}`, ok.init)).status, 401);                          // replay ditolak
  const sw = await signed(s, wallets.organizer, 'PUT', p, { body: GOOD });
  sw.init.body = Buffer.from(JSON.stringify({ ...GOOD, title: 'Judul disusupi' }));          // body diganti MITM
  assert.equal((await call(`${s.base}${p}`, sw.init)).status, 401);
  const old = await signed(s, wallets.organizer, 'PUT', p, { body: GOOD, ts: Math.floor(Date.now() / 1000) - 4000 });
  assert.equal((await call(`${s.base}${p}`, old.init)).status, 401);
  const nosha = await signed(s, wallets.organizer, 'PUT', p, { body: GOOD, shaOverride: '' });
  assert.equal((await call(`${s.base}${p}`, nosha.init)).status, 401);
  const wrong = await signed(s, wallets.buyer, 'PUT', p, { body: GOOD });
  wrong.init.headers.authorization = wrong.init.headers.authorization.replace(wallets.buyer.address, wallets.organizer.address);
  assert.equal((await call(`${s.base}${p}`, wrong.init)).status, 401);                      // alamat tidak cocok
  const other = await signed(s, wallets.buyer, 'PUT', p, { body: GOOD });
  assert.equal((await call(`${s.base}${p}`, other.init)).status, 403);                       // valid tetapi bukan organizer
  const up = await signed(s, wallets.organizer, 'POST', '/api/events/1/poster', { file: PNG });
  assert.equal((await call(`${s.base}/api/events/1/poster`, up.init)).status, 201);
  const up2 = await signed(s, wallets.organizer, 'POST', '/api/events/1/poster', { file: PNG2, shaOverride: sha256Hex(PNG) });
  assert.equal((await call(`${s.base}/api/events/1/poster`, up2.init)).status, 401);
  const del = await signed(s, wallets.admin, 'DELETE', p);
  assert.equal((await call(`${s.base}${p}`, del.init)).status, 204);
});

test('GET /api/config memberi chain dan alamat kontrak (tanpa rahasia)', async (t) => {
  const s = await setup(); t.after(s.close);
  const r = await call(`${s.base}/api/config`);
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body).sort(), ['chainId', 'confirmations', 'marketplaceAddress', 'ticketAddress']);
  assert.equal(r.body.ticketAddress, null);                       // belum diisi pada konfigurasi tes
});

test('konfigurasi: AUTH_MODE=dev ditolak pada production', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production', AUTH_MODE: 'dev' }), /production/);
  assert.equal(loadConfig({ NODE_ENV: 'production' }).authMode, 'signature');
});
