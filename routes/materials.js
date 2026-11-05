const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const materialController = require('../controllers/materialController');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array().map(e => e.msg) });
    }
    next();
};

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/materials');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar|mp4|mp3|jpg|jpeg|png|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname || mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'), false);
        }
    }
});

router.get('/', authenticate, materialController.getAllMaterials);
router.get('/my-materials', authenticate, authorize('teacher', 'admin', 'superadmin'), materialController.getMyMaterials);

router.post('/', authenticate, authorize('teacher', 'admin', 'superadmin'), upload.single('file'), [
    body('title').trim().notEmpty(),
    body('course').trim().notEmpty(),
    body('fileType').isIn(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'zip', 'rar', 'mp4', 'mp3', 'jpg', 'jpeg', 'png', 'gif']),
    validate
], materialController.uploadMaterial);

router.get('/:id/download', authenticate, materialController.downloadMaterial);
router.delete('/:id', authenticate, authorize('teacher', 'admin', 'superadmin'), materialController.deleteMaterial);

module.exports = router;
