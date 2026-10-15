# anti-calo — Marketplace Tiket Event Anti-Calo

Aplikasi web berbasis blockchain untuk membeli tiket event, menjual kembali tiket melalui marketplace dengan batas harga, dan memvalidasi tiket saat check-in. Tiket direpresentasikan sebagai **NFT ERC-721**, sedangkan detail event dan profil pengguna disimpan off-chain.

> **Status per 15 Oktober 2026: frontend interaktif dan fondasi integrasi sudah tersedia.** Marketplace, dashboard, resale, role, QR, dan check-in berjalan sebagai **demo lokal di browser**. Lab Integrasi berisi koneksi MetaMask, pembacaan NFT ERC-721 Sepolia, dan tanda tangan EIP-712. Transaksi aplikasi, SIWE, backend/database, dan indexer **belum terhubung dalam paket source ini**. Ini belum merupakan dApp lengkap yang memenuhi seluruh rubrik on-chain/off-chain.

Dokumen ini memperbarui rancangan awal berdasarkan source frontend yang sudah diperiksa. Status pekerjaan anggota lain di repository terpisah belum dapat disimpulkan dari paket ini. Rancangan backend, blockchain, dan struktur kelompok tetap dipertahankan sebagai arah integrasi.

## Ringkasan Perkembangan

| Bagian | Sudah tersedia pada kode saat ini | Batas / pekerjaan berikutnya |
| --- | --- | --- |
| Identitas aplikasi | Nama **anti-calo**, desain bersama, delapan halaman, enam poster SVG contoh | Nama/NIM anggota dan deadline pengumpulan belum dicatat. |
| Marketplace dan Buyer | Pencarian/filter/sortir, detail event, pembelian demo, Tiket saya, listing/batal/beli resale | Belum mint NFT, membayar ETH, atau membaca marketplace dari kontrak. |
| Admin | Tabel role, pemberian/pencabutan Organizer dan Gate Checker, pengawasan dan status event | Izin dan perubahan masih diperiksa model demo; perlu otorisasi kontrak. |
| Organizer | Buat/edit draft, terbitkan event sendiri, ringkasan penjualan, penugasan Gate Checker | Belum CRUD kontrak/API dan belum upload poster. |
| Gate Checker | Scanner kamera, input payload JSON, pemeriksaan event/role/penugasan, check-in sekali | Belum transaksi check-in on-chain; kamera perangkat nyata belum diuji langsung. |
| QR demo | Expiry 120 detik, nonce acak, pemilik/token/event, QR baru mengganti bukti lama | Registry bukti berada di penyimpanan browser, bukan keamanan tiket produksi. |
| Lab Integrasi | Kode pembacaan deployment/ERC-165/ownerOf di Sepolia, sign/verify EIP-712 dan baca ulang pemilik | Harus dicoba dengan deployment/NFT tim dan MetaMask nyata; bukan transaksi pembelian/check-in. |
| Dokumentasi dan UI | Panduan, halaman Docs dengan daftar isi/tabel/blok kode, teks kecil diperbesar sekitar 2 px, footer copyright | Docs otomatis disinkronkan dari README saat dev/test/build. |
| Pengujian | **42 tes otomatis lulus** dan build produksi berhasil pada snapshot ini | Tes DOM memakai jsdom dan RPC tiruan; belum uji end-to-end kontrak/Sepolia atau layout browser nyata. |
| Backend dan autentikasi | Rancangan SIWE, sesi, profil, API detail event tetap terdokumentasi | Implementasi backend, database, SIWE, upload, dan indexer belum disertakan. |

Preview frontend: https://anti-calo.peachyscout3.chatgpt.site

Docs pada preview: https://anti-calo.peachyscout3.chatgpt.site/docs.html

Preview masih memiliki akses terbatas pada pemilik. Untuk teman kelompok, jalankan source ini di localhost sampai akses/hosting bersama disepakati. Data yang diubah di preview tidak otomatis muncul di localhost karena keduanya memakai origin penyimpanan browser berbeda.

## Daftar Isi

Gunakan outline GitHub atau daftar isi otomatis pada halaman Docs untuk menuju bagian berikut:

- Ringkasan Perkembangan
- Kriteria Tugas
- Fitur Aplikasi
- Role dan Hak Akses
- Penyimpanan Data dan CRUD
- Arsitektur dan Integrasi
- Yang dibutuhkan dari tim smart contract
- Teknologi
- Struktur Folder
- Persiapan dan Menjalankan Proyek
- Pengujian dan Keamanan
- Kolaborasi GitHub
- Demo dan Pengumpulan
- Tindak Lanjut dan Serah Terima Tim
- Keputusan yang Belum Final
- Riwayat Perubahan

## Kriteria Tugas

| Kriteria dosen | Rencana pemenuhan | Status pada paket ini |
| --- | --- | --- |
| Web dengan data on-chain di blockchain | Kontrak menyimpan inti event, tiket, kepemilikan, dan state transaksi. | Web tersedia; state aplikasi masih demo. Lab hanya membaca NFT yang sudah ada. |
| Tema utama | Marketplace tiket event anti-calo. | Sudah digunakan pada anti-calo. |
| Minimal 3 role | Admin, Organizer, Buyer, Gate Checker. | Empat peran tersedia pada demo; belum role kontrak. |
| Login menggunakan wallet address | MetaMask dan autentikasi SIWE melalui signature. | Koneksi wallet pada Lab tersedia; **SIWE/sesi server belum tersedia**. Sign QR bukan login SIWE. |
| CRUD on-chain minimal 1 jenis data | Create/read/update/cancel data inti event. | Baru simulasi frontend; belum bukti transaksi CRUD on-chain. |
| CRUD off-chain minimal 1 jenis data | Profil pengguna dan detail event melalui backend/database. | Detail event lokal dapat dicoba; **belum CRUD database melalui API**. Profil belum diimplementasikan. |
| Source dan pendukung deployment | Source, lockfile, konfigurasi contoh, script, ABI, alamat kontrak, dokumentasi. | Source frontend, test, build, dan dokumentasi tersedia. ABI bisnis/deployment kontrak belum disertakan. |

**Catatan delete:** cancel/soft delete mengubah state aktif; riwayat blockchain tetap tersimpan. Penerimaan soft delete untuk rubrik harus dikonfirmasi kepada dosen. Simulasi di localStorage tidak boleh dipresentasikan sebagai bukti CRUD blockchain/database kelompok.

## Fitur Aplikasi

Daftar berikut mempertahankan scope awal. Keterangan status membedakan alur yang sudah dapat dicoba di frontend dari integrasi yang masih menjadi target.

