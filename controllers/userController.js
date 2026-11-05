const User = require('../models/User');
const logger = require('../utils/logger');
const AuditLog = require('../models/AuditLog');

// @route   POST /api/users
// @desc    Create a new user (admin only)
// @access  Admin/Superadmin
exports.createUser = async (req, res) => {
    try {
        const { username, email, password, firstName, lastName, name, role, department, studentId, phone, campus, college } = req.body;
        
        const userRole = String(role || 'student').toLowerCase(); // Moved up for use in existingUserQuery

        // Check for existing user (username, email, and studentId for students)
        const existingUserQuery = {
            $or: [
                { email: String(email || '').toLowerCase() }, 
                { username: String(username || '').toLowerCase() }
            ] 
        };

        if (userRole === 'student' && studentId) {
            existingUserQuery.$or.push({ studentId: String(studentId).trim().toUpperCase() });
        }

        const existingUser = await User.findOne(existingUserQuery);

        if (existingUser) {
            let message = 'User with this email or username already exists';
            if (existingUser.email.toLowerCase() === String(email || '').toLowerCase()) message = 'User with this email already exists';
            else if (existingUser.username.toLowerCase() === String(username || '').toLowerCase()) message = 'User with this username already exists';
            else if (userRole === 'student' && existingUser.studentId === String(studentId).trim().toUpperCase()) message = 'User with this Student ID already exists';
            return res.status(400).json({ success: false, message });
        }

        // Campus admins can only create users for their campus
        let userCampus = (campus && String(campus).trim()) ? String(campus).trim() : '';
        if (req.user.role === 'admin') {
            userCampus = req.user.campus || '';
        }

        // Generate full name from firstName and lastName if provided
        const finalFirstName = String(firstName || '').trim();
        const finalLastName = String(lastName || '').trim();
        const fullName = (finalFirstName && finalLastName) ? `${finalFirstName} ${finalLastName}` : String(name || '').trim(); // userRole already defined

        const user = await User.create({
            username: String(username || '').toLowerCase(),
            email: String(email || '').toLowerCase(),
            password,
            firstName: finalFirstName,
            lastName: finalLastName,
            name: fullName,
            role: userRole,
            department: String(department || '').trim(),
            studentId: (userRole === 'student' && studentId != null && String(studentId).trim()) ? String(studentId).trim().toUpperCase() : undefined,
            phone: String(phone || '').trim(),
            campus: userCampus,
            college: String(college || '').trim(),
            isActive: true,
            approvalStatus: 'approved'
        });

        // Audit log for user creation
        await AuditLog.create({
            user: req.user._id,
            action: 'user.create',
            resource: 'User',
            resourceId: user._id,
            details: `Created user: ${user.name} (${user.role}) at ${user.campus}`,
            previousValue: null,
            newValue: { username: user.username, email: user.email, role: user.role, campus: user.campus },
            ipAddress: req.ip
        });

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user: user.toJSON()
        });
    } catch (error) {
        console.error('Create user error:', error);

        // Handle duplicate key errors (e.g., if a unique index exists on studentId in DB)
        if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            let message = `A user with this ${field} already exists.`;
            if (field === 'username') message = 'Username already exists.';
            if (field === 'email') message = 'Email already exists.';
            if (field === 'studentId') message = 'Student ID already exists.';
            return res.status(400).json({
                success: false,
                message: message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }

        // Handle Mongoose validation errors
        if (error?.name === 'ValidationError') {
            const validationErrors = Object.keys(error.errors).map((key) => error.errors[key]?.message).filter(Boolean);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validationErrors.length ? validationErrors : ['Invalid input'],
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined

            });
        }

        res.status(500).json({ 
            success: false,
            message: 'Server error during user creation: ' + error.message,
            errors: error.errors ? Object.keys(error.errors).map(key => error.errors[key].message) : [],
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};


// @route   GET /api/users
// @desc    Get all users (admin only)
// @access  Admin/Superadmin
exports.getAllUsers = async (req, res) => {
    try {
        if (!req.user?.role) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const { role, search, approvalStatus, page = 1, limit = 1000 } = req.query;

        // Normalize and clean query parameters
        const safeRole = (typeof role === 'string' && role.trim()) ? role.trim().toLowerCase() : undefined;
        const safeApprovalStatus = (typeof approvalStatus === 'string' && approvalStatus.trim()) ? approvalStatus.trim().toLowerCase() : undefined;
        const safeSearch = (typeof search === 'string' && search.trim()) ? search.trim() : undefined;


        const currentPage = parseInt(page) || 1;
        const currentLimit = parseInt(limit) || 1000;

        let query = {};

        // Campus admins can only see users from their campus
        if (req.user.role === 'admin') {
            query.campus = req.user.campus;
            // Admins can only manage students, teachers, and technicians
            query.role = { $in: ['student', 'teacher', 'technician'] };
        }

        if (safeRole) query.role = safeRole;
        if (safeApprovalStatus) query.approvalStatus = safeApprovalStatus;
        if (safeSearch) {
            query.$or = [
                { name: { $regex: safeSearch, $options: 'i' } },
                { firstName: { $regex: safeSearch, $options: 'i' } },
                { lastName: { $regex: safeSearch, $options: 'i' } },
                { username: { $regex: safeSearch, $options: 'i' } },
                { email: { $regex: safeSearch, $options: 'i' } },
                { studentId: { $regex: safeSearch, $options: 'i' } },
                { phone: { $regex: safeSearch, $options: 'i' } },
                { department: { $regex: safeSearch, $options: 'i' } },
                { campus: { $regex: safeSearch, $options: 'i' } }
            ];
        }


        const skip = (currentPage - 1) * currentLimit;

        const users = await User.find(query)
            .select('-password')
            .skip(skip)
            .limit(currentLimit)
            .sort({ role: 1, createdAt: 1 });

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            users,
            pagination: {
                page: currentPage,
                limit: currentLimit,
                total,
                pages: Math.ceil(total / currentLimit)
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: process.env.NODE_ENV === 'development' ? (error?.message || 'Server error') : 'Server error',
            ...(process.env.NODE_ENV === 'development' && error?.stack ? { stack: error.stack } : {})
        });
    }
};


