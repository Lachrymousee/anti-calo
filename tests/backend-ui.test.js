import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createBackendPage } from '../src/backend.js';

const ORG = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', BUYER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', OTHER = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const ev = (id, over = {}) => ({ id, title: `Event ${id}`, category: 'Musik', description: 'Deskripsi event yang cukup panjang.', date: '2027-01-15T08:00:00.000Z', venue: 'Gelora Bung Karno', city: 'Jakarta',
  price: '0.01', capacity: 100, sold: 2, checkedIn: 1, status: 'live', organizer: ORG, checkers: [], posterUrl: null, detailsComplete: true, hashStatus: 'match', computedHash: `0x${'ab'.repeat(32)}`, onchainHash: '0x', ...over });
const sleep = (ms = 10) => new Promise((r) => setTimeout(r, ms));
let current;

function setup({ wallet = null, events = [ev('1'), ev('2', { organizer: OTHER, detailsComplete: false, hashStatus: 'missing', title: 'Event #2', computedHash: null })],
  roles, tickets = [], listings = [], status = { lastBlock: 12, headBlock: 14, authMode: 'dev' }, failStatus, client = {}, mode = 'lab' } = {}) {
  current?.page.cleanup(); current?.dom.window.close();
  const dom = new JSDOM('<!doctype html><div id="app"></div><div id="toasts"></div>', { url: 'https://example.test/backend.html' });
  Object.defineProperties(globalThis, { window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true },
    Node: { value: dom.window.Node, configurable: true }, navigator: { value: dom.window.navigator, configurable: true } });
  const calls = [];
  const fake = { status: async () => { if (failStatus) throw Error(failStatus); return status; }, events: async () => events, listings: async () => listings,
    roles: async (a) => roles ?? { address: a, admin: false, organizer: a === ORG, organizerEventIds: [], gateCheckerEventIds: [] }, tickets: async () => tickets,
    saveDetails: async (...a) => { calls.push(['save', ...a]); return { computedHash: `0x${'cd'.repeat(32)}`, hashStatus: 'unset' }; },
    deleteDetails: async (...a) => { calls.push(['delete', ...a]); }, uploadPoster: async (...a) => { calls.push(['poster', ...a]); return { computedHash: `0x${'ef'.repeat(32)}`, hashStatus: 'mismatch' }; }, ...client };
  const injected = { on() {}, removeListener() {} };
  const page = createBackendPage({ initialWallet: wallet, injected, createClient: () => fake, mode, chain: { connectInjectedWallet: async () => ({ address: ORG, chainId: 11155111 }) } });
  document.getElementById('app').append(page.main);
  current = { dom, page, calls };
  return current;
}
const q = (id) => document.querySelector(`[data-testid="${id}"]`);
async function click(id) { const n = q(id); assert(n, id); n.click(); await sleep(); }
function type(id, value) { const n = q(id); n.value = value; n.dispatchEvent(new window.Event('input', { bubbles: true })); }

test('menampilkan status backend dan event dari indexer, tanpa tombol edit untuk pengunjung', async () => {
  setup(); await sleep();
  assert.match(q('backend-status').textContent, /Backend terhubung/); assert.match(q('backend-status').textContent, /blok terindeks 12 dari 14/); assert.match(q('backend-status').textContent, /autentikasi: dev/);
  assert.match(q('backend-event-1').textContent, /Event 1/); assert.match(q('backend-event-1').textContent, /0.01 ETH/); assert.match(q('backend-event-1').textContent, /terjual 2\/100/);
  assert.match(q('backend-event-1').textContent, /Cocok dengan komitmen on-chain/); assert.match(q('backend-event-2').textContent, /Detail belum diisi/);
  assert.equal(q('backend-edit-1'), null); assert.equal(q('backend-edit-2'), null);
});

test('mode marketplace menampilkan alur on-chain dan anchor jelajah, tiket, serta resale', async () => {
  setup({ mode: 'marketplace' }); await sleep();
  assert.match(document.querySelector('main h1').textContent, /Jual dan beli tiket resale/);
  assert.match(document.querySelector('.integration-notice').textContent, /konfirmasi MetaMask/);
  assert.equal(document.getElementById('events'), null);
  assert.equal(document.getElementById('tickets').querySelector('h2').textContent, 'Tiket di wallet ini');
  assert.equal(document.getElementById('listings').querySelector('h2').textContent, 'Listing aktif');
});

test('halaman Event hanya menampilkan event aktif mendatang dan membedakan jadwal penjualan', async () => {
  const now = Math.floor(Date.now() / 1000);
  const cfg = { chainId: 31337, ticketAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3', marketplaceAddress: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' };
  setup({ mode: 'events', wallet: { address: BUYER, chainId: 31337 }, client: { config: async () => cfg }, events: [
    ev('1', { saleStart: now - 60, saleEnd: now + 3600, eventTime: now + 7200 }),
    ev('2', { saleStart: now + 3600, saleEnd: now + 7200, eventTime: now + 10800 }),
    ev('3', { eventTime: now - 60 }),
    ev('4', { status: 'cancelled', eventTime: now + 7200 }),
  ] });
  await sleep();
  assert(q('backend-event-1'));
  assert(q('backend-buy-1'));
  assert.match(q('backend-event-2').textContent, /Segera dibuka/);
  assert.equal(q('backend-buy-2'), null);
  assert.equal(q('backend-event-3'), null);
  assert.equal(q('backend-event-4'), null);
});

