const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AttendanceSession'
    },
    reservation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Reservation'
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['present', 'absent', 'late', 'excused'],
        default: 'absent'
    },
    checkInTime: {
        type: Date
    },
    checkOutTime: {
        type: Date
    },
    markedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    notes: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

// Compound index - either session or reservation required
attendanceSchema.index({ session: 1, student: 1 }, { unique: true, sparse: true });
attendanceSchema.index({ reservation: 1, student: 1 }, { unique: true, sparse: true });
attendanceSchema.index({ session: 1, status: 1 });
attendanceSchema.index({ reservation: 1, status: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
