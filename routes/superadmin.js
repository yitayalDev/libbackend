const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const superadminController = require('../controllers/superadminController');

router.use(authenticate);
router.use(authorize('superadmin'));

router.get('/dashboard', superadminController.getDashboard);

router.get('/audit-logs', superadminController.getAuditLogs);
router.get('/audit-logs/actions', superadminController.getAuditLogActions);

router.get('/campuses', superadminController.getCampuses);
router.post('/campuses', superadminController.createCampus);
router.put('/campuses/:id', superadminController.updateCampus);
router.delete('/campuses/:id', superadminController.deleteCampus);

router.get('/roles', superadminController.getRoleDistribution);
router.put('/roles/:userId', superadminController.changeUserRole);

router.get('/config', superadminController.getConfigs);
router.post('/config', superadminController.createConfig);
router.put('/config/:key', superadminController.updateConfig);

router.post('/reset-password-by-phone', superadminController.resetPasswordByPhone);

module.exports = router;
