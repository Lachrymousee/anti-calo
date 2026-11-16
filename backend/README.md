# Backend dan indexer

Backend menyediakan REST API, SQLite untuk detail/poster event, dan indexer `TicketNFT`/`Marketplace`. Data kontrak adalah sumber kebenaran; tabel proyeksi dapat dibangun ulang dari `chain_events`. Detail off-chain tidak dapat dipulihkan dari blockchain.

## Menjalankan

Perlu Node.js 22.13+ (disarankan 24). Dari folder `backend/`:

```powershell
npm ci
Copy-Item .env.example .env
npm start
```

Tanpa RPC/alamat kontrak, API aktif tetapi indexer tidak berjalan. Atur `RPC_URL`, `CHAIN_ID`, alamat TicketNFT/Marketplace, dan `START_BLOCK`. Jalankan indexer terpisah dengan `npm run indexer`. Setup Docker/Sepolia/Hardhat ada di [panduan deployment](../docs/PANDUAN-DEPLOYMENT.md).

## Environment

| Variabel | Default | Fungsi |
| --- | --- | --- |
| `PORT` | `3001` | Port API. |
| `DB_FILE`, `UPLOAD_DIR` | `./data/anti-calo.db`, `./data/uploads` | Lokasi database dan poster. |
| `CORS_ORIGINS` | `http://localhost:5173` | Origin frontend, pisahkan dengan koma. |
| `AUTH_MODE` | `dev` lokal; `signature` production | `dev` ditolak pada production. |
| `AUTH_TTL_SECONDS` | `300` | Masa berlaku signature. |
| `RPC_URL`, `CHAIN_ID` | kosong, `11155111` | RPC dan chain untuk indexer. |
| `TICKET_NFT_ADDRESS`, `MARKETPLACE_ADDRESS` | kosong | Alamat kontrak yang diindeks. |
| `START_BLOCK`, `CONFIRMATIONS` | `0`, `3` | Blok awal dan konfirmasi yang ditunggu. |
| `BATCH_SIZE`, `POLL_INTERVAL_MS`, `REORG_DEPTH` | `2000`, `5000`, `12` | Ukuran query, interval polling (ms), kedalaman pemeriksaan reorg. |
| `MAX_POSTER_BYTES` | `2097152` | Batas upload poster (2 MB). |

Indexer menolak RPC dengan chain ID berbeda. Jika `START_BLOCK` melewati event yang diperlukan, sinkronisasi gagal; betulkan blok awal dan gunakan database baru.

## API

Semua respons JSON. Nilai uint256 dikirim sebagai string; alamat lowercase. Error berbentuk `{ "error": "...", "message": "..." }`.

| Endpoint | Fungsi/akses |
| --- | --- |
| `GET /api/health`, `/api/status`, `/api/config`, `/api/categories` | Health, progres indexer, konfigurasi chain, kategori. |
| `GET /api/auth/challenge/:address`, `POST /api/auth/login` | Tantangan sekali pakai dan login tanda tangan MetaMask. |
| `GET /api/accounts/:address`, `PUT /api/accounts/:address` | Baca profil publik; pemilik wallet dapat membuat atau mengubah nama dengan signature. |
| `GET /api/roles/:address` | Role, event milik, dan penugasan checker. |
| `GET /api/events`, `/api/events/:id` | Daftar (filter `category`, `status`, `organizer`, `q`, `page`, `limit`) dan detail gabungan on/off-chain. |
| `GET /api/events/:id/details` | Detail off-chain. |
| `POST /api/details/hash` | Hitung hash komitmen detail. |
| `POST`, `PUT`, `DELETE /api/events/:id/details` | Organizer pemilik; Admin boleh soft-delete. |
| `POST /api/events/:id/poster` | Organizer pemilik; satu gambar PNG/JPEG/WebP. |
| `GET /uploads/:file` | Ambil poster. |
| `GET /api/tickets`, `/api/tickets/:tokenId` | Cari tiket (filter `owner`, `eventId`, `status`) dan listing tiket. |
| `GET /api/listings` | Listing (filter `eventId`, `seller`, `buyable=1`). |
| `GET /api/events/:id/report` | Laporan untuk Organizer pemilik atau Admin. |

Admin tidak mengubah isi event. Tindakan Organizer memerlukan event tercatat atas alamatnya dan role `ORGANIZER_ROLE` masih aktif. `buyable=1` menyaring listing basi (tiket tidak valid, event batal/mulai, atau pemilik berubah).

## Detail dan autentikasi

`detailsHash` adalah `keccak256(utf8(JSON.stringify({ v: 1, title, description, category, location, posterSha256 })))`; urutan key tetap, dan `posterSha256` berupa SHA-256 file atau string kosong. Simpan detail, lalu cocokan `computedHash` dengan `detailsHash` on-chain. Perubahan poster mengubah hash.

`AUTH_MODE=signature` menandatangani setiap mutasi memakai EIP-191. Pesan:

```text
anti-calo-auth
method:<METHOD>
path:<path tanpa query>
timestamp:<unix detik>
content-sha256:<hash body/file atau ->
```

Header `Authorization: AntiCalo <address>:<timestamp>:<signature>`; untuk body, sertakan `x-content-sha256`. Hash harus cocok dengan payload persis. Signature berlaku `AUTH_TTL_SECONDS` dan tidak dapat dipakai ulang. `AUTH_MODE=dev` memakai `x-wallet-address` tanpa bukti kepemilikan dan hanya untuk lokal. Backend tidak menyimpan private key atau sesi.

## Indexer dan keamanan

Indexer memproses log sampai `head - CONFIRMATIONS` per batch, menyimpan checkpoint nomor/hash blok, dan mengidentifikasi log dengan `txHash:logIndex`. Saat reorg, ia menghapus log sesudah checkpoint aman dan membangun ulang proyeksi dari `chain_events`. Event penarikan dicatat sebagai log mentah; data detail tetap terpisah.

Query SQL memakai parameter. Upload memeriksa magic bytes, menolak SVG, membatasi ukuran, dan membuat nama file di server. Otorisasi diperiksa di backend berdasarkan data terindeks. Anti-replay disimpan di memori; jalankan satu instance. TLS dan rate limiting perlu disediakan reverse proxy.

## Tes

```powershell
npm test
npm run test:e2e
```

E2E memakai kontrak asli di Hardhat lokal, bukan Sepolia. Perlu dependency `blockchain/` terpasang (`cd ../blockchain; npm ci`). API health/status dan batas fitur integrasi dapat diperiksa melalui [panduan deployment](../docs/PANDUAN-DEPLOYMENT.md).
