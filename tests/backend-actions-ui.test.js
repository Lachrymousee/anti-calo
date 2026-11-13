import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createBackendPage } from '../src/backend.js';

const ORG = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', BUYER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', GATE = '0x90F79bf6EB2c4f870365E785982E1f101E93b906', ADMIN = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const NOW = 1_800_000_000, TICKET = '0x5FbDB2315678afecb367f032d93F642f64180aa3', MARKET = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const ev = (id, over = {}) => ({ id, title: `Event ${id}`, category: 'Musik', description: 'Deskripsi event yang cukup panjang.', date: '2027-01-15T08:00:00.000Z', venue: 'GBK', city: 'Jakarta',
  price: '0.01', ticketPriceWei: '10000000000000000', capacity: 100, sold: 2, checkedIn: 0, status: 'live', organizer: ORG, checkers: [], posterUrl: null, detailsComplete: true, hashStatus: 'match',
  computedHash: `0x${'ab'.repeat(32)}`, onchainHash: '0x', saleStart: NOW - 1000, saleEnd: NOW + 1000, eventTime: NOW + 5000, maxPerWallet: 4, resaleCapBps: 11000, ...over });
const role = (over = {}) => ({ admin: false, organizer: false, organizerEventIds: [], gateCheckerEventIds: [], ...over });
const sleep = (ms = 10) => new Promise((r) => setTimeout(r, ms));
let current;

function setup({ wallet = { address: BUYER, chainId: 31337 }, roles = role(), events = [ev('1')], tickets = [], listings = [], cfg = { chainId: 31337, ticketAddress: TICKET, marketplaceAddress: MARKET, confirmations: 0 }, chainImpl = {}, status = { lastBlock: 200, headBlock: 200, authMode: 'dev' } } = {}) {
  current?.page.cleanup(); current?.dom.window.close();
  const dom = new JSDOM('<!doctype html><div id="app"></div><div id="toasts"></div>', { url: 'https://example.test/backend.html' });
  Object.defineProperties(globalThis, { window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true }, Node: { value: dom.window.Node, configurable: true } });
  const calls = [], data = { events, tickets, listings }, counts = { events: 0 };
  const result = (n = 'ok') => ({ hash: `0x${n.padEnd(64, '0')}`, blockNumber: 101 });
  const chain = new Proxy({}, { get: (_, name) => name === 'then' ? undefined : chainImpl[name] ?? (async (...args) => { calls.push([name, ...args]); return result(name === 'createEvent' ? 'create' : 'ok'); }) });
  const fake = { status: async () => status, config: async () => cfg, events: async () => { counts.events += 1; return data.events; }, listings: async () => data.listings, roles: async () => roles, tickets: async () => data.tickets };
  const page = createBackendPage({ initialWallet: wallet, injected: { on() {}, removeListener() {}, request: async () => {} }, createClient: () => fake, makeOnchain: async () => chain, now: () => NOW,
    chain: { connectInjectedWallet: async () => wallet } });
  document.getElementById('app').append(page.main);
  current = { dom, page, calls, data, counts };
  return current;
}
const q = (id) => document.querySelector(`[data-testid="${id}"]`);
async function click(id) { const n = q(id); assert(n, id); n.click(); await sleep(30); }
const set = (id, v) => { q(id).value = v; };

test('tanpa wallet tidak ada tombol transaksi', async () => {
  setup({ wallet: null }); await sleep();
  for (const id of ['backend-buy-1', 'backend-create-panel', 'backend-admin-panel', 'backend-proceeds-panel']) assert.equal(q(id), null, id);
});

test('wallet di jaringan lain: transaksi disembunyikan dan ada tombol ganti jaringan', async () => {
  setup({ wallet: { address: BUYER, chainId: 1 } }); await sleep();
  assert.match(q('backend-network').textContent, /Chain ID 31337/); assert(q('backend-switch')); assert.equal(q('backend-buy-1'), null);
});

test('alamat kontrak belum dikonfigurasi di backend menonaktifkan transaksi', async () => {
  setup({ cfg: { chainId: 31337, ticketAddress: null, marketplaceAddress: null } }); await sleep();
  assert.match(q('backend-network').textContent, /belum dikonfigurasi/); assert.equal(q('backend-buy-1'), null);
});