### Publik dan Buyer

**Status saat ini:** Sudah ada daftar/detail event, filter, pembelian demo, Tiket saya, QR, serta resale. Login SIWE, CRUD profil, NFT/transaksi asli, dan pelacakan receipt blockchain belum terhubung.

- Melihat daftar dan detail event.
- Menghubungkan MetaMask dan login menggunakan wallet.
- Membeli tiket dan melihat NFT yang dimiliki.
- Menampilkan QR tiket pada halaman **Tiket saya**.
- Membuat listing resale, membatalkan listing sendiri, dan membeli tiket resale.
- Mengelola profil pengguna melalui CRUD off-chain.
- Melihat status transaksi: menunggu persetujuan wallet, menunggu konfirmasi, berhasil, atau gagal.

### Dashboard Admin

**Status saat ini:** Semua alur pengawasan, role, dialog konfirmasi, dan perubahan status tersedia pada demo. Admin tidak membuat/mengedit isi event dan tidak menerbitkan draft Organizer.

- Melihat wallet dan role yang diberikan.
- Memberikan atau mencabut role Organizer dan Gate Checker.
- Melihat event dan mengelola status event sesuai izin kontrak.
- Menampilkan konfirmasi sebelum tindakan yang mengubah role atau status event.

### Dashboard Organizer

**Status saat ini:** Buat/edit draft milik sendiri, validasi form, publish, ringkasan penjualan, serta tambah/hapus penugasan Gate Checker tersedia pada demo. Poster masih aset bawaan; API, upload, dan fee resale belum tersedia.

- Membuat event dan mengelola event miliknya.
- Mengisi detail event: deskripsi, kategori, lokasi, dan poster.
- Mengatur data inti event sesuai aturan kontrak.
- Melihat laporan jumlah tiket terjual dan pendapatan.
- Melihat fee resale jika disertakan dalam scope laporan final.

### Dashboard Gate Checker

**Status saat ini:** Pemilihan event penugasan, kamera/JSON, hasil validasi, konfirmasi check-in, penghitung, dan pencarian token tersedia pada demo. Mengirim transaksi wallet serta menunggu receipt kontrak masih target.

- Memilih event yang boleh diperiksa.
- Memindai QR tiket dan menampilkan hasil pemeriksaan.
- Mengirim transaksi check-in melalui wallet.
- Menampilkan tiket valid, sudah digunakan, dicabut, atau berasal dari event lain.
- Menampilkan keberhasilan check-in setelah transaksi terkonfirmasi.

### Aturan Anti-Calo

- Demo sekarang menetapkan **harga resale lebih dari 0 dan maksimal 100% harga awal**, dihitung sebagai integer wei dengan presisi sampai 18 desimal. Contoh 110% dari rancangan awal tidak digunakan pada demo; parameter kontrak final harus disepakati.
- Batas jumlah pembelian per wallet masih target; **belum diterapkan pada model demo** dan jumlahnya belum disepakati.
- Transfer demo terjadi melalui pembelian resale. Pembatasan transfer ERC-721 di luar marketplace masih harus ditegakkan kontrak; tidak dapat dijamin frontend.
- Tiket yang sudah digunakan tidak boleh check-in kembali.
- Demo menolak resale/check-in tiket used atau tidak aktif dan pembelian/check-in event tidak live. Burn/revoke tiket, refund, dan seluruh kebijakan kontrak untuk event canceled masih perlu disepakati.

Batas per wallet tidak membuktikan satu wallet mewakili satu orang. Efektivitas anti-calo dibatasi oleh aturan yang benar-benar ditegakkan kontrak dan mekanisme verifikasi tiket.

## Role dan Hak Akses

Matriks berikut mencerminkan **aturan model demo yang sudah diimplementasikan**. Terapkan padanannya pada kontrak/API sebelum menjadi otorisasi sistem nyata.

| Tindakan | Admin | Organizer | Buyer dasar | Gate Checker |
| --- | --- | --- | --- | --- |
| Melihat event publik dan membeli demo | Ya | Ya | Ya | Ya |
| QR/resale tiket milik sendiri | Ya | Ya | Ya | Ya |
| Memberikan/mencabut role Organizer/Gate Checker | Ya | Tidak | Tidak | Tidak |
| Membuat/edit draft dan publish event sendiri | Tidak | Ya | Tidak | Tidak |
| Menugaskan petugas pada event sendiri | Tidak | Ya | Tidak | Tidak |
| Membaca event dan laporan | Semua event | Event sendiri | Event publik | Event penugasan |
| Tangguhkan/aktifkan kembali/batalkan event | Ya | Tidak pada demo | Tidak | Tidak |
| Verifikasi dan check-in | Tidak | Tidak | Tidak | Hanya event yang ditugaskan |
| CRUD profil off-chain | Belum tersedia | Belum tersedia | Belum tersedia | Belum tersedia |

Aturan yang sudah diterapkan pada demo:

- Buyer adalah akses dasar. Satu wallet memiliki maksimal **satu role khusus**; perbandingan alamat mengabaikan perbedaan huruf besar/kecil.
- Admin memberikan role Gate Checker, kemudian Organizer pemilik event memberikan penugasan event. Role saja belum cukup untuk check-in.
- Role Admin tidak dapat diberikan/dicabut melalui form demo.
- Pencabutan Organizer ditolak jika masih memiliki event draft/live/suspended. Pencabutan Gate Checker menghapus penugasannya pada model.
- Menu **Pilih akun demo** berpindah sesi ke wallet contoh lain; bukan mekanisme untuk mengubah role sebuah wallet.

**Frontend mengatur tampilan, backend memeriksa izin off-chain, dan kontrak memeriksa izin on-chain.** Model browser dapat dimodifikasi pengguna; aturan di atas belum memberikan perlindungan server/kontrak.

## Penyimpanan Data dan CRUD

### Penyimpanan yang Sudah Aktif

- `localStorage`: event, tiket, role, penugasan, listing resale, aktivitas, dan bukti QR **demo**.
- `sessionStorage`: akun demo yang dipilih per tab. Tab Buyer dan Gate Checker bisa memilih akun berbeda pada browser/origin yang sama.
- Event `storage` memperbarui data demo antar-tab. Ini bukan sinkronisasi antarpengguna/perangkat dan bukan transaksi atomik lintas browser.
- Identifier storage versi awal dipertahankan agar data demo dan pilihan akun browser tetap terbaca setelah penggantian nama. Nama Admin bawaan lama dinormalisasi menjadi Admin anti-calo saat dimuat.
- Jika storage tidak tersedia, demo memakai memori sesi. **Reset demo** mengembalikan data contoh di browser tersebut.
- Lab menyimpan identifier publik konfigurasi; signature berada di memori halaman. Pembacaan owner menggunakan RPC wallet ke Sepolia.
- Belum ada MySQL/database server, penyimpanan media upload, atau proses indexer pada paket ini.

