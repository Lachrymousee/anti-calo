# Panduan frontend

Frontend multi-page Vite memakai HTML, CSS, dan JavaScript. Halaman utama menggunakan data demo browser; transaksi Sepolia tersedia terpisah di Lab Backend.

## Halaman

| Halaman | Cakupan |
| --- | --- |
| Marketplace, Tiket saya | Jelajah event, tiket, QR, dan resale demo. |
| Organizer, Admin | Pengelolaan event dan role demo. |
| Gate Checker | Pemindaian QR demo; bukan check-in kontrak. |
| Lab Backend | Data dari API/indexer dan transaksi TicketNFT/Marketplace di Sepolia. |
| Lab Integrasi | Baca NFT dan uji signature EIP-712. |

## Menjalankan

Perlu Node.js 22.13+:

```powershell
npm ci
npm run dev
```

Buka URL Vite yang ditampilkan. Build/test: `npm test`, `npm run build`, `npm run preview`. Edit `README.md` untuk mengubah halaman Docs; `npm run sync-docs` memperbarui salinan otomatis.

Untuk Lab Backend tanpa Docker, isi `VITE_API_URL=http://localhost:3001` pada `.env` root, lalu jalankan backend/indexer sesuai [panduan deployment](./PANDUAN-DEPLOYMENT.md). Semua variabel `VITE_*` bersifat publik.

## Data dan role demo

Data aplikasi disimpan di `localStorage`, sesi akun di `sessionStorage`; keduanya hanya ada di browser dan dapat diubah pengguna. Akun demo bukan wallet sungguhan. Buyer dapat menjelajah, membeli, dan menjual tiket; Organizer mengelola event; Admin mengatur role/status; Gate Checker memeriksa event yang ditugaskan.

Role on-chain berbeda dari role demo. Lab Backend memakai role dan kepemilikan dari kontrak/indexer. Wallet yang melakukan transaksi harus berada di Sepolia dan memiliki saldo testnet.

## QR

QR demo memuat versi, event, token, pemilik, waktu terbit/kedaluwarsa, dan nonce acak; masa berlaku 120 detik. Membuat QR baru membatalkan bukti sebelumnya pada state browser. Mode demo tetap bukan mekanisme otorisasi produksi.

Lab Integrasi membaca `ownerOf` ERC-721 dan dapat meminta tanda tangan EIP-712. Signature tersebut hanya diverifikasi oleh lab: kontrak belum memverifikasi atau mengonsumsi QR. Check-in Lab Backend masih memakai ID tiket manual. Untuk produksi, kontrak perlu memeriksa role, event, pemilik saat transaksi, status tiket, expiry, dan konsumsi nonce secara atomik.

Scanner kamera memerlukan izin kamera dan HTTPS (localhost diizinkan saat pengembangan). Bila kamera tidak tersedia, gunakan input payload. Pencarian token tidak melewati pemeriksaan QR pada demo gate.

## Batas pengujian

Tes UI memakai jsdom dan provider tiruan; tes tersebut tidak menggantikan pemeriksaan browser, kamera, MetaMask, atau transaksi Sepolia. Detail setup, kontrak, dan API tersedia di [README utama](../README.md), [panduan deployment](./PANDUAN-DEPLOYMENT.md), dan [dokumentasi backend](../backend/README.md).
