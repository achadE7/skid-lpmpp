const express = require('express');
const router = express.Router();
const { createSuratKeluar } = require('../services/suratKeluarService');
const multer = require('multer');

// Konfigurasi Multer untuk menerima file PDF sementara
const upload = multer({ dest: 'uploads/' });

router.post('/surat-keluar', upload.single('file'), async (req, res) => {
    try {
        // MEREKAM NAMA ADMIN KE DALAM BODY SEBELUM DIKIRIM KE SERVICE
        req.body.penginput = req.session.user.nama_lengkap;

        const result = await createSuratKeluar(req.body, req.file);
        res.redirect('/?status=sukses_keluar');
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
});

const db = require('../config/database');

// Endpoint Cascading Dropdown Lokasi Fisik
router.get('/lokasi/ruangan', async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM master_ruangan');
    res.json(rows);
});
router.get('/lokasi/kabinet/:id', async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM master_kabinet WHERE id_ruangan = ?', [req.params.id]);
    res.json(rows);
});
router.get('/lokasi/laci/:id', async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM master_laci WHERE id_kabinet = ?', [req.params.id]);
    res.json(rows);
});
router.get('/lokasi/ordner/:id', async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM master_ordner WHERE id_laci = ?', [req.params.id]);
    res.json(rows);
});

// Endpoint Ambil Data Klasifikasi
router.get('/klasifikasi', async (req, res) => {
    const [rows] = await db.execute('SELECT * FROM master_klasifikasi ORDER BY kode_klasifikasi ASC');
    res.json(rows);
});