test('beli tiket: jumlah dibatasi per wallet, transaksi dikirim, menunggu indexer, lalu data dimuat ulang', async () => {
  const s = setup(); await sleep();
  assert.equal(q('backend-qty-1').options.length, 4);
  set('backend-qty-1', '3'); const before = s.counts.events;
  await click('backend-buy-1');
  assert.deepEqual(s.calls[0], ['buyTicket', '1', '3']);
  assert.match(q('backend-tx').textContent, /Pembelian tiket: berhasil/); assert.match(q('backend-tx').textContent, /0xok/);
  assert(s.counts.events > before);
});

test('tombol beli tidak muncul bila penjualan tutup, belum buka, atau tiket habis', async () => {
  setup({ events: [ev('1', { saleEnd: NOW - 1 }), ev('2', { saleStart: NOW + 10 }), ev('3', { sold: 100 }), ev('4', { status: 'cancelled' })] }); await sleep();
  for (const id of ['1', '2', '3', '4']) assert.equal(q(`backend-buy-${id}`), null, id);
  assert.match(q('backend-event-3').textContent, /Habis/);
});

test('galat kontrak ditampilkan jelas dan tidak meninggalkan status transaksi', async () => {
  setup({ chainImpl: { buyTicket: async () => { throw Error('Pembelian melebihi batas per wallet untuk event ini.'); } } }); await sleep();
  await click('backend-buy-1');
  assert.match(q('backend-error').textContent, /batas per wallet/); assert.equal(q('backend-tx').textContent, '');
});

test('hanya satu transaksi pada satu waktu', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const s = setup({ chainImpl: { buyTicket: async () => { await gate; return { hash: '0x1', blockNumber: 101 }; } }, events: [ev('1'), ev('2')] }); await sleep();
  q('backend-buy-1').click(); await sleep();
  q('backend-buy-2').click(); await sleep();
  assert.match(q('backend-error').textContent, /Masih ada transaksi/);
  release(); await sleep(50); assert.equal(s.calls.length, 0);
});

test('organizer: panel buat event mengirim parameter yang benar lalu membuka editor detail', async () => {
  const s = setup({ wallet: { address: ORG, chainId: 31337 }, roles: role({ organizer: true }), events: [ev('1')],
    chainImpl: { createEvent: async (fields) => { s.calls.push(['createEvent', fields]); s.data.events = [...s.data.events, ev('2', { detailsComplete: false, hashStatus: 'missing', title: 'Event #2', computedHash: null })]; return { hash: '0xc', blockNumber: 101, eventId: '2' }; } } }); await sleep();
  set('backend-new-price', '0.02'); set('backend-new-supply', '50'); set('backend-new-perwallet', '2'); set('backend-new-cap', '120');
  set('backend-new-salestart', '2027-01-01T10:00'); set('backend-new-saleend', '2027-01-10T10:00'); set('backend-new-eventtime', '2027-01-11T10:00');
  await click('backend-create-submit'); await sleep(30);
  const [, f] = s.calls[0];
  assert.equal(f.priceEth, '0.02'); assert.equal(f.maxSupply, '50'); assert.equal(f.maxPerWallet, '2'); assert.equal(f.resaleCapBps, 12000);
  assert.equal(f.saleStart, Math.floor(new Date('2027-01-01T10:00').getTime() / 1000)); assert(f.saleEnd > f.saleStart && f.eventTime > f.saleEnd);
  assert(q('backend-title'), 'editor detail event baru terbuka');
});

test('pembeli tidak melihat panel organizer, admin, atau Gate Checker', async () => {
  setup(); await sleep();
  for (const id of ['backend-create-panel', 'backend-admin-panel', 'backend-gate-panel', 'backend-cancel-1', 'backend-withdraw-1', 'backend-assign-1']) assert.equal(q(id), null, id);
});

