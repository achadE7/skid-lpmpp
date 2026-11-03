const express = require('express');
const router = express.Router();
const multer = require('multer');
const { createSuratMasuk } = require('../controllers/suratMasukController');

const upload = multer({ dest: 'uploads/' });

// Rute mengarah ke root (/) karena di server.js sudah didefinisikan /api/surat-masuk
router.post('/', upload.single('file'), createSuratMasuk);

module.exports = router;