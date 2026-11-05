const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '24h';

/**
 * Generate JWT token
 * @param {Object} payload - Data to encode in token
 * @returns {string} JWT token
 */
const generateToken = (payload, expiresIn = JWT_EXPIRE) => {
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn
    });
};

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};

/**
 * Generate password reset token
 * @param {string} userId - User ID
 * @returns {string} Reset token
 */
const generateResetToken = (userId) => {
    return jwt.sign(
        { id: userId, type: 'password-reset' },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
};

module.exports = {
    generateToken,
    verifyToken,
    generateResetToken
};
