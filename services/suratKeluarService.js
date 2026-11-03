const db = require('../config/database');
const { uploadToGoogleDrive } = require('./googleDriveService');

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

async function createSuratKeluar(payload, fileScan) {
    const connection = await db.getConnection();
    const kodeUnit = process.env.KODE_UNIT_INSTANSI || 'UN10.L2';

    try {
        await connection.beginTransaction();

        const tglSurat = new Date(payload.tanggal_surat);
        const tahunSurat = tglSurat.getFullYear();

        // Mengunci baris (FOR UPDATE) agar nomor urut tidak ganda saat diinput bersamaan
        const [lastRow] = await connection.execute(
            `SELECT MAX(nomor_urut_tahun) AS max_urut FROM surat_keluar WHERE tahun_surat = ? FOR UPDATE`,
            [tahunSurat]
        );
        const nextUrut = (lastRow[0].max_urut || 0) + 1;

        // Generate Nomor Surat (Format: Urut/Klasifikasi/Unit/BulanRomawi/Tahun)
        const bulanRomawi = ROMAN_MONTHS[tglSurat.getMonth()];
        const urutPadded = String(nextUrut).padStart(3, '0');
        const nomorFormatted = `${urutPadded}/${payload.kode_klasifikasi}/${kodeUnit}/${bulanRomawi}/${tahunSurat}`;

        // Hitung Jatuh Tempo JRA
        const [jraRows] = await connection.execute(
            `SELECT masa_aktif FROM master_jra WHERE tipe_berkas = ?`,
            [payload.tipe_berkas || null] 
        );
        if (jraRows.length === 0) throw new Error(`Tipe berkas tidak valid atau tidak diisi.`);
        
        const tglJatuhTempo = new Date(tglSurat);
        tglJatuhTempo.setFullYear(tglJatuhTempo.getFullYear() + jraRows[0].masa_aktif);
        const jatuhTempoSQL = tglJatuhTempo.toISOString().split('T')[0];

        // Opsional: Upload ke Google Drive jika ada file
        let driveResult = { webViewLink: null, fileId: null };
        if (fileScan) {
            const safeFileName = `${nomorFormatted.replace(/\//g, '-')}.pdf`;
            driveResult = await uploadToGoogleDrive({
                filePath: fileScan.path,
                fileName: safeFileName,
                folderHierarchy: ['Arsip', String(tahunSurat), 'Surat_Keluar', payload.kode_klasifikasi]
            });
        }

        // Simpan ke Database beserta Nama Penginput
        const [insertResult] = await connection.execute(
            `INSERT INTO surat_keluar 
            (nomor_tergenerate, nomor_urut_tahun, tahun_surat, kode_klasifikasi, tanggal_surat, 
             tujuan, perihal, jumlah_lembar, tipe_berkas, id_lokasi, tanggal_jatuh_tempo, 
             link_google_drive, gdrive_file_id, penginput)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                nomorFormatted, 
                nextUrut, 
                tahunSurat, 
                payload.kode_klasifikasi || null, 
                payload.tanggal_surat || null,
                payload.tujuan || null, 
                payload.perihal || null, 
                payload.jumlah_lembar || 1, 
                payload.tipe_berkas || null,
                payload.id_lokasi || null, 
                jatuhTempoSQL, 
                driveResult.webViewLink || null, 
                driveResult.fileId || null,
                payload.penginput || 'Sistem' // <--- PENAMBAHAN PENANGKAP NAMA ADMIN DI SINI
            ]
        );

        await connection.commit();
        return { id: insertResult.insertId, nomor_surat: nomorFormatted, link_drive: driveResult.webViewLink };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { createSuratKeluar };