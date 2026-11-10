const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'rahasia_jwt_kamu';

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer TOKEN

    if (!token) {
        return res.status(401).json({ status: 'error', message: 'Token akses tidak ditemukan' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ status: 'error', message: 'Token tidak valid atau sudah kedaluwarsa' });
        }
        
        // Simpan payload user ke request agar bisa dipakai di controller berikutnya
        req.user = decoded;
        next();
    });
};

module.exports = { verifyToken };