### Pembagian Data Target Sistem Lengkap

| Penyimpanan            | Data                                                                                    | Sumber kebenaran                     |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------------------------ |
| Blockchain             | Data inti event, token ID, kepemilikan tiket, status used/revoked, role, listing resale | Smart contract                       |
| Database off-chain     | Profil user, deskripsi event, poster, kategori, lokasi                                  | Backend/database                     |
| Database hasil indexer | Salinan aktivitas kontrak untuk daftar, riwayat, dan laporan                            | Blockchain; database adalah proyeksi |
| Penyimpanan media      | File poster yang referensinya disimpan di database                                      | Backend/media storage                |

Field inti event yang tepat, identitas event, dan lokasi state check-in masih perlu ditetapkan. Data pribadi tidak direncanakan untuk disimpan on-chain.

### Bukti CRUD yang Masih Harus Diintegrasikan

Tabel ini adalah target pembuktian final. Operasi model demo belum membuktikan penyimpanan blockchain/API.

| Jenis data             | Insert              | View                    | Update                          | Delete                   |
| ---------------------- | ------------------- | ----------------------- | ------------------------------- | ------------------------ |
| Event inti on-chain    | Buat event          | Baca event dari kontrak | Ubah field yang diizinkan       | Cancel/soft delete event |
| Tiket on-chain         | Mint saat pembelian | Baca pemilik dan status | Transfer/check-in sesuai aturan | Burn/revoke sesuai izin  |
| Profil off-chain       | Buat profil         | Tampilkan profil        | Ubah profil                     | Soft delete akun         |
| Detail event off-chain | Buat detail event   | Tampilkan detail event  | Ubah deskripsi/poster/lokasi    | Soft delete detail event |

Pembatasan update setelah tiket terjual, hubungan cancel event dengan detail off-chain, serta refund harus ditentukan sebelum implementasi. Soft delete profil tidak menghapus kepemilikan NFT atau riwayat blockchain.

## Arsitektur dan Integrasi

### Arsitektur Implementasi Sekarang

| Modul nyata | Fungsi |
| --- | --- |
| Delapan entry HTML + `src/main.js` | Halaman, form, dialog, navigasi, konfirmasi, scanner, dan pemilihan akun demo. |
| `src/model.js` | Aturan bisnis dan mutasi state demo: event/tiket/role/resale/QR/check-in. |
| `src/store.js` | Persistensi browser, pembaruan antar-tab, dan rollback mutasi gagal. |
| `src/ui.js` | Komponen DOM, ikon, modal, dan notifikasi bersama. |
| `src/chain.js` | Adapter provider, pemeriksaan NFT ERC-721 Sepolia, domain typed data, sign/verify EIP-712. |
| `src/integration.js` | UI Lab Integrasi dan pembersihan hasil saat akun/jaringan/konfigurasi berubah. |
| `src/docs.js` + `scripts/sync-docs.mjs` | Pembaca Markdown dengan DOM aman dan sinkronisasi README ke Docs. |

`src/chain.js` belum menggantikan sumber data marketplace. `submitOnchainTransaction()` sengaja menolak dengan pesan integrasi belum aktif, sehingga source tidak menebak fungsi ABI bisnis.

### Arsitektur Target Kelompok

| Komponen                   | Tanggung jawab                                                          |
| -------------------------- | ----------------------------------------------------------------------- |
| Frontend bersama           | Halaman publik, buyer, dashboard, koneksi wallet, dan status transaksi. |
| Wallet                     | Menandatangani pesan login dan transaksi atas persetujuan pengguna.     |
| Backend                    | SIWE, sesi, otorisasi off-chain, profil, detail event, dan API.         |
| Smart contract tiket       | NFT, data inti event, role, lifecycle tiket, dan pembatasan transfer.   |
| Smart contract marketplace | Listing, pembelian resale, aturan harga, dan fee organizer.             |
| Modul check-in             | Pemeriksaan dan perubahan status used; lokasi kontraknya belum final.   |
| Indexer                    | Membaca event kontrak dan membangun data untuk API/laporan.             |

### Kesepakatan Integrasi

Sebelum menghubungkan modul, tim harus menyepakati:

1. ID event dan tiket: gunakan konteks network, alamat kontrak, dan ID agar tidak ambigu.
2. Interface kontrak: fungsi, parameter, izin, return value, event, dan error.
3. API: endpoint, payload, format respons, autentikasi, dan kode error.
4. Urutan penyimpanan event on-chain/off-chain dan penanganan kegagalan parsial.
5. Sumber role untuk frontend/backend dan penanganan perubahan role.
6. Status transaksi dan keterlambatan data indexer.
7. Format QR dan mekanisme pembuktian bahwa pembawanya adalah pemilik tiket.

### Alur Check-in

1. Buyer membuka tiket dan QR pada halaman tiketnya.
2. Gate Checker memindai QR untuk mendapatkan identitas tiket.
3. Aplikasi memeriksa event, status tiket, dan izin petugas.
4. Mekanisme verifikasi pemilik diterapkan sesuai keputusan tim.
5. Petugas mengirim transaksi check-in.
6. Kontrak memeriksa kelayakan dan mengubah status used dalam transaksi yang sama.
7. UI menampilkan sukses setelah transaksi terkonfirmasi.

QR statis dapat disalin. QR berisi identitas tiket saja bukan bukti kepemilikan; jangan memasukkan private key, secret sesi, atau data login ke QR.

## Yang dibutuhkan dari tim smart contract

Bagian ini menjadi acuan serah terima Anggota 1/2 ke frontend. Nama fungsi bisnis harus mengikuti ABI final; tidak ditebak dari label tombol.

- Network/chain ID, alamat deployment Sepolia, ABI final, versi/compiler kontrak, blok deployment, dan transaksi contoh.
- Skema event dan tiket: ID, organizer, harga, kapasitas, status, pemilik, event asal token, dan status used/revoked.
- Fungsi bisnis create/read/update/cancel event; purchase/mint; list/unlist/buy resale; role; assignment; serta check-in.
- Izin Admin/Organizer/Gate Checker, aturan satu role khusus, dan penugasan petugas per event.
- Batas resale, transfer/approval di luar marketplace, harga integer wei, pembayaran, fee, dan batas beli per wallet.
- Check-in atomik yang memeriksa role, assignment, event, pemilik terbaru, signature/domain, waktu blok, nonce, dan tiket belum dipakai.
- Event log/error kontrak untuk receipt transaksi, pembaruan UI, serta indexer.
- Kebijakan cancel/refund/revoke, pencabutan role, konsumsi nonce, dan invalidasi bukti setelah perubahan pemilik/status.

