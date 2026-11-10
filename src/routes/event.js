const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// Contoh endpoint yang hanya bisa diakses oleh ORGANIZER atau ADMIN
router.post('/create', verifyToken, requireRole(['ORGANIZER', 'ADMIN']), async (req, res) => {
    try {
        // Logika pembuatan event off-chain / sinkronisasi
        res.json({ status: 'success', message: 'Event berhasil dibuat oleh authorized user!' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Gagal membuat event' });
    }
});

module.exports = router;