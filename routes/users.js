const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticate, authorize, campusFilter } = require('../middleware/auth');
const userController = require('../controllers/userController');

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

// @route   POST /api/users
router.post('/', authenticate, authorize('admin', 'superadmin'), [
    body('username').trim().isLength({ min: 3, max: 50 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('firstName').optional().trim(),
    body('lastName').optional().trim(),
    body('name').optional().trim(),
    body('role').optional().isIn(['student', 'teacher', 'technician', 'admin']),
    body('studentId').optional().trim(),
    body('department').optional().trim(),
    body('phone').optional().trim(),
    body('campus').optional().trim(),
    body('college').optional().trim(),
    validate
], userController.createUser);

// @route   GET /api/users
router.get('/', authenticate, authorize('admin', 'superadmin'), userController.getAllUsers);

// @route   GET /api/users/students
// @desc    Get students by year, semester, department (for teachers)
// @access  Teacher/Admin
router.get('/students', authenticate, authorize('teacher', 'admin'), userController.getStudentsByFilter);

// @route   GET /api/users/:id
router.get('/:id', authenticate, userController.getUserById);

// @route   PUT /api/users/:id
router.put('/:id', authenticate, [
    body('name').optional().trim().notEmpty(),
    body('email').optional().isEmail(),
    body('phone').optional().trim(),
    body('department').optional().trim(),
    body('campus').optional().trim(),
    body('college').optional().trim(),
    validate
], userController.updateUser);

// @route   PUT /api/users/:id/role
router.put('/:id/role', authenticate, authorize('admin', 'superadmin'), [
    body('role').isIn(['student', 'teacher', 'technician', 'admin']),
    validate
], userController.updateUserRole);

// @route   PUT /api/users/:id/approve
router.put('/:id/approve', authenticate, authorize('admin', 'superadmin'), userController.approveUser);

// @route   PUT /api/users/:id/reject
router.put('/:id/reject', authenticate, authorize('admin', 'superadmin'), userController.rejectUser);

// @route   PUT /api/users/:id/reset-password
router.put('/:id/reset-password', authenticate, authorize('admin', 'superadmin'), [
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
    validate
], userController.resetUserPassword);

// @route   DELETE /api/users/:id
router.delete('/:id', authenticate, authorize('admin', 'superadmin'), userController.deleteUser);

// @route   PUT /api/users/:id/toggle-status
router.put('/:id/toggle-status', authenticate, userController.toggleUserStatus);

module.exports = router;
