const Reservation = require('../models/Reservation');
const Booking = require('../models/Booking');

const toClockTime = (value) => {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
    }
    return String(value);
};

const combineDateAndTime = (dateValue, timeValue) => {
    if (!dateValue || !timeValue) return null;

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;

    const [hours, minutes] = String(timeValue).split(':').map(Number);
    date.setHours(hours || 0, minutes || 0, 0, 0);
    return date;
};

const isCurrentTimeWithinRange = (dateValue, startTime, endTime, now = new Date()) => {
    const start = combineDateAndTime(dateValue, startTime);
    const end = combineDateAndTime(dateValue, endTime);

    if (!start || !end) return false;
    return now >= start && now < end;
};

const getDateBounds = (baseDate = new Date()) => {
    const start = new Date(baseDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(baseDate);
    end.setHours(23, 59, 59, 999);

    return { start, end };
};

const buildAvailabilityMaps = async (labIds, now = new Date()) => {
    const normalizedLabIds = [...new Set((labIds || []).filter(Boolean).map(id => String(id)))];
    if (normalizedLabIds.length === 0) {
        return {
            activeReservationsByLab: new Map(),
            activeReservationsByRoom: new Map(),
            activeBookingsByWorkstation: new Map()
        };
    }

    const { start, end } = getDateBounds(now);

    const [reservations, bookings] = await Promise.all([
        Reservation.find({
            lab: { $in: normalizedLabIds },
            status: 'approved',
            date: { $gte: start, $lte: end }
        }).select('lab roomId roomName courseName courseCode date startTime endTime teacher'),
        Booking.find({
            lab: { $in: normalizedLabIds },
            status: { $in: ['pending', 'confirmed'] },
            date: { $gte: start, $lte: end }
        }).select('lab workstation date startTime endTime status user')
    ]);

    const activeReservationsByLab = new Map();
    const activeReservationsByRoom = new Map();
    const activeBookingsByWorkstation = new Map();

    reservations.forEach(reservation => {
        if (!isCurrentTimeWithinRange(reservation.date, reservation.startTime, reservation.endTime, now)) {
            return;
        }

        const reservationInfo = {
            _id: reservation._id,
            roomId: reservation.roomId || null,
            roomName: reservation.roomName || null,
            courseName: reservation.courseName,
            courseCode: reservation.courseCode,
            startTime: reservation.startTime,
            endTime: reservation.endTime
        };

        if (reservation.roomId) {
            activeReservationsByRoom.set(String(reservation.roomId), reservationInfo);
        } else {
            activeReservationsByLab.set(String(reservation.lab), reservationInfo);
        }
    });

    bookings.forEach(booking => {
        if (!isCurrentTimeWithinRange(booking.date, booking.startTime, booking.endTime, now)) {
            return;
        }

        const workstationId = booking?.workstation?.workstationId;
        if (!workstationId) return;

        activeBookingsByWorkstation.set(String(workstationId), {
            _id: booking._id,
            startTime: booking.startTime,
            endTime: booking.endTime,
            status: booking.status
        });
    });

    return {
        activeReservationsByLab,
        activeReservationsByRoom,
        activeBookingsByWorkstation
    };
};

const applyDynamicAvailabilityToLab = (lab, availabilityMaps) => {
    if (!lab) return lab;

    const plainLab = typeof lab.toObject === 'function' ? lab.toObject() : { ...lab };
    const labId = String(plainLab._id);
    const labReservation = availabilityMaps.activeReservationsByLab.get(labId) || null;

    const decorateWorkstation = (workstation, roomReservation = null) => {
        const plainWorkstation = typeof workstation?.toObject === 'function'
            ? workstation.toObject()
            : { ...workstation };

        const booking = availabilityMaps.activeBookingsByWorkstation.get(String(plainWorkstation._id)) || null;
        const manuallyUnavailable = ['maintenance', 'broken', 'occupied'].includes(plainWorkstation.status);
        const temporarilyReserved = Boolean(roomReservation || labReservation || booking);

        return {
            ...plainWorkstation,
            isTemporarilyInactive: temporarilyReserved,
            isActive: plainWorkstation.isActive !== false && !temporarilyReserved,
            status: manuallyUnavailable
                ? plainWorkstation.status
                : temporarilyReserved
                    ? 'reserved'
                    : 'available',
            activeBooking: booking
        };
    };

    plainLab.rooms = (plainLab.rooms || []).map(room => {
        const roomReservation = availabilityMaps.activeReservationsByRoom.get(String(room._id)) || null;
        const effectiveReservation = roomReservation || labReservation;
        const decoratedWorkstations = (room.workstations || []).map(ws => decorateWorkstation(ws, effectiveReservation));

        return {
            ...room,
            isTemporarilyInactive: Boolean(effectiveReservation),
            isActive: !effectiveReservation,
            activeReservation: effectiveReservation,
            workstations: decoratedWorkstations
        };
    });

    plainLab.workstations = (plainLab.workstations || []).map(ws => decorateWorkstation(ws, labReservation));
    plainLab.isTemporarilyInactive = Boolean(labReservation);
    plainLab.activeReservation = labReservation;

    return plainLab;
};

module.exports = {
    buildAvailabilityMaps,
    applyDynamicAvailabilityToLab,
    isCurrentTimeWithinRange
};