### Skema QR EIP-712 yang Sudah Disiapkan Frontend

Domain saat ini: `name = AntiCaloCheckIn`, `version = 1`, `chainId = 11155111`, `verifyingContract = alamat kontrak NFT yang dikonfigurasi`.

| Field message `CheckIn` | Tipe |
| --- | --- |
| `eventId` | `uint256` |
| `tokenId` | `uint256` |
| `owner` | `address` |
| `issuedAt` | `uint256` |
| `expiresAt` | `uint256` |
| `nonce` | `bytes32` |

Ini usulan adapter frontend, **belum skema kontrak final**. Domain, nama struct, urutan field, tipe, dan kontrak verifier harus identik di seluruh modul. Mapping ID event demo berbentuk string ke ID kontrak integer juga harus disepakati.

Lab memeriksa deployment/ERC-721 dan `ownerOf`, bukan hubungan token-event, status used, role, atau assignment. Event ID masih input pengguna. Signing memakai EOA/ECDSA 65 byte; dukungan contract wallet/ERC-1271 belum dibuat.

QR lab berlaku 120 detik dari timestamp blok yang dibaca. Setelah wallet menandatangani, adapter memeriksa ulang akun, chain, expiry, dan owner. Jam perangkat ikut diperiksa secara konservatif. Membuat QR signed baru **tidak otomatis mencabut signature lama**. EIP-712 tidak menyediakan replay protection; konsumsi nonce/status tiket harus diperiksa kontrak saat transaksi. Label signature/pemilik cocok bukan izin check-in dan tidak mengubah status used.

## Teknologi

### Tech Stack yang Sudah Digunakan

| Bagian | Teknologi/versi pada source | Penggunaan |
| --- | --- | --- |
| Frontend | HTML5, CSS, JavaScript ES Modules | Multi-page, tanpa React/Vue dan tanpa backend pada paket ini. |
| Build/dev server | `vite` **7.3.7** | `npm run dev`, build delapan entry HTML, dan preview hasil build. |
| Wallet/blockchain | `ethers` **6.17.0** | Provider MetaMask, baca ERC-721, typed data dan signature EIP-712. |
| Pembuat QR | `qrcode` **1.5.4** | Mengubah payload menjadi gambar QR. |
| Pembaca QR | `jsqr` **1.4.0** | Dekode QR dari frame kamera. |
| Tes | Node.js test runner + `jsdom` **26.1.0** | Model, adapter RPC, UI, Lab, dan Docs. |
| Runtime yang diuji | Node.js **24.19.0**, npm **11.9.0** | Baseline agar lingkungan teman kelompok konsisten. |
| State demo | `localStorage` dan `sessionStorage` | Data bersama per origin dan sesi akun per tab. |
| Network adapter | Ethereum Sepolia, chain ID **11155111** | Lab pembacaan/signature; belum transaksi aplikasi. |
| Wallet | MetaMask melalui provider browser | Dibutuhkan untuk Lab; akun demo tidak membutuhkan wallet asli. |
| Dokumentasi | Markdown + pembaca DOM internal | README tampil pada `docs.html`; tidak memakai CDN renderer Markdown. |
| Aset | Enam poster SVG lokal dan favicon | Event/penjualan merupakan data contoh. Font mempunyai fallback sistem. |

Versi dependency dikunci pada `package.json` dan `package-lock.json`. Gunakan `npm ci` agar seluruh tim memasang dependency sesuai lockfile.

### Teknologi Target yang Belum Tersedia pada Paket Ini

| Bagian | Rencana / status |
| --- | --- |
| NFT | ERC-721; Lab memakai interface baca standar, ABI bisnis belum tersedia. |
| Smart contract | Solidity; compiler dan dependensi final mengikuti hasil Anggota 1/2. |
| Testing/deployment kontrak | Hardhat sesuai pembagian awal; belum ada proyek/script Hardhat dalam paket frontend. |
| Login dan sesi | SIWE; session/JWT dan kebijakan cookie belum diputuskan/diimplementasikan. |
| Backend/database | Belum dipilih bersama. Tidak ada PHP/Flask/MySQL server yang perlu dijalankan untuk demo ini. |
| Indexer/media upload | Masih rancangan. |
| Audit kontrak | Slither/Mythril sesuai rencana Anggota 2; hasilnya belum tersedia di paket ini. |
| Repository/hosting final | GitHub untuk source; provider dan deployment bersama belum final. |

Penambahan backend/kontrak tidak mengharuskan menulis ulang UI; hubungkan layanan nyata pada batas model/adapter setelah kontrak data disepakati.

## Struktur Folder

### Struktur Nyata Source Code dalam Arsip

Folder `anti-calo/` adalah root aplikasi frontend yang sudah dapat dijalankan. `package.json` berada langsung di root ini, bukan di subfolder `frontend/`.

```text
anti-calo/
├── README.md
├── package.json
├── package-lock.json
├── vite.config.js
├── .env.example
├── .gitignore
├── index.html
├── tickets.html
├── organizer.html
├── admin.html
├── gate.html
├── guide.html
├── docs.html
├── integration.html
├── src/
│   ├── main.js
│   ├── ui.js
│   ├── model.js
│   ├── store.js
│   ├── chain.js
│   ├── integration.js
│   ├── docs.js
│   ├── docs-content.js
│   └── styles.css
├── public/
│   ├── art/                    # Enam poster SVG contoh
│   ├── favicon.svg
│   └── panduan.md              # Salinan README hasil sinkronisasi
├── scripts/
│   └── sync-docs.mjs
├── tests/
│   ├── model.test.js
│   ├── chain.test.js
│   ├── integration-ui.test.js
│   ├── ui.test.js
│   └── docs.test.js
└── docs/
    ├── PANDUAN-FRONTEND.md      # Panduan teknis frontend sebelumnya
    └── PANDUAN-GITHUB.md        # Cara upload source tanpa deployment
```

Arsip tidak menyertakan dependency `node_modules/`, hasil build `dist/`, riwayat Git, kredensial, atau identitas hosting preview. Dependency dan build dibuat kembali dengan perintah di bagian setup. File `.env.example` hanya template publik.

### Struktur Target Repository Kelompok

