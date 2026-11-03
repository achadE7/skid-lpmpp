require('dotenv').config();
const express = require('express');
const { initJraCron } = require('./jobs/jraCronJob');
const apiRoutes = require('./routes/api');
const suratMasukRoutes = require('./routes/suratMasukRoutes');
const db = require('./config/database'); 

const app = express();
const session = require('express-session');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

app.use(session({
    secret: 'rahasia-sikd-lpmpp',
    resave: false,
    saveUninitialized: false
}));

// Middleware Hak Akses Baru
const cekLogin = (req, res, next) => {
    if (req.session.user) next();
    else res.redirect('/login');
};

const cekAdmin = (req, res, next) => {
    // Admin dan Super Admin bisa masuk
    if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'super_admin')) next();
    else res.status(403).send("Akses Ditolak: Halaman ini khusus Admin SIKD. <a href='/ambil-nomor'>Kembali</a>");
};

const cekSuperAdmin = (req, res, next) => {
    // Hanya Super Admin yang bisa masuk
    if (req.session.user && req.session.user.role === 'super_admin') next();
    else res.status(403).send("Akses Ditolak: Khusus Super Admin.");
};

app.get('/login', (req, res) => res.render('login', { title: 'Login SIKD LPMPP' }));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const [rows] = await db.execute('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
    
    if (rows.length > 0) {
        req.session.user = rows[0];
        if (rows[0].role === 'admin' || rows[0].role === 'super_admin') res.redirect('/');
        else res.redirect('/ambil-nomor');
    } else {
        res.send("<script>alert('Username atau Password salah!'); window.location='/login';</script>");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

const PORT = process.env.PORT || 3000;

app.use('/api', apiRoutes);
app.use('/api/surat-masuk', cekLogin, cekAdmin, suratMasukRoutes);

// DASHBOARD DENGAN FILTER TAHUN
app.get('/', cekLogin, async (req, res) => {
    try {
        const selectedYear = req.query.tahun || new Date().getFullYear();

        let pendingDrafts = 0;
        if (req.session.user.role === 'admin' || req.session.user.role === 'super_admin') {
            const [drafts] = await db.execute('SELECT COUNT(*) as count FROM surat_keluar WHERE link_google_drive IS NULL');
            pendingDrafts = drafts[0].count;
        }

        // Statistik berdasarkan tahun yang dipilih
        const [keluarCount] = await db.execute('SELECT COUNT(*) AS total FROM surat_keluar WHERE YEAR(tanggal_surat) = ?', [selectedYear]);
        const [masukCount] = await db.execute('SELECT COUNT(*) AS total FROM surat_masuk WHERE YEAR(tanggal_terima) = ?', [selectedYear]);

        const [suratKeluar] = await db.execute('SELECT * FROM surat_keluar WHERE YEAR(tanggal_surat) = ? ORDER BY id DESC LIMIT 5', [selectedYear]);
        const [suratMasuk] = await db.execute('SELECT * FROM surat_masuk WHERE YEAR(tanggal_terima) = ? ORDER BY id DESC LIMIT 5', [selectedYear]);

        const [notifMasuk] = await db.execute(`
            SELECT 'Surat Masuk' as jenis, nomor_surat, perihal, DATE_ADD(tanggal_surat, INTERVAL m.masa_aktif YEAR) as jatuh_tempo 
            FROM surat_masuk s JOIN master_jra m ON s.tipe_berkas = m.tipe_berkas 
            WHERE DATE_ADD(s.tanggal_surat, INTERVAL m.masa_aktif YEAR) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 1 MONTH)
        `);
        const [notifKeluar] = await db.execute(`
            SELECT 'Surat Keluar' as jenis, nomor_tergenerate as nomor_surat, perihal, DATE_ADD(tanggal_surat, INTERVAL m.masa_aktif YEAR) as jatuh_tempo 
            FROM surat_keluar s JOIN master_jra m ON s.tipe_berkas = m.tipe_berkas 
            WHERE DATE_ADD(s.tanggal_surat, INTERVAL m.masa_aktif YEAR) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 1 MONTH)
        `);

        // Mencari daftar tahun yang tersedia di database untuk dropdown
        const [years] = await db.execute(`
            SELECT DISTINCT YEAR(tanggal_surat) as tahun FROM surat_keluar WHERE tanggal_surat IS NOT NULL
            UNION SELECT DISTINCT YEAR(tanggal_terima) as tahun FROM surat_masuk WHERE tanggal_terima IS NOT NULL ORDER BY tahun DESC
        `);
        let availableYears = years.map(y => y.tahun);
        if(!availableYears.includes(Number(selectedYear))) availableYears.push(Number(selectedYear));
        availableYears.sort((a,b) => b - a);

        res.render('index', { 
            title: 'Dashboard SIKD LPMPP', user: req.session.user,
            totalSuratKeluar: keluarCount[0].total, totalSuratMasuk: masukCount[0].total,
            listSuratKeluar: suratKeluar, listSuratMasuk: suratMasuk,
            notifikasiJRA: [...notifMasuk, ...notifKeluar], pendingDrafts,
            selectedYear, availableYears
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error memuat dashboard");
    }
});

// HALAMAN MANAJEMEN PENGGUNA (Khusus Super Admin)
app.get('/manajemen-pengguna', cekLogin, cekSuperAdmin, async (req, res) => {
    const [users] = await db.execute('SELECT id, nama_lengkap, username, role FROM users');
    res.render('manajemenPengguna', { title: 'Manajemen Pengguna', users, user: req.session.user });
});

// HALAMAN MANAJEMEN KLASIFIKASI (Untuk Admin & Super Admin)
app.get('/manajemen-klasifikasi', cekLogin, cekAdmin, async (req, res) => {
    const [klasifikasi] = await db.execute('SELECT * FROM master_klasifikasi ORDER BY kode_klasifikasi ASC');
    res.render('manajemenKlasifikasi', { title: 'Manajemen Klasifikasi Surat', klasifikasi, user: req.session.user });
});

// HALAMAN MANAJEMEN LOKASI ARSIP
app.get('/manajemen-lokasi', cekLogin, cekAdmin, async (req, res) => {
    const [ruangan] = await db.execute('SELECT * FROM master_ruangan');
    const [kabinet] = await db.execute('SELECT k.*, r.nama_ruangan FROM master_kabinet k JOIN master_ruangan r ON k.id_ruangan = r.id');
    const [laci] = await db.execute('SELECT l.*, k.nama_kabinet, r.nama_ruangan FROM master_laci l JOIN master_kabinet k ON l.id_kabinet = k.id JOIN master_ruangan r ON k.id_ruangan = r.id');
    res.render('manajemenLokasi', { title: 'Manajemen Lokasi Arsip', ruangan, kabinet, laci, user: req.session.user });
});

// RUTE HALAMAN LAINNYA
app.get('/surat-keluar', cekLogin, cekAdmin, (req, res) => res.render('suratKeluar', { title: 'Input Surat Keluar', user: req.session.user }));
app.get('/surat-masuk', cekLogin, cekAdmin, (req, res) => res.render('suratMasuk', { title: 'Input Surat Masuk', user: req.session.user }));
app.get('/data-pengambilan-nomor', cekLogin, cekAdmin, async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM surat_keluar WHERE link_google_drive IS NULL ORDER BY id DESC');
    res.render('dataPengambilanNomor', { title: 'Riwayat Pengambilan Nomor', data: rows, user: req.session.user });
});
app.get('/lengkapi-surat/:id', cekLogin, cekAdmin, async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM surat_keluar WHERE id = ?', [req.params.id]);
    if(rows.length === 0) return res.status(404).send('Draft tidak ditemukan');
    res.render('lengkapiSurat', { surat: rows[0], user: req.session.user });
});

// HALAMAN AMBIL NOMOR (Kirim data klasifikasi ke form ejs)
app.get('/ambil-nomor', cekLogin, async (req, res) => {
    const [klasifikasi] = await db.execute('SELECT * FROM master_klasifikasi ORDER BY kode_klasifikasi ASC');
    res.render('ambilNomor', { title: 'Ambil Nomor Surat Keluar', user: req.session.user, klasifikasi });
});

// Rute Edit Surat (Formnya bisa Anda kembangkan nanti, ini rute pengambil datanya)
app.get('/edit-surat-keluar/:id', cekLogin, cekAdmin, async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM surat_keluar WHERE id = ?', [req.params.id]);
    res.render('editSuratKeluar', { title: 'Edit Surat Keluar', surat: rows[0], user: req.session.user });
});
app.get('/edit-surat-masuk/:id', cekLogin, cekAdmin, async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM surat_masuk WHERE id = ?', [req.params.id]);
    res.render('editSuratMasuk', { title: 'Edit Surat Masuk', surat: rows[0], user: req.session.user });
});

