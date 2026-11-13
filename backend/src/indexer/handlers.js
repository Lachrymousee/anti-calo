import { tx, PROJECTION_TABLES } from '../db.js';

export const ADMIN_ROLE = `0x${'00'.repeat(32)}`;
const ZERO = `0x${'0'.repeat(40)}`;
const low = (a) => String(a).toLowerCase();

const needEvent = (db, eventId) => {
  const row = db.prepare('SELECT * FROM events WHERE event_id = ?').get(String(eventId));
  if (!row) throw new Error(`Event ${eventId} belum terindeks. Periksa START_BLOCK (harus <= blok deployment).`);
  return row;
};
const needTicket = (db, tokenId) => {
  const row = db.prepare('SELECT * FROM tickets WHERE token_id = ?').get(String(tokenId));
  if (!row) throw new Error(`Tiket ${tokenId} belum terindeks. Periksa START_BLOCK (harus <= blok deployment).`);
  return row;
};

const writeParams = (db, eventId, p, block) =>
  db.prepare(`UPDATE events SET ticket_price=?, max_supply=?, max_per_wallet=?, sale_start=?, sale_end=?,
    event_time=?, resale_cap_bps=?, details_hash=?, updated_block=? WHERE event_id=?`)
    .run(p.ticketPrice, Number(p.maxSupply), Number(p.maxPerWallet), Number(p.saleStart), Number(p.saleEnd),
      Number(p.eventTime), Number(p.resaleCapBps), low(p.detailsHash), block, eventId);

