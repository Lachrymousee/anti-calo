# anti-calo — Backend Data, Indexer, dan REST API

Modul ini melengkapi kontrak `TicketNFT` dan `Marketplace` dengan sisi **off-chain**:

| Bagian | Fungsi |
| ------ | ------ |
| CRUD off-chain | Detail event (judul, deskripsi, kategori, lokasi) dan upload poster, disimpan di SQLite. |
| Indexer | Membaca event kontrak, menyimpannya ke database sebagai proyeksi, menangani reorg. |
| REST API | Event, tiket, listing resale, laporan penjualan, dan role untuk frontend. |
| Tes | Unit indexer, integrasi API, dan E2E dengan kontrak asli (beli, resale, check-in, per role). |

Blockchain tetap menjadi **sumber kebenaran** untuk event inti, kepemilikan, status tiket, role, dan listing.
Database hanya salinan (proyeksi) yang dapat dibangun ulang dari `chain_events`. Hanya `event_details`
(data off-chain) yang tidak berasal dari blockchain.

## Prasyarat

- Node.js 22.13 atau lebih baru (baseline proyek: Node.js 24). Database memakai `node:sqlite` bawaan Node, tanpa
  instalasi native. Node akan menampilkan peringatan "ExperimentalWarning: SQLite"; itu normal.
- Untuk tes E2E: `npm ci` di folder `blockchain/` (Hardhat dan OpenZeppelin).

## Menjalankan

```
cd backend
npm ci
cp .env.example .env        # Windows: copy .env.example .env
npm start                   # membaca .env otomatis
```

Untuk data contoh di node Hardhat lokal, lihat bagian 1 panduan deployment (`npm run seed:chain`, `npm run seed:details`).

Tanpa `RPC_URL` dan alamat kontrak, API tetap berjalan tetapi indexer tidak aktif (data event kosong).
Untuk mengaktifkan indexer, isi `RPC_URL`, `TICKET_NFT_ADDRESS`, `MARKETPLACE_ADDRESS`, dan `START_BLOCK`
(blok deployment `TicketNFT`; nilai terlalu besar membuat indexer berhenti dengan pesan yang menyebut START_BLOCK).
Indexer juga dapat dijalankan sendiri: `npm run indexer`.

Panduan lengkap (lokal, Sepolia, produksi, backup): [`docs/PANDUAN-DEPLOYMENT.md`](../docs/PANDUAN-DEPLOYMENT.md).

### Variabel environment

| Nama | Default | Keterangan |
| ---- | ------- | ---------- |
| `PORT` | `3001` | Port API. |
| `DB_FILE` | `./data/anti-calo.db` | File SQLite. |
| `UPLOAD_DIR` | `./data/uploads` | Folder poster. |
| `MAX_POSTER_BYTES` | `2097152` | Batas ukuran poster (2 MB). |
| `CORS_ORIGINS` | `http://localhost:5173` | Origin frontend yang diizinkan, pisahkan dengan koma. |
| `AUTH_MODE` | `dev` (`signature` di production) | Lihat bagian Autentikasi. `dev` ditolak jika `NODE_ENV=production`. |
| `AUTH_TTL_SECONDS` | `300` | Masa berlaku tanda tangan. |
| `RPC_URL`, `CHAIN_ID` | kosong, `11155111` | RPC dan chain yang dibaca indexer. Indexer menolak start jika chain RPC berbeda. |
| `TICKET_NFT_ADDRESS`, `MARKETPLACE_ADDRESS` | kosong | Alamat kontrak. |
| `START_BLOCK` | `0` | Blok awal pembacaan (blok deployment). |
| `CONFIRMATIONS` | `3` | Hanya blok sampai `head - CONFIRMATIONS` yang diproses. |
| `BATCH_SIZE` | `2000` | Rentang blok per `getLogs` (kecilkan jika RPC membatasi). |
| `POLL_INTERVAL_MS` | `5000` | Jeda antar putaran sinkronisasi. |
| `REORG_DEPTH` | `12` | Jumlah blok yang diulang saat reorg terdeteksi. |

## Alur Organizer (on-chain dan off-chain)

`EventParams.detailsHash` di kontrak menjadi komitmen terhadap data off-chain, sehingga pembeli dapat memeriksa
bahwa deskripsi/poster tidak diubah diam-diam.

