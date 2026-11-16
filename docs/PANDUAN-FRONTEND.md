# Panduan frontend

Frontend multi-page Vite memakai HTML, CSS, dan JavaScript. Jika `VITE_API_URL` dikonfigurasi, halaman register/login, event, marketplace, tiket, serta halaman role memakai backend/indexer dan transaksi wallet Sepolia. Pengguna tanpa sesi diarahkan ke register/login; setelah berhasil login, pengguna masuk ke Event. Logout tersedia di navbar. Tanpa API, halaman lama kembali ke demo browser.

## Halaman

| Halaman | Cakupan |
| --- | --- |
| Register/login | Daftar atau masuk dengan MetaMask signature; tidak ada halaman Akun terpisah setelah login. |
| Event | Event aktif yang sedang dijual dan event mendatang; beli tiket primer jika penjualan dibuka. |
| Marketplace | Beli listing resale atau list tiket milik wallet. |
| Tiket saya | Kepemilikan, status, refund, dan listing wallet. |
| Organizer | Membuat event dengan nama, kategori, deskripsi, lokasi, jadwal, dan aturan tiket. Detail teks disimpan di backend; hash-nya dicatat saat event dibuat on-chain. |
| Admin | Mengelola role Organizer dan moderasi kontrak. |
| Gate Checker | Check-in manual untuk event yang ditugaskan. |
| Lab Backend | Panel teknis API/indexer dan operasi kontrak. |
| Lab Integrasi | Baca NFT dan uji signature EIP-712; QR tidak menandai check-in on-chain. |

## Menjalankan

Perlu Node.js 22.13+:

```powershell
npm ci
npm run dev
```

Buka URL Vite yang ditampilkan. Mulai dari `account.html`; login berhasil mengarahkan ke Event (`index.html`). Navigasi menyediakan Event, Tiket saya, Marketplace resale, serta halaman role yang sesuai; pilih Logout di navbar untuk keluar. Build/test: `npm test`, `npm run build`, `npm run preview`. Edit `README.md` untuk mengubah halaman Docs; `npm run sync-docs` memperbarui salinan otomatis.

Untuk integrasi tanpa Docker, salin `.env.example` menjadi `.env` di root, pastikan `VITE_API_URL=http://localhost:3001`, lalu jalankan backend/indexer sesuai [panduan deployment](./PANDUAN-DEPLOYMENT.md). Sesi membutuhkan login wallet terdaftar; halaman lain akan kembali ke register/login jika belum login. Semua variabel `VITE_*` bersifat publik.

## Data dan role demo

Nama profil disimpan backend; login memakai tanda tangan wallet dan tidak menyimpan password/private key. Data on-chain menjadi sumber role dan kepemilikan.

Admin Sepolia awal adalah deployer `0xaE9F21b9D85978Fce4B7c64741aCE39BE36c27E0`. Organizer/Admin dapat menetapkan Gate Checker untuk event. Wallet transaksi harus berada di Sepolia dan memiliki saldo testnet.

## QR

QR demo memuat versi, event, token, pemilik, waktu terbit/kedaluwarsa, dan nonce acak; masa berlaku 120 detik. Membuat QR baru membatalkan bukti sebelumnya pada state browser. Mode demo tetap bukan mekanisme otorisasi produksi.

Lab Integrasi membaca `ownerOf` ERC-721 dan dapat meminta tanda tangan EIP-712. Signature tersebut hanya diverifikasi oleh lab: kontrak belum memverifikasi atau mengonsumsi QR. Check-in Lab Backend masih memakai ID tiket manual. Untuk produksi, kontrak perlu memeriksa role, event, pemilik saat transaksi, status tiket, expiry, dan konsumsi nonce secara atomik.

Scanner kamera memerlukan izin kamera dan HTTPS (localhost diizinkan saat pengembangan). Bila kamera tidak tersedia, gunakan input payload. Pencarian token tidak melewati pemeriksaan QR pada demo gate.

## Batas pengujian

Tes UI memakai jsdom dan provider tiruan; tes tersebut tidak menggantikan pemeriksaan browser, kamera, MetaMask, atau transaksi Sepolia. Detail setup, kontrak, dan API tersedia di [README utama](../README.md), [panduan deployment](./PANDUAN-DEPLOYMENT.md), dan [dokumentasi backend](../backend/README.md).