test('akun belum terdaftar tidak dapat mengirim tindakan wallet', async () => {
  const cfg = { chainId: 31337, ticketAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3', marketplaceAddress: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' };
  setup({ mode: 'events', wallet: { address: BUYER, chainId: 31337 },
    events: [ev('1', { saleStart: 0, saleEnd: 4_000_000_000, eventTime: 4_000_000_000 })],
    roles: { admin: false, organizer: false, gateCheckerEventIds: [] },
    client: { config: async () => cfg, account: async () => { throw Object.assign(Error('Akun belum terdaftar.'), { status: 404 }); } } });
  await sleep();
  assert(q('backend-register-required'));
  assert.equal(q('backend-buy-1'), null);
});

test('halaman Organizer, Gate Checker, dan Admin memisahkan akses sesuai role on-chain', async () => {
  const cfg = { chainId: 31337, ticketAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3', marketplaceAddress: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' };
  setup({ mode: 'organizer', wallet: { address: ORG, chainId: 31337 }, roles: { organizer: true }, client: { config: async () => cfg } }); await sleep();
  assert.match(document.querySelector('main h1').textContent, /Kelola event/);
  assert(q('backend-create-panel'));
  assert.equal(q('backend-event-2'), null);

  setup({ mode: 'gate', wallet: { address: BUYER, chainId: 31337 }, roles: { gateCheckerEventIds: ['2'] },
    client: { config: async () => cfg } }); await sleep();
  assert.match(document.querySelector('main h1').textContent, /Validasi tiket/);
  assert(q('backend-gate-panel'));
  assert.equal(q('backend-event-1'), null);
  assert(q('backend-event-2'));

  setup({ mode: 'admin', wallet: { address: BUYER, chainId: 31337 }, roles: { admin: true },
    client: { config: async () => cfg } }); await sleep();
  assert.match(document.querySelector('main h1').textContent, /Kelola akses dan moderasi/);
  assert(q('backend-admin-panel'));
});

test('Organizer yang rolenya dicabut tidak melihat event lama sebagai akses Organizer', async () => {
  const cfg = { chainId: 31337, ticketAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3', marketplaceAddress: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' };
  setup({ mode: 'organizer', wallet: { address: ORG, chainId: 31337 }, roles: { admin: false, organizer: false, organizerEventIds: ['1'], gateCheckerEventIds: [] }, client: { config: async () => cfg } }); await sleep();
  assert.match([...document.querySelectorAll('.notice')].map((n) => n.textContent).join(' '), /belum memiliki role Organizer/i);
  assert.match(q('backend-no-events').textContent, /Role Organizer tidak aktif/);
  assert.equal(q('backend-event-1'), null);
  assert.equal(q('backend-create-panel'), null);
});

test('backend tidak terjangkau menampilkan pesan yang jelas', async () => {
  setup({ failStatus: 'Backend tidak dapat dijangkau. Periksa VITE_API_URL.' }); await sleep();
  assert.match(q('backend-status').textContent, /Backend belum terhubung/); assert.match(q('backend-status').textContent, /VITE_API_URL/); assert.equal(q('backend-events').children.length, 0);
});

test('daftar kosong menjelaskan penyebabnya', async () => {
  setup({ events: [] }); await sleep();
  assert.match(q('backend-no-events').textContent, /indexer berjalan/);
});

test('hanya organizer pemilik event yang melihat tombol edit; role dari backend', async () => {
  setup({ wallet: { address: ORG, chainId: 31337 } }); await sleep();
  assert(q('backend-edit-1')); assert.equal(q('backend-edit-2'), null);
  assert.match(q('backend-wallet').textContent, /Organizer/);
  setup({ wallet: { address: BUYER, chainId: 31337 } }); await sleep();
  assert.equal(q('backend-edit-1'), null); assert.match(q('backend-wallet').textContent, /Pembeli/);
});

test('tombol Hubungkan wallet memuat ulang data dengan role wallet', async () => {
  setup(); await sleep(); assert.equal(q('backend-edit-1'), null);
  await click('backend-connect'); await sleep(); assert(q('backend-edit-1'));
});

test('menyimpan detail: lokasi digabung dan memakai PUT bila detail sudah ada', async () => {
  const s = setup({ wallet: { address: ORG, chainId: 31337 } }); await sleep();
  await click('backend-edit-1');
  assert.equal(q('backend-title').value, 'Event 1'); assert.equal(q('backend-venue').value, 'Gelora Bung Karno'); assert.equal(q('backend-city').value, 'Jakarta');
  type('backend-title', 'Judul Baru'); type('backend-venue', 'M Bloc Space');
  await click('backend-save'); await sleep();
  assert.deepEqual(s.calls[0], ['save', '1', { title: 'Judul Baru', description: 'Deskripsi event yang cukup panjang.', category: 'Musik', location: 'M Bloc Space, Jakarta' }, true]);
  assert.match(q('backend-hash').textContent, /updateEvent/); assert.match(q('backend-hash').textContent, /0xcdcd/);
});

