const Equipment = require('../models/Equipment');
// Ensure Lab model is registered for populate to work
require('../models/Lab');

// @route   GET /api/inventory
// @desc    Get all inventory items
// @access  Private
exports.getAllItems = async (req, res) => {
    try {
        const { status, category, lab, search, page = 1, limit = 1000 } = req.query;
        console.log('[Inventory] getAllItems query:', { status, category, lab, search, page, limit });

        let query = {};

        if (status) query.status = status;
        if (category) query.category = category;
        if (lab) query.lab = lab;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        console.log('[Inventory] Query object:', JSON.stringify(query));

        const items = await Equipment.find(query)
            .populate('lab', 'name code supervisor')
            .populate('assignedTo', 'name username')
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        console.log('[Inventory] Found', items.length, 'items');

        const total = await Equipment.countDocuments(query);

        const categories = await Equipment.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);

        const statusSummary = await Equipment.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            items,
            summary: { categories, status: statusSummary },
            pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('[Inventory] GET /api/inventory error:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code
        });
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// @route   GET /api/inventory/:id
// @desc    Get inventory item by ID
// @access  Private
exports.getItemById = async (req, res) => {
    try {
        const item = await Equipment.findById(req.params.id)
            .populate('lab', 'name code supervisor')
            .populate('assignedTo', 'name username')
            .populate('maintenanceRecords.performedBy', 'name');

        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        res.json({ success: true, item });
    } catch (error) {
        console.error('Get item error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/inventory
// @desc    Create new inventory item
// @access  Admin/Technician
exports.createItem = async (req, res) => {
    try {
        const item = new Equipment(req.body);
        await item.save();
        await item.populate('lab assignedTo');

        res.status(201).json({ success: true, message: 'Item added to inventory', item });
    } catch (error) {
        console.error('Create inventory item error:', error);

        let errorMessage = 'Server error';
        if (error.name === 'ValidationError') {
            errorMessage = Object.values(error.errors).map(err => err.message).join(', ');
        } else if (error.code === 11000) {
            errorMessage = 'An item with this code or serial number already exists';
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(500).json({ success: false, message: errorMessage });
    }
};

// @route   PUT /api/inventory/:id
// @desc    Update inventory item
// @access  Admin/Technician
exports.updateItem = async (req, res) => {
    try {
        const item = await Equipment.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        ).populate('lab assignedTo');

        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        res.json({ success: true, message: 'Item updated successfully', item });
    } catch (error) {
        console.error('Update inventory item error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/inventory/:id/maintenance
// @desc    Add maintenance record
// @access  Admin/Technician
exports.addMaintenanceRecord = async (req, res) => {
    try {
        const { type, description, date, cost, nextMaintenanceDate } = req.body;

        const item = await Equipment.findById(req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        item.maintenanceRecords.push({
            type,
            description,
            date: new Date(date),
            performedBy: req.user._id,
            cost,
            nextMaintenanceDate: nextMaintenanceDate ? new Date(nextMaintenanceDate) : undefined
        });

        if (type === 'repair') {
            item.status = 'maintenance';
        }

        await item.save();

        res.json({ success: true, message: 'Maintenance record added', item });
    } catch (error) {
        console.error('Add maintenance record error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   DELETE /api/inventory/:id
// @desc    Delete inventory item (permanent delete)
// @access  Admin
exports.deleteItem = async (req, res) => {
    try {
        const item = await Equipment.findByIdAndDelete(req.params.id);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        res.json({ success: true, message: 'Item permanently deleted from inventory' });
    } catch (error) {
        console.error('Delete inventory item error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
