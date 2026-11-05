const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lab: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lab',
        required: true
    },
    roomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lab.rooms'
    },
    roomName: {
        type: String,
        trim: true
    },
    courseName: {
        type: String,
        required: true,
        trim: true
    },
    courseCode: {
        type: String,
        required: true,
        trim: true
    },
    semester: {
        type: String,
        trim: true
    },
    academicYear: {
        type: String,
        trim: true
    },
    year: {
        type: Number
    },
    section: {
        type: String,
        trim: true
    },
    program: {
        type: String,
        trim: true
    },
    date: {
        type: Date,
        required: true
    },
    startTime: {
        type: String,
        required: true,
        match: /^([01]\d|2[0-3]):([0-5]\d)$/
    },
    endTime: {
        type: String,
        required: true,
        match: /^([01]\d|2[0-3]):([0-5]\d)$/
    },
    numberOfStudents: {
        type: Number,
        required: true,
        min: 1
    },
    requiredWorkstations: {
        type: Number,
        min: 1
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'cancelled', 'completed'],
        default: 'pending'
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedTechnician: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: {
        type: Date
    },
    rejectionReason: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    recurring: {
        isRecurring: {
            type: Boolean,
            default: false
        },
        frequency: {
            type: String,
            enum: ['daily', 'weekly', 'biweekly', 'monthly'],
            default: 'weekly'
        },
        endDate: {
            type: Date
        }
    }
}, {
    timestamps: true
});

// Indexes
reservationSchema.index({ teacher: 1, date: -1 });
reservationSchema.index({ lab: 1, date: 1 });
reservationSchema.index({ status: 1 });

module.exports = mongoose.model('Reservation', reservationSchema);
