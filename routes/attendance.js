const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const attendanceController = require('../controllers/attendanceController');
const attendanceSessionController = require('../controllers/attendanceSessionController');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array().map(e => e.msg) });
    }
    next();
};

// Session Management Routes
router.post('/sessions', authenticate, authorize('teacher', 'admin'), attendanceSessionController.createSession);
router.get('/sessions', authenticate, authorize('teacher', 'admin'), attendanceSessionController.getSessions);
router.get('/sessions/:id', authenticate, authorize('teacher', 'admin'), attendanceSessionController.getSessionById);
router.patch('/sessions/:id/start', authenticate, authorize('teacher', 'admin'), attendanceSessionController.startSession);
router.patch('/sessions/:id/end', authenticate, authorize('teacher', 'admin'), attendanceSessionController.endSession);

// Student attendance for a session
router.get('/sessions/:sessionId/students', authenticate, authorize('teacher', 'admin'), attendanceSessionController.getSessionStudents);
router.post('/sessions/:sessionId/mark', authenticate, authorize('teacher', 'admin'), [
    body('studentId').notEmpty(),
    body('status').isIn(['present', 'absent', 'late']),
    validate
], attendanceSessionController.markStudentAttendance);

router.get('/reservation/:reservationId', authenticate, authorize('teacher', 'admin', 'superadmin'), attendanceController.getAttendance);

// Attendance history for teacher
router.get('/history', authenticate, authorize('teacher', 'admin', 'superadmin'), attendanceController.getAttendanceHistory);

// Debug test route - no auth required
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'Attendance routes working', time: new Date().toISOString() });
});

// Debug test route - with auth
router.get('/test-auth', authenticate, (req, res) => {
    res.json({ success: true, message: 'Attendance routes working with auth', user: { id: req.user._id, role: req.user.role } });
});

// Public routes for QR attendance scan
router.get('/session/:reservationId', attendanceController.getSessionInfo);
router.post('/qr-scan', [
    body('reservationId').notEmpty(),
    body('studentId').trim().notEmpty().withMessage('Student ID is required'),
    validate
], attendanceController.markAttendanceByQR);

router.post('/mark', authenticate, authorize('teacher', 'admin', 'superadmin'), [
    body('reservationId').notEmpty(),
    body('studentId').notEmpty(),
    body('status').isIn(['present', 'absent', 'late', 'excused']),
    validate
], attendanceController.markAttendance);

router.post('/bulk-mark', authenticate, authorize('teacher', 'admin', 'superadmin'), [
    body('reservationId').notEmpty(),
    body('attendanceRecords').isArray({ min: 1 }),
    body('attendanceRecords.*.studentId').notEmpty(),
    body('attendanceRecords.*.status').isIn(['present', 'absent', 'late', 'excused']),
    validate
], attendanceController.bulkMarkAttendance);

router.get('/stats/:reservationId', authenticate, authorize('teacher', 'admin', 'superadmin'), attendanceController.getAttendanceStats);

router.post('/checkout', authenticate, authorize('teacher', 'admin', 'superadmin'), [
    body('reservationId').notEmpty(),
    body('studentId').trim().notEmpty().withMessage('Student ID is required'),
    validate
], attendanceController.checkOutStudent);

router.post('/mark-by-student-id', authenticate, authorize('teacher', 'admin', 'superadmin'), [
    body('reservationId').notEmpty(),
    body('studentId').trim().notEmpty().withMessage('Student ID is required'),
    body('status').optional().isIn(['present', 'absent', 'late', 'excused']),
    validate
], attendanceController.markByStudentId);

router.post('/mark-by-email', authenticate, authorize('teacher', 'admin', 'superadmin'), [
    body('reservationId').notEmpty(),
    body('email').trim().notEmpty().withMessage('Student ID or email is required'),
    validate
], attendanceController.markAttendanceByEmail);

// Student self-service attendance (no QR, just Student ID)
router.get('/active-session', authenticate, attendanceController.getActiveSession);
router.post('/mark-student', authenticate, [
    body('studentId').trim().notEmpty().withMessage('Student ID is required'),
    validate
], attendanceController.markStudentAttendance);

module.exports = router;