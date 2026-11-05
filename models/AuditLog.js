const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false  // Made optional for auth actions that happen before user is identified
    },
    action: {
        type: String,
        required: true,
        enum: [
            'user.login', 'user.logout', 'user.register', 'user.create', 'user.update',
            'user.delete', 'user.approve', 'user.reject', 'user.role_change', 'user.password_reset_admin',
            'lab.create', 'lab.update', 'lab.delete',
            'booking.create', 'booking.update', 'booking.cancel', 'booking.delete', 'booking.status_change',
            'reservation.create', 'reservation.approve', 'reservation.reject', 'reservation.cancel',
            'fault.create', 'fault.update', 'fault.resolve', 'fault.status_change', 'fault.ticket_update', 'fault.ticket_status_change',
            'equipment.create', 'equipment.update', 'equipment.delete', 'equipment.operation',
            'campus.create', 'campus.update', 'campus.delete',
            'config.update', 'material.upload', 'material.delete',
            'attendance.mark', 'system.backup', 'system.maintenance',
            // Auth actions
            'auth.login', 'auth.logout', 'auth.register', 'auth.failed_login',
            'auth.password_reset_requested', 'auth.password_reset_failed', 'auth.password_reset_completed',
            'auth.pending_account', 'auth.rejected_account', 'auth.inactive_account'
        ]
    },
    resource: {
        type: String,
        required: true
    },
    resourceId: {
        type: mongoose.Schema.Types.ObjectId
    },
    details: {
        type: String
    },
    previousValue: {
        type: mongoose.Schema.Types.Mixed
    },
    newValue: {
        type: mongoose.Schema.Types.Mixed
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    }
}, {
    timestamps: true
});

auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
