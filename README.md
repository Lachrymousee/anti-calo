# anti-calo

Marketplace tiket event berbasis Ethereum. `TicketNFT` mengelola event dan tiket; `Marketplace` menangani resale. Backend menyimpan detail event dan mengindeks data blockchain.

## Status

Prototipe Sepolia, bukan layanan produksi. Marketplace/dashboard utama masih demo browser; transaksi nyata tersedia di **Lab Backend**. Check-in Lab Backend memakai ID tiket manual, bukan verifikasi QR on-chain.

## Menjalankan dengan Docker

Perlu Docker Desktop, Compose v2.24+, MetaMask di Sepolia, dan Sepolia ETH untuk transaksi.

```powershell
git clone https://github.com/Lachrymousee/anti-calo.git
cd anti-calo
docker compose up --build -d
```

- Aplikasi: <http://localhost:5173/anti-calo/backend.html>
- API: <http://localhost:3001/api/health>
- Status indexer: <http://localhost:3001/api/status>

Gunakan wallet dengan role yang sesuai; Admin memberi `ORGANIZER_ROLE` sebelum Organizer membuat event.

```powershell
docker compose logs -f
docker compose down
```

Database/poster bertahan pada volume Docker. `docker compose down -v` menghapusnya. Untuk RPC ber-API-key, salin `backend/.env.example` ke `backend/.env` dan ubah nilainya; jangan commit kredensial.

## Frontend demo tanpa Docker

Perlu Node.js 22.13+:

```powershell
npm ci
npm run dev
```

Buka URL Vite, biasanya <http://localhost:5173>. Mode ini hanya menjalankan frontend demo, bukan integrasi Sepolia.

## Pengujian

Jalankan di root:

```powershell
npm ci
npm test
npm run build
```

Backend: `cd backend; npm ci; npm test`. Kontrak: `cd blockchain; npm ci; npm test`. Tes E2E lokal dan konfigurasi lengkap ada di [panduan deployment](./docs/PANDUAN-DEPLOYMENT.md).

## Fitur dan role

| Area | Cakupan |
| --- | --- |
| Marketplace/tiket/dashboard/gate | Demo browser; data disimpan lokal. |
| Lab Backend | Membaca indexer, kirim transaksi Sepolia, CRUD detail event off-chain. |
| Lab Integrasi | Baca NFT dan uji signature EIP-712; bukan izin check-in. |
| Buyer | Beli dan resale tiket. |
| Organizer | Membuat event dan mengelola detail. |
| Admin | Mengelola role dan moderasi sesuai kontrak. |
| Gate Checker | Check-in event yang ditugaskan. |

Alamat demo UI bukan wallet sungguhan dan tidak memiliki private key.

## Deployment Sepolia

| Kontrak | Alamat |
| --- | --- |
| TicketNFT | `0x093c1D62871Ecd9b2927155Dfee71a3e87A1cD14` |
| Marketplace | `0x0c11f7C21791a90F2A86A2263561417f96510cC9` |

Chain ID `11155111`; deployment lengkap ada di [manifest](./shared/deployments/sepolia.json). RPC contoh: `https://sepolia.gateway.tenderly.co` (dapat terkena rate limit).

## Dokumentasi

- [Deployment, Docker, Sepolia, dan Hardhat lokal](./docs/PANDUAN-DEPLOYMENT.md)
- [Panduan frontend](./docs/PANDUAN-FRONTEND.md)
- [Kontrak TicketNFT](./docs/contracts.md) · [Marketplace](./docs/contracts-marketplace.md)
- [Keamanan](./docs/security.md) · [Backend/API](./backend/README.md)

## Struktur

`src/`, `public/`, HTML: frontend · `backend/`: API, SQLite, indexer · `blockchain/`: Solidity dan Hardhat · `shared/abi/`, `shared/deployments/`: ABI dan alamat kontrak.

Jangan commit `.env`, `node_modules`, hasil build, atau data lokal.
