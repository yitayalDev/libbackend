const Reservation = require('../models/Reservation');
const Lab = require('../models/Lab');
const AuditLog = require('../models/AuditLog');
const { createNotification } = require('./notificationController');

// @route   GET /api/reservations/check-availability
// @desc    Check lab/room availability for a date/time - returns schedule and conflicts
// @access  Private
exports.checkAvailability = async (req, res) => {
    try {
        const { labId, roomId, date, startTime, endTime } = req.query;

        if (!labId || !date || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: 'labId, date, startTime, and endTime are required'
            });
        }

        const lab = await Lab.findById(labId);
        if (!lab) {
            return res.status(404).json({ success: false, message: 'Lab not found' });
        }

        const queryDate = new Date(date);
        const startOfDay = new Date(queryDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(queryDate.setHours(23, 59, 59, 999));

        let room = null;
        let roomCapacity = lab.capacity;
        
        if (roomId) {
            room = lab.rooms.id(roomId);
            if (!room) {
                return res.status(404).json({ success: false, message: 'Room not found' });
            }
            roomCapacity = room.capacity;
        }

// Find all reservations for this lab/room on this date - show both pending and approved for visibility
        const scheduleQuery = {
            lab: labId,
            date: { $gte: startOfDay, $lte: endOfDay },
            status: { $in: ['pending', 'approved'] }
        };
        if (roomId) {
            scheduleQuery.roomId = roomId;
        }

        const daysReservations = await Reservation.find(scheduleQuery)
            .populate('teacher', 'name')
            .populate('assignedTechnician', 'name')
            .sort({ startTime: 1 });

// Check if the specific requested slot conflicts - ONLY approved reservations block availability
        const conflictQuery = {
            lab: labId,
            date: queryDate,
            status: 'approved', // Only approved reservations make the room unavailable
            $or: [
                { startTime: { $lt: endTime }, endTime: { $gt: startTime } }
            ]
        };
        if (roomId) {
            conflictQuery.roomId = roomId;
        }

        const conflicts = await Reservation.find(conflictQuery)
            .populate('teacher', 'name');

        // Calculate max allowed duration (3 hours)
        const MAX_HOURS = 3;
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
        const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
        const durationHours = durationMinutes / 60;

        const isDurationValid = durationMinutes > 0 && durationHours <= MAX_HOURS;
        const isSlotAvailable = conflicts.length === 0 && isDurationValid;

        // Build day schedule with time slots
        const daySchedule = daysReservations.map(r => ({
            id: r._id,
            courseName: r.courseName,
            courseCode: r.courseCode,
            startTime: r.startTime,
            endTime: r.endTime,
            teacher: r.teacher?.name || 'Unknown',
            technician: r.assignedTechnician?.name || 'Unassigned',
            status: r.status,
            roomName: r.roomName,
            isMine: r.teacher && r.teacher._id.toString() === req.user._id.toString()
        }));

        res.json({
            success: true,
            available: isSlotAvailable,
            lab: {
                name: lab.name,
                code: lab.code,
                capacity: roomCapacity,
                room: room ? { _id: room._id, name: room.name, type: room.type } : null
            },
            timeSlot: { startTime, endTime },
            durationMinutes,
            durationHours: Math.round(durationHours * 10) / 10,
            maxHours: MAX_HOURS,
            durationValid: isDurationValid,
            conflicts: conflicts.map(c => ({
                id: c._id,
                courseName: c.courseName,
                courseCode: c.courseCode,
                startTime: c.startTime,
                endTime: c.endTime,
                teacher: c.teacher?.name || 'Unknown',
                status: c.status
            })),
            daySchedule
        });
    } catch (error) {
        console.error('Check availability error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/reservations
// @desc    Get all reservations (admin/teacher)
// @access  Private
exports.getAllReservations = async (req, res) => {
    try {
        const { status, lab, myReservations, page = 1, limit = 1000, date, campus, year, semester } = req.query;
        let query = {};

        // Technician can see all reservations for their campus
        if (req.user.role === 'technician') {
            if (campus) {
                query.campus = campus;
            } else if (req.user.campus) {
                query.campus = req.user.campus;
            }
        } else if (req.user.role === 'teacher') {
            // Default to teacher's own reservations if myReservations is true
            if (myReservations === 'true') {
                query.teacher = req.user._id;
            } 
        } else if (req.user.role === 'student') {
            query.status = 'approved';
        }

        if (status) query.status = status;
        if (lab) query.lab = lab;
        
        // Filter by Year and Semester
        if (year) query.year = parseInt(year);
        if (semester) query.semester = semester;
        
        // Date filter - for all roles
        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);
            query.date = { $gte: startOfDay, $lte: endOfDay };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const reservations = await Reservation.find(query)
            .populate('teacher', 'name email department')
            .populate('lab', 'name code')
            .populate('assignedTechnician', 'name email')
            .populate('approvedBy', 'name')
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ date: -1, startTime: 1 });

        const total = await Reservation.countDocuments(query);
        res.json({
            success: true,
            reservations,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('Get reservations error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/reservations/my-reservations
// @desc    Get current teacher's reservations
// @access  Teacher/Admin
exports.getMyReservations = async (req, res) => {
    try {
        const reservations = await Reservation.find({ teacher: req.user._id })
            .populate('lab', 'name code location')
            .populate('assignedTechnician', 'name email')
            .populate('approvedBy', 'name')
            .sort({ date: -1 });

        res.json({ success: true, reservations });
    } catch (error) {
        console.error('Get my reservations error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/reservations
// @desc    Create new reservation
// @access  Teacher/Admin
exports.createReservation = async (req, res) => {
    try {
        const { labId, roomId, courseName, courseCode, semester, academicYear, year, section, program,
            date, startTime, endTime, numberOfStudents, requiredWorkstations, description, recurring,
            assignedTechnicianId } = req.body;

        const lab = await Lab.findById(labId);
        if (!lab) {
            return res.status(404).json({ success: false, message: 'Lab not found' });
        }

        let room = null;
        let capacity = lab.capacity;
        let roomType = null;
        let roomWorkstations = 0;
        
        if (roomId) {
            room = lab.rooms.id(roomId);
            if (!room) {
                return res.status(404).json({ success: false, message: 'Room not found' });
            }
            capacity = room.capacity;
            roomType = room.type;
            roomWorkstations = room.workstations ? room.workstations.length : 0;
        }

        if (numberOfStudents > capacity) {
            return res.status(400).json({
                success: false,
                message: `Number of students exceeds room capacity (${capacity})`
            });
        }

        if (requiredWorkstations > roomWorkstations) {
            return res.status(400).json({
                success: false,
                message: `Required workstations (${requiredWorkstations}) exceeds available workstations in this room (${roomWorkstations})`
            });
        }

        // Validate time format
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            return res.status(400).json({ success: false, message: 'Invalid time format' });
        }

        // Calculate duration
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
        const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);

        if (durationMinutes <= 0) {
            return res.status(400).json({ success: false, message: 'End time must be after start time' });
        }

        const durationHours = durationMinutes / 60;
        const MAX_HOURS = 3;

        if (durationHours > MAX_HOURS) {
            return res.status(400).json({
                success: false,
                message: `Reservation cannot exceed ${MAX_HOURS} hours`
            });
        }

        const bookingDate = new Date(date);
        bookingDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Allow reservation for any date/time as long as frontend selection is valid.
        // Past-date blocking disabled to unblock reservation creation in dashboard flows.
        // if (bookingDate < today) {
        //     return res.status(400).json({ success: false, message: 'Cannot reserve a date in the past' });
        // }

        // Duration check already done above

// Check for overlapping reservations - ONLY approved reservations block new bookings
        const overlapQuery = {
            lab: labId,
            date: bookingDate,
            status: 'approved', // Only approved reservations block new bookings
            $or: [
                { startTime: { $lt: endTime }, endTime: { $gt: startTime } }
            ]
        };

        if (roomId) {
            overlapQuery.roomId = roomId;
        } else {
            // If no specific room, check any reservation for this lab on that date
            // (this is fallback, but still overlapping)
        }

        const overlappingReservation = await Reservation.findOne(overlapQuery);
        if (overlappingReservation) {
            return res.status(409).json({
                success: false,
                message: 'Time slot conflicts with an existing reservation',
                conflict: {
                    courseName: overlappingReservation.courseName,
                    courseCode: overlappingReservation.courseCode,
                    startTime: overlappingReservation.startTime,
                    endTime: overlappingReservation.endTime,
                    teacher: overlappingReservation.teacher?.name || 'Unknown',
                    status: overlappingReservation.status
                }
            });
        }

        const reservation = new Reservation({
            teacher: req.user._id,
            lab: labId,
            roomId: roomId || null,
            roomName: room ? room.name : null,
            courseName,
            courseCode,
            semester,
            academicYear,
            year,
            section,
            program,
            date: new Date(date),
            startTime,
            endTime,
            numberOfStudents,
            requiredWorkstations,
            description,
            recurring,
            assignedTechnician: assignedTechnicianId || null
        });

         await reservation.save();
         await reservation.populate('lab', 'name');
         await reservation.populate('teacher', 'name email');

         // Notify teacher about their reservation creation
         await createNotification({
             recipient: req.user._id,
             type: 'reservation_created',
             title: 'Reservation Created',
             message: `Your reservation for ${reservation.courseName} (${reservation.courseCode}) in ${reservation.lab?.name || 'lab'} on ${date} ${startTime}-${endTime} has been submitted.`,
             link: '/teacher/my-reservations',
             priority: 'medium',
             relatedModel: 'Reservation',
             relatedId: reservation._id
         });

         // Audit log for reservation creation
         await AuditLog.create({
            user: req.user._id,
            action: 'reservation.create',
            resource: 'Reservation',
            resourceId: reservation._id,
            details: `Created reservation for ${courseName} (${courseCode}) in ${reservation.lab?.name || 'lab'} on ${date} ${startTime}-${endTime}`,
            ipAddress: req.ip
        });

        res.status(201).json({
            success: true,
            message: 'Reservation request submitted successfully',
            reservation
        });
    } catch (error) {
        console.error('Create reservation error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/reservations/recurring
// @desc    Create recurring reservations (timetable)
// @access  Teacher/Admin
exports.createRecurringReservations = async (req, res) => {
    try {
        const { labId, roomId, courseName, courseCode, semester, academicYear, year, section, program,
            startTime, endTime, numberOfStudents, requiredWorkstations, description, assignedTechnicianId,
            frequency, startDate, endDate, dayOfWeek } = req.body;

        if (!labId || !courseName || !courseCode || !startTime || !endTime || !startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const lab = await Lab.findById(labId);
        if (!lab) {
            return res.status(404).json({ success: false, message: 'Lab not found' });
        }

        let room = null;
        let capacity = lab.capacity;
        
        if (roomId) {
            room = lab.rooms.id(roomId);
            if (room) {
                capacity = room.capacity;
            }
        }

        if (numberOfStudents > capacity) {
            return res.status(400).json({
                success: false,
                message: `Number of students exceeds capacity (${capacity})`
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const reservations = [];
        const conflicts = [];

        let currentDate = new Date(start);

        while (currentDate <= end) {
            let shouldCreate = false;

            if (frequency === 'weekly') {
                // Check if current day matches the target day of week
                const targetDay = dayOfWeek !== undefined ? parseInt(dayOfWeek) : start.getDay();
                shouldCreate = currentDate.getDay() === targetDay;
            } else if (frequency === 'daily') {
                shouldCreate = true;
            } else if (frequency === 'biweekly') {
                const targetDay = dayOfWeek !== undefined ? parseInt(dayOfWeek) : start.getDay();
                const weeksDiff = Math.floor((currentDate - start) / (7 * 24 * 60 * 60 * 1000));
                shouldCreate = currentDate.getDay() === targetDay && weeksDiff % 2 === 0;
            } else if (frequency === 'monthly') {
                shouldCreate = currentDate.getDate() === start.getDate();
            }

            if (shouldCreate) {
                // Check for conflicts
                const dayStart = new Date(currentDate);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(currentDate);
                dayEnd.setHours(23, 59, 59, 999);

const existingConflict = await Reservation.findOne({
                    lab: labId,
                    status: 'approved', // Only approved reservations block new recurring bookings
                    date: { $gte: dayStart, $lte: dayEnd },
                    startTime: { $lt: endTime },
                    endTime: { $gt: startTime }
                });

                if (existingConflict) {
                    conflicts.push({
                        date: currentDate.toISOString().split('T')[0],
                        conflictingCourse: existingConflict.courseName
                    });
                } else {
                    const reservation = new Reservation({
                        teacher: req.user._id,
                        lab: labId,
                        roomId: roomId || null,
                        roomName: room ? room.name : null,
                        courseName,
                        courseCode,
                        semester,
                        academicYear,
                        year,
                        section,
                        program,
                        date: new Date(currentDate),
                        startTime,
                        endTime,
                        numberOfStudents: numberOfStudents || 1,
                        requiredWorkstations,
                        description,
                        recurring: {
                            isRecurring: true,
                            frequency: frequency || 'weekly',
                            endDate: end
                        },
                        assignedTechnician: assignedTechnicianId || null
                    });
                    reservations.push(reservation);
                }
            }

            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
        }

         // Save all reservations
         const savedReservations = await Reservation.insertMany(reservations);

         // Notify teacher about recurring reservation creation
         if (savedReservations.length > 0) {
             await createNotification({
                 recipient: req.user._id,
                 type: 'recurring_reservation_created',
                 title: 'Recurring Reservations Created',
                 message: `Successfully created ${savedReservations.length} recurring reservation(s) for ${courseName} (${courseCode}).`,
                 link: '/teacher/my-reservations',
                 priority: 'medium',
                 relatedModel: 'Reservation',
                 relatedId: savedReservations[0]._id
             });
         }

         res.status(201).json({
            success: true,
            message: `Created ${savedReservations.length} recurring reservation(s)`,
            reservations: savedReservations,
            conflicts: conflicts.length > 0 ? conflicts : undefined,
            summary: {
                totalCreated: savedReservations.length,
                conflictsSkipped: conflicts.length
            }
        });
    } catch (error) {
        console.error('Create recurring reservations error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/reservations/timetable
// @desc    Get teacher's weekly timetable view
// @access  Teacher/Admin
exports.getTimetable = async (req, res) => {
    try {
        const { weekStart, year, semester, campus } = req.query;
        const teacherId = req.user.role === 'teacher' ? req.user._id : req.query.teacherId;

        let startOfWeek;
        if (weekStart) {
            startOfWeek = new Date(weekStart);
        } else {
            const today = new Date();
            const day = today.getDay();
            const diff = today.getDate() - day + (day === 0 ? -6 : 1);
            startOfWeek = new Date(today);
            startOfWeek.setDate(diff);
        }
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        const query = {
            date: { $gte: startOfWeek, $lte: endOfWeek },
            status: { $in: ['pending', 'approved'] }
        };

        if (year) query.year = parseInt(year);
        if (semester) query.semester = semester;
        if (campus) {
            const Lab = require('../models/Lab');
            const labsInCampus = await Lab.find({ campus }).select('_id');
            query.lab = { $in: labsInCampus.map(l => l._id) };
        }

        if (teacherId) {
            query.teacher = teacherId;
        }

        const reservations = await Reservation.find(query)
            .populate('lab', 'name code location')
            .populate('assignedTechnician', 'name')
            .sort({ date: 1, startTime: 1 });

        // Organize by day of week
        const timetable = {
            monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
        };

        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

        reservations.forEach(r => {
            const dayIndex = new Date(r.date).getDay();
            const dayName = dayNames[dayIndex];
            timetable[dayName].push({
                _id: r._id,
                courseName: r.courseName,
                courseCode: r.courseCode,
                lab: r.lab,
                roomName: r.roomName,
                startTime: r.startTime,
                endTime: r.endTime,
                numberOfStudents: r.numberOfStudents,
                academicYear: r.academicYear,
                semester: r.semester,
                year: r.year,
                section: r.section,
                status: r.status,
                isRecurring: r.recurring?.isRecurring || false,
                technician: r.assignedTechnician?.name || 'Unassigned'
            });
        });

        res.json({
            success: true,
            timetable,
            weekStart: startOfWeek,
            weekEnd: endOfWeek
        });
    } catch (error) {
        console.error('Get timetable error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PATCH /api/reservations/:id/approve
// @desc    Approve reservation (admin only, with double-booking check)
// @access  Admin/Superadmin
exports.approveReservation = async (req, res) => {
    try {
        console.log('========== APPROVE RESERVATION STARTED ==========');
        console.log('Request params:', req.params);
        console.log('Request query:', req.query);
        console.log('Request body:', req.body);
        console.log('User from auth:', { id: req.user?._id, role: req.user?.role, name: req.user?.name });
        
        const reservationId = req.params.id;
        console.log('Looking for reservation with ID:', reservationId);
        console.log('ID type:', typeof reservationId);
        console.log('ID length:', reservationId?.length);
        
        // Validate ID format
        if (!reservationId || reservationId === 'undefined' || reservationId === 'null') {
            console.log('INVALID RESERVATION ID');
            return res.status(400).json({ success: false, message: 'Invalid reservation ID' });
        }
        
        // Try to find by different methods
        let reservation = null;
        try {
            reservation = await Reservation.findById(reservationId).populate('lab', 'name');
        } catch (e) {
            console.log('findById failed:', e.message);
            // Try to find by string ID match as fallback
            reservation = await Reservation.findOne({ _id: reservationId }).populate('lab', 'name');
        }
        
        console.log('Found reservation:', reservation ? { 
            _id: reservation._id, 
            _idType: typeof reservation._id,
            status: reservation.status, 
            lab: reservation.lab?.name,
            teacher: reservation.teacher,
            courseName: reservation.courseName
        } : 'NOT FOUND');
        
        if (!reservation) {
            console.log('RESERVATION NOT FOUND - returning 404');
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }

        if (reservation.status !== 'pending') {
            console.log('RESERVATION NOT PENDING - current status:', reservation.status);
            return res.status(400).json({ success: false, message: `Reservation is already ${reservation.status}` });
        }

        console.log('Reservation is pending, checking for conflicts...');

        // Check for double booking - find overlapping approved reservations
        const reservationDate = new Date(reservation.date);
        const startOfDay = new Date(reservationDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(reservationDate);
        endOfDay.setHours(23, 59, 59, 999);

        const conflicts = await Reservation.find({
            lab: reservation.lab._id,
            status: 'approved',
            _id: { $ne: reservation._id },
            date: { $gte: startOfDay, $lte: endOfDay },
            startTime: { $lt: reservation.endTime },
            endTime: { $gt: reservation.startTime }
        }).populate('teacher', 'name').populate('lab', 'name');

        if (conflicts.length > 0) {
            console.log('CONFLICTS FOUND:', conflicts.length);
            return res.status(409).json({
                success: false,
                message: 'Cannot approve: Time slot conflicts with existing approved reservation(s)',
                conflicts: conflicts.map(c => ({
                    id: c._id,
                    courseName: c.courseName,
                    courseCode: c.courseCode,
                    date: c.date,
                    startTime: c.startTime,
                    endTime: c.endTime,
                    teacher: c.teacher?.name || 'Unknown',
                    lab: c.lab?.name || 'Unknown'
                }))
            });
        }

         reservation.status = 'approved';
         reservation.assignedTechnician = req.body.assignedTechnicianId || reservation.assignedTechnician;
         reservation.approvedBy = req.user._id;
         reservation.approvedAt = new Date();
         console.log('Saving reservation with status: approved');
         await reservation.save();
         await reservation.populate('teacher', 'name email');
         console.log('Reservation saved successfully');

         // Notify teacher about approval
         await createNotification({
             recipient: reservation.teacher._id,
             type: 'reservation_approved',
             title: 'Reservation Approved',
             message: `Your reservation for ${reservation.courseName} (${reservation.courseCode}) has been approved for ${reservation.date} ${reservation.startTime}-${reservation.endTime}.`,
             link: '/teacher/my-reservations',
             priority: 'high',
             relatedModel: 'Reservation',
             relatedId: reservation._id
         });

         // Audit log for reservation approval
         await AuditLog.create({
            user: req.user._id,
            action: 'reservation.approve',
            resource: 'Reservation',
            resourceId: reservation._id,
            details: `Approved reservation for ${reservation.courseName} (${reservation.courseCode}) in ${reservation.lab?.name || 'lab'}`,
            previousValue: { status: 'pending' },
            newValue: { status: 'approved' },
            ipAddress: req.ip
        });

        console.log('Sending success response');
        res.json({ success: true, message: 'Reservation approved successfully', reservation });
    } catch (error) {
        console.error('Approve reservation error:', error);
        console.error('Error stack:', error.stack);
        
        let errorMessage = 'Server error';
        if (error.name === 'ValidationError') {
            errorMessage = 'Validation error: ' + error.message;
        } else if (error.name === 'CastError') {
            errorMessage = 'Invalid ID format';
        } else if (error.code === 11000) {
            errorMessage = 'Duplicate entry';
        } else if (error.message) {
            errorMessage = 'Server error: ' + error.message;
        }
        
        res.status(500).json({ success: false, message: errorMessage });
    }
};

// @route   PATCH /api/reservations/:id/reject
// @desc    Reject reservation (admin only)
// @access  Admin/Superadmin
exports.rejectReservation = async (req, res) => {
    try {
        const reservation = await Reservation.findById(req.params.id);
        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }

        if (reservation.status !== 'pending') {
            return res.status(400).json({ success: false, message: `Reservation is already ${reservation.status}` });
        }

         reservation.status = 'rejected';
         reservation.rejectionReason = req.body.reason;
         await reservation.save();
         await reservation.populate('teacher', 'name email');

         // Notify teacher about rejection
         await createNotification({
             recipient: reservation.teacher._id,
             type: 'reservation_rejected',
             title: 'Reservation Rejected',
             message: `Your reservation for ${reservation.courseName} (${reservation.courseCode}) has been rejected. Reason: ${reservation.rejectionReason}`,
             link: '/teacher/my-reservations',
             priority: 'high',
             relatedModel: 'Reservation',
             relatedId: reservation._id
         });

         // Audit log for reservation rejection
         await AuditLog.create({
            user: req.user._id,
            action: 'reservation.reject',
            resource: 'Reservation',
            resourceId: reservation._id,
            details: `Rejected reservation for ${reservation.courseName} (${reservation.courseCode}) in ${reservation.lab?.name || 'lab'}${req.body.reason ? ': ' + req.body.reason : ''}`,
            previousValue: { status: 'pending' },
            newValue: { status: 'rejected' },
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Reservation rejected', reservation });
    } catch (error) {
        console.error('Reject reservation error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   DELETE /api/reservations/:id
// @desc    Cancel reservation
// @access  Private
exports.cancelReservation = async (req, res) => {
    try {
        const reservation = await Reservation.findById(req.params.id);
        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }

        if (reservation.teacher.toString() !== req.user._id.toString() &&
            req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

         reservation.status = 'cancelled';
         await reservation.save();
         await reservation.populate('teacher', 'name email');

         // Notify teacher about cancellation
         await createNotification({
             recipient: reservation.teacher._id,
             type: 'reservation_cancelled',
             title: 'Reservation Cancelled',
             message: `Your reservation for ${reservation.courseName} (${reservation.courseCode}) has been cancelled.`,
             link: '/teacher/my-reservations',
             priority: 'high',
             relatedModel: 'Reservation',
             relatedId: reservation._id
         });

         // Audit log for reservation cancellation
         await AuditLog.create({
            user: req.user._id,
            action: 'reservation.cancel',
            resource: 'Reservation',
            resourceId: reservation._id,
            details: `Cancelled reservation for ${reservation.courseName} (${reservation.courseCode}) in ${reservation.lab?.name || 'lab'}`,
            previousValue: { status: reservation.status },
            newValue: { status: 'cancelled' },
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Reservation cancelled successfully' });
    } catch (error) {
        console.error('Cancel reservation error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/reservations/active-sessions
// @desc    Get currently active sessions for attendance (based on current date/time)
// @access  Private (any authenticated user)
exports.getActiveSessions = async (req, res) => {
    try {
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Find approved reservations for today
        const sessions = await Reservation.find({
            status: 'approved',
            date: { $gte: today, $lt: tomorrow }
        })
            .populate('lab', 'name code location')
            .populate('assignedTechnician', 'name')
            .populate('teacher', 'name')
            .sort({ startTime: 1 });

        // Filter sessions that are currently active or upcoming today
        const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        
        const activeSessions = sessions.filter(session => {
            // Session is active if current time is before end time
            return session.endTime > currentTime;
        });

        res.json({
            success: true,
            sessions: activeSessions,
            currentTime: currentTime
        });
    } catch (error) {
        console.error('Get active sessions error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
