# Marketplace Tiket Event Anti-Calo

Proyek akhir mata kuliah **Blockchain Fundamental** — Computer Science, semester 5, penjurusan Cyber Security.

Aplikasi web berbasis blockchain untuk membeli tiket event, menjual kembali tiket melalui marketplace dengan batas harga, dan memvalidasi tiket saat check-in. Tiket direpresentasikan sebagai **NFT ERC-721**, sedangkan detail event dan profil pengguna disimpan off-chain.

> **Status: tahap perencanaan.** README ini mendokumentasikan rancangan fitur dan struktur repository. Nama folder, interface, stack yang belum dipilih, serta langkah operasional perlu disesuaikan dengan implementasi. Belum ada klaim bahwa fitur, deployment, atau pengujian sudah selesai.

## Daftar Isi

- [Kriteria Tugas](#kriteria-tugas)
- [Fitur Aplikasi](#fitur-aplikasi)
- [Role dan Hak Akses](#role-dan-hak-akses)
- [Penyimpanan Data dan CRUD](#penyimpanan-data-dan-crud)
- [Arsitektur dan Integrasi](#arsitektur-dan-integrasi)
- [Teknologi](#teknologi)
- [Struktur Folder](#struktur-folder)
- [Persiapan dan Menjalankan Proyek](#persiapan-dan-menjalankan-proyek)
- [Pengujian dan Keamanan](#pengujian-dan-keamanan)
- [Kolaborasi GitHub](#kolaborasi-github)
- [Demo dan Pengumpulan](#demo-dan-pengumpulan)
- [Keputusan yang Belum Final](#keputusan-yang-belum-final)

## Kriteria Tugas

| Kriteria dosen                                           | Rencana pemenuhan                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Aplikasi berbasis web dengan data on-chain di blockchain | Smart contract menyimpan data inti event, tiket, kepemilikan, dan state transaksi.       |
| Tema utama aplikasi                                      | Marketplace tiket event anti-calo.                                                       |
| Minimal 3 role                                           | Admin, Organizer, Buyer, dan Gate Checker.                                               |
| Login menggunakan wallet address                         | Connect wallet dan autentikasi SIWE melalui signature.                                   |
| CRUD on-chain untuk minimal 1 jenis data                 | Data inti event menjadi kandidat utama: create, read, update, dan cancel/soft delete.    |
| CRUD off-chain untuk minimal 1 jenis data                | Profil pengguna dan detail event.                                                        |
| Source code dan file pendukung deployment                | Repository, konfigurasi contoh, script deployment, ABI, alamat kontrak, dan dokumentasi. |

**Catatan delete:** pembatalan event atau pencabutan tiket mengubah state aktifnya; riwayat blockchain tetap tersimpan. Penerimaan soft delete untuk rubrik harus dikonfirmasi kepada dosen.

## Fitur Aplikasi

Seluruh fitur di bawah merupakan target implementasi.

### Publik dan Buyer

- Melihat daftar dan detail event.
- Menghubungkan MetaMask dan login menggunakan wallet.
- Membeli tiket dan melihat NFT yang dimiliki.
- Menampilkan QR tiket pada halaman **Tiket saya**.
- Membuat listing resale, membatalkan listing sendiri, dan membeli tiket resale.
- Mengelola profil pengguna melalui CRUD off-chain.
- Melihat status transaksi: menunggu persetujuan wallet, menunggu konfirmasi, berhasil, atau gagal.

### Dashboard Admin

- Melihat wallet dan role yang diberikan.
- Memberikan atau mencabut role Organizer dan Gate Checker.
- Melihat event dan mengelola status event sesuai izin kontrak.
- Menampilkan konfirmasi sebelum tindakan yang mengubah role atau status event.

### Dashboard Organizer

- Membuat event dan mengelola event miliknya.
- Mengisi detail event: deskripsi, kategori, lokasi, dan poster.
- Mengatur data inti event sesuai aturan kontrak.
- Melihat laporan jumlah tiket terjual dan pendapatan.
- Melihat fee resale jika disertakan dalam scope laporan final.

### Dashboard Gate Checker

- Memilih event yang boleh diperiksa.
- Memindai QR tiket dan menampilkan hasil pemeriksaan.
- Mengirim transaksi check-in melalui wallet.
- Menampilkan tiket valid, sudah digunakan, dicabut, atau berasal dari event lain.
- Menampilkan keberhasilan check-in setelah transaksi terkonfirmasi.

### Aturan Anti-Calo

- Harga resale dibatasi; **110% dari harga awal adalah contoh, bukan parameter final**.
- Jumlah pembelian per wallet dibatasi; jumlahnya belum ditetapkan.
- Transfer kepemilikan tiket hanya melalui jalur marketplace yang diizinkan kontrak.
- Tiket yang sudah digunakan tidak boleh check-in kembali.
- Perilaku resale/transfer untuk tiket used, revoked, atau event canceled harus ditentukan.

Batas per wallet tidak membuktikan satu wallet mewakili satu orang. Efektivitas anti-calo dibatasi oleh aturan yang benar-benar ditegakkan kontrak dan mekanisme verifikasi tiket.

## Role dan Hak Akses

Matriks berikut merupakan **usulan untuk disepakati kelompok**, bukan izin yang sudah diimplementasikan.

| Tindakan                  | Admin                     | Organizer                 | Buyer               | Gate Checker              |
| ------------------------- | ------------------------- | ------------------------- | ------------------- | ------------------------- |
| Melihat event publik      | Ya                        | Ya                        | Ya                  | Ya                        |
| Membeli tiket             | Sesuai eligibility wallet | Sesuai eligibility wallet | Ya                  | Sesuai eligibility wallet |
| Mengelola role khusus     | Ya                        | Tidak                     | Tidak               | Tidak                     |
| Membuat event             | Belum final               | Ya                        | Tidak               | Tidak                     |
| Mengubah detail event     | Sesuai kebijakan admin    | Event sendiri             | Tidak               | Tidak                     |
| Membatalkan event         | Sesuai kebijakan admin    | Sesuai izin event sendiri | Tidak               | Tidak                     |
| Menjual kembali tiket     | Tiket milik sendiri       | Tiket milik sendiri       | Tiket milik sendiri | Tiket milik sendiri       |
| Melihat laporan penjualan | Sesuai kebijakan          | Event sendiri             | Tidak               | Tidak                     |
| Melakukan check-in        | Tidak otomatis            | Tidak otomatis            | Tidak               | Event yang ditugaskan     |
| CRUD profil               | Profil sendiri            | Profil sendiri            | Profil sendiri      | Profil sendiri            |

Buyer adalah akses dasar. Admin, Organizer, dan Gate Checker merupakan izin on-chain tambahan; aturan apakah satu wallet boleh memiliki beberapa role perlu disepakati.

**Frontend mengatur tampilan, backend memeriksa izin off-chain, dan kontrak memeriksa izin on-chain.** Menyembunyikan tombol saja tidak memberikan perlindungan akses.

## Penyimpanan Data dan CRUD

### Pembagian Data

| Penyimpanan            | Data                                                                                    | Sumber kebenaran                     |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------------------------ |
| Blockchain             | Data inti event, token ID, kepemilikan tiket, status used/revoked, role, listing resale | Smart contract                       |
| Database off-chain     | Profil user, deskripsi event, poster, kategori, lokasi                                  | Backend/database                     |
| Database hasil indexer | Salinan aktivitas kontrak untuk daftar, riwayat, dan laporan                            | Blockchain; database adalah proyeksi |
| Penyimpanan media      | File poster yang referensinya disimpan di database                                      | Backend/media storage                |

Field inti event yang tepat, identitas event, dan lokasi state check-in masih perlu ditetapkan. Data pribadi tidak direncanakan untuk disimpan on-chain.

### Bukti CRUD

| Jenis data             | Insert              | View                    | Update                          | Delete                   |
| ---------------------- | ------------------- | ----------------------- | ------------------------------- | ------------------------ |
| Event inti on-chain    | Buat event          | Baca event dari kontrak | Ubah field yang diizinkan       | Cancel/soft delete event |
| Tiket on-chain         | Mint saat pembelian | Baca pemilik dan status | Transfer/check-in sesuai aturan | Burn/revoke sesuai izin  |
| Profil off-chain       | Buat profil         | Tampilkan profil        | Ubah profil                     | Soft delete akun         |
| Detail event off-chain | Buat detail event   | Tampilkan detail event  | Ubah deskripsi/poster/lokasi    | Soft delete detail event |

Pembatasan update setelah tiket terjual, hubungan cancel event dengan detail off-chain, serta refund harus ditentukan sebelum implementasi. Soft delete profil tidak menghapus kepemilikan NFT atau riwayat blockchain.

## Arsitektur dan Integrasi

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

## Teknologi

| Bagian                     | Pilihan/status                                     |
| -------------------------- | -------------------------------------------------- |
| NFT                        | ERC-721                                            |
| Smart contract             | Solidity; versi dan dependensi belum dipilih       |
| Testing/deployment kontrak | Hardhat sesuai pembagian tugas                     |
| Target testnet             | Sepolia sesuai rencana kelompok                    |
| Wallet                     | MetaMask                                           |
| Login                      | SIWE                                               |
| Sesi                       | Session atau JWT; belum final                      |
| Frontend                   | HTML/CSS/JavaScript atau framework yang disepakati |
| Backend/database           | Belum final                                        |
| Library wallet dan QR      | Belum final                                        |
| Audit awal                 | Slither/Mythril sesuai rencana anggota 2           |
| Repository                 | GitHub                                             |

Versi runtime, package, dan compiler harus dicatat setelah dipilih. Struktur frontend/backend berikut bersifat usulan modular dan bisa disesuaikan dengan stack kelompok.

## Struktur Folder

**Struktur yang direncanakan; README ini tidak sekaligus membuat folder atau source code tersebut.** Frontend buyer dan dashboard berada dalam satu aplikasi agar komponen login/wallet dapat digunakan bersama.

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

### Prasyarat yang Perlu Disepakati

- Runtime dan package manager sesuai stack final.
- Database dan mekanisme migration.
- Wallet untuk demo; wallet deployer terpisah dari wallet pengguna demo.
- Akses RPC serta saldo testnet untuk deployment/transaksi.
- Versi compiler dan tooling kontrak yang kompatibel.

### Urutan Setup

1. Clone repository dan ikuti konfigurasi modul.
2. Instal dependency sesuai manifest dan lockfile masing-masing modul.
3. Salin konfigurasi contoh menjadi konfigurasi lokal; isi nilai yang diperlukan.
4. Siapkan database dan jalankan migration.
5. Compile, test, dan deploy kontrak ke lingkungan yang dipilih.
6. Konfigurasikan Admin, Organizer, dan Gate Checker.
7. Perbarui `shared/abi/` dan `shared/deployments/`.
8. Jalankan backend dan indexer dengan network/alamat kontrak yang sama.
9. Jalankan frontend, login, lalu lakukan demo setiap role.

**Perintah instalasi dan menjalankan aplikasi belum tersedia** karena source code, manifest, dan stack final belum diberikan. Isi tabel berikut setelah script benar-benar dibuat dan diuji:

| Operasi                     | Perintah final |
| --------------------------- | -------------- |
| Instalasi dependency        | TODO           |
| Migration/seed database     | TODO           |
| Compile/test kontrak        | TODO           |
| Deployment lokal/Sepolia    | TODO           |
| Menjalankan backend/indexer | TODO           |
| Menjalankan frontend        | TODO           |
| Pengujian end-to-end        | TODO           |

Konfigurasi frontend dapat dibaca pengguna. Private key deployer, secret sesi/JWT, dan kredensial database hanya disimpan pada lingkungan server/lokal yang sesuai, tidak pada frontend atau GitHub.

## Pengujian dan Keamanan

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

Urutan demo yang direncanakan:

1. Admin memberikan role.
2. Organizer membuat event dengan data inti on-chain dan detail off-chain.
3. Buyer login, membeli tiket, dan membuka QR.
4. Buyer melakukan resale; percobaan melewati batas harga ditolak.
5. Gate Checker melakukan check-in; percobaan check-in kedua ditolak.
6. Tunjukkan update/cancel event serta CRUD profil.
7. Tunjukkan state kontrak, transaksi, dan hasil pengujian.

Checklist pengumpulan:

- [ ] Nama/NIM anggota dan identitas proyek lengkap.
- [ ] Source code sesuai commit/tag pengumpulan.
- [ ] README dan perintah setup sudah sesuai implementasi.
- [ ] Dependency, versi runtime, dan konfigurasi contoh tersedia.
- [ ] Migration/seed dan script deployment tersedia.
- [ ] ABI, network, alamat kontrak, dan blok deployment tercatat.
- [ ] Kriteria CRUD serta empat role dapat didemokan.
- [ ] Hasil test dan self-audit beserta perbaikan didokumentasikan.
- [ ] Panduan demo dan presentasi tersedia.
- [ ] Tidak ada private key atau secret dalam repository.

## Keputusan yang Belum Final

- Nama aplikasi, deadline, serta nama/NIM anggota.
- Stack frontend/backend/database, library wallet/QR, dan versi runtime.
- Parameter harga resale, batas beli, fee, dan metode pembayaran.
- Izin Admin/Organizer dan penugasan Gate Checker per event.
- Lokasi state check-in dan pembagian interface kontrak.
- Field event yang dapat diubah setelah penjualan dimulai.
- Verifikasi pemilik saat scan QR.
- Refund, cancellation, dan dampak revoke/burn.
- Kebijakan sesi, sinkronisasi role, dan finalitas data indexer.
- Penerimaan soft delete untuk rubrik dosen.
- Penyedia hosting dan langkah deployment final.
