const logger = require('../utils/logger');
const AuditLog = require('../models/AuditLog');

const errorHandler = (err, req, res, next) => {
    // Ensure err is an Error object
    let safeErr = err;
    if (!safeErr || !(safeErr instanceof Error)) {
        safeErr = new Error(safeErr ?? 'Unknown error');
    }

    // Ensure the real error is visible in console immediately
    console.error('[ERROR_HANDLER]', {
        message: safeErr?.message,
        name: safeErr?.name,
        stack: safeErr?.stack,
        method: req?.method,
        path: req?.originalUrl,
        body: req?.body,
        ip: req?.ip
    });

    logger.error('API Error', {
        error: safeErr.message,
        stack: safeErr.stack,
        method: req.method,
        path: req.originalUrl,
        body: req.body,
        ip: req.ip
    });


    // Determine error category and severity
    let auditAction = null;
    let auditDetails = null;
    let severity = 'low';

    // Authentication errors (401)
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        auditAction = 'auth.error';
        auditDetails = `Authentication error: ${err.message}`;
        severity = 'medium';
    } else if (res.statusCode === 401) {
        auditAction = 'auth.failed_login';
        auditDetails = `Authentication failed: ${err.message}`;
        severity = 'medium';
    }
    // Authorization errors (403)
    else if (res.statusCode === 403) {
        auditAction = 'security.access_denied';
        auditDetails = `Access denied: ${err.message}`;
        severity = 'high';
    }
    // Validation errors
    else if (err.name === 'ValidationError') {
        auditAction = 'system.validation_error';
        auditDetails = `Validation error: ${Object.values(err.errors).map(e => e.message).join(', ')}`;
        severity = 'low';
    }
    // Duplicate key errors (potential injection or conflict)
    else if (err.code === 11000) {
        auditAction = 'system.duplicate_conflict';
        auditDetails = `Duplicate key conflict: ${JSON.stringify(err.keyValue)}`;
        severity = 'medium';
    }
    // Server errors (500)
    else if (res.statusCode === 500 || !res.statusCode) {
        auditAction = 'system.error';
        auditDetails = `Internal server error: ${err.message}`;
        severity = 'high';
    }

    // Create audit log for security/significant errors (async, don't block response)
    if (auditAction && req.user) {
        AuditLog.create({
            user: req.user._id,
            action: auditAction,
            resource: 'System',
            details: auditDetails,
            ipAddress: req.ip,
            userAgent: req.headers?.['user-agent']
        }).catch(auditErr => {
            logger.error('Failed to create audit log for error:', auditErr);
        });
    } else if (auditAction) {
        // Log even without authenticated user (e.g., login failures)
        AuditLog.create({
            user: null,
            action: auditAction,
            resource: 'System',
            details: `${auditDetails} - IP: ${req.ip}, Path: ${req.originalUrl}`,
            ipAddress: req.ip,
            userAgent: req.headers?.['user-agent']
        }).catch(auditErr => {
            logger.error('Failed to create audit log for error:', auditErr);
        });
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(val => val.message);
        return res.status(400).json({
            success: false,
            message: 'Validation Error',
            errors: messages
        });
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return res.status(400).json({
            success: false,
            message: `${field} already exists`,
            errors: [`${field} must be unique`]
        });
    }

    // Mongoose cast error (invalid ObjectId)
    if (err.name === 'CastError') {
        return res.status(400).json({
            success: false,
            message: `Invalid ${err.path}: ${err.value}`
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Token expired'
        });
    }

    // Default error
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
