const db = require('../config/db');

/**
 * Middleware untuk membatasi akses berdasarkan role on-chain yang tersinkronisasi di database.
 * @param {Array<string>} allowedRoles - Daftar role yang diizinkan (contoh: ['ADMIN', 'ORGANIZER'])
 */
const requireRole = (allowedRoles) => {
    return async (req, res, next) => {
        try {
            // req.user didapatkan dari middleware verifyToken sebelumnya
            const walletAddress = req.user.walletAddress;

            if (!walletAddress) {
                return res.status(401).json({ status: 'error', message: 'Akses ditolak: Wallet tidak dikenali' });
            }

            // Ambil role dari tabel wallet_roles
            const [rows] = await db.query(
                'SELECT role FROM wallet_roles WHERE wallet_address = ?',
                [walletAddress.toLowerCase()]
            );

            // Jika tidak ada di tabel wallet_roles, default role adalah 'BUYER'
            const userRole = rows.length > 0 ? rows.length > 0 && rows[0].role : 'BUYER';

            // Cek apakah role user termasuk dalam daftar yang diizinkan
            if (!allowedRoles.includes(userRole)) {
                return res.status(403).json({ 
                    status: 'error', 
                    message: `Akses dilarang: Membutuhkan role [${allowedRoles.join(', ')}], role Anda saat ini adalah [${userRole}]` 
                });
            }

            // Simpan role ke req agar bisa dipakai handler berikutnya jika perlu
            req.user.role = userRole;
            next();
        } catch (error) {
            console.error('Error RBAC middleware:', error);
            res.status(500).json({ status: 'error', message: 'Gagal memverifikasi hak akses role' });
        }
    };
};

module.exports = { requireRole };