-- =====================================================================
-- Skema MySQL 8.0 - Anggota 3 (Backend Auth, Profil, Sinkronisasi Role)
-- Konvensi:
--   * Alamat wallet disimpan lowercase, CHAR(42) ("0x" + 40 hex)
--   * Waktu disimpan UTC
--   * Soft delete memakai kolom deleted_at (NULL = aktif)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS anticalo
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE anticalo;

-- ---------------------------------------------------------------------
-- 1. users: profil off-chain, 1 baris per wallet
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  wallet_address CHAR(42)        NOT NULL,
  display_name   VARCHAR(80)     NULL,
  email          VARCHAR(255)    NULL,
  avatar_url     VARCHAR(500)    NULL,
  bio            VARCHAR(500)    NULL,
  last_login_at  DATETIME        NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at     DATETIME        NULL,            -- soft delete akun
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_wallet (wallet_address),
  KEY idx_users_deleted (deleted_at)
) ENGINE=InnoDB;
-- Catatan: kalau user yang sudah dihapus login lagi, AKTIFKAN ULANG baris
-- yang sama (deleted_at = NULL), jangan insert baru, karena wallet UNIQUE.

-- ---------------------------------------------------------------------
-- 2. auth_nonces: nonce SIWE sekali pakai
-- ---------------------------------------------------------------------
CREATE TABLE auth_nonces (
  nonce          VARCHAR(64)  NOT NULL,           -- acak, min 8 alfanumerik (syarat SIWE)
  wallet_address CHAR(42)     NULL,               -- opsional, kalau nonce diminta per alamat
  expires_at     DATETIME     NOT NULL,           -- misal now + 5 menit
  used_at        DATETIME     NULL,               -- diisi saat verify berhasil
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (nonce),
  KEY idx_nonce_expires (expires_at)
) ENGINE=InnoDB;
-- Verify: UPDATE ... SET used_at = NOW() WHERE nonce = ? AND used_at IS NULL
--         AND expires_at > NOW(); cek affected rows = 1 (anti replay, atomik).

-- ---------------------------------------------------------------------
-- 3. refresh_tokens: sesi / refresh token (simpan HASH, bukan token asli)
-- ---------------------------------------------------------------------
CREATE TABLE refresh_tokens (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        BIGINT UNSIGNED NOT NULL,
  token_hash     CHAR(64)        NOT NULL,        -- SHA-256 hex dari token
  user_agent     VARCHAR(255)    NULL,
  ip_address     VARCHAR(45)     NULL,
  expires_at     DATETIME        NOT NULL,
  revoked_at     DATETIME        NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_hash (token_hash),
  KEY idx_refresh_user (user_id),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. wallet_roles: cache role on-chain (sumber kebenaran tetap kontrak)
--    1 wallet = maksimal 1 role khusus. Tidak ada baris = BUYER.
--    Tidak pakai FK ke users: wallet bisa dapat role sebelum pernah login.
-- ---------------------------------------------------------------------
CREATE TABLE wallet_roles (
  wallet_address CHAR(42)     NOT NULL,
  role           ENUM('ADMIN','ORGANIZER','GATE_CHECKER') NOT NULL,
  granted_block  BIGINT UNSIGNED NULL,            -- block saat RoleGranted
  granted_tx     CHAR(66)     NULL,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (wallet_address)                    -- PK = 1 role per wallet
) ENGINE=InnoDB;
-- RoleGranted  -> INSERT ... ON DUPLICATE KEY UPDATE
-- RoleRevoked  -> DELETE WHERE wallet_address = ? AND role = ?
-- Kalau Anggota 6 membuat indexer, tabel ini bisa diisi oleh indexer.
-- Kalau kontrak mengizinkan multi-role, ganti PK menjadi (wallet_address, role).

-- ---------------------------------------------------------------------
-- 5. auth_logs (opsional): jejak login untuk debugging dan audit
-- ---------------------------------------------------------------------
CREATE TABLE auth_logs (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  wallet_address CHAR(42)     NULL,
  action         ENUM('NONCE','LOGIN_OK','LOGIN_FAIL','LOGOUT','REFRESH','ACCOUNT_DELETE','ACCOUNT_RESTORE') NOT NULL,
  detail         VARCHAR(255) NULL,
  ip_address     VARCHAR(45)  NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_logs_wallet (wallet_address),
  KEY idx_logs_created (created_at)
) ENGINE=InnoDB;

-- =====================================================================
-- BUKAN tabel Anggota 3 (koordinasi dengan Anggota 6):
--   events_meta (deskripsi, poster, kategori, lokasi), uploads,
--   indexed_events / tickets / listings (hasil indexer),
--   gate_assignments (penugasan petugas per event)
-- =====================================================================