// Setiap handler menerima (db, args, meta) dan hanya mengubah tabel proyeksi.
const HANDLERS = {
  RoleGranted(db, a) {
    db.prepare(`INSERT INTO roles (role, account, active) VALUES (?, ?, 1)
      ON CONFLICT(role, account) DO UPDATE SET active = 1`).run(low(a.role), low(a.account));
  },
  RoleRevoked(db, a) {
    db.prepare(`INSERT INTO roles (role, account, active) VALUES (?, ?, 0)
      ON CONFLICT(role, account) DO UPDATE SET active = 0`).run(low(a.role), low(a.account));
  },
  EventCreated(db, a, m) {
    const p = a.params;
    db.prepare(`INSERT INTO events (event_id, organizer, ticket_price, max_supply, max_per_wallet, sale_start, sale_end,
      event_time, resale_cap_bps, details_hash, status, created_block, updated_block)
      VALUES (?, ?, '0', 0, 0, 0, 0, 0, 0, '', 'active', ?, ?)`).run(String(a.eventId), low(a.organizer), m.blockNumber, m.blockNumber);
    writeParams(db, String(a.eventId), p, m.blockNumber);
  },
  EventUpdated(db, a, m) {
    needEvent(db, a.eventId);
    writeParams(db, String(a.eventId), a.params, m.blockNumber);
  },
  EventCanceled(db, a, m) {
    needEvent(db, a.eventId);
    db.prepare(`UPDATE events SET status='canceled', updated_block=? WHERE event_id=?`).run(m.blockNumber, String(a.eventId));
  },
  TicketPurchased(db, a, m, id) {
    const ev = needEvent(db, a.eventId);
    const qty = Number(a.quantity);
    const first = BigInt(a.firstTokenId);
    const ins = db.prepare(`INSERT INTO tickets (token_id, event_id, owner, status, original_price) VALUES (?, ?, ?, 'valid', ?)`);
    for (let i = 0n; i < BigInt(qty); i += 1n) ins.run((first + i).toString(), String(a.eventId), low(a.buyer), ev.ticket_price);
    db.prepare('UPDATE events SET sold = sold + ?, updated_block = ? WHERE event_id = ?').run(qty, m.blockNumber, String(a.eventId));
    db.prepare(`INSERT INTO purchases (id, event_id, buyer, first_token_id, quantity, total_paid, block_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, String(a.eventId), low(a.buyer), String(a.firstTokenId), qty, a.totalPaid, m.blockNumber);
  },
  TicketCheckedIn(db, a, m) {
    const t = needTicket(db, a.tokenId);
    if (t.status === 'used') return; // log ganda tidak boleh menambah penghitung
    db.prepare(`UPDATE tickets SET status='used', checked_in_by=?, checked_in_block=? WHERE token_id=?`)
      .run(low(a.checker), m.blockNumber, String(a.tokenId));
    db.prepare('UPDATE events SET checked_in = checked_in + 1, updated_block = ? WHERE event_id = ?').run(m.blockNumber, String(a.eventId));
  },
  TicketRevoked(db, a) {
    needTicket(db, a.tokenId);
    db.prepare(`UPDATE tickets SET status='revoked' WHERE token_id=?`).run(String(a.tokenId));
  },
  RefundClaimed(db, a) {
    needTicket(db, a.tokenId);
    db.prepare(`UPDATE tickets SET status='burned', owner=? WHERE token_id=?`).run(ZERO, String(a.tokenId));
  },
  GateCheckerAssigned(db, a) {
    db.prepare(`INSERT INTO gate_checkers (event_id, checker, active) VALUES (?, ?, 1)
      ON CONFLICT(event_id, checker) DO UPDATE SET active = 1`).run(String(a.eventId), low(a.checker));
  },
  GateCheckerRemoved(db, a) {
    db.prepare(`INSERT INTO gate_checkers (event_id, checker, active) VALUES (?, ?, 0)
      ON CONFLICT(event_id, checker) DO UPDATE SET active = 0`).run(String(a.eventId), low(a.checker));
  },
  Listed(db, a, m) {
    needTicket(db, a.tokenId);
    db.prepare(`INSERT INTO listings (token_id, event_id, seller, price, active, updated_block) VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(token_id) DO UPDATE SET event_id=excluded.event_id, seller=excluded.seller, price=excluded.price,
      active=1, updated_block=excluded.updated_block`).run(String(a.tokenId), String(a.eventId), low(a.seller), a.price, m.blockNumber);
  },
  ListingCanceled(db, a, m) {
    db.prepare('UPDATE listings SET active = 0, updated_block = ? WHERE token_id = ?').run(m.blockNumber, String(a.tokenId));
  },
  Sold(db, a, m, id) {
    needTicket(db, a.tokenId);
    db.prepare('UPDATE listings SET active = 0, updated_block = ? WHERE token_id = ?').run(m.blockNumber, String(a.tokenId));
    db.prepare('UPDATE tickets SET owner = ? WHERE token_id = ?').run(low(a.buyer), String(a.tokenId));
    db.prepare(`INSERT INTO sales (id, token_id, event_id, buyer, seller, price, fee, block_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, String(a.tokenId), String(a.eventId), low(a.buyer), low(a.seller), a.price, a.fee, m.blockNumber);
  },
};

// Dicatat di chain_events untuk jejak audit, tanpa proyeksi.
const AUDIT_ONLY = new Set(['RevenueWithdrawn', 'ResaleFeeReceived', 'ProceedsWithdrawn']);

export const isTracked = (name) => name in HANDLERS || AUDIT_ONLY.has(name);

function project(db, ev) {
  const handler = HANDLERS[ev.name];
  if (handler) handler(db, ev.args, { blockNumber: ev.blockNumber }, ev.id);
}

// Dipanggil di dalam transaksi pemanggil. Idempoten: log yang sudah ada dilewati.
export function insertAndProject(db, ev) {
  const r = db.prepare(`INSERT OR IGNORE INTO chain_events (id, block_number, log_index, tx_hash, block_hash, contract, name, args)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(ev.id, ev.blockNumber, ev.logIndex, ev.txHash, ev.blockHash ?? null, low(ev.contract), ev.name, JSON.stringify(ev.args));
  if (r.changes === 0) return false;
  project(db, ev);
  return true;
}

export function applyEvents(db, events) {
  const sorted = [...events].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  return tx(db, () => sorted.reduce((n, e) => n + (insertAndProject(db, e) ? 1 : 0), 0));
}

const fromRow = (r) => ({ id: r.id, blockNumber: r.block_number, logIndex: r.log_index, txHash: r.tx_hash,
  blockHash: r.block_hash, contract: r.contract, name: r.name, args: JSON.parse(r.args) });

// Membangun ulang semua tabel proyeksi dari chain_events. Data off-chain tidak disentuh.
export function rebuild(db) {
  return tx(db, () => {
    for (const t of PROJECTION_TABLES) db.exec(`DELETE FROM ${t}`);
    const rows = db.prepare('SELECT * FROM chain_events ORDER BY block_number, log_index').all();
    for (const r of rows) project(db, fromRow(r));
    return rows.length;
  });
}

// Menangani reorg: buang log pada blok > blockNumber lalu bangun ulang proyeksi.
export function rewindTo(db, blockNumber) {
  return tx(db, () => {
    const r = db.prepare('DELETE FROM chain_events WHERE block_number > ?').run(blockNumber);
    for (const t of PROJECTION_TABLES) db.exec(`DELETE FROM ${t}`);
    const rows = db.prepare('SELECT * FROM chain_events ORDER BY block_number, log_index').all();
    for (const row of rows) project(db, fromRow(row));
    return Number(r.changes);
  });
}