app.get('/data-surat-keluar', cekLogin, cekAdmin, async (req, res) => {
    const [rows] = await db.execute(`
        SELECT s.*, r.nama_ruangan, k.nama_kabinet, l.nama_laci, o.nama_ordner
        FROM surat_keluar s LEFT JOIN master_ordner o ON s.id_lokasi = o.id
        LEFT JOIN master_laci l ON o.id_laci = l.id LEFT JOIN master_kabinet k ON l.id_kabinet = k.id
        LEFT JOIN master_ruangan r ON k.id_ruangan = r.id ORDER BY s.id DESC
    `);
    res.render('dataSuratKeluar', { title: 'Semua Surat Keluar', data: rows, user: req.session.user });
});

app.get('/data-surat-masuk', cekLogin, cekAdmin, async (req, res) => {
    const [rows] = await db.execute(`
        SELECT s.*, r.nama_ruangan, k.nama_kabinet, l.nama_laci, o.nama_ordner
        FROM surat_masuk s LEFT JOIN master_ordner o ON s.id_lokasi = o.id
        LEFT JOIN master_laci l ON o.id_laci = l.id LEFT JOIN master_kabinet k ON l.id_kabinet = k.id
        LEFT JOIN master_ruangan r ON k.id_ruangan = r.id ORDER BY s.id DESC
    `);
    res.render('dataSuratMasuk', { title: 'Semua Surat Masuk', data: rows, user: req.session.user });
});

