const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Access denied. No token provided.' });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('JWT decoded:', decoded);

        // Find user
        const user = await User.findById(decoded.id);
        if (!user || !user.isActive) {
            return res.status(401).json({ message: 'User not found or deactivated.' });
        }
        console.log('Authenticated user:', { id: user._id, role: user.role, name: user.name });

        // Attach user to request
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Invalid token.' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired.' });
        }
        console.error('Auth middleware error:', error);
        res.status(500).json({ message: 'Server error.' });
    }
};

// Middleware to check user roles
const authorize = (...roles) => {
    return (req, res, next) => {
        console.log('Authorize check:', { userRole: req.user?.role, requiredRoles: roles });
        if (!req.user) {
            return res.status(401).json({ message: 'Access denied. Please login.' });
        }

        if (!roles.includes(req.user.role)) {
            console.log('Authorization failed:', { userRole: req.user.role, required: roles });
            return res.status(403).json({
                message: 'Access denied. Insufficient permissions.',
                required: roles,
                current: req.user.role
            });
        }

        console.log('Authorization passed');
        next();
    };
};

// Middleware to ensure campus admins can only manage their own campus
const campusFilter = (req, res, next) => {
    if (req.user.role === 'admin') {
        req.campusFilter = { campus: req.user.campus };
    } else if (req.user.role === 'superadmin') {
        req.campusFilter = {};
    } else {
        req.campusFilter = {};
    }
    next();
};

module.exports = {
    authenticate,
    authorize,
    campusFilter
};
