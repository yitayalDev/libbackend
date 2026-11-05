// Import all models
const User = require('./User');
const Lab = require('./Lab');
const Booking = require('./Booking');
const Reservation = require('./Reservation');
const Fault = require('./Fault');
const Equipment = require('./Equipment');
const Material = require('./Material');
const Attendance = require('./Attendance');
const AttendanceSession = require('./AttendanceSession');
const AuditLog = require('./AuditLog');
const Campus = require('./Campus');
const SystemConfig = require('./SystemConfig');

module.exports = {
    User,
    Lab,
    Booking,
    Reservation,
    Fault,
    Equipment,
    Material,
    Attendance,
    AttendanceSession,
    AuditLog,
    Campus,
    SystemConfig
};
