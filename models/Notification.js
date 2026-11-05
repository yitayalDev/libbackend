const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    type: {
        type: String,
        required: true,
        enum: [
            'fault_reported',
            'fault_assigned',
            'fault_updated',
            'fault_resolved',
            'booking_created',
            'booking_confirmed',
            'booking_cancelled',
            'booking_reminder',
            'booking_deleted',
            'attendance_marked',
            'report',
            'maintenance_reminder',
            'maintenance_overdue',
            'system_alert',
            'general'
        ]
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    link: {
        type: String,
        trim: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    isRead: {
        type: Boolean,
        default: false
    },
    readAt: {
        type: Date
    },
    relatedModel: {
        type: String,
        enum: ['Fault', 'Booking', 'Reservation', 'User', 'Equipment', 'Report', null],
        default: null
    },
    relatedId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('Notification', notificationSchema);
