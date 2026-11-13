# Panduan Deployment Backend anti-calo

Panduan ini untuk modul `backend/` (API, database, indexer). Frontend (`npm run build` di root) tetap di-deploy
terpisah; workflow GitHub Pages yang ada hanya menerbitkan frontend dari branch `main`.

## 1. Lokal dengan node Hardhat (tanpa Sepolia)

Gunakan tiga terminal. Repo ini belum memiliki script deploy, jadi `backend/scripts/seed-local.mjs` menyediakannya
khusus untuk node lokal (memakai akun Hardhat bawaan yang kuncinya publik; jangan dipakai di jaringan sungguhan).

1. **Terminal 1, node blockchain lokal** (dari folder `blockchain/`, setelah `npm ci`). Biarkan tetap berjalan:
   ```
   npx hardhat node
   ```
   Perintah ini mengompilasi kontrak lebih dulu dan memerlukan akses internet ke binaries.soliditylang.org.
2. **Terminal 2, isi data contoh** (dari folder `backend/`):
   ```
   npm ci
   npm run seed:chain
   ```
   Script ini men-deploy `TicketNFT` dan `Marketplace`, memberi `ORGANIZER_ROLE` dan `MARKETPLACE_ROLE`, membuat 2 event,
   membeli 2 tiket, membuat 1 listing resale, menugaskan 1 Gate Checker, dan menulis `backend/.env` otomatis
   (alamat kontrak, `START_BLOCK`, `CONFIRMATIONS=0`). Bila node tidak di `127.0.0.1:8545`, set `RPC_URL` lebih dulu.
3. **Terminal 2, jalankan backend:**
   ```
   npm start
   ```
   `npm start` membaca `.env` otomatis (Node 22.9 atau lebih baru). Tunggu sampai muncul `[indexer] blok ... event baru`.
4. **Terminal 3, simpan detail off-chain** (dari folder `backend/`, backend harus sudah jalan):
   ```
   npm run seed:details
   ```
5. **Lihat hasilnya** di browser:
   - `http://localhost:3001/api/events` (2 event; event 1 ber-`hashStatus: match`, event 2 `unset`)
   - `http://localhost:3001/api/listings?buyable=1` (1 listing resale)
   - `http://localhost:3001/api/tickets` (2 tiket)

Mengulang dari awal: hentikan semua terminal, hapus folder `backend/data`, lalu mulai lagi dari langkah 1
(node Hardhat baru selalu kosong).

Mode `AUTH_MODE=dev` cukup untuk pengembangan lokal. Untuk menguji seluruh alur otomatis tanpa node manual, jalankan `npm run test:e2e`.

## 1b. Menyambungkan frontend (Lab Backend)

Halaman `backend.html` memakai wallet dan kontrak asli: membaca event, tiket, dan listing dari backend, serta
mengirim transaksi (beli tiket, resale, check-in, refund, penarikan dana, pengelolaan role). Organizer juga dapat
menyimpan detail dan poster event. Halaman lain di website (Jelajahi, Tiket saya, dashboard) masih mode demo.

**Persiapan**

1. Buat file `.env` di **root repo** (bukan di `backend/`):
   ```
   VITE_API_URL=http://localhost:3001
   ```
   Tanpa nilai ini fitur backend nonaktif dan website berjalan persis seperti sebelumnya. Nilainya publik
   (tertanam di hasil build); jangan memasukkan rahasia.
2. Backend harus berjalan dengan alamat kontrak terisi (bagian 1). Frontend mengambil alamat kontrak dan Chain ID dari
   `GET /api/config`, jadi tidak perlu dikonfigurasi dua kali.
3. `CORS_ORIGINS` di `backend/.env` harus memuat alamat frontend persis seperti di address bar, misalnya
   `http://localhost:5173`. Bila membuka lewat `127.0.0.1` atau IP jaringan, tambahkan juga (pisahkan dengan koma),
   lalu restart backend.
4. Dari root repo: `npm install`, `npm run dev`, lalu buka `http://localhost:5173/anti-calo/backend.html`
   (menu **Lab Backend** muncul setelah `VITE_API_URL` terisi; restart `npm run dev` setelah mengubah `.env`).

**MetaMask untuk node Hardhat lokal**

1. Tambahkan jaringan: RPC `http://127.0.0.1:8545`, Chain ID `31337`, simbol `ETH`.
2. Impor akun Hardhat lewat *Import account* memakai private key dari log `npx hardhat node` (kunci ini publik; **hanya
   untuk node lokal**, jangan pernah mengirim dana sungguhan ke alamat ini).

   | Akun | Alamat | Peran pada data contoh `seed:chain` |
   | ---- | ------ | ------------------------------------ |
   | #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Admin |
   | #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Organizer (pemilik event 1 dan 2) |
   | #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | Pembeli (punya 2 tiket, 1 listing resale) |
   | #3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | Gate Checker event 1 |

3. Setiap kali node Hardhat dimulai ulang, hapus cache MetaMask agar nonce tidak salah: *Settings, Advanced,
   Clear activity tab data*. Tanpa ini transaksi gagal dengan galat nonce.

**Yang dapat dicoba per akun**

