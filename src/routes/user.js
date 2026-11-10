const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');

// 1. Endpoint GET /api/users/profile (Mengambil data profil user yang sedang login)
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const [rows] = await db.query(
            'SELECT id, wallet_address, display_name, email, avatar_url, bio, created_at, updated_at FROM users WHERE id = ? AND deleted_at IS NULL',
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ status: 'error', message: 'User tidak ditemukan atau sudah dihapus' });
        }

        res.json({ status: 'success', data: rows[0] });
    } catch (error) {
        console.error('Error get profile:', error);
        res.status(500).json({ status: 'error', message: 'Gagal mengambil profil user' });
    }
});

// 2. Endpoint PUT /api/users/profile (Memperbarui data profil)
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { display_name, email, avatar_url, bio } = req.body;

        // Update data profil berdasarkan id user
        await db.query(
            `UPDATE users 
             SET display_name = COALESCE(?, display_name), 
                 email = COALESCE(?, email), 
                 avatar_url = COALESCE(?, avatar_url), 
                 bio = COALESCE(?, bio) 
             WHERE id = ? AND deleted_at IS NULL`,
            [display_name, email, avatar_url, bio, userId]
        );

        res.json({ status: 'success', message: 'Profil berhasil diperbarui' });
    } catch (error) {
        console.error('Error update profile:', error);
        res.status(500).json({ status: 'error', message: 'Gagal memperbarui profil' });
    }
});

// 3. Endpoint DELETE /api/users/account (Soft Delete Akun & Revoke Token)
router.delete('/account', verifyToken, async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const userId = req.user.id;

        // A. Ubah kolom deleted_at di tabel users menjadi waktu sekarang (soft delete)
        const [updateResult] = await connection.query(
            'UPDATE users SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
            [userId]
        );

        if (updateResult.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ status: 'error', message: 'Akun tidak ditemukan atau sudah dihapus' });
        }

        // B. Lakukan pencabutan (revoke) pada refresh token aktif di tabel refresh_tokens
        await connection.query(
            'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
            [userId]
        );

        await connection.commit();
        res.json({ status: 'success', message: 'Akun berhasil dihapus (soft-delete) dan sesi ditutup' });
    } catch (error) {
        await connection.rollback();
        console.error('Error soft delete account:', error);
        res.status(500).json({ status: 'error', message: 'Gagal menghapus akun' });
    } finally {
        connection.release();
    }
});

module.exports = router;