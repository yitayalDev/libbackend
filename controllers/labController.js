const Lab = require('../models/Lab');
const Booking = require('../models/Booking');
const Reservation = require('../models/Reservation');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const AuditLog = require('../models/AuditLog');
const { buildAvailabilityMaps, applyDynamicAvailabilityToLab } = require('../utils/resourceAvailability');

// Optional auth - tries to verify token but doesn't fail if not present
const optionalAuth = async (req) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id);
            if (user && user.isActive) {
                return user;
            }
        }
    } catch (e) {
        logger.warn('Optional auth failed', { error: e.message });
    }
    return null;
};

// @route   GET /api/labs
// @desc    Get all labs
// @access  Public
exports.getAllLabs = async (req, res) => {
    try {
        const { status, search, campus, page = 1, limit = 1000, all } = req.query;

        // Optional authentication to identify admin users
        const currentUser = await optionalAuth(req);

        const currentPage = parseInt(page) || 1;
        const currentLimit = parseInt(limit) || 1000;
        const skip = (currentPage - 1) * currentLimit;

        let query = {};

        // Campus admins and technicians can only see their own campus labs
        if (currentUser && currentUser.role === 'admin' && currentUser.campus) {
            query.campus = currentUser.campus;
        } else if (currentUser && currentUser.role === 'technician' && currentUser.campus) {
            query.campus = currentUser.campus;
        } else if (campus) {
            query.campus = campus;
        }

        // Default to active only, unless 'all' is requested (intended for admin management)
        if (all !== 'true') {
            query.isActive = true;
        }

        if (status) query.status = status;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } },
                { campus: { $regex: search, $options: 'i' } },
                { 'location.building': { $regex: search, $options: 'i' } },
                { 'location.floor': { $regex: search, $options: 'i' } },
                { 'location.roomNumber': { $regex: search, $options: 'i' } },
                { facilities: { $in: [new RegExp(search, 'i')] } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const labs = await Lab.find(query)
            .populate('supervisor', 'name email')
            .skip(skip)
            .limit(currentLimit)
            .sort({ name: 1 });

        const availabilityMaps = await buildAvailabilityMaps(labs.map(lab => lab._id));
        const decoratedLabs = labs.map(lab => applyDynamicAvailabilityToLab(lab, availabilityMaps));

        const total = await Lab.countDocuments(query);

        res.json({
            success: true,
            labs: decoratedLabs,
            pagination: {
                page: currentPage,
                limit: currentLimit,
                total,
                pages: Math.ceil(total / currentLimit)
            }
        });
    } catch (error) {
        console.error('Get labs error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/labs/:id
// @desc    Get lab by ID
// @access  Public
exports.getLabById = async (req, res) => {
    try {
        const lab = await Lab.findById(req.params.id).populate('supervisor', 'name email');
        if (!lab) {
            return res.status(404).json({ success: false, message: 'Lab not found' });
        }
        const availabilityMaps = await buildAvailabilityMaps([lab._id]);
        res.json({ success: true, lab: applyDynamicAvailabilityToLab(lab, availabilityMaps) });
    } catch (error) {
        console.error('Get lab error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/labs/campus/:campus
// @desc    Get all labs for a specific campus
// @access  Public
exports.getLabsByCampus = async (req, res) => {
    try {
        const { campus } = req.params;
        const { all } = req.query;

        let query = { campus };
        
        // Default to active only, unless 'all' is requested (intended for admin management)
        if (all !== 'true') {
            query.isActive = true;
        }

        const labs = await Lab.find(query)
            .populate('supervisor', 'name email')
            .sort({ name: 1 });
        const availabilityMaps = await buildAvailabilityMaps(labs.map(lab => lab._id));
        res.json({ success: true, labs: labs.map(lab => applyDynamicAvailabilityToLab(lab, availabilityMaps)) });
    } catch (error) {
        console.error('Get labs by campus error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/labs/:id/rooms
// @desc    Get rooms for a lab with workstation details
// @access  Public
exports.getLabRooms = async (req, res) => {
    try {
        const lab = await Lab.findById(req.params.id);
        if (!lab) {
            return res.status(404).json({ success: false, message: 'Lab not found' });
        }

        const availabilityMaps = await buildAvailabilityMaps([lab._id]);
        const decoratedLab = applyDynamicAvailabilityToLab(lab, availabilityMaps);

        // Get all workstations from the lab level as fallback
        const labWorkstations = decoratedLab.workstations || [];

        const roomStats = (decoratedLab.rooms || []).map(room => {
            // Use room workstations if available, otherwise use lab workstations
            let ws = room.workstations || [];

            // If room has no workstations but has capacity, generate from lab workstations
            if (ws.length === 0 && room.capacity > 0 && labWorkstations.length > 0) {
                // Get workstations based on room capacity (split from lab workstations)
                const startIdx = 0; // Could be adjusted based on room order
                ws = labWorkstations.slice(startIdx, startIdx + room.capacity);
            }

            const available = ws.filter(w => w.status === 'available').length;
            const occupied = ws.filter(w => w.status === 'occupied').length;
            const maintenance = ws.filter(w => w.status === 'maintenance').length;
            const reserved = ws.filter(w => w.status === 'reserved').length;

            return {
                _id: room._id,
                name: room.name,
                type: room.type,
                capacity: room.capacity,
                workstations: ws,
                stats: { available, occupied, maintenance, reserved, total: ws.length }
            };
        });

        res.json({
            success: true,
            rooms: roomStats,
            lab: {
                name: decoratedLab.name,
                campus: decoratedLab.campus,
                isTemporarilyInactive: decoratedLab.isTemporarilyInactive,
                activeReservation: decoratedLab.activeReservation
            }
        });
    } catch (error) {
        console.error('Get lab rooms error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/labs/:id/workstations
// @desc    Get workstations for a lab
// @access  Public
exports.getWorkstations = async (req, res) => {
    try {
        const lab = await Lab.findById(req.params.id);
        if (!lab) {
            return res.status(404).json({ success: false, message: 'Lab not found' });
        }
        const availabilityMaps = await buildAvailabilityMaps([lab._id]);
        const decoratedLab = applyDynamicAvailabilityToLab(lab, availabilityMaps);
        res.json({ success: true, workstations: decoratedLab.workstations });
    } catch (error) {
        console.error('Get workstations error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PUT /api/labs/:id/workstations/:workstationId
// @desc    Update workstation status (technician manually checks and updates)
// @access  Technician/Admin
exports.updateWorkstationStatus = async (req, res) => {
    try {
        const { status, notes } = req.body;
        
        console.log('=== UPDATE WORKSTATION STATUS ===');
        console.log('User:', req.user);
        console.log('Lab ID:', req.params.id);
        console.log('Workstation ID:', req.params.workstationId);
        console.log('New status:', status);
        
        const validStatuses = ['available', 'occupied', 'reserved', 'maintenance', 'broken'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        // Check if user is authenticated
        if (!req.user) {
            console.log('ERROR: No user in request');
            return res.status(401).json({ success: false, message: 'Please login first' });
        }

        const lab = await Lab.findById(req.params.id);
        if (!lab) {
            console.log('ERROR: Lab not found:', req.params.id);
            return res.status(404).json({ success: false, message: 'Lab not found' });
        }

        console.log('Lab found:', lab.name);
        console.log('User role:', req.user.role);

// Authorization check: allow technicians to update status for their campus labs.
        // Admin and superadmin keep override access for operations support.
        // Handle both cases: supervisor could be string ID or populated object
        const supervisorId = lab.supervisor 
            ? (typeof lab.supervisor === 'string' ? lab.supervisor : lab.supervisor._id?.toString())
            : null;
        const isSupervisor = supervisorId === req.user._id.toString();
        const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
        
        // All technicians can update status (simplified check for Computer Check feature)
        // We allow any authenticated technician to update status
        const isTechnician = req.user.role === 'technician';
        
        console.log('Supervisor ID:', supervisorId);
        console.log('User ID:', req.user._id.toString());
        console.log('isSupervisor:', isSupervisor, 'isAdmin:', isAdmin, 'isTechnician:', isTechnician);

        if (!isAdmin && !isSupervisor && !isTechnician) {
            console.log('ERROR: User not authorized. Role:', req.user.role);
            return res.status(403).json({ 
                success: false, 
                message: 'Only technicians can change computer status. Your role: ' + req.user.role 
            });
        }

        const targetWsId = req.params.workstationId.toString();
        let workstation = null;
        let roomName = null;
        let previousStatus = null;
        let wsNumber = null;
        
        // First check in room workstations
        if (lab.rooms && lab.rooms.length > 0) {
            console.log('Checking room workstations...');
            for (const room of lab.rooms) {
                if (room.workstations && room.workstations.length > 0) {
                    workstation = room.workstations.find(w => w._id && w._id.toString() === targetWsId);
                    if (workstation) {
                        previousStatus = workstation.status;
                        wsNumber = workstation.workstationNumber;
                        roomName = room.name;
                        console.log('Found workstation in room:', roomName, wsNumber);
                        
                        // Set new status
                        workstation.status = status;
                        if (notes) workstation.notes = notes;
                        
                        lab.markModified('rooms');
                        await lab.save();

                        console.log('SUCCESS: Updated in room');

return res.json({ 
                            success: true, 
                            message: 'Computer marked as ' + status,
                            workstation: {
                                _id: workstation._id,
                                workstationNumber: workstation.workstationNumber,
                                status: workstation.status,
                                notes: workstation.notes
                            }
                        });
                    }
                }
            }
        }

        // Check in lab-level workstations
        if (lab.workstations && lab.workstations.length > 0) {
            console.log('Checking lab-level workstations...');
            workstation = lab.workstations.find(w => w._id && w._id.toString() === targetWsId);
            
            if (workstation) {
                previousStatus = workstation.status;
                wsNumber = workstation.workstationNumber;
                workstation.status = status;
                if (notes) workstation.notes = notes;
                
                await lab.save();
                console.log('SUCCESS: Updated at lab level');

                return res.json({ 
                    success: true, 
                    message: 'Computer marked as ' + status,
                    workstation: {
                        _id: workstation._id,
                        workstationNumber: workstation.workstationNumber,
                        status: workstation.status,
                        notes: workstation.notes
                    }
                });
            }
        }

        console.log('ERROR: Workstation not found');
        return res.status(404).json({ success: false, message: 'Workstation not found' });
    } catch (error) {
        console.error('Update workstation error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
};

// @route   GET /api/labs/:id/availability
// @desc    Get workstation availability for a date
// @access  Public
exports.getAvailability = async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ success: false, message: 'Date is required' });
        }

        const lab = await Lab.findById(req.params.id);
        if (!lab) {
            return res.status(404).json({ success: false, message: 'Lab not found' });
        }

        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        // Get all bookings for this lab on this date
        const bookings = await Booking.find({
            lab: req.params.id,
            date: { $gte: startOfDay, $lte: endOfDay },
            status: { $in: ['pending', 'confirmed'] }
        });

        // Get all reservations (teacher classes) for this lab on this date
        const reservations = await Reservation.find({
            lab: req.params.id,
            date: { $gte: startOfDay, $lte: endOfDay },
            status: 'approved'
        });

        // Get all workstations including from rooms (for labs like Tewodros Veterinary)
        let allWorkstations = [];
        
        // Add room-based workstations with room info
        if (lab.rooms && lab.rooms.length > 0) {
            lab.rooms.forEach(room => {
                if (room.workstations && room.workstations.length > 0) {
                    room.workstations.forEach(ws => {
                        allWorkstations.push({
                            ...ws.toObject(),
                            roomName: room.name,
                            roomType: room.type
                        });
                    });
                }
            });
        }

        // Fallback: use lab-level workstations if no room workstations
        if (allWorkstations.length === 0 && lab.workstations && lab.workstations.length > 0) {
            allWorkstations = lab.workstations.map(ws => ws.toObject());
        }

        const availability = allWorkstations.map(ws => {
            const workstationBookings = bookings.filter(
                b => b.workstation.workstationId.toString() === ws._id.toString()
            );
            return {
                ...ws,
                bookings: workstationBookings.map(b => ({
                    startTime: b.startTime,
                    endTime: b.endTime,
                    status: b.status
                }))
            };
        });

        // Add reservation info to the availability response
        const reservationInfo = reservations.map(r => ({
            startTime: r.startTime,
            endTime: r.endTime,
            courseName: r.courseName,
            courseCode: r.courseCode,
            teacherName: r.teacher?.name || 'Unknown',
            roomName: r.roomName || null,
            roomId: r.roomId || null,
            status: r.status
        }));

        res.json({ success: true, date: new Date(date), availability, reservations: reservationInfo });
    } catch (error) {
        console.error('Get availability error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/labs
// @desc    Create new lab (admin only)
// @access  Admin/Superadmin
exports.createLab = async (req, res) => {
    try {
        const lab = new Lab(req.body);
        await lab.save();

        // Audit log for lab creation
        await AuditLog.create({
            user: req.user._id,
            action: 'lab.create',
            resource: 'Lab',
            resourceId: lab._id,
            details: `Created lab: ${lab.name} (${lab.code}) at ${lab.campus}`,
            previousValue: null,
            newValue: { name: lab.name, code: lab.code, campus: lab.campus, capacity: lab.capacity },
            ipAddress: req.ip
        });

        res.status(201).json({ success: true, message: 'Lab created successfully', lab });
    } catch (error) {
        console.error('Create lab error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PUT /api/labs/:id
// @desc    Update lab (admin only)
// @access  Admin/Superadmin
exports.updateLab = async (req, res) => {
    try {
        const previousLab = await Lab.findById(req.params.id);
        if (!previousLab) {
            return res.status(404).json({ success: false, message: 'Lab not found' });
        }

        const lab = await Lab.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        ).populate('supervisor', 'name email');

        // Audit log for lab update
        await AuditLog.create({
            user: req.user._id,
            action: 'lab.update',
            resource: 'Lab',
            resourceId: lab._id,
            details: `Updated lab: ${lab.name}`,
            previousValue: { name: previousLab.name, capacity: previousLab.capacity, status: previousLab.status },
            newValue: { name: lab.name, capacity: lab.capacity, status: lab.status },
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Lab updated successfully', lab });
    } catch (error) {
        console.error('Update lab error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   DELETE /api/labs/:id/rooms/:roomId
// @desc    Delete a room from a lab
// @access  Admin/Superadmin
exports.deleteRoom = async (req, res) => {
    try {
        const lab = await Lab.findById(req.params.id);
        if (!lab) {
            return res.status(404).json({ success: false, message: 'Lab not found' });
        }

        const roomIdToRemove = req.params.roomId;
        const initialLength = lab.rooms.length;
        lab.rooms = lab.rooms.filter(room => room._id.toString() !== roomIdToRemove);

        if (lab.rooms.length === initialLength) {
            return res.status(404).json({ success: false, message: 'Room not found in lab' });
        }

        // Recalculate total lab capacity
        lab.capacity = lab.rooms.reduce((sum, room) => sum + room.capacity, 0);

        await lab.save();

        // Audit log for room deletion
        await AuditLog.create({
            user: req.user._id,
            action: 'lab.room_deleted',
            resource: 'Lab',
            resourceId: lab._id,
            details: `Deleted room ${roomIdToRemove} from lab: ${lab.name}`,
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: 'Room deleted successfully',
            lab
        });
    } catch (error) {
        console.error('Delete room error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   DELETE /api/labs/:id
// @desc    Delete lab (hard delete)
// @access  Admin/Superadmin
exports.deleteLab = async (req, res) => {
    try {
        const lab = await Lab.findById(req.params.id);
        if (!lab) {
            return res.status(404).json({ success: false, message: 'Lab not found' });
        }

        const labName = lab.name;

        // Hard delete the lab document.
        // Note: Lab contains embedded rooms/workstations, so deleting lab removes them too.
        await Lab.deleteOne({ _id: lab._id });

        // Audit log for lab deletion
        await AuditLog.create({
            user: req.user._id,
            action: 'lab.delete',
            resource: 'Lab',
            resourceId: lab._id,
            details: `Deleted lab: ${labName}`,
            previousValue: { name: labName },
            newValue: null,
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Lab deleted successfully' });
    } catch (error) {
        console.error('Delete lab error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

