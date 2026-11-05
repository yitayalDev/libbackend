const Booking = require('../models/Booking');
const Lab = require('../models/Lab');
const Reservation = require('../models/Reservation');
const { notifyByRole, createNotification } = require('./notificationController');
const logger = require('../utils/logger');
const AuditLog = require('../models/AuditLog');

const timesOverlap = (startA, endA, startB, endB) => startA < endB && startB < endA;

const sameDayKey = (dateValue) => {
    const date = new Date(dateValue);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

const findBookingRoomInfo = (booking) => {
    const workstationId = booking?.workstation?.workstationId?.toString();
    const rooms = booking?.lab?.rooms || [];

    for (const room of rooms) {
        const hasWorkstation = (room.workstations || []).some(ws => ws._id.toString() === workstationId);
        if (hasWorkstation) {
            return {
                roomId: room._id?.toString() || null,
                roomName: room.name || null
            };
        }
    }

    return { roomId: null, roomName: null };
};

const reservationsConflict = (a, b) => {
    if (a.lab?._id?.toString() !== b.lab?._id?.toString()) return false;
    if (sameDayKey(a.date) !== sameDayKey(b.date)) return false;
    if (!timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) return false;

    const roomA = a.roomId?.toString() || null;
    const roomB = b.roomId?.toString() || null;

    if (!roomA || !roomB) return true;
    return roomA === roomB;
};

// @route   GET /api/bookings
// @desc    Get all bookings (admin only)
// @access  Admin/Superadmin
exports.getAllBookings = async (req, res) => {
    try {
        const { status, lab, date, page = 1, limit = 1000 } = req.query;
        let query = {};

        // Campus filtering: Admins and Technicians only see their own campus
        if (req.user.role === 'admin' || req.user.role === 'technician') {
            if (req.user.campus) {
                const Lab = require('../models/Lab');
                const campusLabs = await Lab.find({ campus: req.user.campus }).select('_id');
                const labIds = campusLabs.map(l => l._id);
                query.lab = { $in: labIds };
            }
        }

        if (status) query.status = status;
        if (lab) query.lab = lab;
        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            query.date = { $gte: startOfDay, $lte: endOfDay };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const bookings = await Booking.find(query)
            .populate('user', 'name username email studentId')
            .populate('lab', 'name code')
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ date: -1, startTime: 1 });

        const total = await Booking.countDocuments(query);
        res.json({
            success: true,
            bookings,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/bookings/my-bookings
// @desc    Get current user's bookings
// @access  Private
exports.getMyBookings = async (req, res) => {
    try {
        const { status, upcoming } = req.query;
        let query = { user: req.user._id };
        if (status) query.status = status;
        if (upcoming === 'true') {
            query.date = { $gte: new Date() };
            query.status = { $in: ['pending', 'confirmed'] };
        }

        const bookings = await Booking.find(query)
            .populate('lab', 'name code location')
            .sort({ date: -1, startTime: 1 });

        res.json({ success: true, bookings });
    } catch (error) {
        console.error('Get my bookings error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/bookings/history
// @desc    Get booking history with filters
// @access  Private
exports.getBookingHistory = async (req, res) => {
    try {
        const { startDate, endDate, status } = req.query;
        let query = { user: req.user._id };

        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        if (status) query.status = status;

        const bookings = await Booking.find(query)
            .populate('lab', 'name code location')
            .sort({ date: -1 });

        res.json({ success: true, bookings });
    } catch (error) {
        console.error('Get booking history error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/bookings
// @desc    Create new booking
// @access  Private
exports.createBooking = async (req, res) => {
    try {
        const { labId, workstationId, date, startTime, endTime, purpose } = req.body;

        console.log('[CREATE BOOKING] Request body:', { labId, workstationId, date, startTime, endTime, purpose });
        console.log('[CREATE BOOKING] User:', req.user?.name, req.user?._id);

        // Validate date is not in the past (DISABLED to allow booking any date/time as requested)
        // BUT we still must compute bookingDate for overlap checks.
        const bookingDate = new Date(date);
        if (Number.isNaN(bookingDate.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid booking date' });
        }
        bookingDate.setHours(0, 0, 0, 0);

        // NOTE: past-date blocking intentionally disabled.
        // Admin can still resolve conflicts based on overlap checks below.

        const lab = await Lab.findById(labId);
        if (!lab) {
            return res.status(404).json({ success: false, message: 'Lab not found' });
        }
        console.log('[CREATE BOOKING] Lab found:', lab.name);
        console.log('[CREATE BOOKING] Lab rooms count:', lab.rooms.length);

        // Find workstation in rooms
        let workstation = null;
        let room = null;
        for (const r of lab.rooms) {
          const ws = r.workstations.find(ws => ws._id.toString() === workstationId);
          if (ws) {
            workstation = ws;
            room = r;
            break;
          }
        }

        // Fallback to top-level workstations if not found in rooms (legacy)
        if (!workstation) {
          workstation = lab.workstations.find(ws => ws._id.toString() === workstationId);
        }

        if (!workstation) {
          console.log('[CREATE BOOKING] Workstation not found in lab rooms or lab workstations');
          return res.status(404).json({ success: false, message: 'Workstation not found' });
        }
        console.log('[CREATE BOOKING] Workstation found:', workstation.workstationNumber);

        const roomId = room?._id || null;

        // Check gender-based room restrictions if room is identified
        const user = req.user;

        if (room) {
            if (room.type === 'female_only' && user.gender !== 'female') {
                return res.status(403).json({ success: false, message: 'Access denied: This room is restricted to female students only.' });
            }
            if (room.type === 'male_only' && user.gender !== 'male') {
                return res.status(403).json({ success: false, message: 'Access denied: This room is restricted to male students only.' });
            }
        }

        // Check for overlap with proper date handling
        console.log('[CREATE BOOKING] Booking date:', bookingDate);

        const overlap = await Booking.checkOverlap(labId, workstationId, bookingDate, startTime, endTime);
        if (overlap) {
            return res.status(409).json({ success: false, message: 'Time slot is already booked' });
        }

        const reservationDayStart = new Date(date);
        reservationDayStart.setHours(0, 0, 0, 0);
        const reservationDayEnd = new Date(date);
        reservationDayEnd.setHours(23, 59, 59, 999);

        const reservationConflictQuery = {
            lab: labId,
            date: { $gte: reservationDayStart, $lte: reservationDayEnd },
            status: 'approved',
            startTime: { $lt: endTime },
            endTime: { $gt: startTime },
            $or: [
                { roomId: roomId || null },
                { roomId: null }
            ]
        };

        const overlappingReservation = await Reservation.findOne(reservationConflictQuery);
        if (overlappingReservation) {
            return res.status(409).json({
                success: false,
                message: 'This workstation is unavailable because the room is reserved for a class during that time'
            });
        }

        const booking = new Booking({
            user: req.user._id,
            lab: labId,
            workstation: {
                workstationId: workstation._id,
                workstationNumber: workstation.workstationNumber,
                roomName: room ? room.name : null
            },
            date: new Date(date),
            startTime,
            endTime,
            purpose
        });

        await booking.save();

        // Audit log for booking creation
        await AuditLog.create({
            user: req.user._id,
            action: 'booking.create',
            resource: 'Booking',
            resourceId: booking._id,
            details: `Created booking for lab: ${lab.name}, workstation: ${workstation.workstationNumber}, date: ${new Date(date).toLocaleDateString()}`,
            previousValue: null,
            newValue: { lab: lab.name, workstation: workstation.workstationNumber, date, startTime, endTime, purpose },
            ipAddress: req.ip
        });

        // Notify user about booking creation
        await createNotification({
            recipient: req.user._id,
            type: 'booking_created',
            title: 'Booking Created',
            message: `Your booking for ${lab.name} (${workstation.workstationNumber}) on ${new Date(date).toLocaleDateString()} has been submitted.`,
            link: '/student/my-bookings',
            priority: 'medium',
            relatedModel: 'Booking',
            relatedId: booking._id,
            metadata: {
                labName: lab.name,
                roomName: room?.name || null,
                workstationNumber: workstation.workstationNumber,
                date: new Date(date).toISOString().split('T')[0],
                startTime,
                endTime
            }
        });

        // Notify admins about new booking
        await notifyByRole(['admin', 'superadmin'], {
            sender: req.user._id,
            type: 'booking_created',
            title: 'New Booking Request',
            message: `${req.user.name} booked ${lab.name} (${workstation.workstationNumber}) on ${new Date(date).toLocaleDateString()} from ${startTime} to ${endTime}`,
            link: '/admin/bookings',
            priority: 'low',
            relatedModel: 'Booking',
            relatedId: booking._id
        });

        res.status(201).json({ success: true, message: 'Booking created successfully', booking });
    } catch (error) {
        console.error('Create booking error:', error);
        console.error('Error stack:', error.stack);

        // Try to return a more helpful error message
        let errorMessage = 'Server error';
        if (error.name === 'ValidationError') {
            errorMessage = 'Validation error: ' + error.message;
        } else if (error.name === 'CastError') {
            errorMessage = 'Invalid ID format';
        } else if (error.code === 11000) {
            errorMessage = 'Duplicate entry';
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(500).json({ success: false, message: errorMessage });
    }
};

// @route   DELETE /api/bookings/:id
// @desc    Hard-delete a booking from the database
// @access  Private (booking owner or admin / superadmin)
exports.deleteBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        // Owner or admin/superadmin may delete
        if (booking.user.toString() !== req.user._id.toString() &&
            req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        await booking.populate('lab');
        await booking.populate('user');

        // Audit log before deletion
        await AuditLog.create({
            user: req.user._id,
            action: 'booking.delete',
            resource: 'Booking',
            resourceId: booking._id,
            details: `Deleted booking for lab: ${booking.lab?.name || 'a lab'} on ${new Date(booking.date).toLocaleDateString()}`,
            previousValue: { status: booking.status },
            newValue: null,
            ipAddress: req.ip
        });

        // Notify the booking owner about deletion
        await createNotification({
            recipient: booking.user._id,
            sender: req.user._id,
            type: 'booking_deleted',
            title: 'Booking Deleted',
            message: `Your booking for ${booking.lab?.name || 'a lab'} on ${new Date(booking.date).toLocaleDateString()} has been deleted.`,
            link: '/student/my-bookings',
            priority: 'high',
            relatedModel: 'Booking',
            relatedId: booking._id
        });

        await Booking.findByIdAndDelete(booking._id);

        res.json({ success: true, message: 'Booking deleted successfully' });
    } catch (error) {
        console.error('Delete booking error:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
};

// @route   PATCH /api/bookings/:id/status
// @desc    Update booking status (admin only)
// @access  Admin/Superadmin
exports.updateStatus = async (req, res) => {
    try {
        console.log('========== UPDATE BOOKING STATUS STARTED ==========');
        console.log('Booking ID:', req.params.id);
        console.log('New status:', req.body.status);
        console.log('User:', { id: req.user?._id, role: req.user?.role });

        const { status } = req.body;
        const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed', 'no-show'];
        if (!validStatuses.includes(status)) {
            console.log('Invalid status:', status);
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            console.log('Booking not found');
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        console.log('Current booking status:', booking.status);

        const previousStatus = booking.status;
        booking.status = status;
        if (status === 'cancelled') {
            booking.cancelledAt = new Date();
        }
        await booking.save();
        await booking.populate('user lab');

        console.log('Booking status updated to:', status);

        // Audit log for booking status change
        await AuditLog.create({
            user: req.user._id,
            action: 'booking.status_change',
            resource: 'Booking',
            resourceId: booking._id,
            details: `Updated booking status from ${previousStatus} to ${status}`,
            previousValue: { status: previousStatus },
            newValue: { status: status },
            ipAddress: req.ip
        });

        // Notify user about booking status change
        const statusMessages = {
            confirmed: 'Your booking has been confirmed.',
            cancelled: 'Your booking has been cancelled.',
            completed: 'Your booking has been marked as completed.',
            'no-show': 'Your booking was marked as no-show.'
        };

        if (statusMessages[status]) {
            await createNotification({
                recipient: booking.user._id,
                sender: req.user._id,
                type: status === 'confirmed' ? 'booking_confirmed' : 'booking_cancelled',
                title: `Booking ${status.charAt(0).toUpperCase() + status.slice(1)}`,
                message: `Your booking for ${booking.lab?.name || 'a lab'} on ${new Date(booking.date).toLocaleDateString()} - ${statusMessages[status]}`,
                link: '/student/my-bookings',
                priority: status === 'cancelled' ? 'high' : 'medium',
                relatedModel: 'Booking',
                relatedId: booking._id
            });
        }

        res.json({ success: true, message: `Booking ${status} successfully`, booking });
    } catch (error) {
        console.error('Update booking status error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
};

// @route   PATCH /api/bookings/:id/checkin
// @desc    Check in to booking
// @access  Private
exports.checkin = async (req, res) => {
    try {
        const booking = await Booking.findOne({
            _id: req.params.id,
            user: req.user._id,
            status: 'confirmed'
        });

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        booking.checkedInAt = new Date();
        await booking.save();

        res.json({ success: true, message: 'Checked in successfully' });
    } catch (error) {
        console.error('Checkin error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/bookings/conflicts
// @desc    Detect booking conflicts (admin only)
// @access  Admin/Superadmin
exports.detectConflicts = async (req, res) => {
    try {
        const { date, lab } = req.query;
        let bookingQuery = {
            status: { $in: ['pending', 'confirmed'] }
        };
        let reservationQuery = {
            status: { $in: ['pending', 'approved'] }
        };

        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            bookingQuery.date = { $gte: startOfDay, $lte: endOfDay };
            reservationQuery.date = { $gte: startOfDay, $lte: endOfDay };
        }
        if (lab) {
            bookingQuery.lab = lab;
            reservationQuery.lab = lab;
        }

        const [bookings, reservations] = await Promise.all([
            Booking.find(bookingQuery)
                .populate('user', 'name username email')
                .populate('lab', 'name code rooms'),
            Reservation.find(reservationQuery)
                .populate('teacher', 'name username email')
                .populate('lab', 'name code')
        ]);

        const conflicts = [];

        // 1. Student booking vs student booking on the same workstation.
        const groupedBookings = {};
        bookings.forEach(booking => {
            const wsId = booking.workstation?.workstationId?.toString() || 'unknown';
            const labId = booking.lab?._id?.toString() || 'unknown';
            const dateKey = sameDayKey(booking.date);
            const key = `${labId}-${wsId}-${dateKey}`;
            if (!groupedBookings[key]) groupedBookings[key] = [];
            groupedBookings[key].push(booking);
        });

        Object.values(groupedBookings).forEach(groupBookings => {
            if (groupBookings.length < 2) return;

            for (let i = 0; i < groupBookings.length; i++) {
                for (let j = i + 1; j < groupBookings.length; j++) {
                    const a = groupBookings[i];
                    const b = groupBookings[j];

                    if (!timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) continue;

                    conflicts.push({
                        id: `ws-conflict-${String(a._id)}-${String(b._id)}`,
                        type: 'double_booking',
                        lab: a.lab?.name || 'N/A',
                        labId: a.lab?._id,
                        workstation: a.workstation?.workstationNumber || 'N/A',
                        workstationId: a.workstation?.workstationId,
                        date: sameDayKey(a.date),
                        timeSlot1: `${a.startTime} - ${a.endTime}`,
                        timeSlot2: `${b.startTime} - ${b.endTime}`,
                        bookings: [
                            { id: a._id, user: a.user, purpose: a.purpose, startTime: a.startTime, endTime: a.endTime, createdAt: a.createdAt },
                            { id: b._id, user: b.user, purpose: b.purpose, startTime: b.startTime, endTime: b.endTime, createdAt: b.createdAt }
                        ],
                        status: 'pending',
                        severity: 'high',
                        detectedAt: new Date().toISOString()
                    });
                }
            }
        });

        // 2. Student booking vs teacher reservation in same room/lab and time.
        bookings.forEach(booking => {
            const bookingRoom = findBookingRoomInfo(booking);

            reservations.forEach(reservation => {
                if (booking.lab?._id?.toString() !== reservation.lab?._id?.toString()) return;
                if (sameDayKey(booking.date) !== sameDayKey(reservation.date)) return;
                if (!timesOverlap(booking.startTime, booking.endTime, reservation.startTime, reservation.endTime)) return;

                const reservationRoomId = reservation.roomId?.toString() || null;
                const sameSpace = !reservationRoomId || reservationRoomId === bookingRoom.roomId;
                if (!sameSpace) return;

                const conflictId = `res-conflict-${String(booking._id)}-${String(reservation._id)}`;
                if (conflicts.some(conflict => conflict.id === conflictId)) return;

                conflicts.push({
                    id: conflictId,
                    type: 'reservation_conflict',
                    lab: booking.lab?.name || 'N/A',
                    labId: booking.lab?._id,
                    workstation: booking.workstation?.workstationNumber || bookingRoom.roomName || 'Any',
                    date: sameDayKey(booking.date),
                    timeSlot1: `Booking: ${booking.startTime} - ${booking.endTime}`,
                    timeSlot2: `Reservation: ${reservation.startTime} - ${reservation.endTime}`,
                    bookings: [
                        { id: booking._id, user: booking.user, purpose: booking.purpose || 'Workstation booking', startTime: booking.startTime, endTime: booking.endTime, createdAt: booking.createdAt }
                    ],
                    reservation: {
                        id: reservation._id,
                        courseName: reservation.courseName,
                        courseCode: reservation.courseCode,
                        teacher: reservation.teacher,
                        startTime: reservation.startTime,
                        endTime: reservation.endTime,
                        roomId: reservation.roomId || null,
                        roomName: reservation.roomName || null,
                        status: reservation.status
                    },
                    status: 'pending',
                    severity: reservation.status === 'approved' ? 'critical' : 'high',
                    detectedAt: new Date().toISOString()
                });
            });
        });

        // 3. Teacher reservation vs teacher reservation.
        for (let i = 0; i < reservations.length; i++) {
            for (let j = i + 1; j < reservations.length; j++) {
                const a = reservations[i];
                const b = reservations[j];
                if (!reservationsConflict(a, b)) continue;

                conflicts.push({
                    id: `lab-conflict-${String(a._id)}-${String(b._id)}`,
                    type: 'lab_overbooked',
                    lab: a.lab?.name || 'N/A',
                    labId: a.lab?._id,
                    workstation: a.roomName || b.roomName ? `${a.roomName || 'Entire Lab'} / ${b.roomName || 'Entire Lab'}` : 'Entire Lab',
                    date: sameDayKey(a.date),
                    timeSlot1: `${a.courseCode}: ${a.startTime} - ${a.endTime}`,
                    timeSlot2: `${b.courseCode}: ${b.startTime} - ${b.endTime}`,
                    bookings: [],
                    reservation: {
                        id: a._id,
                        courseName: a.courseName,
                        courseCode: a.courseCode,
                        teacher: a.teacher,
                        startTime: a.startTime,
                        endTime: a.endTime,
                        numberOfStudents: a.numberOfStudents,
                        roomName: a.roomName || 'Entire Lab',
                        status: a.status
                    },
                    reservation2: {
                        id: b._id,
                        courseName: b.courseName,
                        courseCode: b.courseCode,
                        teacher: b.teacher,
                        startTime: b.startTime,
                        endTime: b.endTime,
                        numberOfStudents: b.numberOfStudents,
                        roomName: b.roomName || 'Entire Lab',
                        status: b.status
                    },
                    status: 'pending',
                    severity: a.status === 'approved' || b.status === 'approved' ? 'critical' : 'high',
                    detectedAt: new Date().toISOString()
                });
            }
        }

        res.json({
            success: true,
            conflicts,
            totalConflicts: conflicts.length
        });
    } catch (error) {
        console.error('Detect conflicts error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PATCH /api/bookings/:id/resolve-conflict
// @desc    Resolve a booking conflict (admin cancels one booking)
// @access  Admin/Superadmin
exports.resolveConflict = async (req, res) => {
    try {
        const { cancelBookingId } = req.body;

        if (!cancelBookingId) {
            return res.status(400).json({ success: false, message: 'Booking ID to cancel is required' });
        }

        const booking = await Booking.findById(cancelBookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        booking.status = 'cancelled';
        booking.cancelledAt = new Date();
        booking.cancellationReason = 'Resolved by admin - conflict';
        await booking.save();

        res.json({ success: true, message: 'Conflict resolved - booking cancelled', booking });
    } catch (error) {
        console.error('Resolve conflict error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
