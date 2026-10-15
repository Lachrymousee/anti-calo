# anti-calo — Marketplace Tiket Event Anti-Calo

Frontend website berdasarkan `anti-calo-frontend.md`, untuk proyek Blockchain Fundamental. Dibuat dengan Vite, HTML, CSS, dan JavaScript murni dalam struktur multi-page.

> **Status: frontend dengan demo interaktif.** Pembelian, NFT, resale, role, penugasan, dan check-in masih berupa simulasi di browser. Belum ada transaksi atau penyimpanan data aplikasi pada blockchain. Marketplace memakai akun demo. Halaman Lab Integrasi dapat membaca NFT asli di Sepolia dan meminta tanda tangan EIP-712 melalui MetaMask, tanpa mengirim transaksi. Jangan memakai demo ini untuk tiket event sungguhan.

> Panduan ini mendeskripsikan implementasi frontend. Status keseluruhan kelompok dan struktur paket ekspor yang terbaru ada pada README.md di root.

## 1. Hasil analisis dokumen awal

Dokumen awal sudah menjelaskan QR, role, pembagian wewenang, dan stack. Agar dapat digunakan sebagai website, implementasi menambahkan marketplace, halaman tiket, alur transaksi demo, draft event, dialog konfirmasi, pengelolaan role, serta penanganan kegagalan.

| Poin dokumen awal | Penerapan dan perbaikan |
| --- | --- |
| QR berlaku sekitar 2 menit | QR demo menggunakan expiry 120 detik, nonce, event, token, dan pemilik. Membuat QR baru membatalkan QR lama. |
| QR EIP-712 | Modul EIP-712 di `src/chain.js` dapat dicoba melalui Lab Integrasi dengan NFT ERC-721 asli di Sepolia. Tidak digunakan pada QR demo. |
| Verifikasi frontend cukup untuk MVP | Cukup untuk prototipe UI. Untuk keamanan tiket sungguhan, kontrak harus memverifikasi izin, bukti, expiry, kepemilikan saat transaksi, dan status pemakaian. |
| Satu role khusus per wallet | Model demo menolak pemberian role khusus kedua, termasuk alamat yang hanya berbeda huruf besar/kecil. Buyer tetap menjadi akses dasar. |
| Gate Checker diberikan Admin dan ditugaskan Organizer | Kedua tahap dipisah. Petugas hanya melihat event yang ditugaskan ke wallet-nya. |
| Admin mengelola status, bukan isi event | Admin membaca semua event dan penjualan, menangguhkan, mengaktifkan kembali, atau membatalkan. Tidak dapat membuat, mengedit, atau menerbitkan draft. |
| Input manual token sebagai cadangan | Token ID hanya mencari informasi tiket. Check-in tetap memerlukan bukti QR pemilik. |
| Anti-calo | Pasar resale membatasi harga ke harga awal tiket dengan perbandingan integer wei, bukan pembulatan floating point. |
| Screenshot QR cepat kedaluwarsa | Expiry membatasi umur screenshot, tetapi screenshot masih dapat dipakai selama valid. EIP-712 sendiri tidak menyediakan replay protection. Check-in sekali dan invalidasi harus ditegakkan kontrak. |

## 2. Halaman website

| Halaman | File | Fitur |
| --- | --- | --- |
| Marketplace | `index.html` | Event pilihan, pencarian, filter kategori/kota, pengurutan, event tersimpan, pembelian, dan pasar resale. |
| Tiket saya | `tickets.html` | Tiket milik akun, status, QR dinamis, countdown, salin payload, penawaran resale, serta pembatalan penawaran. |
| Organizer | `organizer.html` | Ringkasan, tabel event milik wallet, buat/edit draft, penerbitan, dan penugasan petugas gerbang. |
| Admin | `admin.html` | Pengawasan event, data penjualan hanya baca, perubahan status event, pemberian dan pencabutan role. |
| Gate Checker | `gate.html` | Pilihan event yang ditugaskan, scanner kamera, payload QR, verifikasi, check-in, penghitung, dan pencarian token manual. |
| Panduan | `guide.html` | Penjelasan alur, tombol menuju tiap langkah, fitur demo, dan batas integrasi blockchain. |
| Docs | `docs.html` | Dokumentasi yang dapat dibaca langsung, daftar isi, anchor bagian, tabel responsive, dan blok kode. |
| Lab Integrasi | `integration.html` | Konfigurasi kontrak/token/event, pembacaan pemilik NFT Sepolia, QR EIP-712, countdown, serta verifikasi ulang signature dan pemilik. |

