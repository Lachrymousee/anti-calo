// Memastikan klien frontend (src/api.js) benar-benar kompatibel dengan backend asli:
// tanda tangan wallet, header hash, upload multipart, dan izin per role.
// Dilewati otomatis bila dependensi backend belum dipasang (cd backend && npm ci).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApiClient, ApiError } from '../src/api.js';

const backend = path.resolve(import.meta.dirname, '../backend');
const ready = fs.existsSync(path.join(backend, 'node_modules/express')) && fs.existsSync(path.join(backend, 'node_modules/ethers'));
const load = (p) => import(pathToFileURL(path.join(backend, p)).href);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 7)]);
const DETAILS = { title: 'Nusa Sound Festival', description: 'Satu panggung, beragam suara untuk semua orang.', category: 'Musik', location: 'Gelora Bung Karno, Jakarta' };

async function boot(authMode) {
  const [{ openDb }, { loadConfig }, { createApp }, { syncOnce }, fc] = await Promise.all(
    ['src/db.js', 'src/config.js', 'src/api/app.js', 'src/indexer/sync.js', 'tests/helpers/fake-chain.js'].map(load));
  const db = openDb(), chain = new fc.FakeChain();
  fc.emit.admin(chain, 1); fc.emit.organizerRole(chain, 1); fc.emit.eventCreated(chain, 2, 1n); fc.emit.eventCreated(chain, 2, 2n); chain.head = 10;
  await syncOnce({ db, provider: chain, interfaces: fc.interfaces, config: { startBlock: 1, confirmations: 2, batchSize: 100, reorgDepth: 4 } });
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anti-calo-compat-'));
  const server = createApp({ db, config: { ...loadConfig({}), authMode, uploadDir, maxPosterBytes: 4096 } }).listen(0);
  return { fc, baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

for (const mode of ['signature', 'dev']) {
  test(`klien frontend <-> backend asli (AUTH_MODE=${mode}): baca, simpan, poster, hapus, izin`, { skip: !ready && 'backend belum di-install' }, async (t) => {
    const b = await boot(mode); t.after(b.close);
    const wallet = (k) => b.fc.wallets[k];
    const organizer = createApiClient({ baseUrl: b.baseUrl, wallet: wallet('organizer') });

    assert.equal((await organizer.status()).authMode, mode);
    let events = await organizer.events();
    assert.equal(events.length, 2); assert.equal(events[0].detailsComplete, false); assert.equal(events[0].price, '0.000000000000001');

    await organizer.saveDetails('1', DETAILS, false);                                            // POST
    await organizer.saveDetails('1', { ...DETAILS, title: 'Nusa Sound Festival 2027' }, true);   // PUT
    await assert.rejects(createApiClient({ baseUrl: b.baseUrl, wallet: wallet('buyer') }).saveDetails('1', DETAILS, true), (e) => e instanceof ApiError && e.status === 403);
    await assert.rejects(createApiClient({ baseUrl: b.baseUrl }).saveDetails('1', DETAILS, true), /Hubungkan wallet/);

    const withPoster = await organizer.uploadPoster('1', new File([PNG], 'p.png', { type: 'image/png' }));
    assert.match(withPoster.posterUrl, /^\/uploads\/1-[0-9a-f]{16}\.png$/);
    await assert.rejects(organizer.uploadPoster('1', new File([Buffer.from('<svg/>')], 'x.svg', { type: 'image/svg+xml' })), (e) => e.status === 400);

    events = await organizer.events();
    assert.equal(events[0].title, 'Nusa Sound Festival 2027'); assert.equal(events[0].venue, 'Gelora Bung Karno'); assert.equal(events[0].city, 'Jakarta');
    assert.equal(events[0].hashStatus, 'unset'); assert.equal(events[0].posterUrl, `${b.baseUrl}${withPoster.posterUrl}`);
    const img = await fetch(events[0].posterUrl);
    assert.equal(img.status, 200); assert.deepEqual(Buffer.from(await img.arrayBuffer()), PNG);

    const hash = await organizer.hashFor(DETAILS);
    assert.match(hash.detailsHash, /^0x[0-9a-f]{64}$/);
    await organizer.deleteDetails('1');
    assert.equal((await organizer.events())[0].detailsComplete, false);
  });
}

test('tanda tangan yang dipakai ulang ditolak backend (anti-replay)', { skip: !ready && 'backend belum di-install' }, async (t) => {
  const b = await boot('signature'); t.after(b.close);
  let captured;
  const spy = async (url, init) => { if (init?.method === 'POST') captured = { url, init }; return fetch(url, init); };
  const c = createApiClient({ baseUrl: b.baseUrl, wallet: b.fc.wallets.organizer, fetchImpl: spy });
  await c.saveDetails('2', DETAILS, false);
  const replay = await fetch(captured.url, captured.init);
  assert.equal(replay.status, 401);
});