**Struktur di bawah tetap merupakan rencana integrasi**, bukan daftar folder yang sudah dibuat dalam arsip. Frontend buyer dan dashboard berada dalam satu aplikasi agar komponen wallet/layout dapat digunakan bersama. Saat menyatukan repository, tim dapat memindahkan seluruh root frontend ke `frontend/`; sesuaikan perintah dan path bersama agar anggota tidak memakai dua struktur berbeda.

### Root Repository

| Path          | Isi/fungsi                                                    |
| ------------- | ------------------------------------------------------------- |
| `README.md`   | Gambaran proyek, fitur, struktur, dan petunjuk awal.          |
| `.gitignore`  | Mengecualikan secret, dependency, file build, dan data lokal. |
| `frontend/`   | Aplikasi web publik, buyer, dan dashboard.                    |
| `backend/`    | Autentikasi, CRUD off-chain, dan REST API.                    |
| `blockchain/` | Kontrak, test, script deployment, dan konfigurasi Hardhat.    |
| `indexer/`    | Pembaca event kontrak dan sinkronisasi database.              |
| `shared/`     | ABI, alamat deployment, dan kontrak data bersama.             |
| `tests/e2e/`  | Pengujian alur lintas frontend, backend, dan kontrak.         |
| `docs/`       | Spesifikasi, deployment, audit, demo, dan presentasi.         |

### Frontend

| Path                               | Fitur/tanggung jawab                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `frontend/src/pages/public/`       | Daftar event dan detail event; anggota 4.                                                 |
| `frontend/src/pages/buyer/`        | Beli tiket, tiket saya, resale, dan profil; anggota 4, integrasi profil dengan anggota 3. |
| `frontend/src/pages/admin/`        | Kelola role dan event; anggota 5.                                                         |
| `frontend/src/pages/organizer/`    | Form event dan laporan penjualan; anggota 5.                                              |
| `frontend/src/pages/gate-checker/` | Pilih event, scan QR, hasil validasi, dan check-in; anggota 5.                            |
| `frontend/src/components/layout/`  | Navbar, sidebar, dan layout dashboard.                                                    |
| `frontend/src/components/wallet/`  | Komponen wallet/login bersama; anggota 4.                                                 |
| `frontend/src/components/qr/`      | Generator dan scanner QR; anggota 5, dipakai anggota 4.                                   |
| `frontend/src/components/common/`  | Form, tabel, dialog, loading, dan notifikasi.                                             |
| `frontend/src/services/`           | Pemanggilan API, kontrak, dan pelacakan transaksi.                                        |
| `frontend/src/auth/`               | State login/role dan pengaturan akses halaman.                                            |
| `frontend/src/mocks/`              | Data contoh sementara untuk pengerjaan UI.                                                |
| `frontend/src/styles/`             | Styling bersama.                                                                          |
| `frontend/public/`                 | Aset statis bawaan aplikasi; bukan penyimpanan poster upload.                             |
| `frontend/.env.example`            | Nama konfigurasi publik frontend tanpa secret.                                            |

### Backend, Blockchain, dan Indexer

| Path                           | Fitur/tanggung jawab                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `backend/src/auth/`            | Nonce, verifikasi SIWE, sesi/logout; anggota 3.                                    |
| `backend/src/middleware/`      | Otorisasi, validasi request, dan error handling.                                   |
| `backend/src/users/`           | CRUD profil dan soft delete; anggota 3.                                            |
| `backend/src/events/`          | CRUD detail event; anggota 6.                                                      |
| `backend/src/uploads/`         | Validasi dan penyimpanan poster; anggota 6.                                        |
| `backend/src/reports/`         | API laporan penjualan dari data yang tersedia; anggota 6, scope bersama anggota 5. |
| `backend/src/database/`        | Koneksi database dan akses data bersama.                                           |
| `backend/database/migrations/` | Perubahan skema database yang dapat dijalankan ulang.                              |
| `backend/database/seeds/`      | Data demo tanpa secret atau data pribadi nyata.                                    |
| `backend/tests/`               | Pengujian auth, izin, CRUD, dan API.                                               |
| `backend/.env.example`         | Konfigurasi server/database tanpa nilai secret.                                    |
| `blockchain/contracts/`        | Kontrak tiket, marketplace, dan check-in sesuai desain final; anggota 1/2.         |
| `blockchain/test/`             | Unit test kontrak, termasuk harga resale dan double check-in; anggota 2.           |
| `blockchain/scripts/`          | Script deployment dan konfigurasi role awal; anggota 2.                            |
| `blockchain/.env.example`      | Nama konfigurasi RPC/deployer tanpa private key nyata.                             |
| `indexer/src/listeners/`       | Pembacaan event kontrak; anggota 6.                                                |
| `indexer/src/handlers/`        | Pembaruan data transaksi, tiket, dan laporan.                                      |
| `indexer/src/sync/`            | Checkpoint, pembacaan ulang, serta penanganan duplikasi/perubahan chain.           |
| `indexer/tests/`               | Pengujian sinkronisasi data.                                                       |
| `indexer/.env.example`         | Konfigurasi RPC/database dan titik awal pembacaan.                                 |
| `shared/abi/`                  | ABI hasil compile yang dipakai frontend/backend/indexer.                           |
| `shared/deployments/`          | Alamat kontrak, network, dan blok deployment; tanpa secret.                        |
| `shared/schemas/`              | Format respons API, identifier, dan payload QR yang disepakati.                    |

### Dokumentasi

| Path                   | Isi                                                          |
| ---------------------- | ------------------------------------------------------------ |
| `docs/requirements.md` | Scope MVP dan pemetaan kriteria dosen.                       |
| `docs/roles.md`        | Matriks izin dan aturan event ownership.                     |
| `docs/architecture.md` | Arsitektur, data on-chain/off-chain, dan lifecycle.          |
| `docs/api.md`          | Endpoint, request, response, dan error.                      |
| `docs/contracts.md`    | Fungsi kontrak, event, parameter, dan izin.                  |
| `docs/deployment.md`   | Langkah lokal/testnet/hosting beserta versi runtime.         |
| `docs/security.md`     | Asumsi keamanan, threat model, temuan, dan perbaikan.        |
| `docs/testing.md`      | Skenario, hasil test, dan bukti yang benar-benar tersedia.   |
| `docs/demo.md`         | Akun demo per role dan urutan presentasi; tanpa private key. |
| `docs/presentation/`   | Slide dan gambar pendukung.                                  |

## Persiapan dan Menjalankan Proyek

### Menjalankan Frontend yang Sudah Tersedia