1. `POST /api/details/hash` dengan detail event, lalu pakai `detailsHash` pada `createEvent` / `updateEvent` di kontrak.
2. Setelah transaksi terindeks, `POST /api/events/:id/details` untuk menyimpan detail.
3. (Opsional) `POST /api/events/:id/poster`. Poster ikut dalam hash, sehingga hash berubah. Ambil `computedHash`
   terbaru dari respons, lalu panggil `updateEvent` (diizinkan setelah tiket terjual selama harga, supply, cap resale,
   dan waktu event tidak diubah).
4. `GET /api/events/:id` menampilkan `details.hashStatus`: `match`, `mismatch`, atau `unset` (hash on-chain nol).

Rumus hash: `keccak256(utf8(JSON.stringify({ v: 1, title, description, category, location, posterSha256 })))` dengan
urutan key persis seperti itu dan `posterSha256` berupa sha256 isi file (hex) atau `""` bila belum ada poster.

## Endpoint

Semua respons JSON. Nilai uint256 (wei, token ID, event ID) dikirim sebagai **string**. Alamat berhuruf kecil.
Kesalahan berbentuk `{ "error": "<kode>", "message": "<pesan>" }`.

| Method dan path | Akses | Keterangan |
| --------------- | ----- | ---------- |
| `GET /api/health` | publik | Pemeriksaan hidup. |
| `GET /api/status` | publik | Blok terakhir terindeks, head, waktu pembaruan. |
| `GET /api/categories` | publik | Daftar kategori yang diizinkan. |
| `GET /api/roles/:address` | publik | `admin`, `organizer`, event yang dimiliki, event penugasan Gate Checker. |
| `POST /api/details/hash` | publik | Hitung `detailsHash` dari detail event. |
| `GET /api/events` | publik | Query: `category`, `status`, `organizer`, `q`, `page`, `limit` (maks 100). |
| `GET /api/events/:id` | publik | Data on-chain + detail off-chain + Gate Checker aktif. |
| `GET /api/events/:id/details` | publik | Detail off-chain. 404 jika belum dibuat/dihapus. |
| `POST /api/events/:id/details` | Organizer pemilik event | Create (409 bila sudah ada). |
| `PUT /api/events/:id/details` | Organizer pemilik event | Update (replace penuh). |
| `DELETE /api/events/:id/details` | Organizer pemilik event atau Admin | Soft delete. Riwayat blockchain tidak berubah. |
| `POST /api/events/:id/poster` | Organizer pemilik event | `multipart/form-data`, field `poster` (PNG/JPEG/WebP). |
| `GET /uploads/<file>` | publik | Poster. |
| `GET /api/tickets` | publik | Query: `owner`, `eventId`, `status` (`valid`, `used`, `revoked`, `burned`). |
| `GET /api/tickets/:tokenId` | publik | Tiket + listing aktif. |
| `GET /api/listings` | publik | Query: `eventId`, `seller`, `buyable=1`. Tiap item punya `stale`. |
| `GET /api/events/:id/report` | Organizer pemilik event atau Admin | Terjual, check-in, pendapatan primer, volume dan fee resale. |

Admin sengaja tidak dapat membuat atau mengubah isi event (sesuai matriks role), hanya melakukan moderasi
(soft delete). Pemilik event berarti `organizer` tercatat on-chain **dan** masih memegang `ORGANIZER_ROLE`; jika role
dicabut di kontrak, izin edit di API ikut hilang setelah indexer menyinkronkan `RoleRevoked`.

`stale: true` pada listing berarti kontrak akan menolak pembelian (tiket tidak valid, event dibatalkan atau sudah
mulai, atau pemilik berubah). Gunakan `buyable=1` untuk menyaringnya.

## Autentikasi

Backend tidak menyimpan sesi dan tidak membutuhkan private key. Mode `signature` memakai tanda tangan wallet
(EIP-191 `personal_sign`) pada **setiap request yang mengubah data**:

```js
const body = JSON.stringify(details);
const sha = sha256(toUtf8Bytes(body)).slice(2);                  // ethers; tanpa 0x
const ts = Math.floor(Date.now() / 1000);
const path = '/api/events/1/details';                            // tanpa query string
const message = `anti-calo-auth\nmethod:PUT\npath:${path}\ntimestamp:${ts}\ncontent-sha256:${sha}`;
const signature = await signer.signMessage(message);
await fetch(`${API}${path}`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', 'x-content-sha256': sha,
             Authorization: `AntiCalo ${await signer.getAddress()}:${ts}:${signature}` },
  body,                                                          // kirim string yang sama persis
});
```

