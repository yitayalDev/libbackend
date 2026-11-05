const Notification = require('../models/Notification');
const User = require('../models/User');

// @route   GET /api/notifications
// @desc    Get current user's notifications
// @access  Private
exports.getNotifications = async (req, res) => {
    try {
        const { isRead, type, page = 1, limit = 1000 } = req.query;
        let query = { recipient: req.user._id };

        if (isRead !== undefined) query.isRead = isRead === 'true';
        if (type) query.type = type;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const notifications = await Notification.find(query)
            .populate('sender', 'name username role')
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        const total = await Notification.countDocuments(query);
        const unreadCount = await Notification.countDocuments({
            recipient: req.user._id,
            isRead: false
        });

        res.json({
            success: true,
            notifications,
            unreadCount,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/notifications/unread-count
// @desc    Get unread notification count
// @access  Private
exports.getUnreadCount = async (req, res) => {
    try {
        const count = await Notification.countDocuments({
            recipient: req.user._id,
            isRead: false
        });

        res.json({ success: true, count });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PATCH /api/notifications/:id/read
// @desc    Mark a notification as read
// @access  Private
exports.markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipient: req.user._id },
            { isRead: true, readAt: new Date() },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({ success: true, notification });
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PATCH /api/notifications/mark-all-read
// @desc    Mark all notifications as read
// @access  Private
exports.markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.user._id, isRead: false },
            { isRead: true, readAt: new Date() }
        );

        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   DELETE /api/notifications/:id
// @desc    Delete a notification
// @access  Private
exports.deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            recipient: req.user._id
        });

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   DELETE /api/notifications/clear-all
// @desc    Clear all read notifications
// @access  Private
exports.clearAllRead = async (req, res) => {
    try {
        await Notification.deleteMany({
            recipient: req.user._id,
            isRead: true
        });

        res.json({ success: true, message: 'All read notifications cleared' });
    } catch (error) {
        console.error('Clear all read error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/notifications/send
// @desc    Send a notification (admin/superadmin only)
// @access  Admin/Superadmin
exports.sendNotification = async (req, res) => {
    try {
        const { recipientId, recipientRole, type, title, message, link, priority, relatedModel, relatedId, metadata } = req.body;

        let recipients = [];

        if (recipientId) {
            recipients = [recipientId];
        } else if (recipientRole) {
            const users = await User.find({ role: recipientRole, isActive: true }).select('_id');
            recipients = users.map(u => u._id);
        } else {
            return res.status(400).json({ success: false, message: 'Recipient ID or role is required' });
        }

        const notifications = recipients.map(recipient => ({
            recipient,
            sender: req.user._id,
            type: type || 'general',
            title,
            message,
            link,
            priority: priority || 'medium',
            relatedModel,
            relatedId,
            metadata
        }));

        const created = await Notification.insertMany(notifications);

        res.status(201).json({
            success: true,
            message: `Notification sent to ${created.length} user(s)`,
            count: created.length
        });
    } catch (error) {
        console.error('Send notification error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/notifications/export-data
// @desc    Submit a technician export data request to admins and superadmins
// @access  Technician
exports.submitExportDataRequest = async (req, res) => {
    try {
        const {
            title,
            category,
            labName,
            dateRange,
            format,
            summary,
            details,
            includeSchedule,
            includeComputerStatus,
            includeInventory,
            includeMaintenance
        } = req.body;

        if (!title || !summary) {
            return res.status(400).json({
                success: false,
                message: 'Title and summary are required'
            });
        }

        const campus = req.user.campus || req.user.campusCode;
        const adminQuery = campus
            ? { role: 'admin', campus, isActive: true }
            : { role: 'admin', isActive: true };

        const recipients = await User.find({
            isActive: true,
            $or: [
                adminQuery,
                { role: 'superadmin' }
            ]
        }).select('_id role');

        if (recipients.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No active admin or superadmin recipients found'
            });
        }

        const includedData = [
            includeSchedule ? 'schedule' : null,
            includeComputerStatus ? 'computer status' : null,
            includeInventory ? 'inventory' : null,
            includeMaintenance ? 'maintenance' : null
        ].filter(Boolean);

        const requestMetadata = {
            category: category || 'general',
            labName: labName || '',
            campus: campus || '',
            dateRange: dateRange || '',
            format: format || 'pdf',
            summary,
            details: details || '',
            includedData,
            requestedBy: {
                id: req.user._id,
                name: req.user.name || req.user.username,
                role: req.user.role
            }
        };

        const notifications = recipients.map(recipient => ({
            recipient: recipient._id,
            sender: req.user._id,
            type: 'report',
            title: `Export data request: ${title}`,
            message: `${req.user.name || req.user.username} requested ${format || 'PDF'} export data${labName ? ` for ${labName}` : ''}. ${summary}`,
            link: '/admin/reports',
            priority: 'high',
            relatedModel: 'Report',
            metadata: requestMetadata
        }));

        await Notification.insertMany(notifications);

        res.status(201).json({
            success: true,
            message: `Export data request sent to ${recipients.length} admin recipient(s)`,
            count: recipients.length
        });
    } catch (error) {
        console.error('Submit export data request error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Helper function to create notifications (used by other controllers)
exports.createNotification = async (data) => {
    try {
        const notification = await Notification.create(data);
        return notification;
    } catch (error) {
        console.error('Create notification helper error:', error);
        return null;
    }
};

// Helper: notify users by role
exports.notifyByRole = async (roles, data) => {
    try {
        const users = await User.find({ role: { $in: roles }, isActive: true }).select('_id');
        if (users.length === 0) {
            console.warn(`notifyByRole: No active users found for roles: ${roles.join(', ')}`);
            return;
        }
        const notifications = users.map(user => ({
            ...data,
            recipient: user._id
        }));
        await Notification.insertMany(notifications);
        console.log(`notifyByRole: Sent ${notifications.length} notification(s) to roles: ${roles.join(', ')}`);
    } catch (error) {
        console.error('notifyByRole error:', error.message, error.errors || '');
    }
};