Yang disiapkan anggota tim: Node.js 24 beserta npm, editor seperti VS Code, browser, dan internet untuk instalasi dependency. MetaMask dan NFT Sepolia hanya dibutuhkan untuk Lab Integrasi. Demo marketplace/dashboard tidak memerlukan saldo ETH, database, Apache/XAMPP, backend, atau deploy kontrak.

1. Ekstrak `anti-calo-SourceCode.rar` menggunakan aplikasi pembuka RAR.
2. Buka folder `anti-calo` di VS Code; pastikan terminal berada pada folder yang berisi `package.json`.
3. Periksa runtime dan instal dependency, lalu jalankan Vite:

```bash
node --version
npm --version
npm ci
npm run dev
```

Buka URL pada terminal, biasanya `http://localhost:5173`. Jika port terpakai, Vite memilih port lain. Jangan membuka HTML langsung melalui `file://` atau hanya memakai Live Server karena source memakai import package dari Vite.

| Halaman | Path lokal |
| --- | --- |
| Marketplace | `/index.html` atau `/` |
| Tiket saya | `/tickets.html` |
| Organizer | `/organizer.html` |
| Admin | `/admin.html` |
| Gate Checker | `/gate.html` |
| Panduan demo | `/guide.html` |
| Docs | `/docs.html` |
| Lab Integrasi | `/integration.html` |

### Test, Build, dan Preview Lokal

```bash
npm test
npm run build
npm run preview
```

`npm run build` menghasilkan `dist/`; `npm run preview` menyajikan hasil build, biasanya di `http://localhost:4173`. Perintah preview lokal bukan deployment publik. Hentikan server dengan `Ctrl+C`.

### Mengedit Dokumentasi

Edit `README.md`, bukan `src/docs-content.js` atau `public/panduan.md`. Script `sync-docs` membuat ulang kedua salinan tersebut. `npm run dev`, `npm test`, dan `npm run build` menjalankannya otomatis melalui lifecycle npm.

Jika dev server sudah berjalan ketika README diubah:

```bash
npm run sync-docs
```

### Konfigurasi dan Lab Integrasi

`.env.example` memuat `VITE_CHAIN_ID=11155111` dan placeholder `VITE_CONTRACT_ADDRESS`. **Adapter saat ini tidak membaca template ini sebagai konfigurasi aktif.** Lab menerima alamat kontrak, Event ID, dan Token ID lewat form; chain ID ditetapkan pada model/adapter. Mengisi `.env` saja tidak mengaktifkan transaksi atau mengganti jaringan aplikasi.

Untuk mencoba Lab: pasang MetaMask, gunakan Ethereum Sepolia, isi kontrak ERC-721 tim dan token yang sudah ada, lalu periksa pemilik. Hanya pemilik yang dapat meminta tanda tangan QR. Tidak ada pengiriman ETH/transaksi dalam alur Lab ini. Persetujuan wallet harus tetap ditinjau pengguna.

Semua konfigurasi frontend dapat dibaca pengguna; `VITE_*` bukan tempat menyimpan secret. Jangan memasukkan private key, seed phrase, secret sesi/JWT, atau kredensial database ke source/frontend/GitHub.

### Urutan Integrasi Sistem Lengkap — Tahap Berikutnya

1. Sepakati stack backend/database, identitas event/token, dan kontrak API/ABI.
2. Siapkan environment server/database serta migration; implementasikan SIWE dan sesi.
3. Compile/test/deploy kontrak; konfigurasikan Admin, Organizer, dan Gate Checker.
4. Catat ABI, alamat, chain ID, dan blok deployment di lokasi bersama.
5. Jalankan backend/indexer dan hubungkan detail event/profil/laporan.
6. Hubungkan pembacaan dan transaksi bisnis frontend; tangani wallet rejection, pending, receipt, dan kegagalan.
7. Ganti otorisasi/state demo dengan sumber data server/kontrak untuk mode nyata; fasilitas demo harus ditandai terpisah.
8. Jalankan E2E lintas perangkat dan kumpulkan bukti transaksi/CRUD yang diminta dosen.

Belum ada perintah backend, migration, Hardhat, atau indexer yang valid dalam paket ini karena manifest/source modul tersebut belum disertakan.

## Pengujian dan Keamanan

### Hasil Verifikasi Source Saat Ini

Snapshot source telah diuji dengan Node.js 24.19.0/npm 11.9.0: **42 tes lulus dan build delapan halaman berhasil**.

| Kelompok tes | Jumlah | Cakupan |
| --- | --- | --- |
| Model | 13 | Pembelian, resale cap presisi wei, role, assignment, QR/expiry, check-in sekali, draft, rollback, signature, round-trip QR asli. |
| Adapter blockchain/RPC | 12 | Pembacaan ERC-721, domain/signature, token/event, owner transfer, expiry, perubahan akun/jaringan saat sign. |
| UI Lab | 6 | Connect/read/sign/verify, konfigurasi, input tidak valid, respons async lama, perubahan akun/jaringan. |
| UI marketplace/dashboard | 9 | Pembelian sampai check-in, guard role, draft, input XSS, token lookup, kegagalan kamera, render delapan halaman. |
| Pembaca Docs | 2 | Semua bagian/tabel/kode README, anchor sidebar, dan penolakan HTML/link berbahaya. |

DOM diuji melalui jsdom; canvas QR pada tes UI memakai stub. Ada tes terpisah yang benar-benar melakukan encode/decode payload dengan library QR. RPC memakai provider EIP-1193 tiruan dengan signature kriptografis nyata dari wallet sementara, **bukan panggilan Sepolia**.

Belum diverifikasi langsung: layout browser nyata, izin/scanner kamera perangkat, popup ekstensi MetaMask, transaksi kontrak, sinkronisasi antarperangkat, backend/API, serta E2E sistem lengkap. Tes model check-in tidak membuktikan transaksi paralel on-chain aman.

### Praktik yang Sudah Diterapkan

- Input event dirender sebagai teks/node DOM; pembaca Markdown tidak mengeksekusi HTML dan menolak protokol link berbahaya.
- Model memeriksa izin/status pada mutasi; handler mencegah klik ganda dan mutasi gagal di-rollback.
- QR demo mempunyai TTL/nonce dan invalidasi saat bukti diganti atau state relevan berubah.
- Harga memakai integer wei; tidak membandingkan harga dengan pembulatan floating point.
- Perubahan akun/jaringan/config membuang hasil Lab yang lama; kamera dihentikan saat tidak dipakai atau video gagal.
- Tidak ada permintaan/penyimpanan seed phrase atau private key pengguna. Alamat akun contoh bukan kredensial wallet.
- Lockfile tersedia; audit dependency perlu dijalankan ulang sebelum rilis. Tidak ada klaim jumlah advisory nol atau hasil audit kontrak yang belum diperoleh.

