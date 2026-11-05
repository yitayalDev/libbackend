const mongoose = require('mongoose');

const faultSchema = new mongoose.Schema({
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lab: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lab',
        required: true
    },
    workstation: {
        type: String,
        trim: true
    },
    category: {
        type: String,
        required: true,
        enum: ['hardware', 'software', 'network', 'peripheral', 'other']
    },
    severity: {
        type: String,
        required: true,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['open', 'in-progress', 'resolved', 'closed'],
        default: 'open'
    },
    submittedTo: {
        type: String,
        enum: ['technician', 'admin', 'superadmin'],
        required: true,
        default: 'technician'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    resolution: {
        type: String,
        trim: true
    },
    resolvedAt: {
        type: Date
    },
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    attachments: [{
        filename: String,
        path: String,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

// Indexes
faultSchema.index({ reportedBy: 1 });
faultSchema.index({ lab: 1 });
faultSchema.index({ status: 1 });
faultSchema.index({ assignedTo: 1 });

module.exports = mongoose.model('Fault', faultSchema);
