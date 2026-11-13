# Panduan Deployment Backend anti-calo

Panduan ini untuk modul `backend/` (API, database, indexer). Frontend (`npm run build` di root) tetap di-deploy
terpisah; workflow GitHub Pages yang ada hanya menerbitkan frontend dari branch `main`.

## 1. Lokal dengan node Hardhat (tanpa Sepolia)

Gunakan tiga terminal.

1. Node blockchain lokal (dari folder `blockchain/`, setelah `npm ci`):
   ```
   npx hardhat node
   ```
   Catatan: perintah ini mengompilasi kontrak dan memerlukan akses ke binaries.soliditylang.org.
2. Deploy kontrak ke node tersebut memakai script deployment milik Anggota 2, lalu catat alamat `TicketNFT`,
   `Marketplace`, dan nomor blok deployment. Beri `ORGANIZER_ROLE` ke akun organizer dan `MARKETPLACE_ROLE` ke
   alamat `Marketplace`.
3. Backend (dari folder `backend/`):
   ```
   npm ci
   copy .env.example .env      (macOS/Linux: cp .env.example .env)
   ```
   Isi `.env`: `RPC_URL=http://127.0.0.1:8545`, `CHAIN_ID=31337`, kedua alamat kontrak, `START_BLOCK` = blok deployment,
   `CONFIRMATIONS=0`. Lalu `npm start`. Periksa `http://localhost:3001/api/status`.

Mode `AUTH_MODE=dev` cukup untuk pengembangan lokal. Untuk hanya menguji alur tanpa node manual, jalankan `npm run test:e2e`.

## 2. Sepolia

1. Siapkan RPC Sepolia (penyedia RPC pilihan tim). Backend hanya membaca; **tidak memerlukan private key**.
2. Isi `.env`: `CHAIN_ID=11155111`, `RPC_URL`, `TICKET_NFT_ADDRESS`, `MARKETPLACE_ADDRESS`, dan
   `START_BLOCK` = blok deployment `TicketNFT` (lihat `shared/deployments/` bila sudah dicatat tim).
   Biarkan `CONFIRMATIONS=3`. Jika RPC membatasi rentang `getLogs`, turunkan `BATCH_SIZE` (misalnya 500).
3. Jalankan dengan `NODE_ENV=production` dan `AUTH_MODE=signature` (default pada production).
4. Pastikan `CORS_ORIGINS` berisi origin frontend yang sebenarnya.
5. Setelah indexer menyusul, `GET /api/status` menunjukkan `lastBlock` mendekati `headBlock`.

## 3. Produksi sederhana (satu server)

Prasyarat: Node.js 24, reverse proxy (Nginx/Caddy) dengan HTTPS.

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
