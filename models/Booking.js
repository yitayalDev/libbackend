const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    user: {
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
        workstationId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        workstationNumber: {
            type: String,
            required: true
        }
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
    purpose: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'],
        default: 'pending'
    },
    checkedInAt: {
        type: Date
    },
    checkedOutAt: {
        type: Date
    },
    cancelledAt: {
        type: Date
    },
    cancellationReason: {
        type: String,
        trim: true
    },
    notes: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

// Index for efficient querying
bookingSchema.index({ user: 1, date: -1 });
bookingSchema.index({ lab: 1, date: 1 });
bookingSchema.index({ status: 1 });

// Check for overlapping bookings
bookingSchema.statics.checkOverlap = async function (labId, workstationId, date, startTime, endTime, excludeBookingId = null) {
    // Convert labId to ObjectId if needed
    const labObjectId = mongoose.Types.ObjectId.isValid(labId) ? new mongoose.Types.ObjectId(labId) : labId;
    
    // Convert workstationId to ObjectId if needed
    const wsObjectId = mongoose.Types.ObjectId.isValid(workstationId) ? new mongoose.Types.ObjectId(workstationId) : workstationId;
    
    // Handle both string date and Date object
    let dateObj;
    if (date instanceof Date) {
        dateObj = date;
    } else {
        dateObj = new Date(date);
    }
    
    // Reset time component to ensure we're comparing dates correctly
    dateObj.setHours(0, 0, 0, 0);
    
    const query = {
        lab: labObjectId,
        'workstation.workstationId': wsObjectId,
        date: dateObj,
        status: { $in: ['pending', 'confirmed'] },
        $or: [
            { startTime: { $lt: endTime }, endTime: { $gt: startTime } }
        ]
    };

    if (excludeBookingId) {
        query._id = { $ne: excludeBookingId };
    }

    console.log('[CHECK OVERLAP] Query:', JSON.stringify(query));
    return this.findOne(query);
};

module.exports = mongoose.model('Booking', bookingSchema);
