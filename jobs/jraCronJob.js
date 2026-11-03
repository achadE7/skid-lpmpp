const cron = require('node-cron');
const db = require('../config/database');

const initJraCron = () => {
    // Penjadwalan berjalan setiap hari pada jam 00:00 (Tengah Malam)
    cron.schedule('0 0 * * *', async () => {
        console.log('\n[JRA Cron] Memulai pengecekan Jadwal Retensi Arsip otomatis...');
        
        try {
            // Aturan: Arsip yang umurnya lebih dari 5 tahun otomatis menjadi 'Inaktif'
            const retentionYears = 5;

            // 1. Update Surat Keluar
            const queryKeluar = `
                UPDATE surat_keluar 
                SET status_arsip = 'Inaktif' 
                WHERE status_arsip = 'Aktif' 
                AND tanggal_surat <= DATE_SUB(CURDATE(), INTERVAL ? YEAR)
            `;
            const [resultKeluar] = await db.execute(queryKeluar, [retentionYears]);
            
            // 2. Update Surat Masuk
            const queryMasuk = `
                UPDATE surat_masuk 
                SET status_arsip = 'Inaktif' 
                WHERE status_arsip = 'Aktif' 
                AND tanggal_surat <= DATE_SUB(CURDATE(), INTERVAL ? YEAR)
            `;
            const [resultMasuk] = await db.execute(queryMasuk, [retentionYears]);

            console.log(`[JRA Cron] Selesai. Surat Keluar di-inaktifkan: ${resultKeluar.affectedRows} | Surat Masuk di-inaktifkan: ${resultMasuk.affectedRows}\n`);
            
        } catch (error) {
            console.error('[JRA Cron] Terjadi kesalahan saat memproses retensi:', error);
        }
    });
    
    console.log('[Sistem] Robot JRA Cron Job berhasil diaktifkan. Berjalan di latar belakang.');
};

module.exports = { initJraCron };