const db = require('../config/database');
const { uploadToGoogleDrive } = require('../services/googleDriveService');

async function createSuratMasuk(req, res) {
    const payload = req.body;
    const fileScan = req.file;
    // Mengambil nama admin dari sesi login, default 'Sistem' jika tidak ditemukan
    const penginput = req.session?.user?.nama_lengkap || 'Sistem';

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const tglSurat = new Date(payload.tanggal_surat);
        const tahunSurat = tglSurat.getFullYear();

        // 1. Hitung Jatuh Tempo JRA berdasarkan tipe_berkas
        const [jraRows] = await connection.execute(
            `SELECT masa_aktif FROM master_jra WHERE tipe_berkas = ?`,
            [payload.tipe_berkas || null]
        );

        if (jraRows.length === 0) {
            throw new Error(`Tipe berkas tidak valid atau belum dipilih.`);
        }

        const tglJatuhTempo = new Date(payload.tanggal_terima); 
        tglJatuhTempo.setFullYear(tglJatuhTempo.getFullYear() + jraRows[0].masa_aktif);
        const jatuhTempoSQL = tglJatuhTempo.toISOString().split('T')[0];

        // 2. Upload ke Google Drive (Opsional jika file disisipkan)
        let driveResult = { webViewLink: null, fileId: null };
        if (fileScan) {
            // Hilangkan karakter miring dari nomor surat agar aman jadi nama file PDF
            const safeFileName = `${payload.nomor_surat.replace(/[\/\\]/g, '-')}.pdf`;
            driveResult = await uploadToGoogleDrive({
                filePath: fileScan.path,
                fileName: safeFileName,
                folderHierarchy: ['Arsip', String(tahunSurat), 'Surat_Masuk', payload.kode_klasifikasi || 'UMUM']
            });
        }

        // 3. Simpan ke Database
        const [insertResult] = await connection.execute(
            `INSERT INTO surat_masuk 
            (nomor_surat, nomor_surat_revisi, kode_klasifikasi, pengirim, tanggal_surat, tanggal_terima, perihal, 
             tipe_berkas, id_lokasi, tanggal_jatuh_tempo, link_google_drive, gdrive_file_id, penginput)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                payload.nomor_surat,
                payload.nomor_surat_revisi || null,
                payload.kode_klasifikasi || null,
                payload.pengirim,
                payload.tanggal_surat,
                payload.tanggal_terima,
                payload.perihal,
                payload.tipe_berkas || null,
                payload.id_lokasi || null,
                jatuhTempoSQL,
                driveResult.webViewLink || null,
                driveResult.fileId || null,
                penginput
            ]
        );

        await connection.commit();
        res.redirect('/?status=sukses_masuk');
    } catch (error) {
        await connection.rollback();
        console.error("Error Registrasi Surat Masuk:", error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        connection.release();
    }
}

module.exports = { createSuratMasuk };