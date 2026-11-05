const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const inventoryController = require('../controllers/inventoryController');

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array().map(e => e.msg) });
    }
    next();
};

router.get('/', authenticate, inventoryController.getAllItems);
router.get('/:id', authenticate, inventoryController.getItemById);

router.post('/', authenticate, authorize('admin', 'superadmin', 'technician'), [
    body('name').trim().notEmpty(),
    body('code').trim().notEmpty(),
    body('category').isIn(['computer', 'laptop', 'printer', 'projector', 'network', 'furniture', 'peripheral', 'other']),
    validate
], inventoryController.createItem);

router.put('/:id', authenticate, authorize('admin', 'superadmin', 'technician'), inventoryController.updateItem);

router.post('/:id/maintenance', authenticate, authorize('admin', 'superadmin', 'technician'), [
    body('type').isIn(['routine', 'repair', 'upgrade', 'inspection']),
    body('description').trim().notEmpty(),
    body('date').isISO8601(),
    validate
], inventoryController.addMaintenanceRecord);

router.delete('/:id', authenticate, authorize('admin', 'superadmin', 'technician'), inventoryController.deleteItem);

module.exports = router;