test('organizer pemilik event: batalkan, tarik dana, tugaskan petugas, kunci hash (hanya bila belum cocok)', async () => {
  const s = setup({ wallet: { address: ORG, chainId: 31337 }, roles: role({ organizer: true }), events: [ev('1', { hashStatus: 'unset' }), ev('2', { organizer: BUYER })] }); await sleep();
  assert.equal(q('backend-cancel-2'), null); assert.equal(q('backend-assign-2'), null);
  set('backend-checker-1', GATE); await click('backend-assign-1'); await click('backend-unassign-1');
  await click('backend-withdraw-1'); await click('backend-lockhash-1'); await click('backend-cancel-1');
  assert.deepEqual(s.calls.map((c) => c[0]), ['assignGateChecker', 'removeGateChecker', 'withdraw', 'updateEventHash', 'cancelEvent']);
  assert.deepEqual(s.calls[0], ['assignGateChecker', '1', GATE]); assert.deepEqual(s.calls[3], ['updateEventHash', '1', `0x${'ab'.repeat(32)}`]);
});

test('tombol kunci hash tidak muncul bila hash sudah cocok', async () => {
  setup({ wallet: { address: ORG, chainId: 31337 }, roles: role({ organizer: true }) }); await sleep();
  assert.equal(q('backend-lockhash-1'), null);
});

test('tiket: jual kembali dengan batas harga, batalkan listing, dan klaim refund', async () => {
  const t = (tokenId, status) => ({ tokenId, eventId: '1', owner: BUYER, status, originalPrice: '10000000000000000' });
  const s = setup({ tickets: [t('1', 'valid'), t('2', 'valid'), t('3', 'revoked'), t('4', 'used')],
    listings: [{ tokenId: '2', eventId: '1', seller: BUYER, price: '11000000000000000', originalPrice: '10000000000000000', stale: false }] }); await sleep();
  assert.equal(q('backend-price-1').value, '0.011'); assert.match(q('backend-ticket-1').textContent, /Batas 0.011 ETH/);
  set('backend-price-1', '0.0105'); await click('backend-list-1');
  await click('backend-unlist-2'); await click('backend-refund-3');
  assert.deepEqual(s.calls.map((c) => c.join(':')), ['listTicket:1:0.0105', 'cancelListing:2', 'claimRefund:3']);
  assert.equal(q('backend-list-4'), null); assert.equal(q('backend-refund-4'), null);
});

test('event dibatalkan: tiket valid dapat diklaim refund-nya', async () => {
  setup({ events: [ev('1', { status: 'cancelled' })], tickets: [{ tokenId: '1', eventId: '1', owner: BUYER, status: 'valid', originalPrice: '10000000000000000' }] }); await sleep();
  assert(q('backend-refund-1')); assert.equal(q('backend-list-1'), null);
});

test('listing: tombol beli tidak muncul untuk penjual sendiri', async () => {
  const s = setup({ listings: [{ tokenId: '7', eventId: '1', seller: BUYER, price: '11000000000000000', stale: false }, { tokenId: '8', eventId: '1', seller: GATE, price: '11000000000000000', stale: false }] }); await sleep();
  assert.equal(q('backend-buylisting-7'), null); await click('backend-buylisting-8');
  assert.deepEqual(s.calls[0], ['buyListing', '8']);
});

test('Gate Checker: check-in hanya untuk event penugasannya', async () => {
  const s = setup({ wallet: { address: GATE, chainId: 31337 }, roles: role({ gateCheckerEventIds: ['2'] }), events: [ev('1'), ev('2')] }); await sleep();
  assert.deepEqual([...q('backend-gate-event').options].map((o) => o.value), ['2']);
  set('backend-gate-token', '5'); await click('backend-gate-submit');
  assert.deepEqual(s.calls[0], ['checkIn', '2', '5']);
});

test('Admin: beri dan cabut role Organizer, cabut tiket', async () => {
  const s = setup({ wallet: { address: ADMIN, chainId: 31337 }, roles: role({ admin: true }) }); await sleep();
  set('backend-role-address', ORG); await click('backend-grant');
  set('backend-role-address', ORG); await click('backend-revoke');                // formulir dikosongkan setelah data dimuat ulang
  set('backend-revoke-token', '9'); await click('backend-revoketicket');
  assert.deepEqual(s.calls, [['grantOrganizer', ORG], ['revokeOrganizer', ORG], ['revokeTicket', '9']]);
  assert(q('backend-cancel-1'), 'Admin dapat membatalkan event');
});

test('tarik hasil resale tersedia untuk semua wallet terhubung', async () => {
  const s = setup(); await sleep(); await click('backend-withdraw-proceeds');
  assert.deepEqual(s.calls[0], ['withdrawProceeds']);
});
