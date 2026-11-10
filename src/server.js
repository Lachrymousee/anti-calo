const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// Test endpoint untuk mengecek koneksi database
app.get('/api/health', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT 1 + 1 AS solution');
        res.json({ status: 'success', message: 'Database terhubung!', data: rows[0].solution });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Gagal terhubung ke database' });
    }
});

app.listen(PORT, () => {
    console.log(`Server backend berjalan di port ${PORT}`);
});

// Routes milik src/routes/auth.js
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Routes milik src/routes/user.js
const userRoutes = require('./routes/user');

// Pasang endpoint user dengan prefix /api/users
app.use('/api/users', userRoutes);