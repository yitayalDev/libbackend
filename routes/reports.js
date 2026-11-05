const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const reportController = require('../controllers/reportController');

router.get('/dashboard', authenticate, authorize('admin', 'superadmin'), reportController.getDashboard);
router.get('/technician-stats', authenticate, authorize('admin', 'technician', 'superadmin'), reportController.getTechnicianStats);
router.get('/bookings', authenticate, authorize('admin', 'technician', 'superadmin'), reportController.getBookingReports);
router.get('/equipment', authenticate, authorize('admin', 'superadmin'), reportController.getEquipmentReports);
router.get('/maintenance', authenticate, authorize('admin', 'superadmin'), reportController.getMaintenanceReports);

// Export endpoints
router.get('/export/csv', authenticate, authorize('admin', 'technician', 'superadmin'), reportController.exportCSV);
router.get('/export/pdf', authenticate, authorize('admin', 'technician', 'superadmin'), reportController.exportPDF);

// Generate and send report to user group
router.post('/generate', authenticate, authorize('admin', 'technician', 'superadmin'), reportController.generateAndSendReport);

// Staff performance tracking
router.get('/staff-performance', authenticate, authorize('admin', 'superadmin'), reportController.getStaffPerformance);

// Maintenance reminders
router.get('/maintenance-reminders', authenticate, authorize('admin', 'technician', 'superadmin'), reportController.getMaintenanceReminders);
router.post('/send-maintenance-reminders', authenticate, authorize('admin', 'technician', 'superadmin'), reportController.sendMaintenanceReminders);

module.exports = router;
