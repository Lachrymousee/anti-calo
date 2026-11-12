import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { syncOnce } from '../src/indexer/sync.js';
import { rebuild } from '../src/indexer/handlers.js';
import { FakeChain, emit, interfaces, addr, wallets, TICKET } from './helpers/fake-chain.js';

const config = { startBlock: 1, confirmations: 2, batchSize: 3, reorgDepth: 4 };
const run = (db, chain) => syncOnce({ db, provider: chain, interfaces, config });
const snapshot = (db) => ({
  events: db.prepare('SELECT * FROM events ORDER BY event_id').all(),
  tickets: db.prepare('SELECT * FROM tickets ORDER BY CAST(token_id AS INTEGER)').all(),
  listings: db.prepare('SELECT * FROM listings ORDER BY token_id').all(),
  sales: db.prepare('SELECT * FROM sales ORDER BY id').all(),
  roles: db.prepare('SELECT * FROM roles ORDER BY role, account').all(),
});

function seedChain() {
  const c = new FakeChain();
  emit.admin(c, 1); emit.organizerRole(c, 1);
  emit.eventCreated(c, 2); emit.assigned(c, 2);
  emit.purchased(c, 3, 1n, 1n, 3n);            // token 1..3 -> buyer
  emit.listed(c, 4, 1n, 1100n);
  emit.sold(c, 5, 1n, 1100n, 110n);            // token 1 -> buyer2
  emit.checkedIn(c, 6, 2n);
  c.head = 10;
  return c;
}

test('indexer memproyeksikan event, tiket, resale, dan check-in', async () => {
  const db = openDb(); const c = seedChain();
  const r = await run(db, c);
  assert.equal(r.processed, 8);
  const ev = db.prepare('SELECT * FROM events').get();
  assert.equal(ev.sold, 3); assert.equal(ev.checked_in, 1); assert.equal(ev.status, 'active'); assert.equal(ev.ticket_price, '1000');
  const t = Object.fromEntries(db.prepare('SELECT * FROM tickets').all().map((x) => [x.token_id, x]));
  assert.equal(t['1'].owner, addr('buyer2')); assert.equal(t['2'].status, 'used'); assert.equal(t['3'].status, 'valid');
  assert.equal(db.prepare('SELECT active FROM listings').get().active, 0);
  assert.deepEqual({ ...db.prepare('SELECT price, fee FROM sales').get() }, { price: '1100', fee: '110' });
  assert.equal(db.prepare('SELECT active FROM gate_checkers').get().active, 1);
});

test('sinkronisasi idempoten dan checkpoint mengikuti confirmations', async () => {
  const db = openDb(); const c = seedChain();
  await run(db, c);
  const before = snapshot(db);
  const again = await run(db, c);
  assert.equal(again.processed, 0);
  assert.deepEqual(snapshot(db), before);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chain_events').get().n, 8);
  assert.equal(Number(db.prepare("SELECT value FROM sync_state WHERE key='last_block'").get().value), 8); // head 10 - 2
});

test('log yang belum cukup konfirmasi tidak diproses', async () => {
  const db = openDb(); const c = new FakeChain();
  emit.admin(c, 1); emit.organizerRole(c, 1); emit.eventCreated(c, 2); c.head = 3;
  const r = await run(db, c);
  assert.equal(r.safe, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n, 0);
});

test('rebuild dari chain_events menghasilkan proyeksi yang sama', async () => {
  const db = openDb(); await run(db, seedChain());
  const before = snapshot(db);
  rebuild(db);
  assert.deepEqual(snapshot(db), before);
});

test('reorg: checkpoint mundur dan data dibangun ulang dari chain baru', async () => {
  const db = openDb(); const c = seedChain();
  await run(db, c);
  assert.equal(db.prepare('SELECT owner FROM tickets WHERE token_id = ?').get('1').owner, addr('buyer2'));
  c.reorgFrom(5);                                  // resale (blok 5) dan check-in (blok 6) hilang dari chain
  emit.checkedIn(c, 7, 3n); c.head = 10;           // chain baru: token 3 check-in
  const r = await run(db, c);
  assert.ok(r.rewound > 0);
  assert.equal(db.prepare('SELECT owner FROM tickets WHERE token_id = ?').get('1').owner, addr('buyer'));
  assert.equal(db.prepare('SELECT status FROM tickets WHERE token_id = ?').get('2').status, 'valid');
  assert.equal(db.prepare('SELECT status FROM tickets WHERE token_id = ?').get('3').status, 'used');
  assert.equal(db.prepare('SELECT checked_in FROM events').get().checked_in, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales').get().n, 0);
});

test('event yang tidak diketahui memberi pesan START_BLOCK dan membatalkan batch', async () => {
  const db = openDb(); const c = new FakeChain();
  emit.purchased(c, 1, 9n, 1n, 1n); c.head = 5;
  await assert.rejects(() => run(db, c), /START_BLOCK/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chain_events').get().n, 0);
  assert.equal(db.prepare("SELECT value FROM sync_state WHERE key='last_block'").get(), undefined);
});

test('EventUpdated dan EventCanceled memperbarui event', async () => {
  const db = openDb(); const c = new FakeChain();
  emit.organizerRole(c, 1); emit.eventCreated(c, 1);
  c.emit(TICKET, 'EventUpdated', [1n, wallets.organizer.address,
    [2000n, 100n, 4n, 1000n, 2000n, 3000n, 11000n, `0x${'ab'.repeat(32)}`]], 2);
  c.emit(TICKET, 'EventCanceled', [1n, wallets.organizer.address], 3);
  c.head = 8;
  await run(db, c);
  const ev = db.prepare('SELECT * FROM events').get();
  assert.equal(ev.ticket_price, '2000'); assert.equal(ev.details_hash, `0x${'ab'.repeat(32)}`); assert.equal(ev.status, 'canceled');
});
