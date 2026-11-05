const Booking = require('../models/Booking');
const Fault = require('../models/Fault');
const Equipment = require('../models/Equipment');
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const Attendance = require('../models/Attendance');
const Material = require('../models/Material');
const Lab = require('../models/Lab');
const { createNotification, notifyByRole } = require('./notificationController');

// @route   GET /api/reports/dashboard
// @desc    Get dashboard statistics
// @access  Admin/Superadmin
exports.getDashboard = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let userQuery = { isActive: true };
        let equipmentQuery = { isActive: true };
        let bookingQuery = {};
        
        if (req.user.role === 'admin') {
            userQuery.campus = req.user.campus;
            equipmentQuery.campus = req.user.campus;
            bookingQuery.campus = req.user.campus;
        }

        const totalUsers = await User.countDocuments(userQuery);
        const userRoles = await User.aggregate([
            { $match: userQuery },
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);

        const totalBookings = await Booking.countDocuments(bookingQuery);
        const todayBookings = await Booking.countDocuments({
            ...bookingQuery,
            date: { $gte: today, $lt: tomorrow },
            status: { $in: ['pending', 'confirmed'] }
        });
        
        let faultQuery = { status: { $in: ['open', 'in-progress'] } };
        if (req.user.role === 'admin') {
            faultQuery.campus = req.user.campus;
        }
        const pendingFaults = await Fault.countDocuments(faultQuery);

        const totalEquipment = await Equipment.countDocuments(equipmentQuery);
        const maintenanceEquipment = await Equipment.countDocuments({ 
            ...equipmentQuery, 
            status: 'maintenance' 
        });

        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);

            const count = await Booking.countDocuments({
                ...bookingQuery,
                date: { $gte: date, $lt: nextDate },
                status: { $nin: ['cancelled'] }
            });

            last7Days.push({ date: date.toISOString().split('T')[0], count });
        }

        const recentBookings = await Booking.find(bookingQuery)
            .populate('user', 'name')
            .populate('lab', 'name')
            .sort({ createdAt: -1 })
            .limit(5);

        const recentFaults = await Fault.find(faultQuery)
            .populate('reportedBy', 'name')
            .populate('lab', 'name')
            .sort({ createdAt: -1 })
            .limit(5);

        res.json({
            success: true,
            stats: { totalUsers, totalBookings, todayBookings, pendingFaults, totalEquipment, maintenanceEquipment },
            trends: { bookings: last7Days },
            userRoles,
            recentActivity: { bookings: recentBookings, faults: recentFaults },
            scope: req.user.role === 'admin' ? req.user.campus : 'global'
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/reports/technician-stats
// @desc    Get technician dashboard statistics (bookings + equipment + computers)
// @access  Technician/Admin/Superadmin
exports.getTechnicianStats = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        const userCampus = req.user.campus;
        let labQuery = {};
        if (userCampus) {
            labQuery.campus = userCampus;
        }

        const labs = await Lab.find(labQuery).lean();
        let totalComputers = 0;
        let availableComputers = 0;
        let occupiedComputers = 0;
        let maintenanceComputers = 0;
        let reservedComputers = 0;

        labs.forEach(lab => {
            const rooms = lab.rooms || [];
            rooms.forEach(room => {
                const workstations = room.workstations || [];
                workstations.forEach(ws => {
                    totalComputers++;
                    if (ws.status === 'available') availableComputers++;
                    else if (ws.status === 'occupied') occupiedComputers++;
                    else if (ws.status === 'maintenance') maintenanceComputers++;
                    else if (ws.status === 'reserved') reservedComputers++;
                });
            });
        });

        let equipmentQuery = { isActive: true };
        if (userCampus) {
            const campusLabs = labs.map(l => l._id.toString());
            equipmentQuery.lab = { $in: campusLabs };
        }

        const totalEquipment = await Equipment.countDocuments(equipmentQuery);
        const operationalEquipment = await Equipment.countDocuments({ ...equipmentQuery, status: 'operational' });
        const maintenanceEquipment = await Equipment.countDocuments({ ...equipmentQuery, status: 'maintenance' });
        const brokenEquipment = await Equipment.countDocuments({ ...equipmentQuery, status: 'broken' });
        const retiredEquipment = await Equipment.countDocuments({ ...equipmentQuery, status: 'retired' });

        let bookingQuery = {};
        if (userCampus) {
            const campusLabIds = labs.map(l => l._id.toString());
            bookingQuery.lab = { $in: campusLabIds };
        }

        const totalBookings = await Booking.countDocuments(bookingQuery);
        const todayBookings = await Booking.countDocuments({
            ...bookingQuery,
            date: { $gte: today, $lt: tomorrow },
            status: { $nin: ['cancelled'] }
        });
        const activeNowBookings = await Booking.countDocuments({
            ...bookingQuery,
            date: { $gte: today, $lt: tomorrow },
            status: 'confirmed'
        });
        const weeklyBookings = await Booking.countDocuments({
            ...bookingQuery,
            date: { $gte: weekAgo, $lt: tomorrow },
            status: { $nin: ['cancelled'] }
        });
        const pendingBookings = await Booking.countDocuments({ ...bookingQuery, status: 'pending' });
        const confirmedBookings = await Booking.countDocuments({ ...bookingQuery, status: 'confirmed' });

        const recentBookings = await Booking.find(bookingQuery)
            .populate('user', 'name email studentId')
            .populate('workstation', 'roomName workstationNumber')
            .populate('lab', 'name')
            .sort({ createdAt: -1 })
            .limit(10);

        let faultQuery = {};
        if (userCampus) {
            const campusLabIds = labs.map(l => l._id.toString());
            faultQuery.lab = { $in: campusLabIds };
        }
        const openFaults = await Fault.countDocuments({ ...faultQuery, status: 'open' });
        const inProgressFaults = await Fault.countDocuments({ ...faultQuery, status: 'in-progress' });

        res.json({
            success: true,
            stats: {
                bookings: {
                    total: totalBookings,
                    today: todayBookings,
                    activeNow: activeNowBookings,
                    thisWeek: weeklyBookings,
                    pending: pendingBookings,
                    confirmed: confirmedBookings
                },
                equipment: {
                    total: totalEquipment,
                    operational: operationalEquipment,
                    maintenance: maintenanceEquipment,
                    broken: brokenEquipment,
                    retired: retiredEquipment
                },
                computers: {
                    total: totalComputers,
                    available: availableComputers,
                    occupied: occupiedComputers,
                    maintenance: maintenanceComputers,
                    reserved: reservedComputers
                },
                faults: {
                    open: openFaults,
                    inProgress: inProgressFaults
                }
            },
            recentBookings,
            scope: userCampus || 'global'
        });
    } catch (error) {
        console.error('Technician stats error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/reports/bookings
// @desc    Get booking reports
// @access  Admin/Superadmin
exports.getBookingReports = async (req, res) => {
    try {
        const { startDate, endDate, lab, groupBy } = req.query;
        let query = {};

        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        if (lab) query.lab = lab;

        let bookings;

        if (groupBy === 'month') {
            bookings = await Booking.aggregate([
                { $match: query },
                { $group: { _id: { year: { $year: '$date' }, month: { $month: '$date' } }, count: { $sum: 1 } } },
                { $sort: { '_id.year': -1, '_id.month': -1 } }
            ]);
        } else if (groupBy === 'status') {
            bookings = await Booking.aggregate([
                { $match: query },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]);
        } else {
            bookings = await Booking.find(query)
                .populate('user', 'name')
                .populate('lab', 'name')
                .sort({ date: -1 });
        }

        res.json({ success: true, bookings });
    } catch (error) {
        console.error('Booking reports error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/reports/equipment
// @desc    Get equipment reports
// @access  Admin/Superadmin
exports.getEquipmentReports = async (req, res) => {
    try {
        const { category, status } = req.query;
        let query = { isActive: true };
        if (category) query.category = category;
        if (status) query.status = status;

        const equipment = await Equipment.find(query)
            .populate('lab', 'name')
            .sort({ createdAt: -1 });

        const categoryDistribution = await Equipment.aggregate([
            { $match: query },
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);

        res.json({ success: true, equipment, categoryDistribution });
    } catch (error) {
        console.error('Equipment reports error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/reports/maintenance
// @desc    Get maintenance reports
// @access  Admin/Superadmin
exports.getMaintenanceReports = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let dateFilter = {};

        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        const faultStats = await Fault.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    avgResolutionTime: {
                        $avg: {
                            $cond: [
                                { $and: ['$resolvedAt', '$createdAt'] },
                                { $subtract: ['$resolvedAt', '$createdAt'] },
                                null
                            ]
                        }
                    }
                }
            }
        ]);

        const faultsByCategory = await Fault.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);

        const faultsBySeverity = await Fault.aggregate([
            { $match: dateFilter },
            { $group: { _id: '$severity', count: { $sum: 1 } } }
        ]);

        res.json({ success: true, faultStats, faultsByCategory, faultsBySeverity });
    } catch (error) {
        console.error('Maintenance reports error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/reports/export/csv
// @desc    Export report data as CSV
// @access  Admin/Superadmin
exports.exportCSV = async (req, res) => {
    try {
        const { type, startDate, endDate } = req.query;
        const dateFilter = {};
        if (startDate) dateFilter.$gte = new Date(startDate);
        if (endDate) dateFilter.$lte = new Date(endDate);

        let csvContent = '';
        let filename = '';

        if (type === 'bookings' || !type) {
            const query = {};
            if (startDate || endDate) query.date = dateFilter;

            // Respect campus boundaries for Technician exports
            if (req.user.role === 'admin' || req.user.role === 'technician') {
                if (req.user.campus) {
                    const labsInCampus = await Lab.find({ campus: req.user.campus }).select('_id');
                    query.lab = { $in: labsInCampus.map(l => l._id) };
                }
            }

            const bookings = await Booking.find(query)
                .populate('user', 'name email studentId')
                .populate('lab', 'name code')
                .sort({ date: -1 });

            csvContent = 'Booking ID,User,Student ID,Email,Lab,Room,PC #,Date,Time,Purpose,Status\n';
            bookings.forEach(b => {
                const room = b.workstation?.roomName || 'N/A';
                const pc = b.workstation?.workstationNumber || 'N/A';
                csvContent += `"${b._id}","${b.user?.name}","${b.user?.studentId}","${b.user?.email}","${b.lab?.name}","${room}","${pc}","${new Date(b.date).toLocaleDateString()}","${b.startTime}-${b.endTime}","${b.purpose}","${b.status}"\n`;
            });
            filename = `bookings_report_${new Date().toISOString().split('T')[0]}.csv`;

        } else if (type === 'equipment') {
            const equipment = await Equipment.find({ isActive: true })
                .populate('lab', 'name code')
                .sort({ createdAt: -1 });

            csvContent = 'Name,Code,Category,Lab,Status,Quantity,Serial Number,Created At\n';
            equipment.forEach(e => {
                csvContent += `"${e.name}","${e.code}","${e.category}","${e.lab?.name || 'N/A'}","${e.status}","${e.quantity || 1}","${e.specifications?.serialNumber || ''}","${new Date(e.createdAt).toLocaleString()}"\n`;
            });
            filename = `equipment_report_${new Date().toISOString().split('T')[0]}.csv`;

        } else if (type === 'faults') {
            const query = {};
            if (startDate || endDate) query.createdAt = dateFilter;
            const faults = await Fault.find(query)
                .populate('reportedBy', 'name role')
                .populate('lab', 'name code')
                .populate('assignedTo', 'name')
                .sort({ createdAt: -1 });

            csvContent = 'Title,Reported By,Role,Lab,Category,Severity,Status,Assigned To,Resolved At,Created At\n';
            faults.forEach(f => {
                csvContent += `"${f.title}","${f.reportedBy?.name || 'N/A'}","${f.reportedBy?.role || 'N/A'}","${f.lab?.name || 'N/A'}","${f.category}","${f.severity}","${f.status}","${f.assignedTo?.name || 'Unassigned'}","${f.resolvedAt ? new Date(f.resolvedAt).toLocaleString() : ''}","${new Date(f.createdAt).toLocaleString()}"\n`;
            });
            filename = `faults_report_${new Date().toISOString().split('T')[0]}.csv`;

        } else if (type === 'attendance') {
            const query = {};
            if (startDate || endDate) query.createdAt = dateFilter;
            const attendance = await Attendance.find(query)
                .populate('student', 'name email studentId')
                .populate('reservation', 'courseName courseCode date')
                .populate('markedBy', 'name')
                .sort({ createdAt: -1 });

            csvContent = 'Student Name,Student ID,Email,Course,Reservation Date,Status,Check-In Time,Check-Out Time,Marked By\n';
            attendance.forEach(a => {
                csvContent += `"${a.student?.name || 'N/A'}","${a.student?.studentId || 'N/A'}","${a.student?.email || 'N/A'}","${a.reservation?.courseName || 'N/A'}","${a.reservation?.date ? new Date(a.reservation.date).toLocaleDateString() : 'N/A'}","${a.status}","${a.checkInTime ? new Date(a.checkInTime).toLocaleTimeString() : ''}","${a.checkOutTime ? new Date(a.checkOutTime).toLocaleTimeString() : ''}","${a.markedBy?.name || 'N/A'}"\n`;
            });
            filename = `attendance_report_${new Date().toISOString().split('T')[0]}.csv`;

        } else if (type === 'reservations') {
            const query = {};
            if (startDate || endDate) query.date = dateFilter;
            const reservations = await Reservation.find(query)
                .populate('teacher', 'name email')
                .populate('lab', 'name code')
                .sort({ date: -1 });

            csvContent = 'Course Name,Course Code,Teacher,Email,Lab,Date,Start Time,End Time,Students,Status,Created At\n';
            reservations.forEach(r => {
                csvContent += `"${r.courseName}","${r.courseCode}","${r.teacher?.name || 'N/A'}","${r.teacher?.email || 'N/A'}","${r.lab?.name || 'N/A'}","${new Date(r.date).toLocaleDateString()}","${r.startTime}","${r.endTime}","${r.numberOfStudents}","${r.status}","${new Date(r.createdAt).toLocaleString()}"\n`;
            });
            filename = `reservations_report_${new Date().toISOString().split('T')[0]}.csv`;

        } else if (type === 'users') {
            const users = await User.find().select('-password').sort({ createdAt: -1 });

            csvContent = 'Name,Username,Email,Role,Department,Student ID,Campus,Active,Approval Status,Created At\n';
            users.forEach(u => {
                csvContent += `"${u.name}","${u.username}","${u.email}","${u.role}","${u.department || ''}","${u.studentId || ''}","${u.campus || ''}","${u.isActive}","${u.approvalStatus}","${new Date(u.createdAt).toLocaleString()}"\n`;
            });
            filename = `users_report_${new Date().toISOString().split('T')[0]}.csv`;

        } else {
            return res.status(400).json({ success: false, message: 'Invalid report type' });
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);
    } catch (error) {
        console.error('Export CSV error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/reports/export/pdf
// @desc    Export report data as HTML (printable as PDF)
// @access  Admin/Superadmin
exports.exportPDF = async (req, res) => {
    try {
        const { type, startDate, endDate } = req.query;
        const dateFilter = {};
        if (startDate) dateFilter.$gte = new Date(startDate);
        if (endDate) dateFilter.$lte = new Date(endDate);

        const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        let reportTitle = '';
        let tableHTML = '';
        let summaryHTML = '';

        if (type === 'bookings' || !type) {
            reportTitle = 'Bookings Report';
            const query = {};
            if (startDate || endDate) query.date = dateFilter;
            const bookings = await Booking.find(query)
                .populate('user', 'name email')
                .populate('lab', 'name code')
                .sort({ date: -1 });

            const statusCounts = {};
            bookings.forEach(b => { statusCounts[b.status] = (statusCounts[b.status] || 0) + 1; });
            summaryHTML = `<p>Total Bookings: <strong>${bookings.length}</strong> | ${Object.entries(statusCounts).map(([s, c]) => `${s}: <strong>${c}</strong>`).join(' | ')}</p>`;

            tableHTML = `<table><thead><tr><th>User</th><th>Lab</th><th>Date</th><th>Time</th><th>Status</th></tr></thead><tbody>`;
            bookings.forEach(b => {
                tableHTML += `<tr><td>${b.user?.name || 'N/A'}</td><td>${b.lab?.name || 'N/A'}</td><td>${new Date(b.date).toLocaleDateString()}</td><td>${b.startTime}-${b.endTime}</td><td>${b.status}</td></tr>`;
            });
            tableHTML += '</tbody></table>';

        } else if (type === 'equipment') {
            reportTitle = 'Equipment Report';
            const equipment = await Equipment.find({ isActive: true }).populate('lab', 'name').sort({ createdAt: -1 });
            summaryHTML = `<p>Total Equipment: <strong>${equipment.length}</strong></p>`;
            tableHTML = `<table><thead><tr><th>Name</th><th>Code</th><th>Category</th><th>Lab</th><th>Status</th></tr></thead><tbody>`;
            equipment.forEach(e => {
                tableHTML += `<tr><td>${e.name}</td><td>${e.code}</td><td>${e.category}</td><td>${e.lab?.name || 'N/A'}</td><td>${e.status}</td></tr>`;
            });
            tableHTML += '</tbody></table>';

        } else if (type === 'faults') {
            reportTitle = 'Faults Report';
            const query = {};
            if (startDate || endDate) query.createdAt = dateFilter;
            const faults = await Fault.find(query).populate('reportedBy', 'name').populate('lab', 'name').sort({ createdAt: -1 });
            summaryHTML = `<p>Total Faults: <strong>${faults.length}</strong> | Open: <strong>${faults.filter(f => f.status === 'open').length}</strong> | Resolved: <strong>${faults.filter(f => f.status === 'resolved').length}</strong></p>`;
            tableHTML = `<table><thead><tr><th>Title</th><th>Reported By</th><th>Lab</th><th>Severity</th><th>Status</th><th>Date</th></tr></thead><tbody>`;
            faults.forEach(f => {
                tableHTML += `<tr><td>${f.title}</td><td>${f.reportedBy?.name || 'N/A'}</td><td>${f.lab?.name || 'N/A'}</td><td>${f.severity}</td><td>${f.status}</td><td>${new Date(f.createdAt).toLocaleDateString()}</td></tr>`;
            });
            tableHTML += '</tbody></table>';

        } else if (type === 'reservations') {
            reportTitle = 'Lab Reservations Report';
            const query = {};
            if (startDate || endDate) query.date = dateFilter;
            const reservations = await Reservation.find(query).populate('teacher', 'name').populate('lab', 'name').sort({ date: -1 });
            summaryHTML = `<p>Total Reservations: <strong>${reservations.length}</strong> | Approved: <strong>${reservations.filter(r => r.status === 'approved').length}</strong> | Pending: <strong>${reservations.filter(r => r.status === 'pending').length}</strong></p>`;
            tableHTML = `<table><thead><tr><th>Course</th><th>Teacher</th><th>Lab</th><th>Date</th><th>Time</th><th>Students</th><th>Status</th></tr></thead><tbody>`;
            reservations.forEach(r => {
                tableHTML += `<tr><td>${r.courseName}</td><td>${r.teacher?.name || 'N/A'}</td><td>${r.lab?.name || 'N/A'}</td><td>${new Date(r.date).toLocaleDateString()}</td><td>${r.startTime}-${r.endTime}</td><td>${r.numberOfStudents}</td><td>${r.status}</td></tr>`;
            });
            tableHTML += '</tbody></table>';

        } else {
            return res.status(400).json({ success: false, message: 'Invalid report type' });
        }

        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${reportTitle} - UOG CLMS</title>
<style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    .header { text-align: center; border-bottom: 3px solid #1a237e; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #1a237e; margin: 0; font-size: 24px; }
    .header p { color: #666; margin: 5px 0 0; }
    .summary { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .summary p { margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
    th { background: #1a237e; color: white; padding: 10px 8px; text-align: left; }
    td { padding: 8px; border-bottom: 1px solid #ddd; }
    tr:nth-child(even) { background: #f9f9f9; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 11px; }
    @media print { body { margin: 20px; } }
</style></head><body>
<div class="header">
    <h1>University of Gondar - CLMS</h1>
    <h2>${reportTitle}</h2>
    <p>Generated on: ${today}${startDate ? ` | Period: ${startDate} to ${endDate || 'Present'}` : ''}</p>
</div>
<div class="summary">${summaryHTML}</div>
${tableHTML}
<div class="footer"><p>Computer Lab Management System - Confidential Report</p></div>
</body></html>`;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('Export PDF error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/reports/generate
// @desc    Generate and send report to user group via notifications
// @access  Admin/Superadmin
exports.generateAndSendReport = async (req, res) => {
    try {
        const { title, type, message, includeStats, priority, targetRole } = req.body;

        if (!title || !targetRole) {
            return res.status(400).json({ success: false, message: 'Title and target role are required' });
        }

        let reportContent = message || '';
        let statsSummary = '';

        if (includeStats) {
            const totalUsers = await User.countDocuments({ isActive: true, role: targetRole });
            const totalBookings = await Booking.countDocuments();
            const pendingFaults = await Fault.countDocuments({ status: { $in: ['open', 'in-progress'] } });
            const totalEquipment = await Equipment.countDocuments({ isActive: true });

            statsSummary = `\n\n--- System Statistics ---\nActive ${targetRole}s: ${totalUsers}\nTotal Bookings: ${totalBookings}\nPending Faults: ${pendingFaults}\nTotal Equipment: ${totalEquipment}`;

            if (type === 'fault') {
                const faultsByCategory = await Fault.aggregate([
                    { $group: { _id: '$category', count: { $sum: 1 } } }
                ]);
                statsSummary += '\n\nFaults by Category:';
                faultsByCategory.forEach(f => { statsSummary += `\n- ${f._id}: ${f.count}`; });
            } else if (type === 'usage') {
                const last30Days = new Date();
                last30Days.setDate(last30Days.getDate() - 30);
                const recentBookings = await Booking.countDocuments({ createdAt: { $gte: last30Days } });
                statsSummary += `\n\nBookings (Last 30 Days): ${recentBookings}`;
            } else if (type === 'inventory') {
                const categories = await Equipment.aggregate([
                    { $match: { isActive: true } },
                    { $group: { _id: '$category', count: { $sum: 1 } } }
                ]);
                statsSummary += '\n\nInventory by Category:';
                categories.forEach(c => { statsSummary += `\n- ${c._id}: ${c.count}`; });
            }
        }

        const fullMessage = reportContent + statsSummary;

        await notifyByRole([targetRole], {
            sender: req.user._id,
            type: 'report',
            title: `Report: ${title}`,
            message: fullMessage.substring(0, 500),
            link: '/notifications',
            priority: priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'medium',
            relatedModel: 'Report'
        });

        const recipientCount = await User.countDocuments({ role: targetRole, isActive: true });

        res.json({
            success: true,
            message: `Report "${title}" sent to ${recipientCount} ${targetRole}(s)`,
            recipientCount
        });
    } catch (error) {
        console.error('Generate and send report error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/reports/staff-performance
// @desc    Get staff performance metrics
// @access  Admin/Superadmin
exports.getStaffPerformance = async (req, res) => {
    try {
        const { role, startDate, endDate } = req.query;
        const dateFilter = {};
        if (startDate) dateFilter.$gte = new Date(startDate);
        if (endDate) dateFilter.$lte = new Date(endDate);

        const performance = {};

        if (!role || role === 'teacher') {
            const teachers = await User.find({ role: 'teacher', isActive: true }).select('name email department');

            const teacherMetrics = await Promise.all(teachers.map(async (teacher) => {
                const reservationQuery = { teacher: teacher._id };
                if (startDate || endDate) reservationQuery.date = dateFilter;

                const totalReservations = await Reservation.countDocuments(reservationQuery);
                const approvedReservations = await Reservation.countDocuments({ ...reservationQuery, status: 'approved' });
                const totalStudentsServed = await Reservation.aggregate([
                    { $match: { ...reservationQuery, status: { $in: ['approved', 'completed'] } } },
                    { $group: { _id: null, total: { $sum: '$numberOfStudents' } } }
                ]);

                const materialCount = await Material.countDocuments({ uploadedBy: teacher._id, isActive: true });
                const attendanceMarked = await Attendance.countDocuments({ markedBy: teacher._id });

                return {
                    _id: teacher._id,
                    name: teacher.name,
                    email: teacher.email,
                    department: teacher.department,
                    totalReservations,
                    approvedReservations,
                    approvalRate: totalReservations > 0 ? Math.round((approvedReservations / totalReservations) * 100) : 0,
                    totalStudentsServed: totalStudentsServed[0]?.total || 0,
                    materialsUploaded: materialCount,
                    attendanceRecordsMarked: attendanceMarked
                };
            }));

            performance.teachers = teacherMetrics.sort((a, b) => b.totalReservations - a.totalReservations);
        }

        if (!role || role === 'technician') {
            const technicians = await User.find({ role: 'technician', isActive: true }).select('name email');

            const technicianMetrics = await Promise.all(technicians.map(async (tech) => {
                const faultQuery = { assignedTo: tech._id };
                if (startDate || endDate) faultQuery.createdAt = dateFilter;

                const totalAssigned = await Fault.countDocuments(faultQuery);
                const resolved = await Fault.countDocuments({ ...faultQuery, status: 'resolved' });
                const inProgress = await Fault.countDocuments({ ...faultQuery, status: 'in-progress' });

                const avgResolution = await Fault.aggregate([
                    { $match: { ...faultQuery, status: 'resolved', resolvedAt: { $exists: true } } },
                    { $project: { resolutionTime: { $subtract: ['$resolvedAt', '$createdAt'] } } },
                    { $group: { _id: null, avgTime: { $avg: '$resolutionTime' } } }
                ]);

                const avgHours = avgResolution[0]?.avgTime ? Math.round(avgResolution[0].avgTime / (1000 * 60 * 60) * 10) / 10 : 0;

                return {
                    _id: tech._id,
                    name: tech.name,
                    email: tech.email,
                    totalAssigned,
                    resolved,
                    inProgress,
                    resolutionRate: totalAssigned > 0 ? Math.round((resolved / totalAssigned) * 100) : 0,
                    avgResolutionHours: avgHours
                };
            }));

            performance.technicians = technicianMetrics.sort((a, b) => b.resolutionRate - a.resolutionRate);
        }

        if (!role || role === 'admin') {
            const admins = await User.find({ role: 'admin', isActive: true }).select('name email');

            const adminMetrics = await Promise.all(admins.map(async (admin) => {
                const bookingsApproved = await Booking.countDocuments({ status: { $in: ['confirmed', 'completed'] } });
                const reservationsApproved = await Reservation.countDocuments({ approvedBy: admin._id, status: 'approved' });

                return {
                    _id: admin._id,
                    name: admin.name,
                    email: admin.email,
                    bookingsManaged: bookingsApproved,
                    reservationsApproved
                };
            }));

            performance.admins = adminMetrics;
        }

        res.json({ success: true, performance });
    } catch (error) {
        console.error('Staff performance error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/reports/maintenance-reminders
// @desc    Get upcoming maintenance reminders
// @access  Admin/Technician/Superadmin
exports.getMaintenanceReminders = async (req, res) => {
    try {
        const today = new Date();
        const thirtyDaysLater = new Date();
        thirtyDaysLater.setDate(today.getDate() + 30);

        const upcomingMaintenance = await Equipment.find({
            isActive: true,
            nextMaintenanceDate: { $gte: today, $lte: thirtyDaysLater }
        })
            .populate('lab', 'name code')
            .sort({ nextMaintenanceDate: 1 });

        const overdueMaintenance = await Equipment.find({
            isActive: true,
            nextMaintenanceDate: { $lt: today }
        })
            .populate('lab', 'name code')
            .sort({ nextMaintenanceDate: 1 });

        const thisWeek = [];
        const thisMonth = [];

        upcomingMaintenance.forEach(eq => {
            const daysUntil = Math.ceil((new Date(eq.nextMaintenanceDate) - today) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 7) {
                thisWeek.push({ ...eq.toObject(), daysUntil });
            } else {
                thisMonth.push({ ...eq.toObject(), daysUntil });
            }
        });

        res.json({
            success: true,
            reminders: {
                overdue: overdueMaintenance.map(eq => ({
                    ...eq.toObject(),
                    daysOverdue: Math.ceil((today - new Date(eq.nextMaintenanceDate)) / (1000 * 60 * 60 * 24))
                })),
                thisWeek,
                thisMonth,
                summary: {
                    overdueCount: overdueMaintenance.length,
                    thisWeekCount: thisWeek.length,
                    thisMonthCount: thisMonth.length
                }
            }
        });
    } catch (error) {
        console.error('Maintenance reminders error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.sendMaintenanceReminders = async (req, res) => {
    try {
        const today = new Date();
        const sevenDaysLater = new Date();
        sevenDaysLater.setDate(today.getDate() + 7);

        const upcomingMaintenance = await Equipment.find({
            isActive: true,
            nextMaintenanceDate: { $gte: today, $lte: sevenDaysLater }
        }).populate('lab', 'name');

        const overdueEquipment = await Equipment.find({
            isActive: true,
            nextMaintenanceDate: { $lt: today }
        }).populate('lab', 'name');

        const notifications = [];

        for (const eq of upcomingMaintenance) {
            const daysUntil = Math.ceil((new Date(eq.nextMaintenanceDate) - today) / (1000 * 60 * 60 * 24));
            await notifyByRole(['technician', 'admin'], {
                sender: req.user._id,
                type: 'maintenance_reminder',
                title: 'Maintenance Reminder',
                message: '"' + eq.name + '" in ' + (eq.lab?.name || 'Unknown Lab') + ' needs maintenance in ' + daysUntil + ' day(s)',
                link: '/technician/equipment',
                priority: daysUntil <= 2 ? 'high' : 'medium',
                relatedModel: 'Equipment',
                relatedId: eq._id
            });
            notifications.push({ equipment: eq.name, daysUntil, status: 'upcoming' });
        }

        for (const eq of overdueEquipment) {
            const daysOverdue = Math.ceil((today - new Date(eq.nextMaintenanceDate)) / (1000 * 60 * 60 * 24));
            await notifyByRole(['technician', 'admin'], {
                sender: req.user._id,
                type: 'maintenance_overdue',
                title: 'Overdue Maintenance',
                message: '"' + eq.name + '" in ' + (eq.lab?.name || 'Unknown Lab') + ' maintenance is ' + daysOverdue + ' day(s) overdue!',
                link: '/technician/equipment',
                priority: 'critical',
                relatedModel: 'Equipment',
                relatedId: eq._id
            });
            notifications.push({ equipment: eq.name, daysOverdue, status: 'overdue' });
        }

        res.json({
            success: true,
            message: 'Sent ' + notifications.length + ' maintenance reminder(s)',
            notifications
        });
    } catch (error) {
        console.error('Send maintenance reminders error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
