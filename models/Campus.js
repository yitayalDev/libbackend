const mongoose = require('mongoose');

const campusSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    address: {
        type: String,
        trim: true
    },
    city: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    contactEmail: {
        type: String,
        trim: true,
        lowercase: true
    },
    contactPhone: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    // Optional metadata for total labs and computers (can be used when Lab docs are not present)
    totalLabs: {
        type: Number,
        default: 0
    },
    totalComputers: {
        type: Number,
        default: 0
    },
    // Admin assigned to this campus
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    adminName: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Campus', campusSchema);