### Rencana Verifikasi Sistem Lengkap

Rencana verifikasi minimum:

| Area              | Skenario                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Authentication    | Nonce tidak bisa dipakai ulang; signature/domain yang salah ditolak.                                   |
| Authorization     | Wallet tanpa izin tidak bisa memanggil fungsi kontrak/API yang dilindungi.                             |
| Event ownership   | Organizer tidak bisa mengubah event organizer lain.                                                    |
| Resale            | Harga melewati batas ditolak; listing stale/tiket tidak valid ditangani.                               |
| Transfer/approval | Jalur transfer dan operator approval tidak melewati aturan marketplace.                                |
| Check-in          | Tiket used/event berbeda ditolak; dua request bersamaan tidak bisa menghasilkan dua check-in berhasil. |
| Off-chain CRUD    | Validasi input, izin profil/detail event, dan soft delete diuji.                                       |
| QR                | Payload salah ditolak; QR salinan tidak dianggap bukti pemilik.                                        |
| Upload            | Jenis/ukuran file, penamaan, dan lokasi penyimpanan diperiksa.                                         |
| Indexer           | Pembacaan ulang tidak menggandakan data; checkpoint dan perubahan chain ditangani.                     |
| Frontend          | Penolakan wallet, network salah, transaksi gagal, dan pending tampil jelas.                            |

Hasil Slither/Mythril, unit test, coverage, dan E2E dicatat setelah dijalankan. Self-audit bukan sertifikasi bahwa aplikasi bebas celah.

## Kolaborasi GitHub

### Mengunggah Source Pertama Kali

Ekstrak RAR terlebih dahulu. GitHub membutuhkan file/folder source agar bisa dibaca dan dikerjakan bersama; mengunggah RAR saja hanya menyimpan sebuah lampiran.

Pilihan paling sederhana: buat repository kosong, pilih **Add file → Upload files**, lalu unggah **isi folder `anti-calo`** sehingga `README.md` dan `package.json` langsung berada di root repository. Sertakan `.gitignore`, `.env.example`, dan lockfile; jangan sertakan `node_modules/`, `dist/`, file `.env` lokal, atau secret. Panduan langkah demi langkah terdapat di `docs/PANDUAN-GITHUB.md` pada arsip.

Jika menggunakan Git di terminal, jalankan dari folder `anti-calo` dan ganti URL contoh dengan repository milik kelompok:

```bash
git init
git add .
git status
git commit -m "Add anti-calo frontend demo and project progress docs"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```

Repository untuk cara terminal sebaiknya dibuat kosong, tanpa README awal. Jika repository sudah berisi pekerjaan teman, clone repository tersebut, buat branch, dan salin perubahan terkoordinasi; jangan force-push atau menimpa modul lain.

**Upload source ke GitHub belum membuat website ter-deploy.** Belum ada deployment GitHub Pages/Vercel/Netlify otomatis di paket ini. Untuk hosting statis, build dengan `npm ci` lalu `npm run build`, gunakan output `dist/`, dan tentukan konfigurasi hosting bersama. GitHub Pages pada subpath repository memerlukan penyesuaian `base` Vite sebelum deployment final.

### Workflow Kelompok

Usulan workflow:

- `main`: perubahan yang sudah direview dan siap untuk demo.
- `feature/<nama-fitur>`: pekerjaan fitur.
- `fix/<nama-perbaikan>`: perbaikan.
- `docs/<topik>`: dokumentasi.

Contoh branch: `feature/admin-dashboard`, `feature/siwe-login`, dan `feature/qr-check-in`.

Setiap pull request menjelaskan perubahan, cara memeriksa, dependency ke anggota lain, dan screenshot jika mengubah UI. Perubahan ABI/API/schema harus diberitahukan kepada anggota yang menggunakannya.

Usulan aturan repository: perubahan melalui pull request, minimal satu reviewer, dan pemeriksaan yang tersedia harus lulus. Konfigurasi branch protection disesuaikan dengan fasilitas repository kelompok.

Jangan commit file secret, `node_modules/` jika digunakan, file build sementara, atau database pribadi. Gunakan satu manifest/lockfile konsisten per modul dan hindari perubahan pada modul teman tanpa koordinasi.

## Demo dan Pengumpulan

### Demo yang Bisa Dicoba Sekarang

| Akun contoh | Role khusus | Wallet label |
| --- | --- | --- |
| Alya | Tidak ada; Buyer dasar | `0x1111111111111111111111111111111111111111` |
| Nusa Collective | Organizer | `0x2222222222222222222222222222222222222222` |
| Admin anti-calo | Admin | `0x3333333333333333333333333333333333333333` |
| Raka | Gate Checker | `0x4444444444444444444444444444444444444444` |

Alamat di atas adalah label akun demo; tidak ada private key yang disertakan.

1. Pilih Alya, beli tiket demo dari Marketplace, lalu buka **Tiket saya → Tampilkan QR** dan salin payload JSON.
2. Buka tab lain pada **origin yang sama**, pilih akun Raka di Gate Checker, pilih event yang sama, tempel payload, verifikasi, lalu konfirmasi check-in.
3. Gunakan ulang payload: check-in ditolak karena tiket sudah used. Coba juga QR expired/event berbeda/QR lama yang sudah diganti.
4. Coba listing harga di atas harga awal: ditolak. Listing harga yang valid dapat dibeli akun demo lain dan kepemilikan berpindah.
5. Pilih Organizer untuk membuat draft tanggal mendatang, publish, dan tambah/hapus penugasan Raka. Role Gate Checker harus diberikan Admin terlebih dahulu.
6. Pilih Admin untuk menangguhkan/mengaktifkan kembali/membatalkan event; perubahan membatasi alur pembelian/check-in sesuai state demo.
7. Buka Docs untuk dokumentasi yang mudah dibaca. Lab Integrasi merupakan jalur terpisah memakai wallet/NFT nyata jika prasyaratnya tersedia.

Scanner memerlukan izin kamera dan HTTPS atau localhost. Bila kamera tidak tersedia, payload JSON tetap dapat digunakan. Pencarian manual Token ID hanya menampilkan informasi; tidak melewati bukti QR untuk check-in. Tombol **Isi QR contoh** adalah fasilitas latihan demo, bukan kewenangan petugas pada sistem produksi. Jam check-in demo tidak dibatasi tanggal event agar dapat dipresentasikan.

### Demo Final Setelah Integrasi

Urutan demo yang direncanakan:

