# SIKD LPMPP - Sistem Informasi Kearsipan Dinamis

Aplikasi manajemen arsip dinamis berbasis web untuk internal Lembaga Penjaminan Mutu dan Pengembangan Pembelajaran (LPMPP). Dibangun dengan Node.js, MySQL, dan terintegrasi langsung dengan Google Drive API untuk pengarsipan dokumen secara terotomatisasi.

## 🚀 Fitur Utama
- **Pemisahan Pintu Input:** Registrasi Surat Masuk & Surat Keluar.
- **Penomoran Otomatis:** Format standar `[Urut]/[Klasifikasi]/[Unit]/[Bulan]/[Tahun]`.
- **Cloud Storage Otomatis:** Unggah & alokasi hierarki folder dinamis via Google Drive API.
- **Jadwal Retensi Arsip (JRA):** Menghitung jatuh tempo arsip secara otomatis berdasarkan Tipe Berkas.
- **Pelacakan Fisik Bertingkat:** Cascading dropdown untuk Ruangan > Kabinet > Laci > Ordner.

## 🛠️ Persyaratan Sistem
- Node.js (v14 atau lebih baru)
- MySQL / MariaDB (XAMPP/Laragon)
- Akun Google Cloud Console (untuk OAuth 2.0 / Service Account)

## 📦 Instalasi
1. Clone repositori ini:
   ```bash
   git clone [https://github.com/achadE7/sikd-lpmpp.git](https://github.com/achadE7/sikd-lpmpp.git)
   cd sikd-lpmpp