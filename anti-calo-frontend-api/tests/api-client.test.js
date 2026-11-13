import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, verifyMessage } from 'ethers';
import { weiToEth, splitLocation, joinLocation, mapEvent, mapTicket, authMessage, sha256Hex, createApiClient, ApiError } from '../src/api.js';

const BASE = 'http://api.test';
const apiEvent = (over = {}) => ({ id: '1', organizer: '0xabc', status: 'active', ticketPrice: '10000000000000000', maxSupply: 100, maxPerWallet: 4, sold: 2, checkedIn: 1,
  saleStart: 1, saleEnd: 2, eventTime: 1800000000, resaleCapBps: 11000, detailsHash: `0x${'00'.repeat(32)}`, gateCheckers: ['0xdef'],
  details: { title: 'Nusa Sound Festival', description: 'Deskripsi', category: 'Musik', location: 'Gelora Bung Karno, Jakarta', posterUrl: '/uploads/1-abc.png', hashStatus: 'match', computedHash: '0x11' }, ...over });

test('weiToEth tepat tanpa kehilangan presisi', () => {
  assert.equal(weiToEth('10000000000000000'), '0.01');
  assert.equal(weiToEth('0'), '0');
  assert.equal(weiToEth('1500000000000000000'), '1.5');
  assert.equal(weiToEth('1'), '0.000000000000000001');
  assert.equal(weiToEth('123456789012345678901234567890'), '123456789012.34567890123456789');
});

test('location dipisah dan digabung kembali sebagai venue dan kota', () => {
  assert.deepEqual(splitLocation('Gelora Bung Karno, Jakarta'), { venue: 'Gelora Bung Karno', city: 'Jakarta' });
  assert.deepEqual(splitLocation('Hall A, Lantai 2, Bandung'), { venue: 'Hall A, Lantai 2', city: 'Bandung' });
  assert.deepEqual(splitLocation('Balai Kota'), { venue: 'Balai Kota', city: '' });
  assert.equal(joinLocation({ venue: ' Hall A ', city: ' Bandung ' }), 'Hall A, Bandung');
  assert.equal(joinLocation({ venue: 'Hall A', city: '' }), 'Hall A');
});

test('mapEvent menyesuaikan bentuk backend ke bentuk frontend', () => {
  const e = mapEvent(apiEvent(), BASE);
  assert.equal(e.title, 'Nusa Sound Festival'); assert.equal(e.venue, 'Gelora Bung Karno'); assert.equal(e.city, 'Jakarta');
  assert.equal(e.price, '0.01'); assert.equal(e.capacity, 100); assert.equal(e.status, 'live'); assert.equal(e.date, '2027-01-15T08:00:00.000Z');
  assert.equal(e.posterUrl, 'http://api.test/uploads/1-abc.png'); assert.equal(e.hashStatus, 'match'); assert.deepEqual(e.checkers, ['0xdef']);
  const bare = mapEvent(apiEvent({ details: null, status: 'canceled' }), BASE);
  assert.equal(bare.title, 'Event #1'); assert.equal(bare.detailsComplete, false); assert.equal(bare.hashStatus, 'missing'); assert.equal(bare.status, 'cancelled'); assert.equal(bare.posterUrl, null);
});

test('mapTicket: valid -> active, ada listing -> listed, used tetap used', () => {
  const t = { tokenId: '5', eventId: '1', owner: '0xabc', status: 'valid', originalPrice: '10000000000000000' };
  assert.equal(mapTicket(t).status, 'active');
  assert.deepEqual(mapTicket(t, { price: '11000000000000000' }), { id: '5', eventId: '1', owner: '0xabc', facePrice: '0.01', status: 'listed', resalePrice: '0.011' });
  assert.equal(mapTicket({ ...t, status: 'used' }).status, 'used');
});

test('format pesan tanda tangan sama persis dengan yang diverifikasi backend', () => {
  assert.equal(authMessage({ method: 'put', path: '/api/events/1/details', timestamp: 1700000000, contentSha256: 'ab12' }),
    'anti-calo-auth\nmethod:PUT\npath:/api/events/1/details\ntimestamp:1700000000\ncontent-sha256:ab12');
  assert.equal(authMessage({ method: 'DELETE', path: '/x', timestamp: 1, contentSha256: '' }).endsWith('content-sha256:-'), true);
});

function fakeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); const r = await handler(url, init, calls.length); return { ok: r.status < 400, status: r.status, text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)) }; };
  return { fetchImpl, calls };
}

