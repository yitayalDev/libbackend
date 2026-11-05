const AuditLog = require('../models/AuditLog');

const createAuditLog = async ({ userId, action, resource, resourceId, details, previousValue, newValue, req }) => {
    try {
        await AuditLog.create({
            user: userId,
            action,
            resource,
            resourceId,
            details,
            previousValue,
            newValue,
            ipAddress: req?.ip || req?.connection?.remoteAddress,
            userAgent: req?.headers?.['user-agent']
        });
    } catch (error) {
        console.error('Audit log error:', error);
    }
};

module.exports = { createAuditLog };
