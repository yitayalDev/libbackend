const mongoose = require('mongoose');

const workstationSchema = new mongoose.Schema({
    workstationNumber: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['available', 'occupied', 'maintenance', 'reserved', 'broken'],
        default: 'available'
    },
    notes: {
        type: String,
        trim: true
    },
    lastUpdatedBy: {
        type: String,
        default: null
    },
    lastUpdatedAt: {
        type: Date,
        default: null
    },
    specifications: {
        cpu: String,
        ram: String,
        storage: String,
        os: String,
        monitor: String
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { _id: true });

const roomSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['general', 'female_only', 'male_only', 'post'],
        default: 'general'
    },
    capacity: {
        type: Number,
        required: true
    },
    workstations: [workstationSchema]
}, { _id: true });

const labSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    campus: {
        type: String,
        required: true,
        trim: true
    },
    rooms: [roomSchema],
    location: {
        building: String,
        floor: String,
        roomNumber: String
    },
    capacity: {
        type: Number,
        required: true,
        min: 1
    },
    workstations: [workstationSchema],
    facilities: [{
        type: String,
        enum: ['projector', 'whiteboard', 'ac', 'printer', 'scanner', 'internet']
    }],
    openingHours: {
        monday: { open: String, close: String },
        tuesday: { open: String, close: String },
        wednesday: { open: String, close: String },
        thursday: { open: String, close: String },
        friday: { open: String, close: String },
        saturday: { open: String, close: String },
        sunday: { open: String, close: String }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    description: {
        type: String,
        trim: true
    },
    supervisor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Generate workstations when lab is created
labSchema.pre('save', function (next) {
    if (this.isNew && this.workstations.length === 0) {
        for (let i = 1; i <= this.capacity; i++) {
            this.workstations.push({
                workstationNumber: `WS-${i.toString().padStart(3, '0')}`,
                status: 'available'
            });
        }
    }
    next();
});

module.exports = mongoose.model('Lab', labSchema);
