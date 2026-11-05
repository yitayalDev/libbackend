const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const settingsController = require('../controllers/settingsController');

router.use(authenticate);
router.use(authorize('admin', 'superadmin'));

router.get('/', settingsController.getSettings);
router.put('/', settingsController.updateSettings);

module.exports = router;
