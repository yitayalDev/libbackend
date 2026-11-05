const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const reservationController = require('../controllers/reservationController');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array().map(e => e.msg) });
    }
    next();
};

router.get('/', authenticate, reservationController.getAllReservations);
router.get('/active-sessions', authenticate, reservationController.getActiveSessions);
router.get('/check-availability', authenticate, reservationController.checkAvailability);
router.get('/my-reservations', authenticate, authorize('teacher', 'admin', 'superadmin'), reservationController.getMyReservations);
router.get('/timetable', authenticate, authorize('teacher', 'admin', 'superadmin', 'technician'), reservationController.getTimetable);

router.post('/', authenticate, authorize('teacher', 'admin', 'superadmin'), [
    body('labId').notEmpty(),

    // Must be string
    body('courseName').isString().trim().notEmpty(),
    body('courseCode').isString().trim().notEmpty()
        // Expect something like IT101, CS101, etc. (letters + digits)
        .custom(value => {
            const re = /^[A-Za-z]{2,}[0-9]{3,}$/;
            if (!re.test(value)) throw new Error('courseCode must be like IT101');
            return true;
        }),

    // Must be string
    body('section').optional().isString().trim(),

    body('date').isISO8601(),
    body('startTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body('endTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body('numberOfStudents').isInt({ min: 1 }),
    validate
], reservationController.createReservation);


router.post('/recurring', authenticate, authorize('teacher', 'admin', 'superadmin'), [
    body('labId').notEmpty(),

    body('courseName').isString().trim().notEmpty(),
    body('courseCode').isString().trim().notEmpty()
        .custom(value => {
            const re = /^[A-Za-z]{2,}[0-9]{3,}$/;
            if (!re.test(value)) throw new Error('courseCode must be like IT101');
            return true;
        }),

    body('section').optional().isString().trim(),

    body('startTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body('endTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body('startDate').isISO8601(),
    body('endDate').isISO8601(),
    validate
], reservationController.createRecurringReservations);


router.patch('/:id/approve', authenticate, authorize('admin', 'superadmin'), reservationController.approveReservation);

router.patch('/:id/reject', authenticate, authorize('admin', 'superadmin'), [
    body('reason').trim().notEmpty(),
    validate
], reservationController.rejectReservation);

router.delete('/:id', authenticate, reservationController.cancelReservation);

module.exports = router;
