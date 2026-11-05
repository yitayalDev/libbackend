const mongoose = require('mongoose');

const attendanceSessionSchema = new mongoose.Schema({
    year: {
        type: Number,
        required: true
    },
    semester: {
        type: Number,
        required: true
    },
    department: {
        type: String,
        required: true
    },
    courseCode: {
        type: String,
        required: true
    },
    campus: {
        type: String,
        required: true
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reservation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Reservation'
    },
    status: {
        type: String,
        enum: ['generated', 'active', 'completed'],
        default: 'generated'
    },
    startedAt: {
        type: Date
    },
    endedAt: {
        type: Date
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);