// PROSES AMBIL NOMOR (Perbaikan format permanen UN8.3)
app.post('/api/ambil-nomor', cekLogin, async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { tanggal_surat, kode_klasifikasi, peminta, perihal, tipe_berkas } = req.body;
        const year = new Date(tanggal_surat).getFullYear();
        
        const [rows] = await connection.execute('SELECT MAX(nomor_urut_tahun) as max_urut FROM surat_keluar WHERE YEAR(tanggal_surat) = ? FOR UPDATE', [year]);
        
        let nextUrut = rows[0].max_urut ? rows[0].max_urut + 1 : 1;
        
        // FORMAT BARU: Urut/UN8.3/Klasifikasi/Tahun
        const nomorTergenerate = `${String(nextUrut).padStart(3, '0')}/UN8.3/${kode_klasifikasi}/${year}`;

        await connection.execute(
            `INSERT INTO surat_keluar (nomor_tergenerate, nomor_urut_tahun, tanggal_surat, tujuan, perihal, tipe_berkas, penginput, kode_klasifikasi) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [nomorTergenerate, nextUrut, tanggal_surat, peminta, perihal, tipe_berkas, req.session.user.nama_lengkap, kode_klasifikasi]
        );
        await connection.commit();
        res.render('hasilNomor', { title: 'Nomor Berhasil Diambil', nomor: nomorTergenerate, peminta, perihal, user: req.session.user });
    } catch(err) {
        await connection.rollback();
        res.status(500).send("Error: " + err.message);
    } finally { connection.release(); }
});

initJraCron();
app.listen(PORT, () => console.log(`🚀 Server berjalan di port ${PORT}`));