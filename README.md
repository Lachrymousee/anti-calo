# anti-calo

Marketplace tiket event berbasis Ethereum. `TicketNFT` mengelola event dan tiket; `Marketplace` menangani resale. Backend menyimpan detail event dan mengindeks data blockchain.

## Status

Prototipe Sepolia, bukan layanan produksi. Pengguna daftar/masuk dengan MetaMask sebelum membuka Event. Event menampilkan pembelian yang sedang dibuka dan event mendatang; Tiket saya menampilkan tiket wallet. Role dibaca dari kontrak. Logout tersedia di navbar. Tanpa `VITE_API_URL`, halaman lama berjalan sebagai demo browser.

## Menjalankan dengan Docker

Perlu Docker Desktop, Compose v2.24+, MetaMask di Sepolia, dan Sepolia ETH untuk transaksi.

```powershell
git clone https://github.com/Lachrymousee/anti-calo.git
cd anti-calo
docker compose up --build -d
docker compose logs -f
```

- Mulai daftar / masuk wallet: <http://localhost:5173/anti-calo/account.html>

Mulai dari register/login; setelah berhasil pengguna masuk ke Event. Tanda tangan wallet membuktikan identitas tanpa password. Gunakan Logout di navbar untuk mengakhiri sesi. Untuk kepentingan testing akun admin default adalah deployer Sepolia `0xaE9F21b9D85978Fce4B7c64741aCE39BE36c27E0`. Ia dapat memberi role Organizer; Organizer/Admin dapat menugaskan Gate Checker pada event. Hak Admin hanya diberikan oleh role kontrak.

Untuk mengakhiri:
```powershell
docker compose down
```

## Fitur dan role

| Area | Cakupan |
| --- | --- |
| Register/login | Masuk dengan tanda tangan MetaMask; tidak ada halaman Akun terpisah setelah login. |
| Event | Event aktif yang sedang dijual dan event mendatang; pembelian tiket on-chain. |
| Marketplace | Beli listing resale atau jual tiket milik wallet. |
| Organizer | Buat event dengan nama, kategori, deskripsi, lokasi, jadwal, dan harga; detail tersimpan di backend dengan hash on-chain. |
| Gate Checker | Check-in tiket untuk event yang ditugaskan; ID tiket dimasukkan manual. |
| Admin | Beri/cabut role Organizer, tugaskan checker, dan moderasi tiket sesuai kontrak. |
| Tiket saya | Lihat status tiket, refund, dan kelola listing milik wallet. |
| Lab Backend | Panel teknis untuk API/indexer dan operasi role on-chain. |
| Lab Integrasi | Baca NFT dan uji signature EIP-712; bukan izin check-in. |
Tanpa backend, halaman utama lama tetap tersedia dalam mode demo browser.

## Deployment Sepolia

| Kontrak | Alamat |
| --- | --- |
| TicketNFT | `0x093c1D62871Ecd9b2927155Dfee71a3e87A1cD14` |
| Marketplace | `0x0c11f7C21791a90F2A86A2263561417f96510cC9` |

Chain ID `11155111`; deployment lengkap ada di [manifest](./shared/deployments/sepolia.json). RPC contoh: `https://sepolia.gateway.tenderly.co` (dapat terkena rate limit).

## Dokumentasi
- [Kontrak TicketNFT](./docs/contracts.md) · [Marketplace](./docs/contracts-marketplace.md)
- [Keamanan](./docs/security.md) 

## Struktur

`src/`, `public/`, HTML: frontend · `backend/`: API, SQLite, indexer · `blockchain/`: Solidity dan Hardhat · `shared/abi/`, `shared/deployments/`: ABI dan alamat kontrak.

Jangan commit `.env`, `node_modules`, hasil build, atau data lokal.
