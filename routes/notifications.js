const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

// @route   GET /api/notifications
// @desc    Get current user's notifications
// @access  Private
router.get('/', authenticate, notificationController.getNotifications);

// @route   GET /api/notifications/unread-count
// @desc    Get unread notification count
// @access  Private
router.get('/unread-count', authenticate, notificationController.getUnreadCount);

// @route   PATCH /api/notifications/mark-all-read
// @desc    Mark all notifications as read
// @access  Private
router.patch('/mark-all-read', authenticate, notificationController.markAllAsRead);

// @route   PATCH /api/notifications/:id/read
// @desc    Mark a notification as read
// @access  Private
router.patch('/:id/read', authenticate, notificationController.markAsRead);

// @route   DELETE /api/notifications/clear-all
// @desc    Clear all read notifications
// @access  Private
router.delete('/clear-all', authenticate, notificationController.clearAllRead);

// @route   DELETE /api/notifications/:id
// @desc    Delete a notification
// @access  Private
router.delete('/:id', authenticate, notificationController.deleteNotification);

// @route   POST /api/notifications/export-data
// @desc    Submit technician export data request
// @access  Technician
router.post('/export-data', authenticate, authorize('technician'), notificationController.submitExportDataRequest);

// @route   POST /api/notifications/send
// @desc    Send a notification to users
// @access  Admin/Superadmin
router.post('/send', authenticate, authorize('admin', 'superadmin'), notificationController.sendNotification);

module.exports = router;
