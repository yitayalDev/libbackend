const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const labController = require('../controllers/labController');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array().map(e => e.msg) });
    }
    next();
};

router.get('/', labController.getAllLabs);
router.get('/campus/:campus', labController.getLabsByCampus);
router.get('/:id', labController.getLabById);
router.get('/:id/rooms', labController.getLabRooms);
router.get('/:id/workstations', labController.getWorkstations);
router.put('/:id/workstations/:workstationId', authenticate, authorize('technician', 'admin', 'superadmin'), labController.updateWorkstationStatus);
router.get('/:id/availability', labController.getAvailability);
router.delete('/:id/rooms/:roomId', authenticate, authorize('admin', 'superadmin'), labController.deleteRoom);

router.post('/', authenticate, authorize('admin', 'superadmin'), [
    body('name').trim().notEmpty(),
    body('code').trim().notEmpty(),
    body('capacity').isInt({ min: 1 }),
    body('campus').trim().notEmpty(),
    validate
], labController.createLab);

router.put('/:id', authenticate, authorize('admin', 'superadmin'), labController.updateLab);
router.delete('/:id', authenticate, authorize('admin', 'superadmin'), labController.deleteLab);

module.exports = router;
