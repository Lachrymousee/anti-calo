import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { bad } from './errors.js';

// Hanya PNG/JPEG/WebP. SVG sengaja ditolak (dapat memuat script). Tipe ditentukan dari isi file
// (magic bytes), bukan dari nama atau Content-Type kiriman klien.
export function sniffImage(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

export function createPosterUpload(config) {
  const m = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxPosterBytes, files: 1, fields: 0 } });
  return (req, res, next) =>
    m.single('poster')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return next(bad(`Ukuran poster maksimal ${Math.floor(config.maxPosterBytes / 1024)} KB.`, 'file_too_large'));
      return next(bad('Upload tidak valid. Kirim satu file pada field "poster".'));
    });
}

// Nama file dibuat server (eventId + potongan hash), bukan dari klien: aman dari path traversal.
export function savePoster(config, eventId, buf, sha256, ext) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const file = `${eventId}-${sha256.slice(0, 16)}.${ext}`;
  fs.writeFileSync(path.join(config.uploadDir, file), buf, { flag: 'w' });
  return file;
}

export function removePoster(config, file) {
  if (!file || file !== path.basename(file)) return;
  fs.rmSync(path.join(config.uploadDir, file), { force: true });
}
