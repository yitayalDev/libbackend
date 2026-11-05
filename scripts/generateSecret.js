/**
 * Helper script to generate secure random keys for JWT_SECRET and encryption.
 * Usage: node scripts/generateSecret.js
 */
const crypto = require('crypto');

const secret = crypto.randomBytes(64).toString('hex');
console.log('\nGenerated 64-byte Cryptographic Secret:\n');
console.log(secret);
console.log('\nCopy and paste the above string as your JWT_SECRET in backend/.env\n');

