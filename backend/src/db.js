import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// Tabel chain_events adalah log mentah (sumber kebenaran lokal). Tabel proyeksi lain dapat
// dibangun ulang dari chain_events kapan saja (lihat rebuild() di indexer/handlers.js).
// Nilai uint256 disimpan sebagai TEXT (wei) agar tidak kehilangan presisi.
export const PROJECTION_TABLES = ['roles', 'events', 'gate_checkers', 'tickets', 'purchases', 'listings', 'sales'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS chain_events (
  id TEXT PRIMARY KEY,
  block_number INTEGER NOT NULL,
  log_index INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  block_hash TEXT,
  contract TEXT NOT NULL,
  name TEXT NOT NULL,
  args TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chain_events_order ON chain_events(block_number, log_index);

CREATE TABLE IF NOT EXISTS roles (
  role TEXT NOT NULL, account TEXT NOT NULL, active INTEGER NOT NULL,
  PRIMARY KEY (role, account)
);

CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  organizer TEXT NOT NULL,
  ticket_price TEXT NOT NULL,
  max_supply INTEGER NOT NULL,
  max_per_wallet INTEGER NOT NULL,
  sale_start INTEGER NOT NULL,
  sale_end INTEGER NOT NULL,
  event_time INTEGER NOT NULL,
  resale_cap_bps INTEGER NOT NULL,
  details_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  sold INTEGER NOT NULL DEFAULT 0,
  checked_in INTEGER NOT NULL DEFAULT 0,
  created_block INTEGER NOT NULL,
  updated_block INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer);

CREATE TABLE IF NOT EXISTS gate_checkers (
  event_id TEXT NOT NULL, checker TEXT NOT NULL, active INTEGER NOT NULL,
  PRIMARY KEY (event_id, checker)
);

CREATE TABLE IF NOT EXISTS tickets (
  token_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  status TEXT NOT NULL,
  original_price TEXT NOT NULL,
  checked_in_by TEXT,
  checked_in_block INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tickets_owner ON tickets(owner);
CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY, event_id TEXT NOT NULL, buyer TEXT NOT NULL,
  first_token_id TEXT NOT NULL, quantity INTEGER NOT NULL, total_paid TEXT NOT NULL, block_number INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_purchases_event ON purchases(event_id);

CREATE TABLE IF NOT EXISTS listings (
  token_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, seller TEXT NOT NULL,
  price TEXT NOT NULL, active INTEGER NOT NULL, updated_block INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listings_event ON listings(event_id);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY, token_id TEXT NOT NULL, event_id TEXT NOT NULL,
  buyer TEXT NOT NULL, seller TEXT NOT NULL, price TEXT NOT NULL, fee TEXT NOT NULL, block_number INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_event ON sales(event_id);

-- Data off-chain (CRUD melalui API). Bukan proyeksi blockchain; tidak ikut dihapus saat rebuild.
CREATE TABLE IF NOT EXISTS event_details (
  event_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  location TEXT NOT NULL,
  poster_file TEXT,
  poster_sha256 TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
`;

export function openDb(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const getState = (db, key) => db.prepare('SELECT value FROM sync_state WHERE key = ?').get(key)?.value ?? null;
export const setState = (db, key, value) =>
  db.prepare('INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
