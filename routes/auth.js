const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const authController = require('../controllers/authController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for profile photo uploads
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/profiles');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const profileUpload = multer({
    storage: profileStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for profile photos
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname || mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'), false);
        }
    }
});

// Validation middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array().map(e => e.msg)
        });
    }
    next();
};

// @route   POST /api/auth/login
router.post('/login', [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate
], authController.login);

// @route   POST /api/auth/register
router.post('/register', [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate
], authController.register);

// @route   POST /api/auth/forgot-password
router.post('/forgot-password', [
    body('email').isEmail().withMessage('Valid email is required'),
    validate
], authController.forgotPassword);

// @route   POST /api/auth/reset-password
router.post('/reset-password', [
    body('token').notEmpty().withMessage('Token is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate
], authController.resetPassword);

// @route   POST /api/auth/send-reset-code
// @desc    Send verification code via SMS (Super Admin only)
router.post('/send-reset-code', authController.sendResetCode);

// @route   POST /api/auth/find-user-for-reset
// @desc    Find user by username for password reset (Super Admin only)
router.post('/find-user-for-reset', authController.findUserForReset);

// @route   POST /api/auth/verify-reset-code
// @desc    Verify reset code
router.post('/verify-reset-code', [
    body('phone').notEmpty().withMessage('Phone is required'),
    body('code').notEmpty().withMessage('Code is required'),
    validate
], authController.verifyResetCode);

// @route   POST /api/auth/reset-password-by-phone
// @desc    Reset password by phone
router.post('/reset-password-by-phone', [
    body('phone').notEmpty().withMessage('Phone is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate
], authController.resetPasswordByPhone);

// @route   POST /api/auth/send-email-code
// @desc    Send verification code via email
router.post('/send-email-code', authController.sendEmailCode);

// @route   POST /api/auth/verify-email-code
// @desc    Verify email code
router.post('/verify-email-code', [
    body('email').isEmail().withMessage('Valid email is required'),
    body('code').notEmpty().withMessage('Code is required'),
    validate
], authController.verifyEmailCode);

// @route   POST /api/auth/verify-old-password
// @desc    Verify old password before allowing reset (for all users)
router.post('/verify-old-password', [
    body('email').isEmail().withMessage('Valid email is required'),
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    validate
], authController.verifyOldPassword);

// @route   POST /api/auth/reset-password-by-email
// @desc    Reset password by email verification
router.post('/reset-password-by-email', [
    body('email').isEmail().withMessage('Valid email is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate
], authController.resetPasswordByEmail);

// @route   GET /api/auth/me
router.get('/me', authenticate, authController.getMe);

// @route   POST /api/auth/change-password
router.post('/change-password', authenticate, [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
    validate
], authController.changePassword);

// @route   POST /api/auth/upload-photo
router.post('/upload-photo', authenticate, profileUpload.single('photo'), authController.uploadPhoto);

module.exports = router;
