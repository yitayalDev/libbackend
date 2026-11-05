const mongoose = require('mongoose');

const maintenanceRecordSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true
    },
    type: {
        type: String,
        enum: ['routine', 'repair', 'upgrade', 'inspection'],
        required: true
    },
    description: {
        type: String,
        required: true
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    cost: {
        type: Number,
        default: 0
    },
    nextMaintenanceDate: {
        type: Date
    }
}, { _id: true });

const equipmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        enum: ['computer', 'laptop', 'printer', 'projector', 'network', 'furniture', 'peripheral', 'other']
    },
    lab: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lab'
    },
    specifications: {
        brand: String,
        model: String,
        serialNumber: String,
        purchaseDate: Date,
        warrantyExpiry: Date,
        specifications: mongoose.Schema.Types.Mixed
    },
    status: {
        type: String,
        enum: ['operational', 'maintenance', 'broken', 'retired', 'disposed'],
        default: 'operational'
    },
    condition: {
        type: String,
        enum: ['excellent', 'good', 'fair', 'poor'],
        default: 'good'
    },
    location: {
        type: String,
        trim: true
    },
    quantity: {
        type: Number,
        default: 1,
        min: 0
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    maintenanceRecords: [maintenanceRecordSchema],
    purchaseInfo: {
        vendor: String,
        purchasePrice: Number,
        purchaseOrder: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    notes: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

// Indexes
equipmentSchema.index({ lab: 1 });
equipmentSchema.index({ category: 1 });
equipmentSchema.index({ status: 1 });

module.exports = mongoose.model('Equipment', equipmentSchema);
