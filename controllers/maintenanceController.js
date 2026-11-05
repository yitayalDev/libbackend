const Fault = require('../models/Fault');
const Equipment = require('../models/Equipment');
const { notifyByRole, createNotification } = require('./notificationController');
const AuditLog = require('../models/AuditLog');

// @route   GET /api/maintenance/faults
// @desc    Get all fault reports
// @access  Private
exports.getAllFaults = async (req, res) => {
    try {
        const { status, lab, myReports, assignedToMe, page = 1, limit = 1000 } = req.query;
        let query = {};

        if (status) query.status = status;
        if (lab) query.lab = lab;
        if (myReports === 'true') query.reportedBy = req.user._id;
        if (assignedToMe === 'true') query.assignedTo = req.user._id;

        console.log('[GET /api/maintenance/faults] Query:', JSON.stringify(query));
        console.log('[GET /api/maintenance/faults] User:', req.user._id, 'Role:', req.user.role);

        const totalAll = await Fault.countDocuments({});
        console.log('[GET /api/maintenance/faults] Total faults in collection (no filter):', totalAll);

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const faults = await Fault.find(query)
            .populate('reportedBy', 'name username role')
            .populate('lab', 'name code supervisor')
            .populate('assignedTo', 'name username')
            .populate('resolvedBy', 'name')
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        console.log('[GET /api/maintenance/faults] Returning faults:', faults.map(f => ({
          _id: f._id,
          title: f.title,
          status: f.status,
          lab: f.lab ? f.lab.name : 'NULL',
          reportedBy: f.reportedBy ? f.reportedBy.name : 'NULL'
        })));

        const total = await Fault.countDocuments(query);

        console.log('[getAllFaults] Returning faults:', faults.map(f => ({
          _id: f._id,
          title: f.title,
          status: f.status,
          lab: f.lab ? f.lab.name : 'NULL',
          reportedBy: f.reportedBy ? f.reportedBy.name : 'NULL'
        })));

        const summary = {
            open: await Fault.countDocuments({ status: 'open' }),
            inProgress: await Fault.countDocuments({ status: 'in-progress' }),
            resolved: await Fault.countDocuments({ status: 'resolved' })
        };

        res.json({
            success: true,
            faults,
            summary,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('Get faults error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/maintenance/faults
// @desc    Report a new fault
// @access  Private
exports.createFault = async (req, res) => {
    try {
        const { labId, workstation, category, severity, title, description, submittedTo } = req.body;

        const fault = new Fault({
            reportedBy: req.user._id,
            lab: labId,
            workstation,
            category,
            severity,
            title,
            description,
            submittedTo: submittedTo || 'technician'
        });

        await fault.save();
        await fault.populate('reportedBy lab');

        // Audit log for fault creation
        await AuditLog.create({
            user: req.user._id,
            action: 'fault.create',
            resource: 'Fault',
            resourceId: fault._id,
            details: `Reported fault: ${fault.title} in ${fault.lab?.name || 'unknown lab'} (${fault.severity} severity)`,
            ipAddress: req.ip
        });

        // Notify the target role about the new fault report
        const targetRoles = submittedTo === 'superadmin'
            ? ['superadmin']
            : submittedTo === 'admin'
                ? ['admin', 'superadmin']
                : ['technician', 'admin', 'superadmin'];

        await notifyByRole(targetRoles, {
            sender: req.user._id,
            type: 'fault_reported',
            title: 'New Fault Report',
            message: `${req.user.name} reported: "${title}" in ${fault.lab?.name || 'a lab'} (${severity} severity)`,
            link: submittedTo === 'technician' ? '/technician/tickets' : '/admin/faults',
            priority: severity === 'critical' ? 'critical' : severity === 'high' ? 'high' : 'medium',
            relatedModel: 'Fault',
            relatedId: fault._id
        });

        res.status(201).json({ success: true, message: 'Fault reported successfully', fault });
    } catch (error) {
        console.error('Create fault error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PATCH /api/maintenance/faults/:id
// @desc    Update fault status/assign
// @access  Technician/Admin
exports.updateFault = async (req, res) => {
    try {
        const { status, assignedTo, resolution } = req.body;

        const fault = await Fault.findById(req.params.id);
        if (!fault) {
            return res.status(404).json({ success: false, message: 'Fault not found' });
        }

        const previousStatus = fault.status;
        if (status) {
            fault.status = status;
            if (status === 'resolved') {
                fault.resolvedAt = new Date();
                fault.resolvedBy = req.user._id;
            }
        }

        if (assignedTo) fault.assignedTo = assignedTo;
        if (resolution) fault.resolution = resolution;

        await fault.save();
        await fault.populate('reportedBy lab assignedTo resolvedBy');

        // Audit log for fault update
        await AuditLog.create({
            user: req.user._id,
            action: status ? 'fault.status_change' : 'fault.update',
            resource: 'Fault',
            resourceId: fault._id,
            details: `${status ? 'Updated status' : 'Updated'} for fault: ${fault.title} from ${previousStatus} to ${status || previousStatus}`,
            previousValue: status ? { status: previousStatus } : null,
            newValue: status ? { status } : null,
            ipAddress: req.ip
        });

        // Notify the reporter about status change
        if (status && fault.reportedBy) {
            const statusMessages = {
                'in-progress': 'Your fault report is now being worked on.',
                'resolved': 'Your fault report has been resolved.',
                'closed': 'Your fault report has been closed.'
            };

            if (statusMessages[status]) {
                await createNotification({
                    recipient: fault.reportedBy._id,
                    sender: req.user._id,
                    type: status === 'resolved' ? 'fault_resolved' : 'fault_updated',
                    title: `Fault ${status.charAt(0).toUpperCase() + status.slice(1)}`,
                    message: `"${fault.title}" - ${statusMessages[status]}`,
                    link: '/student/bookings',
                    priority: status === 'resolved' ? 'medium' : 'low',
                    relatedModel: 'Fault',
                    relatedId: fault._id
                });
            }
        }

        // Notify assigned person
        if (assignedTo && assignedTo !== req.user._id.toString()) {
            await createNotification({
                recipient: assignedTo,
                sender: req.user._id,
                type: 'fault_assigned',
                title: 'Fault Assigned to You',
                message: `You have been assigned to fix: "${fault.title}" in ${fault.lab?.name || 'a lab'}`,
                link: '/technician/tickets',
                priority: fault.severity === 'critical' ? 'critical' : fault.severity === 'high' ? 'high' : 'medium',
                relatedModel: 'Fault',
                relatedId: fault._id
            });
        }

        res.json({ success: true, message: 'Fault updated successfully', fault });
    } catch (error) {
        console.error('Update fault error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/maintenance/equipment
// @desc    Get all equipment
// @access  Private
exports.getAllEquipment = async (req, res) => {
    try {
        const { status, category, lab } = req.query;
        let query = {};
        if (status) query.status = status;
        if (category) query.category = category;
        if (lab) query.lab = lab;

        const equipment = await Equipment.find(query)
            .populate('lab', 'name code')
            .populate('assignedTo', 'name username')
            .sort({ createdAt: -1 });

        res.json({ success: true, equipment });
    } catch (error) {
        console.error('Get equipment error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/maintenance/equipment
// @desc    Add new equipment
// @access  Technician/Admin
exports.createEquipment = async (req, res) => {
    try {
        const { name, category, labId, serialNumber, quantity, status } = req.body;

        const equipment = new Equipment({
            name,
            code: serialNumber || `EQ-${Date.now()}`,
            category,
            lab: labId,
            specifications: { serialNumber },
            status: status || 'operational',
            quantity: quantity || 1,
            location: req.body.location || ''
        });

        await equipment.save();
        await equipment.populate('lab', 'name code');

        // Audit log for equipment creation
        await AuditLog.create({
            user: req.user._id,
            action: 'equipment.create',
            resource: 'Equipment',
            resourceId: equipment._id,
            details: `Added equipment: ${equipment.name} (${equipment.category}) to lab: ${equipment.lab?.name || 'unknown'}`,
            ipAddress: req.ip
        });

        res.status(201).json({ success: true, message: 'Equipment added successfully', equipment });
    } catch (error) {
        console.error('Create equipment error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PATCH /api/maintenance/equipment/:id
// @desc    Update equipment status
// @access  Technician/Admin
exports.updateEquipment = async (req, res) => {
    try {
        const { status, condition, assignedTo, notes } = req.body;

        const previousEquipment = await Equipment.findById(req.params.id);
        if (!previousEquipment) {
            return res.status(404).json({ success: false, message: 'Equipment not found' });
        }

        const equipment = await Equipment.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        ).populate('lab assignedTo');

        if (!equipment) {
            return res.status(404).json({ success: false, message: 'Equipment not found' });
        }

        // Audit log for equipment update
        await AuditLog.create({
            user: req.user._id,
            action: 'equipment.update',
            resource: 'Equipment',
            resourceId: equipment._id,
            details: `Updated equipment: ${equipment.name}`,
            previousValue: { status: previousEquipment.status, condition: previousEquipment.condition },
            newValue: { status: equipment.status, condition: equipment.condition },
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Equipment updated successfully', equipment });
    } catch (error) {
        console.error('Update equipment error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   DELETE /api/maintenance/equipment/:id
// @desc    Delete equipment (soft delete)
// @access  Technician/Admin
exports.deleteEquipment = async (req, res) => {
    try {
        const equipment = await Equipment.findById(req.params.id);
        if (!equipment) {
            return res.status(404).json({ success: false, message: 'Equipment not found' });
        }

        const equipmentName = equipment.name;
        equipment.isActive = false;
        await equipment.save();

        // Audit log for equipment deletion
        await AuditLog.create({
            user: req.user._id,
            action: 'equipment.delete',
            resource: 'Equipment',
            resourceId: equipment._id,
            details: `Removed equipment: ${equipmentName}`,
            previousValue: { isActive: true },
            newValue: { isActive: false },
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'Equipment removed successfully' });
    } catch (error) {
        console.error('Delete equipment error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/maintenance/tickets
// @desc    Get maintenance tickets (alias for faults)
// @access  Private
exports.getTickets = async (req, res) => {
    try {
        const { status } = req.query;
        let query = {};
        if (status) query.status = status;

        const tickets = await Fault.find(query)
            .populate('reportedBy', 'name username role')
            .populate('lab', 'name code')
            .populate('assignedTo', 'name username')
            .sort({ createdAt: -1 });

        res.json({ success: true, tickets });
    } catch (error) {
        console.error('Get tickets error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   PATCH /api/maintenance/tickets/:id
// @desc    Update ticket status
// @access  Technician/Admin
exports.updateTicket = async (req, res) => {
    try {
        const { status, resolution } = req.body;

        const ticket = await Fault.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        ticket.status = status || ticket.status;
        if (resolution) ticket.resolution = resolution;
        if (status === 'resolved') {
            ticket.resolvedAt = new Date();
            ticket.resolvedBy = req.user._id;
        }

        await ticket.save();
        await ticket.populate('reportedBy lab assignedTo resolvedBy');

        // Audit log for ticket update
        await AuditLog.create({
            user: req.user._id,
            action: status ? 'fault.ticket_status_change' : 'fault.ticket_update',
            resource: 'Fault',
            resourceId: ticket._id,
            details: `${status ? 'Updated ticket status' : 'Updated'} for ticket: ${ticket.title} from ${ticket.status === status ? 'unknown' : ticket.status} to ${status || ticket.status}`,
            previousValue: { status: 'unknown' },
            newValue: { status: ticket.status },
            ipAddress: req.ip
        });

        // Notify the reporter about ticket status change
        if (status && ticket.reportedBy) {
            const statusMessages = {
                'in-progress': 'Your maintenance ticket is now being worked on.',
                'resolved': 'Your maintenance ticket has been resolved.',
                'closed': 'Your maintenance ticket has been closed.'
            };

            if (statusMessages[status]) {
                await createNotification({
                    recipient: ticket.reportedBy._id,
                    sender: req.user._id,
                    type: status === 'resolved' ? 'fault_resolved' : 'fault_updated',
                    title: `Ticket ${status.charAt(0).toUpperCase() + status.slice(1)}`,
                    message: `"${ticket.title}" - ${statusMessages[status]}`,
                    link: '/student/bookings',
                    priority: 'medium',
                    relatedModel: 'Fault',
                    relatedId: ticket._id
                });
            }
        }

        res.json({ success: true, message: 'Ticket updated successfully', ticket });
    } catch (error) {
        console.error('Update ticket error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