Desain menggunakan latar hangat, aksen jingga dan hijau, serta enam poster event SVG buatan khusus. Semua event dan angka penjualan awal adalah contoh, bukan informasi event nyata. Font web memiliki fallback sistem.

## 3. Matriks izin

| Kemampuan | Buyer dasar | Organizer | Admin | Gate Checker |
| --- | --- | --- | --- | --- |
| Jelajahi dan beli tiket | Ya | Ya | Ya | Ya |
| QR dan resale tiket milik sendiri | Ya | Ya | Ya | Ya |
| Buat/edit draft dan terbitkan event sendiri | Tidak | Ya | Tidak | Tidak |
| Tugaskan petugas pada event sendiri | Tidak | Ya | Tidak | Tidak |
| Baca semua event dan penjualan | Event publik | Event sendiri | Ya | Event penugasan |
| Tangguhkan/aktifkan kembali/batalkan event | Tidak | Tidak pada demo | Ya | Tidak |
| Berikan/cabut role khusus | Tidak | Tidak | Ya, Organizer/Gate Checker | Tidak |
| Verifikasi dan check-in | Tidak | Tidak | Tidak | Hanya event penugasan |

Tidak ada penggantian role pada wallet yang sama. Menu **Pilih akun demo** mengganti sesi ke wallet contoh lain. Role Admin tidak dapat diberikan atau dicabut melalui form demo.

## 4. Akun demo

| Akun | Role khusus | Wallet contoh |
| --- | --- | --- |
| Alya | Tidak ada; Buyer dasar | `0x1111111111111111111111111111111111111111` |
| Nusa Collective | Organizer | `0x2222222222222222222222222222222222222222` |
| Admin anti-calo | Admin | `0x3333333333333333333333333333333333333333` |
| Raka | Gate Checker | `0x4444444444444444444444444444444444444444` |

Alamat tersebut merupakan label akun demo. Website tidak memiliki private key untuk akun-akun ini. Alya memiliki dua tiket awal; satu tiket resale milik akun contoh lain tersedia di marketplace.

Data demo disimpan dalam `localStorage`, sesi akun dalam `sessionStorage`. Tab lain pada browser yang sama menerima pembaruan data melalui event `storage`, sementara pilihan akun tetap per tab. Dua perangkat berbeda tidak berbagi data. Penyimpanan browser dapat dimodifikasi penggunanya dan bukan sumber otorisasi yang aman. Jika penyimpanan tidak tersedia, demo hanya bertahan di memori sesi.

## 5. Cara menjalankan lokal

Prasyarat: Node.js yang kompatibel dengan versi Vite yang dipin pada `package.json`; implementasi diuji dengan Node.js 24.

```bash
npm ci
npm run dev
```

Buka URL yang diberikan Vite. Untuk build dan pemeriksaan:

```bash
npm test
npm run build
npm run preview
```

Halaman `docs.html` menampilkan dokumentasi sebagai halaman yang dapat dibaca. Edit `README.md`; `npm run dev`, `npm test`, dan `npm run build` otomatis menyinkronkannya. Saat dev server sudah berjalan, jalankan `npm run sync-docs` setelah mengedit README untuk memperbarui Docs.

Commit `package-lock.json` agar seluruh anggota tim memakai versi dependency yang sama. `.env.example` hanya memuat konfigurasi publik. Semua variabel `VITE_*` dapat terlihat oleh pengguna browser.

## 6. Skenario mencoba website

1. Buka Marketplace dengan akun Alya, pilih event, lalu konfirmasi pembelian demo.
2. Buka **Tiket saya**, pilih **Tampilkan QR**, lalu buka detail payload dan salin JSON.
3. Buka halaman **Gate Checker** pada tab lain. Gunakan akun Raka dan pilih event yang sama.
4. Tempel payload dan tekan **Verifikasi QR**, kemudian **Konfirmasi check-in**.
5. Tempel QR yang sama lagi: website menolak karena tiket sudah digunakan.
6. Coba QR yang sudah melewati dua menit, QR dari event lain, atau QR lama setelah membuat ulang.
7. Dari akun Organizer, hapus penugasan Raka. Akun Gate Checker tidak dapat check-in untuk event itu lagi.
8. Dari akun Admin, tangguhkan event. Pembelian dan check-in berhenti sampai diaktifkan kembali.
9. Coba jual tiket aktif dengan harga di atas harga awal: penawaran ditolak. Harga yang memenuhi batas dapat ditawarkan dan dibeli akun lain.