- Pembeli (#2): **Beli tiket**, **Jual kembali** (harga dibatasi cap resale), **Batalkan listing**, **Klaim refund**,
  **Beli** pada listing orang lain, **Tarik hasil resale**.
- Organizer (#1): **Buat event baru**, **Isi/Edit detail** dan poster, **Kunci hash on-chain**, **Tugaskan/Cabut**
  Gate Checker, **Batalkan event**, **Tarik dana** (setelah event dimulai).
- Gate Checker (#3): **Check-in tiket** (ID tiket dimasukkan manual; verifikasi QR ada di Lab Integrasi).
- Admin (#0): **Beri/Cabut role Organizer**, **Cabut tiket**, batalkan event.

Setiap aksi disimulasikan dulu; bila kontrak akan menolaknya, pesan penyebabnya muncul sebelum MetaMask meminta
persetujuan. Setelah transaksi terkonfirmasi, halaman menunggu indexer menyusul lalu memuat ulang data (di Sepolia
dengan `CONFIRMATIONS=3` ini dapat memakan beberapa puluh detik).

Pada `AUTH_MODE=dev` penyimpanan detail event tidak meminta tanda tangan. Pada `AUTH_MODE=signature` MetaMask meminta
satu tanda tangan pesan (bukan transaksi, tanpa biaya) untuk setiap penyimpanan, unggahan, atau penghapusan detail.

**Batasan**: pembelian dan check-in di halaman demo lain belum memakai kontrak; check-in belum memverifikasi QR
EIP-712 sebelum transaksi; belum ada pengujian di browser dengan MetaMask sungguhan dan di Sepolia.

## 2. Sepolia

1. Siapkan RPC Sepolia (penyedia RPC pilihan tim). Backend hanya membaca; **tidak memerlukan private key**.
2. Isi `.env`: `CHAIN_ID=11155111`, `RPC_URL`, `TICKET_NFT_ADDRESS`, `MARKETPLACE_ADDRESS`, dan
   `START_BLOCK` = blok deployment `TicketNFT` (lihat `shared/deployments/` bila sudah dicatat tim).
   Biarkan `CONFIRMATIONS=3`. Jika RPC membatasi rentang `getLogs`, turunkan `BATCH_SIZE` (misalnya 500).
3. Jalankan dengan `NODE_ENV=production` dan `AUTH_MODE=signature` (default pada production).
4. Pastikan `CORS_ORIGINS` berisi origin frontend yang sebenarnya.
5. Setelah indexer menyusul, `GET /api/status` menunjukkan `lastBlock` mendekati `headBlock`.

## 3. Produksi sederhana (satu server)

Prasyarat: Node.js 24 (minimal 22.13), reverse proxy (Nginx/Caddy) dengan HTTPS.

```
cd backend && npm ci --omit=dev
NODE_ENV=production AUTH_MODE=signature PORT=3001 node src/server.js
```

Jalankan di bawah pengelola proses (systemd, pm2, atau container) agar otomatis hidup kembali. Contoh unit systemd:

```
[Service]
WorkingDirectory=/opt/anti-calo/backend
EnvironmentFile=/opt/anti-calo/backend/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
User=anticalo
```

Contoh Nginx (HTTPS, batas body, rate limit):

```
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
server {
  server_name api.contoh.id;
  client_max_body_size 3m;
  location / {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
  }
}
```

Catatan penting:

- Jalankan **satu** instance backend. Cache anti-replay tanda tangan ada di memori, dan SQLite ditulis oleh satu proses.
- Folder `data/` (database dan `uploads/`) harus berada di disk persisten. Jangan commit `data/` atau `.env`.
- Pastikan `.env` tidak dapat dibaca pengguna lain (`chmod 600 .env`).

## 4. Backup dan pemulihan

- Yang perlu dibackup: file database (`DB_FILE`, gunakan `sqlite3 anti-calo.db ".backup backup.db"` saat berjalan)
  dan folder `UPLOAD_DIR`. Data `event_details` hanya ada di sini; tidak dapat dipulihkan dari blockchain.
- Tabel proyeksi aman dibangun ulang kapan saja: hapus file database (setelah backup `event_details`) dan jalankan ulang
  indexer dari `START_BLOCK`, atau panggil `rebuild(db)` bila `chain_events` masih ada.
- Hash `detailsHash` on-chain memungkinkan pembeli memastikan detail yang dipulihkan sama dengan yang dikomitmenkan.

## 5. Mengganti kontrak atau chain

Alamat, ABI, dan `START_BLOCK` baru berarti riwayat lama tidak berlaku. Gunakan `DB_FILE` baru (atau hapus yang lama),
perbarui `shared/abi/*.json` dengan `npm run export-abi` di `blockchain/`, lalu jalankan ulang backend.

## 6. Pemeriksaan setelah deployment

| Pemeriksaan | Hasil yang diharapkan |
| ----------- | --------------------- |
| `GET /api/health` | `{ "ok": true }` |
| `GET /api/status` | `lastBlock` bertambah mengikuti chain |
| `GET /api/events` | Event on-chain muncul (detail `null` sampai organizer menyimpan detail) |
| Tulis tanpa login | 401 |
| Tulis dengan wallet non-organizer | 403 |
| Upload SVG | 400 |
| `NODE_ENV=production AUTH_MODE=dev` | Server menolak start |

## 7. Cabang kerja dan CI

Branch `feature/backend-indexer` memakai workflow `.github/workflows/backend.yml` (tes unit dan E2E saat ada
perubahan di `backend/`, `shared/abi/`, atau `blockchain/contracts/`). Workflow GitHub Pages hanya berjalan untuk `main`,
jadi branch ini tidak mengubah situs yang sudah ter-deploy.
