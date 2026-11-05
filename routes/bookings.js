const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const bookingController = require('../controllers/bookingController');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array().map(e => e.msg) });
    }
    next();
};

// Public endpoint to check lab availability - no auth required
router.get('/available', async (req, res, next) => {
    try {
        const { lab, date } = req.query;
        
        if (!lab || !date) {
            return res.status(400).json({ success: false, message: 'Lab and date are required' });
        }

        const { getAvailability } = require('../controllers/labController');
        await getAvailability(req, res);
    } catch (error) {
        next(error);
    }
});

router.get('/conflicts', authenticate, authorize('admin', 'superadmin'), bookingController.detectConflicts);
router.get('/', authenticate, authorize('admin', 'technician', 'superadmin'), bookingController.getAllBookings);
router.get('/my-bookings', authenticate, bookingController.getMyBookings);
router.get('/history', authenticate, bookingController.getBookingHistory);

router.post('/', authenticate, [
    body('labId').notEmpty(),
    body('workstationId').notEmpty(),
    body('date').isISO8601(),
    body('startTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body('endTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/),
    body('purpose').trim().notEmpty(),
    validate
], bookingController.createBooking);

router.delete('/:id', authenticate, bookingController.deleteBooking);
router.patch('/:id/status', authenticate, authorize('admin', 'superadmin'), bookingController.updateStatus);
router.patch('/:id/checkin', authenticate, bookingController.checkin);
router.patch('/:id/resolve-conflict', authenticate, authorize('admin', 'superadmin'), bookingController.resolveConflict);

module.exports = router;