1. Admin memberikan role.
2. Organizer membuat event dengan data inti on-chain dan detail off-chain.
3. Buyer login, membeli tiket, dan membuka QR.
4. Buyer melakukan resale; percobaan melewati batas harga ditolak.
5. Gate Checker melakukan check-in; percobaan check-in kedua ditolak.
6. Tunjukkan update/cancel event serta CRUD profil.
7. Tunjukkan state kontrak, transaksi, dan hasil pengujian.

## Tindak Lanjut dan Serah Terima Tim

Pembagian berikut mengikuti penomoran tugas awal. Kolom berikut adalah keluaran yang diperlukan frontend, bukan klaim bahwa pekerjaan teman belum dimulai.

| Anggota / area | Posisi terhadap source yang sudah tersedia | Keluaran berikut yang perlu dibagikan |
| --- | --- | --- |
| 1/2 — kontrak, pengujian, deployment | Frontend dan Lab siap menjadi titik integrasi; kode kontrak belum terlampir pada paket ini. | ABI/alamat/deployment, aturan bisnis, fungsi dan error/event log, akun role, hasil test/audit yang benar-benar dijalankan. |
| 3 — SIWE, sesi, profil, fondasi backend | UI demo belum login ke server dan profil belum memiliki CRUD. | Stack backend/database, endpoint nonce/verify/me/logout/profil, kebijakan sesi, format role/user, validasi dan izin. |
| 4 — publik dan Buyer | Marketplace, Tiket saya, pembelian/resale/QR sudah tersedia sebagai frontend bersama. | Hubungkan data event/NFT, auth, transaksi dan status receipt tanpa menggandakan komponen/layout. |
| 5 — dashboard dan check-in | Admin, Organizer, Gate Checker, role, assignment, scanner/QR, serta Lab sudah tersedia. | Hubungkan kontrak/API pada dashboard, verifikasi QR/check-in atomik, lalu uji kamera/MetaMask/perangkat nyata. |
| 6 — detail event, upload, laporan/indexer | Form/ringkasan saat ini memakai state demo dan poster bawaan. | API detail event/upload/report, mapping ID on-chain/off-chain, event listener/checkpoint, skema respons dan penanganan duplikasi. |

Urutan kerja integrasi yang disarankan:

- [ ] Sepakati interface kontrak dan API tertulis; catat versi serta siapa pemilik setiap modul.
- [ ] Bagikan satu deployment Sepolia dan akun pengujian per role tanpa membagikan private key.
- [ ] Aktifkan SIWE dan CRUD off-chain; frontend tidak boleh dipercaya sebagai sumber role.
- [ ] Hubungkan baca event/tiket, pembelian, resale, role, dan assignment dengan receipt/status transaksi.
- [ ] Samakan skema EIP-712 dan implementasikan check-in kontrak dengan replay protection.
- [ ] Uji cancel/refund/used/transfer serta transaksi paralel dan sinkronisasi beberapa perangkat.
- [ ] Jalankan tes kontrak/API/E2E, uji browser/kamera/MetaMask, dan kumpulkan bukti rubrik dosen.
- [ ] Sepakati hosting bersama, konfigurasi environment, dan prosedur demo/pengumpulan.

Setiap handoff minimal berisi branch/commit, cara menjalankan, contoh request/response atau pemanggilan kontrak, skenario gagal, dan dependency ke modul lain. Hindari mengubah interface tanpa memberi tahu penggunanya.

## Keputusan yang Belum Final

Sudah diputuskan/diimplementasikan pada frontend: **anti-calo**, HTML/CSS/JavaScript dengan Vite, ethers, qrcode, jsQR, jsdom, delapan halaman, satu role khusus per wallet, assignment Gate Checker oleh Organizer, QR TTL 120 detik, batas resale demo 100%, dan Docs di website.

Yang masih perlu disepakati atau diverifikasi bersama:

- Deadline, nama/NIM anggota, dan repository kelompok resmi.
- Stack backend/database; detail SIWE, sesi/cookie, CSRF, validasi, dan sinkronisasi role.
- Versi Solidity/Hardhat/dependency kontrak, ABI bisnis, alamat deployment, dan lokasi state check-in.
- Parameter kontrak final: cap resale, batas beli, fee, pembayaran, serta transfer/approval.
- Penyamaan aturan role/assignment kontrak dengan model demo dan administrasi Admin utama.
- Field event yang boleh diperbarui setelah penjualan, mapping event/token, refund/cancel/revoke/burn.
- Skema QR verifier final, konsumsi nonce, invalidasi, waktu blok, replay, dan pemeriksaan owner atomik.
- Checkpoint/finalitas/penanganan duplikasi atau perubahan chain pada indexer.
- Penerimaan cancel/soft delete untuk rubrik CRUD dosen.
- Uji langsung browser, kamera, MetaMask, Sepolia, backend, dan E2E lintas perangkat.
- Provider hosting, pengaturan akses, dan langkah deployment GitHub/hosting final.

## Riwayat Perubahan

| Tahap | Hasil |
| --- | --- |
| Rancangan awal | Scope anti-calo, empat role, rencana on-chain/off-chain, pembagian modul dan struktur kelompok. |
| Implementasi frontend | Marketplace/Buyer, dashboard tiga role khusus, state demo, draft/publish, resale cap, QR/scan/check-in. |
| Fondasi integrasi | Adapter ERC-721 Sepolia, koneksi MetaMask, Lab sign/verify EIP-712, pengamanan perubahan akun/jaringan/hasil async. |
| Perbaikan keterbacaan | Teks kecil dinaikkan sekitar 2 px dengan minimum 12 px; tautan dokumentasi menuju Docs; footer menjadi copyright dinamis. |
| Penggantian nama, 15 Oktober 2026 | Nama website, logo teks, judul tab, footer, Docs, akun Admin bawaan, nama paket, URL preview, serta dokumentasi menjadi **anti-calo**. Domain usulan EIP-712 diperbarui menjadi `AntiCaloCheckIn`; samakan dengan kontrak sebelum integrasi. |
| Dokumentasi dan handoff, 15 Oktober 2026 | README awal diperbarui dengan stack/version, status aktual, batas demo, struktur nyata vs rencana, setup, pengujian, dan kebutuhan anggota lain; source disiapkan sebagai RAR untuk upload GitHub. |

Snapshot source disinkronkan dengan preview **anti-calo** setelah penggantian nama pada 15 Oktober 2026. Paket ini menyertakan source dan dokumentasi terbaru, tanpa riwayat Git atau identitas hosting preview. Upload/deployment GitHub tetap dilakukan oleh tim.