- Untuk `DELETE` dan `GET` tanpa body, `content-sha256` pada pesan diisi `-` dan header `x-content-sha256` tidak dikirim.
- Untuk upload poster, `x-content-sha256` adalah sha256 isi file.
- Tanda tangan terikat ke method, path, waktu, dan isi body; berlaku `AUTH_TTL_SECONDS` dan tidak dapat dipakai dua kali.
- `AUTH_MODE=dev` hanya untuk lokal: identitas dibaca dari header `x-wallet-address` tanpa bukti kepemilikan.
- Ini adalah penyederhanaan sementara sebelum SIWE/sesi (pekerjaan Anggota 3). Antarmukanya terpusat di `src/api/auth.js`
  (`req.wallet`), sehingga dapat diganti tanpa mengubah rute.

## Indexer

- Membaca log `TicketNFT` dan `Marketplace` sampai `head - CONFIRMATIONS`, per batch, dalam satu transaksi database
  bersama checkpoint (nomor dan hash blok). Pembacaan idempoten: id log = `txHash:logIndex`.
- Reorg: bila hash blok checkpoint berubah, indexer mundur `REORG_DEPTH` blok, membuang log setelahnya, membangun
  ulang proyeksi dari `chain_events`, lalu membaca ulang chain baru.
- Event yang diindeks: `RoleGranted/Revoked`, `EventCreated/Updated/Canceled`, `TicketPurchased`, `TicketCheckedIn`,
  `TicketRevoked`, `RefundClaimed`, `GateCheckerAssigned/Removed`, `Listed`, `ListingCanceled`, `Sold`. Penarikan dana
  (`RevenueWithdrawn`, `ResaleFeeReceived`, `ProceedsWithdrawn`) dicatat di `chain_events` tanpa proyeksi.
- Bila sebuah event menunjuk data yang belum terindeks (biasanya `START_BLOCK` terlalu besar), batch dibatalkan dan
  indexer mencoba lagi dengan backoff. Perbaiki `START_BLOCK`, hapus `DB_FILE`, lalu jalankan ulang.
- Membangun ulang proyeksi tanpa RPC: `rebuild(db)` di `src/indexer/handlers.js`.

## Skema Database

`chain_events` (log mentah), proyeksi (`roles`, `events`, `gate_checkers`, `tickets`, `purchases`, `listings`, `sales`),
`event_details` (off-chain), dan `sync_state` (checkpoint). Definisi lengkap ada di `src/db.js`.

## Keamanan

- Query SQL memakai parameter terikat; teks dari pengguna tidak pernah disambung ke SQL.
- Poster: tipe ditentukan dari isi file (PNG/JPEG/WebP), SVG ditolak, ukuran dibatasi, nama file dibuat server
  (`<eventId>-<sha256[:16]>.<ext>`), dan file disajikan dengan `X-Content-Type-Options: nosniff`.
- Otorisasi dilakukan di server berdasarkan role hasil indexer, bukan berdasarkan klaim frontend.
- Cache anti-replay tanda tangan berada di memori proses. Untuk lebih dari satu instance, pindahkan ke penyimpanan bersama.
- Belum ada rate limiting dan TLS di aplikasi; pasang di reverse proxy (lihat panduan deployment).
- Data off-chain tidak memuat data pribadi. Profil pengguna belum termasuk modul ini.

## Pengujian

```
npm test           # unit indexer + integrasi API (cepat, tanpa blockchain)
npm run test:e2e   # kontrak asli di node Hardhat lokal -> indexer -> API (butuh npm ci di blockchain/)
```

Cakupan E2E: deploy, pemberian role, `createEvent` dengan `detailsHash` dari API, pembelian dan batas per wallet,
resale (di atas cap ditolak, transfer langsung ditolak, fee organizer), penugasan Gate Checker, check-in sekali
(double check-in dan non-petugas ditolak), laporan per role, pembatalan event (listing basi), pencabutan
`ORGANIZER_ROLE`, dan indexer kedua dari nol menghasilkan proyeksi identik. Kontrak dikompilasi dengan `solc-js`
(`test-support/compile.mjs`) memakai pengaturan yang sama seperti `blockchain/hardhat.config.js`.

Belum diuji: Sepolia sungguhan, hosting publik, dan integrasi dengan frontend (masih memakai state demo).