Tombol **Isi QR contoh** di dashboard Gate Checker membuat bukti contoh atas akun Buyer untuk latihan. Ini fasilitas demo, bukan kemampuan yang boleh tersedia bagi petugas pada dApp produksi. Tombol **Reset demo** mengembalikan seluruh data contoh di browser ini.

Scanner memerlukan izin kamera dan HTTPS, atau localhost saat pengembangan. Jika kamera tidak tersedia, gunakan payload QR. Pencarian token manual tidak melewati verifikasi QR. Mode demo sengaja tidak membatasi jam check-in berdasarkan tanggal event agar alur dapat dipresentasikan.

## 7. Struktur folder

```text
anti-calo/
├── index.html
├── tickets.html
├── organizer.html
├── admin.html
├── gate.html
├── guide.html
├── docs.html
├── integration.html
├── src/
│   ├── main.js       # Tampilan halaman, form, dialog, dan scanner
│   ├── docs.js       # Pembaca dokumentasi dengan node DOM aman
│   ├── docs-content.js # Hasil sinkronisasi README untuk tampilan Docs
│   ├── ui.js         # Komponen DOM aman, ikon, dialog, dan notifikasi
│   ├── model.js      # Aturan demo: tiket, resale, role, QR, dan check-in
│   ├── store.js      # Penyimpanan serta rollback mutasi yang gagal
│   ├── integration.js # Antarmuka uji NFT dan QR signed pada Sepolia
│   ├── chain.js      # Adapter ERC-721, wallet, dan EIP-712
│   └── styles.css    # Layout responsive dan aksesibilitas
├── public/
│   ├── art/          # Enam poster event SVG
│   ├── favicon.svg
│   └── panduan.md    # Salinan panduan untuk diakses dari website
├── scripts/
│   └── sync-docs.mjs # Sinkronkan README saat dev/test/build
├── tests/
│   ├── docs.test.js  # Render isi dokumentasi dan keamanan Markdown
│   ├── model.test.js # Aturan bisnis, izin, signature, dan expiry
│   ├── chain.test.js # Pemeriksaan RPC, ownership, signature, dan perubahan wallet
│   ├── integration-ui.test.js # Alur lab dan penolakan hasil async yang sudah tidak berlaku
│   └── ui.test.js    # Alur antarmuka melalui jsdom
├── .env.example
├── package.json
├── package-lock.json
├── vite.config.js
└── README.md
```

## 8. QR demo dan rencana QR on-chain

### QR demo yang aktif saat ini

```json
{
  "v": 1,
  "mode": "demo",
  "chainId": 11155111,
  "contract": "demo-only",
  "eventId": "nusa",
  "tokenId": "1001",
  "owner": "0x1111111111111111111111111111111111111111",
  "issuedAt": 1791882000,
  "expiresAt": 1791882120,
  "nonce": "00000000000000000000000000000000"
}
```

Payload di atas hanya ilustrasi format. QR yang diterima harus cocok dengan bukti yang diterbitkan model demo. Nonce sebenarnya dibuat acak. Payload dibatasi ukurannya dan tidak diperlakukan sebagai HTML atau JavaScript.

### Fondasi EIP-712 untuk integrasi

`src/chain.js` menyediakan:

- `connectInjectedWallet`: meminta akun melalui provider wallet dan membaca chain ID.
- `switchToSepolia`: meminta wallet berpindah ke chain ID `11155111`.
- `readOnchainTicket`: memeriksa chain ID, deployment kontrak, dukungan ERC-721 melalui ERC-165, dan `ownerOf` pada blok yang sama.
- `signOnchainQR`: membaca owner, memeriksa akun, membuat message dari waktu blok, lalu meminta `signTypedData`. Setelah popup wallet selesai, jaringan, akun, expiry, dan owner dibaca/diperiksa lagi.
- `validateSignedQR`: memulihkan signer dan memeriksa domain, **event dan token yang diharapkan**, owner, bentuk nonce/signature, serta expiry.
- `verifyOnchainQR`: menolak ketidaksesuaian konfigurasi sebelum RPC, lalu membaca ulang owner dari Sepolia untuk memverifikasi bukti.
- `submitOnchainTransaction`: sengaja berhenti dengan pesan integrasi belum aktif, sehingga fungsi ABI tidak ditebak.

Domain: `name = AntiCaloCheckIn`, `version = 1`, `chainId = 11155111`, dan `verifyingContract = alamat kontrak final`.

Message `CheckIn`: `eventId`, `tokenId`, `owner`, `issuedAt`, `expiresAt`, dan `nonce`. Event ID on-chain diasumsikan integer; mapping dari ID demo ke ID kontrak perlu disepakati. Nonce on-chain berformat `bytes32`. Format ini merupakan usulan frontend yang harus disamakan persis dengan kontrak, bukan ABI yang sudah final.