// @route   GET /api/users/students
// @desc    Get students by year, semester, department
// @access  Teacher/Admin
exports.getStudentsByFilter = async (req, res) => {
    try {
        const { year, semester, department, campus, limit = 1000 } = req.query;

        let query = { role: 'student', isActive: true };

        if (year) query.year = parseInt(year);
        if (semester) query.semester = parseInt(semester);
        if (department) query.department = department;
        if (campus) query.campus = campus;

        const users = await User.find(query)
            .select('firstName lastName username email studentId year semester department campus')
            .limit(parseInt(limit) || 1000)
            .sort({ firstName: 1, lastName: 1 });

        res.json({ success: true, users, total: users.length });
    } catch (error) {
        console.error('Get students error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private
exports.getUserById = async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'superadmin' &&
            req.user._id.toString() !== req.params.id) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private
exports.updateUser = async (req, res) => {
    try {
        if (req.user.role !== 'admin' && req.user.role !== 'superadmin' &&
            req.user._id.toString() !== req.params.id) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const { firstName, lastName, name, email, phone, department, studentId, campus, college } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const previousValues = user.toObject();

        if (firstName !== undefined) user.firstName = firstName;
        if (lastName !== undefined) user.lastName = lastName;
        
        if (firstName !== undefined || lastName !== undefined) {
            user.name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        } else if (name) {
            user.name = name;
        }
        
        if (email) user.email = email;
        if (phone) user.phone = phone;
        if (department) user.department = department;
        if (campus) user.campus = campus;
        if (college) user.college = college;
        if (studentId && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
            user.studentId = studentId;
        }

        await user.save();

        // Audit log for user update
        await AuditLog.create({
            user: req.user._id,
            action: 'user.update',
            resource: 'User',
            resourceId: user._id,
            details: `Updated user: ${user.name}`,
            previousValue: { firstName: previousValues.firstName, lastName: previousValues.lastName, email: previousValues.email, campus: previousValues.campus },
            newValue: { firstName: user.firstName, lastName: user.lastName, email: user.email, campus: user.campus },
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: 'User updated successfully',
            user: user.toJSON()
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PUT /api/users/:id/role
// @desc    Update user role (admin only)
// @access  Admin/Superadmin
exports.updateUserRole = async (req, res) => {
    try {
        const { role } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.role === 'superadmin') {
            return res.status(403).json({ success: false, message: 'Cannot modify superadmin' });
        }

        user.role = role;
        await user.save();

        res.json({
            success: true,
            message: 'User role updated successfully',
            user: user.toJSON()
        });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PUT /api/users/:id/approve
// @desc    Approve a pending user (admin only)
// @access  Admin/Superadmin
exports.approveUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Campus admins can only approve users from their campus
        if (req.user.role === 'admin' && user.campus !== req.user.campus) {
            return res.status(403).json({ success: false, message: 'You can only manage users from your campus' });
        }

        user.approvalStatus = 'approved';
        user.isActive = true;
        await user.save();

        // Audit log for user approval
        await AuditLog.create({
            user: req.user._id,
            action: 'user.approve',
            resource: 'User',
            resourceId: user._id,
            details: `Approved user: ${user.name}`,
            previousValue: { approvalStatus: 'pending', isActive: false },
            newValue: { approvalStatus: 'approved', isActive: true },
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: `User ${user.name} has been approved`,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('Approve user error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PUT /api/users/:id/reject
// @desc    Reject a pending user (admin only)
// @access  Admin/Superadmin
exports.rejectUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Campus admins can only reject users from their campus
        if (req.user.role === 'admin' && user.campus !== req.user.campus) {
            return res.status(403).json({ success: false, message: 'You can only manage users from your campus' });
        }

        user.approvalStatus = 'rejected';
        user.isActive = false;
        await user.save();

        // Audit log for user rejection
        await AuditLog.create({
            user: req.user._id,
            action: 'user.reject',
            resource: 'User',
            resourceId: user._id,
            details: `Rejected user: ${user.name}`,
            previousValue: { approvalStatus: 'pending', isActive: true },
            newValue: { approvalStatus: 'rejected', isActive: false },
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: `User ${user.name} has been rejected`,
            user: user.toJSON()
        });
    } catch (error) {
        console.error('Reject user error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PUT /api/users/:id/reset-password
// @desc    Reset user password (admin only)
// @access  Admin/Superadmin
exports.resetUserPassword = async (req, res) => {
    try {
        const { newPassword } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Campus admins can only reset passwords for users from their campus
        if (req.user.role === 'admin' && user.campus !== req.user.campus) {
            return res.status(403).json({ success: false, message: 'You can only manage users from your campus' });
        }

        if (user.role === 'superadmin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Cannot reset superadmin password' });
        }

        user.password = newPassword;
        await user.save();

        // Audit log for admin password reset
        await AuditLog.create({
            user: req.user._id,
            action: 'user.password_reset_admin',
            resource: 'User',
            resourceId: user._id,
            details: `Admin reset password for user: ${user.name}`,
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: `Password for ${user.name} has been reset successfully`
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   DELETE /api/users/:id
// @desc    Delete user (hard delete)
// @access  Admin/Superadmin
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Campus admins can only delete users from their campus
        if (req.user.role === 'admin' && user.campus !== req.user.campus) {
            return res.status(403).json({ success: false, message: 'You can only manage users from your campus' });
        }

        if (user.role === 'superadmin') {
            return res.status(403).json({ success: false, message: 'Cannot delete superadmin' });
        }

        const userName = user.name;

        // Hard delete the user document.
        await User.deleteOne({ _id: user._id });

        // Audit log for user deletion


        await AuditLog.create({
            user: req.user._id,
            action: 'user.delete',
            resource: 'User',
            resourceId: user._id,
            details: `Deleted user: ${userName}`,
            previousValue: null,
            newValue: null,
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: error?.message || 'Server error'
        });
    }
};



// @route   PUT /api/users/:id/toggle-status
// @desc    Toggle user active status (own account)
// @access  Private
exports.toggleUserStatus = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Only allow users to toggle their own account
        if (req.user._id.toString() !== req.params.id) {
            return res.status(403).json({ success: false, message: 'You can only toggle your own account status' });
        }

        // Superadmin cannot be deactivated
        if (user.role === 'superadmin') {
            return res.status(403).json({ success: false, message: 'Superadmin account cannot be deactivated' });
        }

        const previousStatus = user.isActive;
        user.isActive = !user.isActive;
        await user.save();

        // Audit log for user status toggle
        await AuditLog.create({
            user: req.user._id,
            action: 'user.status_toggle',
            resource: 'User',
            resourceId: user._id,
            details: `${user.isActive ? 'Activated' : 'Deactivated'} user account: ${user.name}`,
            previousValue: { isActive: previousStatus },
            newValue: { isActive: user.isActive },
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: user.isActive ? 'Account activated successfully' : 'Account deactivated successfully',
            user: user.toJSON()
        });
    } catch (error) {
        console.error('Toggle user status error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
