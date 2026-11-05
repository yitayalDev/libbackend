const Attendance = require('../models/Attendance');
const Reservation = require('../models/Reservation');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { createNotification } = require('./notificationController');
const AttendanceSession = require('../models/AttendanceSession');

// Internal helper to handle common attendance marking and notification logic
const processAttendanceMarking = async ({ reservation, session, studentId, status, markedBy, notes }) => {
    let attendance = await Attendance.findOne({
        $or: [
            { reservation: reservation?._id, student: studentId },
            { session: session?._id, student: studentId }
        ]
    });

    if (attendance) {
        attendance.status = status;
        attendance.markedBy = markedBy;
        if (status === 'present' || status === 'late') {
            attendance.checkInTime = attendance.checkInTime || new Date();
        }
        if (notes) attendance.notes = notes;
    } else {
        attendance = new Attendance({
            reservation: reservation?._id || reservation || null,
            session: session?._id || null,
            student: studentId,
            status,
            markedBy,
            checkInTime: (status === 'present' || status === 'late') ? new Date() : null,
            notes
        });
    }

    await attendance.save();
    await attendance.populate([
        { path: 'student', select: 'name email studentId' },
        { path: 'markedBy', select: 'name' }
    ]);

    // Send notification asynchronously
    const statusText = status === 'present' ? 'present' : status === 'late' ? 'late' : status === 'absent' ? 'absent' : status;
    const courseName = reservation?.courseName || session?.courseCode || 'the lab session';
    const dateStr = reservation?.date ? new Date(reservation.date).toLocaleDateString() : new Date().toLocaleDateString();

    createNotification({
        recipient: studentId,
        sender: markedBy,
        type: 'attendance_marked',
        title: 'Attendance Marked',
        message: `Your attendance has been marked as ${statusText} for ${courseName} on ${dateStr}.`,
        link: '/student/bookings',
        priority: 'medium',
        relatedModel: reservation ? 'Reservation' : 'AttendanceSession',
        relatedId: reservation?._id || session?._id,
        metadata: {
            courseName: courseName,
            status: status,
            date: reservation?.date || new Date()
        }
    }).catch(err => console.error('Failed to send attendance notification:', err));

    return attendance;
};