Verifikasi signature di frontend membantu pengalaman petugas, tetapi tidak cukup sebagai kontrol keamanan. EIP-712 tidak menyediakan replay protection. Kontrak harus menegakkan status tiket terpakai atau konsumsi nonce, dan keputusan check-in harus dilakukan dalam transaksi yang atomik.

## 9. Yang dibutuhkan dari tim smart contract

- Alamat kontrak final pada Sepolia, ABI, versi deployment, dan transaksi contoh.
- Struktur event, status, kapasitas, harga, token, dan pemilik.
- Mekanisme role yang menolak role khusus kedua untuk wallet yang sama.
- Mapping penugasan Gate Checker per event, hanya dapat diubah Organizer pemilik event.
- `ownerOf(tokenId)` serta cara membaca event asal dan status tiket.
- Fungsi pembelian, listing, unlisting, dan resale; harga memakai integer wei.
- Kebijakan transfer NFT agar pembatasan resale tidak mudah dilewati melalui transfer di luar marketplace.
- Fungsi check-in yang menegakkan role, assignment, event, signature, expiry berbasis waktu blok, pemilik terbaru, dan status belum terpakai; transaksi bersamaan harus menghasilkan maksimal satu keberhasilan.
- Aturan nonce, pergantian QR, perubahan pemilik, dan invalidasi saat perubahan status event.
- Kebijakan pembatalan, refund, pencabutan role Organizer yang masih punya event, dan administrasi Admin utama.
- Event log kontrak untuk memperbarui UI setelah transaksi berhasil dan untuk perubahan dari pengguna lain.

Nama fungsi bisnis belum ditebak karena ABI tidak dilampirkan. Mengisi `VITE_CONTRACT_ADDRESS` saja tidak mengubah website menjadi dApp lengkap: adapter transaksi, pembacaan data, serta otorisasi perlu dihubungkan dan diuji.

## 10. Praktik keamanan yang diterapkan

- Data pengguna dirender dengan node teks dan `textContent`; tidak memasukkan nama/deskripsi event ke `innerHTML`.
- Tidak meminta atau menyimpan seed phrase/private key.
- Harga resale dibandingkan dalam integer wei, termasuk presisi 18 desimal.
- Setiap mutasi model memeriksa izin dan status, bukan hanya menyembunyikan tombol.
- QR baru, listing, transfer pemilik, check-in, serta perubahan status event menginvalidasi bukti yang relevan pada demo.
- QR demo dan QR on-chain mempunyai penanda mode yang berbeda.
- Tombol tindakan mencegah klik ganda selama handler berjalan; mutasi gagal tidak meninggalkan sebagian perubahan state.
- Kamera dihentikan saat scanner berhenti atau halaman ditinggalkan.
- Lockfile dipertahankan dan dependency diperiksa melalui `npm audit`.

Jika nanti memakai backend dan autentikasi wallet, tambahkan challenge sekali pakai, verifikasi signer di server, sesi cookie HttpOnly/Secure dengan kebijakan SameSite yang sesuai, proteksi CSRF untuk mutasi berbasis cookie, validasi server, dan pembatasan permintaan. Pemeriksaan UI tidak menggantikan kontrol server/kontrak.

## 11. Validasi dan batas pemeriksaan

Tersedia 42 pengujian: 13 model, 12 adapter blockchain/RPC, 6 antarmuka lab, 9 antarmuka marketplace/dashboard, dan 2 pembaca dokumentasi. Pengujian mencakup pembelian sampai check-in, check-in berulang, expiry, tampering, event/role salah, penugasan, resale cap, transfer pemilik, draft event, rollback, input XSS, dan render delapan halaman. Pengujian baru juga mencakup domain/token yang salah, perubahan akun/jaringan/pemilik saat tanda tangan, penolakan hasil async yang sudah tidak berlaku, serta penghentian kamera jika video gagal diputar.

Pengujian DOM memakai jsdom; encoding canvas QR diganti stub pada pengujian antarmuka. Library QR asli tetap digunakan pada website. Pengujian terpisah memastikan encoder QR asli dan jsQR dapat melakukan round-trip payload lengkap. Pemulihan signature EIP-712 diuji menggunakan wallet sementara di memori pengujian. Adapter blockchain diuji dengan provider EIP-1193 tiruan yang merespons panggilan RPC dan menghasilkan signature kriptografis nyata, tanpa menghubungi Sepolia.