// Endpoint Tambah Data Klasifikasi Baru
router.post('/klasifikasi', async (req, res) => {
    const { kode, uraian } = req.body;
    try {
        await db.execute('INSERT IGNORE INTO master_klasifikasi (kode_klasifikasi, uraian) VALUES (?, ?)', [kode, uraian]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/lengkapi-surat/:id', upload.single('file'), async (req, res) => {
    try {
        const { tipe_berkas } = req.body;
        const idDraft = req.params.id;

        // 1. Ambil data draft
        const [draftRows] = await db.execute('SELECT * FROM surat_keluar WHERE id = ?', [idDraft]);
        const draft = draftRows[0];

        // 2. Hitung JRA
        const [jraRows] = await db.execute('SELECT masa_aktif FROM master_jra WHERE tipe_berkas = ?', [tipe_berkas]);
        const tglJatuhTempo = new Date(draft.tanggal_surat);
        tglJatuhTempo.setFullYear(tglJatuhTempo.getFullYear() + jraRows[0].masa_aktif);

        // 3. Upload File ke Google Drive
        const safeFileName = `${draft.nomor_tergenerate.replace(/\//g, '-')}.pdf`;
        const driveResult = await uploadToGoogleDrive({
            filePath: req.file.path,
            fileName: safeFileName,
            folderHierarchy: ['Arsip', String(draft.tahun_surat), 'Surat_Keluar', draft.kode_klasifikasi || 'UMUM']
        });

        // 4. Update Database
        await db.execute(
            `UPDATE surat_keluar SET tipe_berkas = ?, tanggal_jatuh_tempo = ?, link_google_drive = ?, gdrive_file_id = ? WHERE id = ?`,
            [tipe_berkas, tglJatuhTempo.toISOString().split('T')[0], driveResult.webViewLink, driveResult.fileId, idDraft]
        );

        res.redirect('/data-surat-keluar?status=lengkapi_sukses');
    } catch (error) {
        console.error(error);
        res.status(500).send("Gagal melengkapi data");
    }
});

// Route Ganti Username / Password (Super Admin)
router.post('/edit-user/:id', async (req, res) => {
    const { username, password } = req.body;
    try {
        if (password) {
            await require('../config/database').execute('UPDATE users SET username=?, password=? WHERE id=?', [username, password, req.params.id]);
        } else {
            await require('../config/database').execute('UPDATE users SET username=? WHERE id=?', [username, req.params.id]);
        }
        res.redirect('/manajemen-pengguna?status=sukses');
    } catch (err) {
        res.status(500).send("Gagal mengupdate: " + err.message);
    }
});

// Route Simpan Edit Surat Keluar
router.post('/edit-surat-keluar/:id', async (req, res) => {
    const { perihal, tujuan } = req.body;
    await require('../config/database').execute('UPDATE surat_keluar SET perihal=?, tujuan=? WHERE id=?', [perihal, tujuan, req.params.id]);
    res.redirect('/data-surat-keluar?status=edit_sukses');
});

// Route Simpan Edit Surat Masuk
router.post('/edit-surat-masuk/:id', async (req, res) => {
    const { perihal, pengirim } = req.body;
    await require('../config/database').execute('UPDATE surat_masuk SET perihal=?, pengirim=? WHERE id=?', [perihal, pengirim, req.params.id]);
    res.redirect('/data-surat-masuk?status=edit_sukses');
});

// Tambah Klasifikasi
router.post('/tambah-klasifikasi', async (req, res) => {
    try {
        await require('../config/database').execute('INSERT INTO master_klasifikasi (kode_klasifikasi, keterangan) VALUES (?, ?)', [req.body.kode_klasifikasi, req.body.keterangan]);
        res.redirect('/manajemen-klasifikasi?status=tambah_sukses');
    } catch (err) {
        res.status(500).send("Gagal menambah data (kode mungkin duplikat): " + err.message);
    }
});

// Edit Klasifikasi (Tanpa ID)
router.post('/edit-klasifikasi', async (req, res) => {
    try {
        const { kode_klasifikasi_lama, kode_klasifikasi_baru, keterangan } = req.body;
        await require('../config/database').execute(
            'UPDATE master_klasifikasi SET kode_klasifikasi=?, keterangan=? WHERE kode_klasifikasi=?', 
            [kode_klasifikasi_baru, keterangan, kode_klasifikasi_lama]
        );
        res.redirect('/manajemen-klasifikasi?status=edit_sukses');
    } catch (err) {
        res.status(500).send("Gagal mengupdate: " + err.message);
    }
});

router.post('/delete-surat-keluar/:id', async (req, res) => {
    await require('../config/database').execute('DELETE FROM surat_keluar WHERE id=?', [req.params.id]);
    res.redirect('/data-surat-keluar?status=hapus_sukses');
});

router.post('/delete-surat-masuk/:id', async (req, res) => {
    await require('../config/database').execute('DELETE FROM surat_masuk WHERE id=?', [req.params.id]);
    res.redirect('/data-surat-masuk?status=hapus_sukses');
});

router.post('/delete-klasifikasi', async (req, res) => {
    try {
        await require('../config/database').execute(
            'DELETE FROM master_klasifikasi WHERE kode_klasifikasi=?', 
            [req.body.kode_klasifikasi_lama]
        );
        res.redirect('/manajemen-klasifikasi?status=hapus_sukses');
    } catch (err) {
        // Jika error disebabkan oleh Foreign Key (kode sedang digunakan di tabel surat)
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            res.send(`
                <script>
                    alert('Gagal: Kode klasifikasi ini sedang digunakan pada data Surat Keluar atau Surat Masuk. Anda harus mengubah atau menghapus surat yang berkaitan terlebih dahulu jika ingin menghapus kode ini.'); 
                    window.location.href='/manajemen-klasifikasi';
                </script>
            `);
        } else {
            res.status(500).send("Gagal menghapus data: " + err.message);
        }
    }
});

router.post('/edit-surat-keluar/:id', async (req, res) => {
    const { perihal, tujuan, id_lokasi } = req.body;
    if (id_lokasi) { // Jika lokasi baru dipilih
        await require('../config/database').execute('UPDATE surat_keluar SET perihal=?, tujuan=?, id_lokasi=? WHERE id=?', [perihal, tujuan, id_lokasi, req.params.id]);
    } else { // Jika lokasi tidak diubah
        await require('../config/database').execute('UPDATE surat_keluar SET perihal=?, tujuan=? WHERE id=?', [perihal, tujuan, req.params.id]);
    }
    res.redirect('/data-surat-keluar?status=edit_sukses');
});

router.post('/edit-surat-masuk/:id', async (req, res) => {
    const { perihal, pengirim, id_lokasi } = req.body;
    if (id_lokasi) {
        await require('../config/database').execute('UPDATE surat_masuk SET perihal=?, pengirim=?, id_lokasi=? WHERE id=?', [perihal, pengirim, id_lokasi, req.params.id]);
    } else {
        await require('../config/database').execute('UPDATE surat_masuk SET perihal=?, pengirim=? WHERE id=?', [perihal, pengirim, req.params.id]);
    }
    res.redirect('/data-surat-masuk?status=edit_sukses');
});

router.post('/tambah-ruangan', async (req, res) => {
    await require('../config/database').execute('INSERT INTO master_ruangan (nama_ruangan) VALUES (?)', [req.body.nama_ruangan]);
    res.redirect('/manajemen-lokasi');
});
router.post('/tambah-kabinet', async (req, res) => {
    await require('../config/database').execute('INSERT INTO master_kabinet (id_ruangan, nama_kabinet) VALUES (?, ?)', [req.body.id_ruangan, req.body.nama_kabinet]);
    res.redirect('/manajemen-lokasi');
});
router.post('/tambah-laci', async (req, res) => {
    await require('../config/database').execute('INSERT INTO master_laci (id_kabinet, nama_laci) VALUES (?, ?)', [req.body.id_kabinet, req.body.nama_laci]);
    res.redirect('/manajemen-lokasi');
});
router.post('/tambah-ordner', async (req, res) => {
    await require('../config/database').execute('INSERT INTO master_ordner (id_laci, nama_ordner) VALUES (?, ?)', [req.body.id_laci, req.body.nama_ordner]);
    res.redirect('/manajemen-lokasi');
});

module.exports = router;