// @route   GET /api/attendance/reservation/:reservationId
// @desc    Get attendance for a specific reservation
// @access  Teacher/Admin
exports.getAttendance = async (req, res) => {
    try {
        const reservation = await Reservation.findById(req.params.reservationId);
        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }

        if (reservation.teacher.toString() !== req.user._id.toString() &&
            req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const attendance = await Attendance.find({ reservation: req.params.reservationId })
            .populate('student', 'name email studentId')
            .populate('markedBy', 'name')
            .sort({ createdAt: -1 });

        res.json({ success: true, attendance });
    } catch (error) {
        console.error('Get attendance error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/attendance/mark
// @desc    Mark attendance for a student
// @access  Teacher/Admin
exports.markAttendance = async (req, res) => {
    try {
        const { reservationId, studentId, status, notes } = req.body;

        const reservation = await Reservation.findById(reservationId);
        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }

        if (reservation.teacher.toString() !== req.user._id.toString() &&
            req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const attendance = await processAttendanceMarking({
            reservation,
            studentId,
            status,
            markedBy: req.user._id,
            notes
        });

        res.json({ success: true, message: 'Attendance marked successfully', attendance });
    } catch (error) {
        console.error('Mark attendance error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/attendance/bulk-mark
// @desc    Mark attendance for multiple students
// @access  Teacher/Admin
exports.bulkMarkAttendance = async (req, res) => {
    try {
        const { reservationId, attendanceRecords } = req.body;

        const reservation = await Reservation.findById(reservationId);
        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }

        if (reservation.teacher.toString() !== req.user._id.toString() &&
            req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const markPromises = attendanceRecords.map(async (record) => {
            return processAttendanceMarking({
                reservation,
                studentId: record.studentId,
                status: record.status,
                markedBy: req.user._id,
                notes: record.notes
            });
        });

        const results = await Promise.all(markPromises);

        res.json({ success: true, message: 'Attendance marked successfully', attendance: results });
    } catch (error) {
        console.error('Bulk mark attendance error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/attendance/stats/:reservationId
// @desc    Get attendance statistics for a reservation
// @access  Teacher/Admin
exports.getAttendanceStats = async (req, res) => {
    try {
        const reservation = await Reservation.findById(req.params.reservationId);
        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }

        if (reservation.teacher.toString() !== req.user._id.toString() &&
            req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const attendanceRecords = await Attendance.find({ reservation: req.params.reservationId });

        const present = attendanceRecords.filter(a => a.status === 'present').length;
        const absent = attendanceRecords.filter(a => a.status === 'absent').length;
        const late = attendanceRecords.filter(a => a.status === 'late').length;
        const excused = attendanceRecords.filter(a => a.status === 'excused').length;
        const total = attendanceRecords.length;

        // Calculate attendance rate
        const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;

        // Calculate check-in time analysis
        const checkInTimes = attendanceRecords
            .filter(a => a.checkInTime)
            .map(a => new Date(a.checkInTime));

        let avgCheckInTime = null;
        let earlyCount = 0;
        let onTimeCount = 0;
        let lateCount = 0;

        if (checkInTimes.length > 0) {
            const sumMs = checkInTimes.reduce((sum, t) => sum + t.getTime(), 0);
            const avgDate = new Date(sumMs / checkInTimes.length);
            avgCheckInTime = avgDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            // Parse session start time
            const [startH, startM] = reservation.startTime.split(':').map(Number);
            const sessionStart = new Date(reservation.date);
            sessionStart.setHours(startH, startM, 0, 0);

            attendanceRecords.forEach(a => {
                if (!a.checkInTime) return;
                const checkIn = new Date(a.checkInTime);
                const diffMinutes = (checkIn - sessionStart) / (1000 * 60);
                if (diffMinutes <= -5) earlyCount++;
                else if (diffMinutes <= 5) onTimeCount++;
                else lateCount++;
            });
        }

        // Session duration in minutes
        const [sh, sm] = reservation.startTime.split(':').map(Number);
        const [eh, em] = reservation.endTime.split(':').map(Number);
        const sessionDurationMinutes = (eh * 60 + em) - (sh * 60 + sm);

        res.json({
            success: true,
            stats: {
                total,
                present,
                absent,
                late,
                excused,
                attendanceRate,
                expectedStudents: reservation.numberOfStudents,
                avgCheckInTime,
                checkInBreakdown: {
                    early: earlyCount,
                    onTime: onTimeCount,
                    lateCheckIn: lateCount
                },
                sessionDurationMinutes,
                sessionStartTime: reservation.startTime,
                sessionEndTime: reservation.endTime
            }
        });
    } catch (error) {
        console.error('Get attendance stats error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/attendance/session/:reservationId
// @desc    Get session info for QR attendance page (public)
// @access  Public  
exports.getSessionInfo = async (req, res) => {
    try {
        const reservation = await Reservation.findById(req.params.reservationId)
            .populate('lab', 'name code location')
            .populate('teacher', 'name');

        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        if (reservation.status !== 'approved') {
            return res.status(400).json({ success: false, message: 'This session is not active for attendance' });
        }

        const attendanceCount = await Attendance.countDocuments({
            reservation: reservation._id,
            status: 'present'
        });

        res.json({
            success: true,
            session: {
                _id: reservation._id,
                courseName: reservation.courseName,
                courseCode: reservation.courseCode,
                lab: reservation.lab,
                date: reservation.date,
                startTime: reservation.startTime,
                endTime: reservation.endTime,
                teacher: reservation.teacher,
                numberOfStudents: reservation.numberOfStudents,
                attendanceCount
            }
        });
    } catch (error) {
        console.error('Get session info error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/attendance/qr-scan
// @desc    Mark attendance via QR scan (student self-service, no auth)
// @access  Public
exports.markAttendanceByQR = async (req, res) => {
    try {
        const { reservationId, studentId } = req.body;

        if (!reservationId || !studentId) {
            return res.status(400).json({ success: false, message: 'Reservation ID and Student ID are required' });
        }

        const reservation = await Reservation.findById(reservationId);
        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }

        if (reservation.status !== 'approved') {
            return res.status(400).json({ success: false, message: 'This session is not active for attendance' });
        }

        // Find student by studentId (case-insensitive)
        const student = await User.findOne({
            studentId: { $regex: new RegExp(`^${studentId.trim()}$`, 'i') },
            role: 'student'
        });

        if (!student) {
            return res.status(404).json({ success: false, message: `Student ID "${studentId}" not found` });
        }

        if (!student.isActive) {
            return res.status(400).json({ success: false, message: 'Your account is deactivated. Contact admin.' });
        }

        // Check if attendance already marked
        const existing = await Attendance.findOne({ reservation: reservationId, student: student._id });
        if (existing) {
            return res.json({
                success: true,
                alreadyMarked: true,
                message: `Attendance already marked for ${student.name}`,
                student: {
                    name: student.name,
                    email: student.email,
                    studentId: student.studentId
                }
            });
        }

        // Create new attendance record
        const attendance = new Attendance({
            reservation: reservationId,
            student: student._id,
            status: 'present',
            markedBy: reservation.teacher,
            checkInTime: new Date()
        });

        await attendance.save();

        const attendanceCount = await Attendance.countDocuments({
            reservation: reservationId,
            status: 'present'
        });

        res.json({
            success: true,
            alreadyMarked: false,
            message: `Attendance marked successfully for ${student.name}`,
            student: {
                name: student.name,
                email: student.email,
                studentId: student.studentId
            },
            attendanceCount
        });
    } catch (error) {
        console.error('QR scan attendance error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/attendance/checkout
// @desc    Check out a student (record check-out time)
// @access  Teacher/Admin
exports.checkOutStudent = async (req, res) => {
    try {
        const { reservationId, studentId } = req.body;

        if (!reservationId || !studentId) {
            return res.status(400).json({ success: false, message: 'Reservation ID and Student ID are required' });
        }

        const reservation = await Reservation.findById(reservationId);
        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }

        if (reservation.teacher.toString() !== req.user._id.toString() &&
            req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Find student by studentId (case-insensitive)
        const student = await User.findOne({
            studentId: { $regex: new RegExp(`^${studentId.trim()}$`, 'i') },
            role: 'student'
        });

        if (!student) {
            return res.status(404).json({ success: false, message: `Student ID "${studentId}" not found` });
        }

        // Find existing attendance record
        const attendance = await Attendance.findOne({ reservation: reservationId, student: student._id });

        if (!attendance) {
            return res.status(404).json({ success: false, message: 'No attendance record found for this student in this session' });
        }

        if (attendance.checkOutTime) {
            return res.json({
                success: true,
                alreadyCheckedOut: true,
                message: `${student.name} already checked out at ${new Date(attendance.checkOutTime).toLocaleTimeString()}`,
                attendance
            });
        }

        attendance.checkOutTime = new Date();
        await attendance.save();
        await attendance.populate('student', 'name email studentId');

        res.json({
            success: true,
            message: `${student.name} checked out successfully`,
            attendance
        });
    } catch (error) {
        console.error('Check-out error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/attendance/sessions/:sessionId/mark
// @desc    Mark attendance for a session using Student ID or ObjectId
// @access  Teacher/Admin
exports.markSessionAttendance = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { studentId, status, notes } = req.body;

        if (!sessionId) return res.status(400).json({ success: false, message: 'Session ID is required' });

        const session = await AttendanceSession.findById(sessionId);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Attendance session not found' });
        }

        // Find student by Student ID string or ObjectId
        let student;
        if (studentId.match(/^[0-9a-fA-F]{24}$/)) {
            student = await User.findById(studentId);
        } else {
            student = await User.findOne({
                studentId: { $regex: new RegExp(`^${studentId.trim()}$`, 'i') },
                role: 'student'
            });
        }

        if (!student) {
            return res.status(404).json({ success: false, message: `Student ID "${studentId}" not found` });
        }

        // Determine if student is late based on session start time
        let finalStatus = status;
        if (status === 'present' && session.startedAt) {
            const now = new Date();
            const startTime = new Date(session.startedAt);
            const diffMins = (now - startTime) / (1000 * 60);
            if (diffMins > 15) { // 15 minute grace period
                finalStatus = 'late';
            }
        }

        const attendance = await processAttendanceMarking({
            session,
            reservation: session.reservation ? (typeof session.reservation === 'object' ? session.reservation : { _id: session.reservation }) : null,
            studentId: student._id,
            status: finalStatus,
            markedBy: req.user._id,
            notes
        });

        res.json({ success: true, message: 'Attendance marked', status: finalStatus, attendance });
    } catch (error) {
        console.error('Mark session attendance error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error during attendance marking' });
    }
};

// @route   POST /api/attendance/mark-by-student-id
// @desc    Mark attendance by student ID string (teacher/admin action)
// @access  Teacher/Admin
exports.markByStudentId = async (req, res) => {
    try {
        const { reservationId, studentId, status = 'present' } = req.body;

        if (!reservationId || !studentId) {
            return res.status(400).json({ success: false, message: 'Reservation ID and Student ID are required' });
        }

        const reservation = await Reservation.findById(reservationId);
        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }

        if (reservation.teacher.toString() !== req.user._id.toString() &&
            req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Find student by studentId (case-insensitive)
        const student = await User.findOne({
            studentId: { $regex: new RegExp(`^${studentId.trim()}$`, 'i') },
            role: 'student'
        });

        if (!student) {
            return res.status(404).json({ success: false, message: `Student ID "${studentId}" not found in database` });
        }

        if (!student.isActive) {
            return res.status(400).json({ success: false, message: 'Student account is deactivated' });
        }

        const attendance = await processAttendanceMarking({
            reservation,
            studentId: student._id,
            status,
            markedBy: req.user._id
        });

        res.json({
            success: true,
            message: `Attendance marked for ${student.name} (${student.studentId})`,
            attendance,
            student: {
                name: student.name,
                email: student.email,
                studentId: student.studentId
            }
        });
    } catch (error) {
        console.error('Mark by student ID error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/attendance/mark-by-email
// @desc    Mark attendance by student email
// @access  Teacher/Admin
exports.markAttendanceByEmail = async (req, res) => {
    try {
        const { reservationId, email } = req.body;

        if (!reservationId || !email) {
            return res.status(400).json({ success: false, message: 'Reservation ID and email are required' });
        }

        const reservation = await Reservation.findById(reservationId);
        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }

        if (reservation.teacher.toString() !== req.user._id.toString() &&
            req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Find student by email or studentId (case-insensitive)
        const searchIdentifier = email.trim();
        const student = await User.findOne({
            $or: [
                { email: searchIdentifier.toLowerCase() },
                { studentId: { $regex: new RegExp(`^${searchIdentifier}$`, 'i') } }
            ],
            role: 'student'
        });

        if (!student) {
            return res.status(404).json({ success: false, message: `Student ID "${searchIdentifier}" not found in database` });
        }

        if (!student.isActive) {
            return res.status(400).json({ success: false, message: 'Student account is deactivated' });
        }

        // Check if attendance already marked
        let attendance = await Attendance.findOne({ reservation: reservationId, student: student._id });

        if (attendance) {
            // Update existing record
            attendance.status = 'present';
            attendance.markedBy = req.user._id;
            attendance.checkInTime = attendance.checkInTime || new Date();
        } else {
            // Create new attendance record
            attendance = new Attendance({
                reservation: reservationId,
                student: student._id,
                status: 'present',
                markedBy: req.user._id,
                checkInTime: new Date()
            });
        }

        await attendance.save();
        await attendance.populate('student', 'name email studentId');
        await attendance.populate('markedBy', 'name');

        // Send notification to the student
        try {
            const statusText = attendance.status === 'present' ? 'present' : attendance.status === 'late' ? 'late' : attendance.status;
            await createNotification({
                recipient: student._id,
                sender: req.user._id,
                type: 'attendance_marked',
                title: 'Attendance Marked',
                message: `Your attendance has been marked as ${statusText} for ${reservation.courseName || 'the lab session'} on ${new Date(reservation.date).toLocaleDateString()}.`,
                link: '/student/bookings',
                priority: 'medium',
                relatedModel: 'Reservation',
                relatedId: reservation._id,
                metadata: {
                    courseName: reservation.courseName,
                    status: attendance.status,
                    labName: reservation.lab?.name || 'Lab',
                    date: reservation.date,
                    startTime: reservation.startTime,
                    endTime: reservation.endTime
                }
            });
        } catch (notifError) {
            console.error('Failed to send attendance notification:', notifError);
            // Don't fail the request if notification fails
        }

        res.json({
            success: true,
            message: `Attendance marked successfully for ${student.name}`,
            attendance,
            student: {
                name: student.name,
                email: student.email,
                studentId: student.studentId
            }
        });
    } catch (error) {
        console.error('Mark attendance by email error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/attendance/history
// @desc    Get attendance history for teacher
// @access  Teacher/Admin
exports.getAttendanceHistory = async (req, res) => {
    try {
        console.log('getAttendanceHistory called', { userId: req.user._id, role: req.user.role, query: req.query });
        
        const { reservationId, date, page = 1, limit = 50 } = req.query;
        
        // Get all reservations for this teacher to find their sessions
        let teacherReservations;
        if (req.user.role === 'teacher') {
            teacherReservations = await Reservation.find({ teacher: req.user._id }).select('_id');
        } else if (req.user.role === 'admin' || req.user.role === 'superadmin') {
            // Admin can see all reservations
            teacherReservations = await Reservation.find().select('_id');
        } else {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        
        console.log('Teacher reservations:', teacherReservations.length);
        
        const reservationIds = teacherReservations.map(r => r._id);
        
        // If no reservations, return empty array
        if (reservationIds.length === 0) {
            return res.json({
                success: true,
                attendance: [],
                pagination: {
                    page: 1,
                    limit: parseInt(limit),
                    total: 0,
                    pages: 0
                }
            });
        }
        
        // Build query - include both reservation-based AND session-based attendance
        let query = {};

        // If date filter is used, ensure attendance history is complete (present + absent)
        // by inserting missing 'absent' records for each relevant session.
        // This guarantees the teacher always sees all students after clicking a day.
        const ensureCompleteHistoryForDate = async (selectedDate) => {
            // Get teacher reservations for that exact date
            const from = new Date(selectedDate);
            const to = new Date(selectedDate);
            to.setDate(to.getDate() + 1);

            const teacherReservationsForDate = await Reservation.find({
                ...(req.user.role === 'teacher' ? { teacher: req.user._id } : {}),
                date: { $gte: from, $lt: to }
            }).select('_id');

            const reservationIdsForDate = teacherReservationsForDate.map(r => r._id);
            if (reservationIdsForDate.length === 0) return;

            // Sessions for those reservations
            const sessionsForDate = await AttendanceSession.find({
                teacher: req.user._id,
                reservation: { $in: reservationIdsForDate }
            }).select('_id year semester department campus reservation');

            if (sessionsForDate.length === 0) return;

            // For each session, ensure attendance rows exist for every student
            for (const session of sessionsForDate) {
                const students = await User.find({
                    role: 'student',
                    isActive: true,
                    year: session.year,
                    semester: session.semester,
                    department: session.department,
                    campus: session.campus
                }).select('_id');

                if (students.length === 0) continue;

                const existing = await Attendance.find({
                    $or: [
                        { session: session._id },
                        { reservation: session.reservation }
                    ],
                    student: { $in: students.map(s => s._id) }
                }).select('student');

                const existingByStudentId = new Set(existing.map(a => String(a.student)));
                const missingStudents = students.filter(s => !existingByStudentId.has(String(s._id)));

                if (missingStudents.length > 0) {
                    const missingRecords = missingStudents.map(s => ({
                        session: session._id,
                        reservation: session.reservation,
                        student: s._id,
                        status: 'absent',
                        markedBy: null,
                        checkInTime: null
                    }));

                    await Attendance.insertMany(missingRecords, { ordered: false });
                }
            }
        };

        
        // Get all attendance session IDs for teacher's reservations
        const AttendanceSession = require('../models/AttendanceSession');
        const teacherSessions = await AttendanceSession.find({
            teacher: req.user._id
        }).select('_id');
        const sessionIds = teacherSessions.map(s => s._id);
        
        const hasReservationFilter = reservationId && reservationIds.some(id => String(id) === String(reservationId));

        if (hasReservationFilter) {
            // Filter by specific reservation
            query = { reservation: reservationId };
        } else if (sessionIds.length > 0) {
            // Get all attendance for teacher's reservations OR sessions
            query = {
                $or: [
                    { reservation: { $in: reservationIds } },
                    { session: { $in: sessionIds } }
                ]
            };
        } else {
            // Get all attendance for teacher's reservations
            query = { reservation: { $in: reservationIds } };
        }

        if (date) {
            // IMPORTANT: Use the real session/reservation date, not createdAt/checkInTime.
            // Absent records may not have checkInTime, so createdAt filtering can miss them.
            const selectedDate = new Date(date);
            if (!Number.isNaN(selectedDate.getTime())) {
                // Ensure missing absent rows exist so history is complete.
                await ensureCompleteHistoryForDate(selectedDate);

                const nextDate = new Date(selectedDate);
                nextDate.setDate(nextDate.getDate() + 1);


                query = {
                    $and: [
                        query,
                        {
                            $or: [
                // Prefer reservation.date because absent rows still belong to the reservation
                                { 'reservation.date': { $gte: selectedDate, $lt: nextDate } },
                                // Fallbacks for session-based/manual data
                                { 'session.createdAt': { $gte: selectedDate, $lt: nextDate } },
                                { 'session.startedAt': { $gte: selectedDate, $lt: nextDate } }

                            ]
                        }
                    ]
                };
            }
        }

        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const attendance = await Attendance.find(query)
            .populate('student', 'name email studentId firstName lastName')
            .populate('markedBy', 'name')
            .populate('session', 'courseCode year semester department campus startedAt createdAt')
            .populate({
                path: 'reservation',
                select: 'courseName courseCode date startTime endTime lab',
                populate: { path: 'lab', select: 'name' }
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await Attendance.countDocuments(query);
        
        // Transform data for frontend - handle both session and reservation based records
        const records = attendance.map(a => ({
            _id: a._id,
            student: a.student,
            courseName: a.reservation?.courseName || a.session?.courseCode || 'Manual Attendance Session',
            courseCode: a.reservation?.courseCode || a.session?.courseCode || 'N/A',
            date: a.reservation?.date || a.checkInTime || a.session?.startedAt || a.session?.createdAt,
            startTime: a.reservation?.startTime || '',
            endTime: a.reservation?.endTime || '',
            lab: a.reservation?.lab,
            status: a.status,
            checkInTime: a.checkInTime,
            checkOutTime: a.checkOutTime,
            markedBy: a.markedBy,
            notes: a.notes
        }));
        
        res.json({
            success: true,
            attendance: records,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get attendance history error:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
};

// @route   GET /api/attendance/active-session
// @desc    Get current active session for attendance (auto-detect based on time)
// @access  Private (any authenticated user)
exports.getActiveSession = async (req, res) => {
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
            .populate('lab', 'name code')
            .populate('teacher', 'name')
            .sort({ startTime: 1 });

        // Get current time in HH:MM format
        const currentTime = now.getHours().toString().padStart(2, '0') + ':' +
            now.getMinutes().toString().padStart(2, '0');

        // Find the session that is currently active (current time is between start and end)
        const activeSession = sessions.find(session => {
            return session.startTime <= currentTime && session.endTime >= currentTime;
        });

        if (!activeSession) {
            return res.status(404).json({
                success: false,
                message: 'No active session found at this time. Please try during your scheduled lab session.'
            });
        }

        res.json({
            success: true,
            session: {
                _id: activeSession._id,
                courseName: activeSession.courseName,
                courseCode: activeSession.courseCode,
                labName: activeSession.lab?.name,
                labId: activeSession.lab?._id,
                date: activeSession.date,
                startTime: activeSession.startTime,
                endTime: activeSession.endTime,
                teacherName: activeSession.teacher?.name
            }
        });
    } catch (error) {
        console.error('Get active session error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/attendance/mark-student
// @desc    Mark attendance using only student ID (auto-detect active session)
// @access  Private (any authenticated user)
exports.markStudentAttendance = async (req, res) => {
    try {
        const { studentId } = req.body;

        if (!studentId || !studentId.trim()) {
            return res.status(400).json({ success: false, message: 'Student ID is required' });
        }

        // Find the current active session
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const sessions = await Reservation.find({
            status: 'approved',
            date: { $gte: today, $lt: tomorrow }
        }).sort({ startTime: 1 });

        const currentTime = now.getHours().toString().padStart(2, '0') + ':' +
            now.getMinutes().toString().padStart(2, '0');

        const activeSession = sessions.find(session => {
            return session.startTime <= currentTime && session.endTime >= currentTime;
        });

        if (!activeSession) {
            return res.status(404).json({
                success: false,
                message: 'No active session found. Please try during your scheduled lab session.'
            });
        }

        // Find student by studentId (case-insensitive)
        const student = await User.findOne({
            studentId: { $regex: new RegExp(`^${studentId.trim()}$`, 'i') },
            role: 'student'
        });

        if (!student) {
            return res.status(404).json({
                success: false,
                message: `Student ID "${studentId}" not found. Please check your ID and try again.`
            });
        }

        if (!student.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Your account is deactivated. Please contact the administrator.'
            });
        }

        // Check if attendance already marked
        const existing = await Attendance.findOne({
            reservation: activeSession._id,
            student: student._id
        });

        if (existing) {
            return res.json({
                success: true,
                alreadyMarked: true,
                message: `Attendance already marked for ${student.name}`,
                student: {
                    name: student.name,
                    studentId: student.studentId,
                    email: student.email
                }
            });
        }

        // Create new attendance record
        const attendance = new Attendance({
            reservation: activeSession._id,
            student: student._id,
            status: 'present',
            markedBy: activeSession.teacher,
            checkInTime: new Date()
        });

        await attendance.save();

        res.json({
            success: true,
            alreadyMarked: false,
            message: `Attendance marked successfully for ${student.name}`,
            student: {
                name: student.name,
                studentId: student.studentId,
                email: student.email
            }
        });
    } catch (error) {
        console.error('Mark student attendance error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
