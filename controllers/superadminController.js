const AuditLog = require('../models/AuditLog');
const Campus = require('../models/Campus');
const SystemConfig = require('../models/SystemConfig');
const User = require('../models/User');
const Lab = require('../models/Lab');
const Booking = require('../models/Booking');
const Fault = require('../models/Fault');
const Equipment = require('../models/Equipment');

// @route   GET /api/superadmin/dashboard
// @desc    Get superadmin dashboard stats
// @access  Superadmin
exports.getDashboard = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({ isActive: true });
        const totalLabs = await Lab.countDocuments();
        const totalBookings = await Booking.countDocuments();
        const totalFaults = await Fault.countDocuments();
        const totalEquipment = await Equipment.countDocuments();

        const usersByRole = await User.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);

        const usersByStatus = await User.aggregate([
            { $group: { _id: '$approvalStatus', count: { $sum: 1 } } }
        ]);

        const recentRegistrations = await User.find()
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(5);

        const recentAuditLogs = await AuditLog.find()
            .populate('user', 'name username role')
            .sort({ createdAt: -1 })
            .limit(10);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const registrationTrends = await User.aggregate([
            { $match: { createdAt: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const bookingTrends = await Booking.aggregate([
            { $match: { createdAt: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const totalCampuses = await Campus.countDocuments();
        const activeCampuses = await Campus.countDocuments({ isActive: true });

        res.json({
            success: true,
            stats: {
                totalUsers,
                activeUsers,
                totalLabs,
                totalBookings,
                totalFaults,
                totalEquipment,
                totalCampuses,
                activeCampuses
            },
            usersByRole,
            usersByStatus,
            recentRegistrations,
            recentAuditLogs,
            trends: {
                registrations: registrationTrends,
                bookings: bookingTrends
            }
        });
    } catch (error) {
        console.error('Superadmin dashboard error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// --- Audit Logs ---

// @route   GET /api/superadmin/audit-logs
// @desc    Get audit logs with filtering
// @access  Superadmin
exports.getAuditLogs = async (req, res) => {
    try {
        const { action, user, resource, startDate, endDate, page = 1, limit = 1000, search } = req.query;

        let query = {};
        if (action) query.action = action;
        if (user) query.user = user;
        if (resource) query.resource = resource;
        if (search) {
            query.$or = [
                { details: { $regex: search, $options: 'i' } },
                { action: { $regex: search, $options: 'i' } }
            ];
        }
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const logs = await AuditLog.find(query)
            .populate('user', 'name username role')
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        const total = await AuditLog.countDocuments(query);

        res.json({
            success: true,
            logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/superadmin/audit-logs/actions
// @desc    Get distinct audit log action types
// @access  Superadmin
exports.getAuditLogActions = async (req, res) => {
    try {
        const actions = await AuditLog.distinct('action');
        res.json({ success: true, actions });
    } catch (error) {
        console.error('Get audit actions error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// --- Campus Management ---

// @route   GET /api/superadmin/campuses
// @desc    Get all campuses
// @access  Superadmin
exports.getCampuses = async (req, res) => {
    try {
        const campuses = await Campus.find().sort({ name: 1 });

        const campusesWithStats = await Promise.all(campuses.map(async (campus) => {
            const labCountFromDocs = await Lab.countDocuments({ 'location.building': campus.name });
            const userCount = await User.countDocuments({ campus: campus.name });
            
            // Get the admin user details if admin is assigned
            // Guard against invalid ObjectId values to prevent CastError -> 500.
            let adminInfo = null;
            if (campus.admin) {
                const isValidAdminId = /^[a-fA-F0-9]{24}$/.test(String(campus.admin));
                if (isValidAdminId) {
                    const adminUser = await User.findById(campus.admin).select('name email username');
                    if (adminUser) {
                        adminInfo = {
                            id: adminUser._id,
                            name: adminUser.name,
                            email: adminUser.email,
                            username: adminUser.username
                        };
                    }
                }
            }


            // If no Lab documents exist for this campus, fall back to stored metadata (totalLabs)
            const displayLabCount = (labCountFromDocs && labCountFromDocs > 0) ? labCountFromDocs : (campus.totalLabs || 0);

            return {
                ...campus.toObject(),
                labCount: displayLabCount,
                userCount,
                adminInfo,
                totalLabs: campus.totalLabs || 0,
                totalComputers: campus.totalComputers || 0
            };
        }));

        res.json({ success: true, campuses: campusesWithStats });
    } catch (error) {
        console.error('Get campuses error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/superadmin/campuses
// @desc    Create a campus
// @access  Superadmin
exports.createCampus = async (req, res) => {
    try {
        const { name, code, address, city, contactEmail, contactPhone, description, admin, adminName, labs, computers } = req.body;

        const normalizedCode = String(code || '').trim().toUpperCase();
        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, message: 'Campus name is required' });
        }
        if (!normalizedCode) {
            return res.status(400).json({ success: false, message: 'Campus code is required' });
        }

        const existing = await Campus.findOne({ code: normalizedCode });

        if (existing) {
            return res.status(400).json({ success: false, message: 'Campus code already exists' });
        }

        let adminUser = null;
        if (admin) {
            adminUser = await User.findById(admin);
            if (!adminUser) {
                return res.status(404).json({ success: false, message: 'Admin user not found' });
            }
        }

        const campus = await Campus.create({
            name,
            code: normalizedCode,
            address,
            city,
            contactEmail,
            contactPhone,
            description,
            admin: admin || null,
            adminName: adminUser?.name || adminName || '',
            totalLabs: labs ? parseInt(labs, 10) : 0,
            totalComputers: computers ? parseInt(computers, 10) : 0
        });

        // If admin is assigned, update the user's campus and role
        if (adminUser) {
            adminUser.campus = name;
            adminUser.role = 'admin';
            await adminUser.save();
        }

        await AuditLog.create({
            user: req.user._id,
            action: 'campus.create',
            resource: 'Campus',
            resourceId: campus._id,
            details: `Created campus: ${campus.name} (${campus.code})`,
            ipAddress: req.ip
        });

        res.status(201).json({ success: true, message: 'Campus created successfully', campus });
    } catch (error) {
        console.error('Create campus error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PUT /api/superadmin/campuses/:id
// @desc    Update a campus
// @access  Superadmin
exports.updateCampus = async (req, res) => {
    try {
        const campusId = req.params.id || req.body._id || req.body.id;
        const campus = await Campus.findById(campusId);

        if (!campus) {
            return res.status(404).json({ success: false, message: 'Campus not found' });
        }

        const { name, code, address, city, contactEmail, contactPhone, description, isActive, admin, adminName, labs, computers } = req.body;
        const previousValues = campus.toObject();

        if (name !== undefined && String(name).trim() !== '') campus.name = name;

        // Only update code if it's explicitly provided and non-empty.
        if (code !== undefined) {
            const normalizedCode = String(code || '').trim().toUpperCase();
            if (!normalizedCode) {
                return res.status(400).json({ success: false, message: 'Campus code cannot be empty' });
            }

            if (normalizedCode !== campus.code) {
                const existing = await Campus.findOne({ code: normalizedCode });
                if (existing) {
                    return res.status(400).json({ success: false, message: 'Campus code already exists' });
                }
                campus.code = normalizedCode;
            }
        }

        // Update other optional fields only when they are explicitly present.
        // Also avoid overwriting with empty string values.
        if (address !== undefined && String(address).trim() !== '') campus.address = address;
        if (city !== undefined && String(city).trim() !== '') campus.city = city;
        if (contactEmail !== undefined && String(contactEmail).trim() !== '') campus.contactEmail = contactEmail;
        if (contactPhone !== undefined && String(contactPhone).trim() !== '') campus.contactPhone = contactPhone;
        if (description !== undefined && String(description).trim() !== '') campus.description = description;
        if (isActive !== undefined) campus.isActive = isActive;

        // Update metadata fields for totals when provided
        if (labs !== undefined) {
            const parsed = parseInt(labs, 10);
            if (!isNaN(parsed)) campus.totalLabs = parsed;
        }

        if (computers !== undefined) {
            const parsedC = parseInt(computers, 10);
            if (!isNaN(parsedC)) campus.totalComputers = parsedC;
        }

        // Handle admin assignment
        const previousAdmin = campus.admin;
        if (admin !== undefined) {
            campus.admin = admin || null;

            if (previousAdmin && previousAdmin.toString() !== admin) {
                const previousAdminUser = await User.findById(previousAdmin);
                if (previousAdminUser && previousAdminUser.role === 'admin') {
                    previousAdminUser.role = 'technician';
                    await previousAdminUser.save();
                }
            }

            if (admin) {
                const adminUser = await User.findById(admin);
                if (!adminUser) {
                    return res.status(404).json({ success: false, message: 'Admin user not found' });
                }

                adminUser.campus = campus.name;
                adminUser.role = 'admin';
                await adminUser.save();

                campus.adminName = adminUser.name;
            } else {
                campus.adminName = '';
            }
        }


        await campus.save();

        await AuditLog.create({
            user: req.user._id,
            action: 'campus.update',
            resource: 'Campus',
            resourceId: campus._id,
            details: `Updated campus: ${campus.name}`,
            previousValue: previousValues,
            newValue: campus.toObject(),
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Campus updated successfully', campus });
    } catch (error) {
        console.error('Update campus error:', error);
        if (error.name === 'CastError') {
            return res.status(400).json({ success: false, message: 'Invalid campus ID' });
        }
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   DELETE /api/superadmin/campuses/:id
// @desc    Delete a campus (soft delete)
// @access  Superadmin
exports.deleteCampus = async (req, res) => {
    try {
        const campus = await Campus.findById(req.params.id);
        if (!campus) {
            return res.status(404).json({ success: false, message: 'Campus not found' });
        }

        campus.isActive = false;
        await campus.save();

        await AuditLog.create({
            user: req.user._id,
            action: 'campus.delete',
            resource: 'Campus',
            resourceId: campus._id,
            details: `Deactivated campus: ${campus.name}`,
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Campus deactivated successfully' });
    } catch (error) {
        console.error('Delete campus error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// --- Role Management ---

// @route   GET /api/superadmin/roles
// @desc    Get role distribution and user counts
// @access  Superadmin
exports.getRoleDistribution = async (req, res) => {
    try {
        const roles = ['student', 'teacher', 'technician', 'admin', 'superadmin'];

        const distribution = await Promise.all(roles.map(async (role) => {
            const count = await User.countDocuments({ role });
            const activeCount = await User.countDocuments({ role, isActive: true });
            const users = await User.find({ role })
                .select('name username email isActive approvalStatus createdAt')
                .sort({ createdAt: -1 })
                .limit(10);
            return { role, count, activeCount, users };
        }));

        res.json({ success: true, distribution });
    } catch (error) {
        console.error('Get role distribution error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PUT /api/superadmin/roles/:userId
// @desc    Change user role (superadmin can change any role including to admin)
// @access  Superadmin
exports.changeUserRole = async (req, res) => {
    try {
        const { role } = req.body;
        const validRoles = ['student', 'teacher', 'technician', 'admin', 'superadmin'];

        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, message: 'Invalid role' });
        }

        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const previousRole = user.role;
        user.role = role;
        await user.save();

        await AuditLog.create({
            user: req.user._id,
            action: 'user.role_change',
            resource: 'User',
            resourceId: user._id,
            details: `Changed role of ${user.name} from ${previousRole} to ${role}`,
            previousValue: { role: previousRole },
            newValue: { role },
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: `User role changed from ${previousRole} to ${role}`,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('Change role error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// --- System Configuration ---

// @route   GET /api/superadmin/config
// @desc    Get all system configurations
// @access  Superadmin
exports.getConfigs = async (req, res) => {
    try {
        const { category } = req.query;
        let query = {};
        if (category) query.category = category;

        let configs = await SystemConfig.find(query).sort({ category: 1, key: 1 });

        if (configs.length === 0) {
            const defaultConfigs = [
                { key: 'booking.maxPerUser', value: 5, category: 'booking', description: 'Maximum bookings per user per day' },
                { key: 'booking.maxDuration', value: 4, category: 'booking', description: 'Maximum booking duration in hours' },
                { key: 'booking.advanceDays', value: 14, category: 'booking', description: 'Days in advance users can book' },
                { key: 'booking.cancellationHours', value: 2, category: 'booking', description: 'Hours before booking to allow cancellation' },
                { key: 'system.maintenanceMode', value: false, category: 'system', description: 'Enable maintenance mode' },
                { key: 'system.maintenanceMessage', value: 'System is under maintenance. Please check back later.', category: 'system', description: 'Maintenance mode message' },
                { key: 'system.sessionTimeout', value: 30, category: 'security', description: 'Session timeout in minutes' },
                { key: 'system.maxLoginAttempts', value: 5, description: 'Maximum login attempts before lockout', category: 'security' },
                { key: 'notification.emailEnabled', value: true, category: 'notification', description: 'Enable email notifications' },
                { key: 'display.itemsPerPage', value: 20, category: 'display', description: 'Default items per page' }
            ];
            await SystemConfig.insertMany(defaultConfigs);
            configs = await SystemConfig.find(query).sort({ category: 1, key: 1 });
        }

        res.json({ success: true, configs });
    } catch (error) {
        console.error('Get configs error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PUT /api/superadmin/config/:key
// @desc    Update a system configuration
// @access  Superadmin
exports.updateConfig = async (req, res) => {
    try {
        const config = await SystemConfig.findOne({ key: req.params.key });
        if (!config) {
            return res.status(404).json({ success: false, message: 'Configuration not found' });
        }

        const previousValue = config.value;
        config.value = req.body.value;
        config.updatedBy = req.user._id;
        await config.save();

        await AuditLog.create({
            user: req.user._id,
            action: 'config.update',
            resource: 'SystemConfig',
            resourceId: config._id,
            details: `Updated config ${config.key}`,
            previousValue: { value: previousValue },
            newValue: { value: req.body.value },
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Configuration updated', config });
    } catch (error) {
        console.error('Update config error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/superadmin/config
// @desc    Create a new system configuration
// @access  Superadmin
exports.createConfig = async (req, res) => {
    try {
        const { key, value, category, description } = req.body;

        const existing = await SystemConfig.findOne({ key });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Configuration key already exists' });
        }

        const config = await SystemConfig.create({
            key, value, category: category || 'system', description, updatedBy: req.user._id
        });

        res.status(201).json({ success: true, message: 'Configuration created', config });
    } catch (error) {
        console.error('Create config error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/superadmin/reset-password-by-phone
// @desc    Reset user password by phone number without verification code (Superadmin only)
// @access  Superadmin
exports.resetPasswordByPhone = async (req, res) => {
    try {
        const { phone, newPassword } = req.body;

        if (!phone || !newPassword) {
            return res.status(400).json({ success: false, message: 'Phone number and new password are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }

        const user = await User.findOne({ phone });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found with this phone number' });
        }

        // Prevent superadmin from resetting another superadmin's password
        if (user.role === 'superadmin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Cannot reset superadmin password' });
        }

        user.password = newPassword;
        await user.save();

        await AuditLog.create({
            user: req.user._id,
            action: 'user.password_reset_admin',
            resource: 'User',
            resourceId: user._id,
            details: `Superadmin reset password for user: ${user.name} (${user.username}) via phone`, 
            previousValue: { password: '***' },
            newValue: { password: '***' },
            ipAddress: req.ip
        });

        res.json({ 
            success: true, 
            message: `Password for ${user.name} (${user.username}) has been reset successfully`
        });
    } catch (error) {
        console.error('Reset password by phone error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
