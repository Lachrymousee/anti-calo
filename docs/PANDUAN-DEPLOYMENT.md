# Menjalankan anti-calo

Proyek memuat frontend, backend/indexer, dan kontrak. Untuk mencoba integrasi Sepolia, gunakan Docker Compose. MetaMask tetap di browser host; RPC hanya dipakai untuk membaca/indexing. Semua transaksi ditandatangani wallet.

## Sepolia dengan Docker (disarankan)

Perlu Docker Desktop dengan Compose v2.24+, MetaMask di Sepolia, dan Sepolia ETH untuk transaksi.

1. Dari root repo, jalankan:

   ```powershell
   docker compose up --build -d
   ```

2. Periksa layanan:
   - Register/login (halaman awal): <http://localhost:5173/anti-calo/account.html>
   - Event (tujuan setelah login): <http://localhost:5173/anti-calo/>
   - Tiket saya: <http://localhost:5173/anti-calo/tickets.html>
   - Marketplace resale: <http://localhost:5173/anti-calo/marketplace.html>
   - Tiket saya: <http://localhost:5173/anti-calo/tickets.html>
   - Organizer / Gate Checker / Admin: `organizer.html`, `gate.html`, `admin.html`
   - API: <http://localhost:3001/api/health>
   - Indexer: <http://localhost:3001/api/status>

   Tunggu `lastBlock` mendekati `headBlock`, lalu daftar atau masuk dengan MetaMask di Sepolia. Setelah login, aplikasi membuka Event; gunakan Logout di navbar untuk keluar.
3. Admin default adalah deployer `0xaE9F21b9D85978Fce4B7c64741aCE39BE36c27E0`. Masuk dengan wallet itu untuk memberi `ORGANIZER_ROLE`; Organizer/Admin dapat menugaskan Gate Checker pada event. Organizer mengisi nama, kategori, deskripsi, dan lokasi langsung di form buat event; backend menyimpan teks, sementara hash detail ikut dicatat on-chain.
4. Log: `docker compose logs -f`. Berhenti: `docker compose down`.

Database dan poster tersimpan pada volume `backend-data`; `down -v` menghapusnya. Default RPC/alamat ada di [backend/.env.example](../backend/.env.example) dan [manifest](../shared/deployments/sepolia.json). Untuk RPC ber-API-key, salin contoh menjadi `backend/.env`; jangan commit secret. Compose menjalankan frontend Vite, API, dan indexer, bukan node blockchain.

## Sepolia tanpa Docker

Backend hanya membaca RPC; tidak memerlukan private key. Dari root, salin `backend/.env.example` menjadi `backend/.env`, lalu periksa RPC, alamat kontrak, `START_BLOCK`, dan `CORS_ORIGINS`. Template memakai deployment Sepolia saat ini.

Terminal backend:

```powershell
cd backend
npm ci
npm start
```

Pastikan `/api/health` mengembalikan `{ "ok": true }` dan `/api/status` menunjukkan indexer berjalan. Di root repo, salin `.env.example` menjadi `.env`, lalu jalankan:

```powershell
npm ci
npm run dev
```

Buka `account.html` untuk daftar/masuk dengan MetaMask. Jelajahi, pembelian, tiket wallet, serta resale memakai API/indexer dan kontrak yang sama. Role ditentukan kontrak, bukan profil. `GET /api/config` menampilkan Chain ID `11155111` beserta alamat kontrak. Transaksi memerlukan Sepolia ETH.

Jangan jalankan `npm run seed:chain` di Sepolia; script itu hanya untuk Hardhat lokal dan menulis alamat lokal ke `backend/.env`. Jika `VITE_API_URL` tidak diatur, halaman marketplace menggunakan demo browser. Check-in masih memakai ID tiket manual; QR Lab Integrasi belum dikonsumsi kontrak.

## Demo lokal dengan Hardhat

Data contoh memakai akun Hardhat yang private key-nya publik. Gunakan hanya pada jaringan lokal.

1. Terminal pertama, dari `blockchain/`:

   ```powershell
   npm ci
   npx hardhat node
   ```

2. Terminal kedua, dari `backend/`:

   ```powershell
   npm ci
   npm run seed:chain
   npm start
   ```

   Script men-deploy kontrak, membuat event/tiket/listing contoh, dan menulis `backend/.env`.
3. Terminal ketiga, dari `backend/`, simpan detail off-chain:

   ```powershell
   npm run seed:details
   ```

4. Jalankan frontend dari root (`npm ci`, `npm run dev`). Atur MetaMask ke RPC `http://127.0.0.1:8545`, Chain ID `31337`, lalu impor akun dari log Hardhat hanya untuk pengujian lokal.

Untuk tes otomatis E2E tanpa menyalakan node manual, jalankan `npm run test:e2e` dari `backend/`. Untuk mengulang demo, hentikan node lalu hapus `backend/data/`.

## Perintah kerja

| Tujuan | Perintah |
| --- | --- |
| Frontend | `npm ci`, `npm run dev` |
| Frontend tests/build | `npm test`, `npm run build` |
| Backend/indexer | `cd backend; npm ci; npm start` |
| Tes backend | `cd backend; npm test` |
| Tes kontrak | `cd blockchain; npm ci; npm test` |
| Ekspor ABI | `cd blockchain; npm run export-abi` |

`npm run build` menghasilkan `dist/`. Workflow GitHub Pages hanya menerbitkan frontend dari branch `main`; backend/indexer memerlukan hosting terpisah.

## Konfigurasi produksi

Produksi belum disiapkan atau diuji. Jika dipasang untuk uji internal, gunakan Node.js 24 (minimal 22.13), HTTPS reverse proxy, `NODE_ENV=production`, `AUTH_MODE=signature`, dan satu instance backend. Simpan `.env`, SQLite, dan `uploads/` pada disk persisten dengan akses terbatas. Aplikasi belum menyediakan rate limiting atau hosting publik.

Backup database (`DB_FILE`) dan `UPLOAD_DIR`; detail event off-chain tidak dapat dipulihkan dari blockchain. Tabel proyeksi dapat dibangun ulang dari `chain_events`. Jika alamat kontrak/chain berubah, gunakan database baru, perbarui ABI dan `START_BLOCK`, lalu jalankan ulang indexer.