test('detail event yang belum ada dibuat sebagai POST dan poster belum bisa diunggah', async () => {
  const events = [ev('3', { detailsComplete: false, hashStatus: 'missing', title: 'Event #3', computedHash: null, venue: '', city: '', description: '' })];
  const s = setup({ wallet: { address: ORG, chainId: 31337 }, events }); await sleep();
  await click('backend-edit-3');
  assert.equal(q('backend-title').value, ''); assert.equal(q('backend-upload'), null); assert.equal(q('backend-delete'), null);
  type('backend-title', 'Judul'); type('backend-description', 'Deskripsi yang cukup panjang'); type('backend-venue', 'Aula'); type('backend-city', 'Bandung');
  await click('backend-save'); await sleep();
  assert.equal(s.calls[0][3], false); assert.equal(s.calls[0][2].location, 'Aula, Bandung');
});

test('galat dari backend ditampilkan dan tidak menghapus formulir', async () => {
  setup({ wallet: { address: ORG, chainId: 31337 }, client: { saveDetails: async () => { throw Error('Judul harus 3–120 karakter.'); } } }); await sleep();
  await click('backend-edit-1'); await click('backend-save');
  assert.match(q('backend-error').textContent, /Judul harus/); assert(q('backend-editor').querySelector('form, .backend-editor'));
});

test('upload poster membutuhkan file dan memperbarui hash', async () => {
  const s = setup({ wallet: { address: ORG, chainId: 31337 } }); await sleep();
  await click('backend-edit-1'); await click('backend-upload');
  assert.match(q('backend-error').textContent, /Pilih file poster/); assert.equal(s.calls.length, 0);
  const file = new window.File([new Uint8Array([1, 2, 3])], 'poster.png', { type: 'image/png' });
  Object.defineProperty(q('backend-poster'), 'files', { value: [file], configurable: true });
  await click('backend-upload'); await sleep();
  assert.equal(s.calls[0][0], 'poster'); assert.equal(s.calls[0][1], '1'); assert.match(q('backend-hash').textContent, /Tidak cocok/);
});

test('hapus detail memanggil API lalu menutup editor', async () => {
  const s = setup({ wallet: { address: ORG, chainId: 31337 } }); await sleep();
  await click('backend-edit-1'); await click('backend-delete'); await sleep();
  assert.deepEqual(s.calls[0], ['delete', '1']); assert.equal(q('backend-title'), null);
});

test('tiket wallet dan listing resale ditampilkan dari data on-chain', async () => {
  setup({ wallet: { address: BUYER, chainId: 31337 }, tickets: [{ tokenId: '1', eventId: '1', owner: BUYER, status: 'valid', originalPrice: '10000000000000000' },
    { tokenId: '2', eventId: '1', owner: BUYER, status: 'used', originalPrice: '10000000000000000' }, { tokenId: '3', eventId: '1', owner: BUYER, status: 'burned', originalPrice: '1' }],
    listings: [{ tokenId: '1', eventId: '1', seller: BUYER, price: '11000000000000000', originalPrice: '10000000000000000', stale: false }] }); await sleep();
  assert.match(q('backend-ticket-1').textContent, /Dijual kembali/); assert.match(q('backend-ticket-1').textContent, /Resale 0.011 ETH/);
  assert.match(q('backend-ticket-2').textContent, /Tiket #2/); assert.equal(q('backend-ticket-3'), null);
  assert.match(q('backend-listing-1').textContent, /Resale 0.011 ETH/);
});

test('pergantian akun di MetaMask membersihkan editor dan memuat ulang role', async () => {
  let handler;
  current?.page.cleanup(); current?.dom.window.close();
  const dom = new JSDOM('<!doctype html><div id="app"></div><div id="toasts"></div>', { url: 'https://example.test/backend.html' });
  Object.defineProperties(globalThis, { window: { value: dom.window, configurable: true }, document: { value: dom.window.document, configurable: true }, Node: { value: dom.window.Node, configurable: true } });
  const fake = { status: async () => ({ lastBlock: 1, headBlock: 1, authMode: 'dev' }), events: async () => [ev('1')], listings: async () => [], tickets: async () => [],
    roles: async (a) => ({ address: a, admin: false, organizer: a === ORG, organizerEventIds: [], gateCheckerEventIds: [] }) };
  const page = createBackendPage({ initialWallet: { address: ORG, chainId: 1 }, injected: { on: (e, h) => { handler = h; }, removeListener() {} }, createClient: () => fake });
  document.getElementById('app').append(page.main); current = { dom, page, calls: [] }; await sleep();
  await click('backend-edit-1'); assert(q('backend-title'));
  handler([BUYER]); await sleep(30);
  assert.equal(q('backend-title'), null); assert.equal(q('backend-edit-1'), null);
});
