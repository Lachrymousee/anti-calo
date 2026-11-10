const express = require('express');
const router = express.Router();
const { generateNonce, SiweMessage } = require('siwe');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db'); // Sesuaikan jalur koneksi database MySQL kamu

const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_jwt_kamu';
const JWT_EXPIRES_IN = '15m'; // Access token berumur pendek

// 1. Endpoint GET /api/auth/nonce
router.get('/nonce', async (req, res) => {
    try {
        const nonce = generateNonce();
        // Berlaku selama 5 menit ke depan
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        // Simpan ke tabel auth_nonces
        await db.query(
            'INSERT INTO auth_nonces (nonce, expires_at) VALUES (?, ?)',
            [nonce, expiresAt]
        );

        res.json({ status: 'success', nonce });
    } catch (error) {
        console.error('Error generate nonce:', error);
        res.status(500).json({ status: 'error', message: 'Gagal membuat nonce' });
    }
});

// 2. Endpoint POST /api/auth/verify
router.post('/verify', async (req, res) => {
    const { message, signature } = req.body;

    if (!message || !signature) {
        return res.status(400).json({ status: 'error', message: 'Message dan signature diperlukan' });
    }

    try {
        // Parse dan verifikasi pesan SIWE menggunakan library siwe
        const siweMessage = new SiweMessage(message);
        const verificationResult = await siweMessage.verify({ signature });

        if (!verificationResult.success) {
            return res.status(401).json({ status: 'error', message: 'Verifikasi tanda tangan gagal' });
        }

        const walletAddress = verificationResult.data.address.toLowerCase();
        const nonce = verificationResult.data.nonce;

        // Cek nonce di database: apakah ada, belum kedaluwarsa, dan belum digunakan
        const [nonceRows] = await db.query(
            'SELECT * FROM auth_nonces WHERE nonce = ? AND used_at IS NULL AND expires_at > NOW()',
            [nonce]
        );

        if (nonceRows.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Nonce tidak valid atau sudah kedaluwarsa' });
        }

        // Tandai nonce sebagai sudah digunakan (cegah replay attack)
        await db.query('UPDATE auth_nonces SET used_at = NOW() WHERE nonce = ?', [nonce]);

        // Cek apakah user dengan wallet_address sudah terdaftar di tabel users
        const [userRows] = await db.query('SELECT * FROM users WHERE wallet_address = ?', [walletAddress]);
        let userId;

        if (userRows.length === 0) {
            // Jika belum ada, buat record baru (Registrasi otomatis)
            const [insertResult] = await db.query(
                'INSERT INTO users (wallet_address, last_login_at) VALUES (?, NOW())',
                [walletAddress]
            );
            userId = insertResult.insertId;
        } else {
            const user = userRows[0];
            
            // Pastikan akun tidak sedang dalam status soft-delete
            if (user.deleted_at !== null) {
                return res.status(403).json({ status: 'error', message: 'Akun ini telah dihapus (soft-delete)' });
            }

            userId = user.id;
            // Perbarui last_login_at
            await db.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [userId]);
        }

        // Terbitkan JWT Access Token
        const accessToken = jwt.sign(
            { id: userId, walletAddress },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        // Buat Refresh Token (simpan hash-nya ke tabel refresh_tokens)
        const refreshTokenPlain = crypto.randomBytes(40).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(refreshTokenPlain).digest('hex');
        const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 hari

        const userAgent = req.headers['user-agent'] || null;
        const ipAddress = req.ip || null;

        await db.query(
            'INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_address, expires_at) VALUES (?, ?, ?, ?, ?)',
            [userId, tokenHash, userAgent, ipAddress, refreshExpiresAt]
        );

        // Kirim token ke frontend
        res.json({
            status: 'success',
            message: 'Autentikasi berhasil',
            accessToken,
            refreshToken: refreshTokenPlain // Dikirim sekali ke client untuk disimpan aman
        });

    } catch (error) {
        console.error('Error verifikasi SIWE:', error);
        res.status(500).json({ status: 'error', message: 'Terjadi kesalahan pada server' });
    }
});

module.exports = router;