Build produksi berhasil. Pengujian ini tidak memverifikasi layout pada browser nyata, izin kamera pada perangkat, interaksi ekstensi MetaMask, transaksi kontrak, atau sinkronisasi antarperangkat. Uji bagian tersebut setelah ABI tersedia dan sebelum demo kuliah final. Jumlah kerentanan audit harus diperiksa ulang seiring pembaruan database advisory.

## 12. Referensi teknis utama

- EIP-712, termasuk domain dan peringatan replay protection: https://eips.ethereum.org/EIPS/eip-712
- ERC-721 dan ownerOf: https://eips.ethereum.org/EIPS/eip-721
- ethers v6, typed data dan pemulihan signer: https://docs.ethers.org/v6/api/hashing/
- Vite: https://vite.dev/guide/
- node-qrcode: https://github.com/soldair/node-qrcode
- jsQR: https://github.com/cozmo/jsQR


## 13. Cara memakai Lab Integrasi Sepolia

1. Buka `integration.html` melalui tombol **Buka lab Sepolia** pada Panduan.
2. Hubungkan MetaMask dan pindah ke Ethereum Sepolia jika jaringan berbeda. Akun demo Alya/Raka tidak dipakai untuk pembacaan atau tanda tangan pada halaman ini.
3. Isi alamat kontrak NFT tim, Event ID (`uint256`), serta Token ID NFT yang sudah dibuat. Simpan konfigurasi jika ingin memakainya kembali. Hanya identifier publik yang disimpan; signature tetap di memori halaman.
4. Klik **Periksa pemilik NFT**. Alamat harus memiliki deployment pada Sepolia, menyatakan dukungan ERC-721, dan mengembalikan owner token yang valid.
5. Jika wallet yang terhubung merupakan pemilik NFT, klik **Tanda tangani & buat QR** dan periksa typed data di MetaMask. Tidak ada transaksi atau pengiriman ETH.
6. QR memiliki batas waktu 120 detik sejak waktu blok yang dipakai saat penerbitan. Popup wallet yang terlalu lama dapat membuat QR sudah kedaluwarsa saat kembali; buat ulang jika perlu.
7. Gunakan **Periksa signature & pemilik** untuk membaca ulang owner pada Sepolia dan mencocokkan kontrak, event, token, signer, serta expiry.

### Batas yang harus dipahami tim

- Ini uji pembacaan NFT dan bukti kepemilikan. Pembelian, resale, event, role, serta check-in aplikasi belum terhubung ke blockchain.
- **Event ID adalah parameter yang diisi pengguna.** Hubungan token dengan event belum diperiksa pada kontrak; memerlukan fungsi bisnis dari ABI tim. Demikian juga status tiket terpakai, status event, role, dan penugasan petugas.
- Domain `AntiCaloCheckIn` versi `1` dan message `CheckIn` merupakan usulan. Harus identik dengan skema verifikasi kontrak sebelum dipakai untuk tiket produksi.
- Tanda tangan menggunakan EOA/ECDSA 65 byte. Dukungan contract wallet/ERC-1271 belum diimplementasikan.
- Membuat QR on-chain baru **tidak otomatis mencabut signature lama**. Bukti lama dapat tetap valid sampai expiry; kontrak perlu menegakkan konsumsi nonce/status tiket untuk mencegah replay. Perilaku ini berbeda dari registri QR demo yang dapat mengganti nonce lokal.
- Pergantian wallet/jaringan atau konfigurasi membersihkan hasil UI. Respons lama yang selesai belakangan tidak boleh memunculkan kembali QR atau status valid.
- Verifikasi ulang memakai owner terbaru yang dibaca, tetapi perpindahan sesudah pembacaan tetap mungkin terjadi. Kontrak check-in harus melakukan pemeriksaan ulang secara atomik ketika transaksi dieksekusi.
- Waktu penerbitan bersumber dari blok dan batas expiry juga diperiksa terhadap waktu browser secara konservatif. Jam perangkat yang salah dapat membuat pemeriksaan frontend menolak QR; kontrak tetap memakai waktu bloknya sendiri.
- Label signature/pemilik cocok tidak memberikan izin check-in dan tidak menandai tiket sebagai terpakai.

Untuk menuntaskan transaksi, minta Anggota 1/2 menyediakan **alamat deployment Sepolia, ABI final, skema event/token, aturan role dan penugasan, serta fungsi pembelian/resale/check-in**. Setelah tersedia, hubungkan adapter bisnis dan jalankan pengujian integrasi dengan kontrak sesungguhnya.