test('mode dev: memakai header x-wallet-address tanpa meminta tanda tangan', async () => {
  const wallet = Wallet.createRandom(); let signed = 0;
  const { fetchImpl, calls } = fakeFetch((url) => (url.endsWith('/api/status') ? { status: 200, body: { authMode: 'dev' } } : { status: 201, body: { ok: 1 } }));
  const c = createApiClient({ baseUrl: BASE, fetchImpl, wallet: { address: wallet.address, signMessage: async () => { signed += 1; } } });
  await c.saveDetails('1', { title: 't' }, false);
  const write = calls.at(-1);
  assert.equal(write.init.method, 'POST'); assert.equal(write.init.headers['x-wallet-address'], wallet.address); assert.equal(signed, 0);
});

test('mode signature: tanda tangan memuat method, path, waktu, dan hash isi body', async () => {
  const wallet = Wallet.createRandom();
  const { fetchImpl, calls } = fakeFetch((url) => (url.endsWith('/api/status') ? { status: 200, body: { authMode: 'signature' } } : { status: 200, body: {} }));
  const c = createApiClient({ baseUrl: BASE, fetchImpl, wallet, now: () => 1700000000 });
  const details = { title: 'Judul', description: 'Deskripsi cukup panjang', category: 'Musik', location: 'Hall, Jakarta' };
  await c.saveDetails('7', details, true);
  const { init } = calls.at(-1), body = init.body;
  const sha = sha256Hex(body);
  assert.equal(init.method, 'PUT'); assert.equal(init.headers['x-content-sha256'], sha);
  const [, address, ts, signature] = /^AntiCalo (0x[0-9a-fA-F]{40}):(\d+):(0x[0-9a-f]+)$/.exec(init.headers.authorization);
  assert.equal(address, wallet.address); assert.equal(ts, '1700000000');
  assert.equal(verifyMessage(authMessage({ method: 'PUT', path: '/api/events/7/details', timestamp: ts, contentSha256: sha }), signature), wallet.address);
  await c.deleteDetails('7');
  const del = calls.at(-1).init;
  assert.equal(del.headers['x-content-sha256'], undefined);
  assert.equal(verifyMessage(authMessage({ method: 'DELETE', path: '/api/events/7/details', timestamp: 1700000000, contentSha256: '' }), del.headers.authorization.split(':')[2]), wallet.address);
});

test('upload poster: hash dihitung dari isi file', async () => {
  const wallet = Wallet.createRandom(), bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const { fetchImpl, calls } = fakeFetch((url) => (url.endsWith('/api/status') ? { status: 200, body: { authMode: 'signature' } } : { status: 201, body: {} }));
  const c = createApiClient({ baseUrl: BASE, fetchImpl, wallet, now: () => 1700000000 });
  await c.uploadPoster('1', new File([bytes], 'poster.png', { type: 'image/png' }));
  const { init } = calls.at(-1);
  assert.ok(init.body instanceof FormData); assert.equal(init.headers['x-content-sha256'], sha256Hex(bytes));
  assert.equal(init.headers['content-type'], undefined);                                   // boundary diisi fetch sendiri
});

test('menulis tanpa wallet ditolak sebelum request dikirim', async () => {
  const { fetchImpl, calls } = fakeFetch(() => ({ status: 200, body: {} }));
  await assert.rejects(createApiClient({ baseUrl: BASE, fetchImpl }).saveDetails('1', {}, false), /Hubungkan wallet/);
  assert.equal(calls.length, 0);
});

test('error backend menjadi ApiError berisi pesan; jaringan gagal punya pesan sendiri', async () => {
  const { fetchImpl } = fakeFetch(() => ({ status: 403, body: { error: 'forbidden', message: 'Hanya organizer pemilik event ini yang dapat melakukan tindakan tersebut.' } }));
  await assert.rejects(createApiClient({ baseUrl: BASE, fetchImpl }).events(), (e) => e instanceof ApiError && e.status === 403 && e.code === 'forbidden' && /organizer/.test(e.message));
  const down = createApiClient({ baseUrl: BASE, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(down.status(), /tidak dapat dijangkau/);
  assert.throws(() => createApiClient({ baseUrl: '' }), /VITE_API_URL/);
});

test('events/tickets/listings membentuk query dan memetakan hasil', async () => {
  const { fetchImpl, calls } = fakeFetch((url) => {
    if (url.includes('/api/events')) return { status: 200, body: { items: [apiEvent()] } };
    return { status: 200, body: { items: [{ tokenId: '1' }] } };
  });
  const c = createApiClient({ baseUrl: BASE, fetchImpl });
  assert.equal((await c.events())[0].title, 'Nusa Sound Festival');
  await c.tickets('0xabc'); await c.listings();
  assert.match(calls[0].url, /\/api\/events\?limit=100$/); assert.match(calls[1].url, /\/api\/tickets\?owner=0xabc&limit=100$/); assert.match(calls[2].url, /\/api\/listings\?buyable=1&limit=100$/);
});
