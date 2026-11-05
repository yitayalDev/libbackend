const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const maintenanceController = require('../controllers/maintenanceController');
const { body, validationResult } = require('express-validator');

const validateFault = (req, res, next) => {
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



// @route   GET /api/maintenance/faults
// @desc    Get all fault reports
// @access  Private
router.get('/faults', authenticate, maintenanceController.getAllFaults);

// @route   POST /api/maintenance/faults
// @desc    Report a new fault
// @access  Private
router.post('/faults', authenticate, [
    body('title').isString().trim().notEmpty().withMessage('title must be a string'),
    body('description').isString().trim().notEmpty().withMessage('description must be a string'),
    validateFault
], maintenanceController.createFault);



// @route   PATCH /api/maintenance/faults/:id
// @desc    Update fault status/assign
// @access  Technician/Admin
router.patch('/faults/:id', authenticate, authorize('technician', 'admin', 'superadmin'), maintenanceController.updateFault);

// @route   GET /api/maintenance/equipment
// @desc    Get all equipment
// @access  Private
router.get('/equipment', authenticate, maintenanceController.getAllEquipment);

// @route   POST /api/maintenance/equipment
// @desc    Add new equipment
// @access  Technician/Admin
router.post('/equipment', authenticate, authorize('technician', 'admin', 'superadmin'), maintenanceController.createEquipment);

// @route   PATCH /api/maintenance/equipment/:id
// @desc    Update equipment status
// @access  Technician/Admin
router.patch('/equipment/:id', authenticate, authorize('technician', 'admin', 'superadmin'), maintenanceController.updateEquipment);

// @route   DELETE /api/maintenance/equipment/:id
// @desc    Delete equipment (soft delete)
// @access  Technician/Admin
router.delete('/equipment/:id', authenticate, authorize('technician', 'admin', 'superadmin'), maintenanceController.deleteEquipment);

// @route   GET /api/maintenance/tickets
// @desc    Get maintenance tickets (alias for faults)
// @access  Private
router.get('/tickets', authenticate, maintenanceController.getTickets);

// @route   PATCH /api/maintenance/tickets/:id
// @desc    Update ticket status
// @access  Technician/Admin
router.patch('/tickets/:id', authenticate, authorize('technician', 'admin', 'superadmin'), maintenanceController.updateTicket);

module.exports = router;