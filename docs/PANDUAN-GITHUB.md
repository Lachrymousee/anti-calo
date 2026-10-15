# Memasukkan Source anti-calo ke GitHub

Arsip ini berisi source frontend anti-calo, delapan halaman, test, dan dokumentasi progres. RAR perlu diekstrak terlebih dahulu.

## Pilihan 1 — Upload melalui Website GitHub

1. Ekstrak `anti-calo-SourceCode.rar`, lalu buka folder `anti-calo`.
2. Buat repository GitHub baru untuk kelompok. Pilih public/private sesuai kebutuhan tim.
3. Pada repository kosong, pilih tautan untuk mengunggah file. Pada repository yang sudah memiliki halaman utama, gunakan **Add file → Upload files**.
4. Unggah **isi** folder `anti-calo`, bukan hanya file RAR. `package.json`, `README.md`, dan `index.html` sebaiknya langsung berada di root repository.
5. Sertakan folder `src`, `public`, `scripts`, `tests`, `docs`, semua HTML, `vite.config.js`, `package-lock.json`, `.gitignore`, dan `.env.example`.
6. Periksa daftar file. Jangan unggah `.env` berisi nilai lokal, private key, seed phrase, `node_modules`, atau `dist`.
7. Tulis pesan commit, lalu simpan. Anggota lain dapat mengunduh/clone source dan menjalankan `npm ci` serta `npm run dev`.

Jika repository sudah berisi pekerjaan anggota lain, buat branch dan pull request sesuai kesepakatan; jangan menghapus atau menimpa modul mereka.

## Pilihan 2 — Git di Terminal VS Code

Pasang Git jika belum tersedia. Dari folder yang berisi `package.json`, jalankan perintah berikut. URL `USERNAME/NAMA-REPO` adalah contoh yang harus diganti. Buat repository tujuan kosong terlebih dahulu, tanpa README tambahan.

```bash
git init
git add .
git status
git commit -m "Add anti-calo frontend demo and project progress docs"
git branch -M main
git remote add origin https://github.com/USERNAME/NAMA-REPO.git
git push -u origin main
```

Jika Git meminta identitas, isi `user.name` dan `user.email` milik sendiri sesuai petunjuk Git. Ikuti autentikasi GitHub pada perangkat. Jangan menaruh token/password dalam source atau URL remote.

## Pemeriksaan Setelah Upload

- Root repository menampilkan `README.md` dan `package.json`.
- Source delapan halaman, direktori aplikasi, dan lockfile tersedia.
- Folder dependency/build dan kredensial tidak ikut terunggah.
- Setelah clone, `npm ci`, `npm test`, dan `npm run build` berhasil.

Upload source belum merupakan deployment website. Paket ini tidak membuat repository atau menyalakan GitHub Pages secara otomatis. Ketika hosting disepakati, build command adalah `npm ci` lalu `npm run build`, output statis `dist`. GitHub Pages pada subpath repository perlu pengaturan `base` Vite yang sesuai. Simpan perubahan hosting sebagai pekerjaan terpisah setelah source kelompok siap.
