const Material = require('../models/Material');
const path = require('path');
const fs = require('fs');

// @route   GET /api/materials
// @desc    Get all materials (public for students, own for teachers)
// @access  Private
exports.getAllMaterials = async (req, res) => {
    try {
        const { course, category, page = 1, limit = 1000 } = req.query;
        let query = { isActive: true };

        if (req.user.role === 'teacher') {
            query.uploadedBy = req.user._id;
        }

        if (course) query.course = course;
        if (category && category !== 'all') query.category = category;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const materials = await Material.find(query)
            .populate('uploadedBy', 'name email')
            .skip(skip)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        const total = await Material.countDocuments(query);

        res.json({
            success: true,
            materials,
            pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('Get materials error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/materials/my-materials
// @desc    Get current teacher's materials
// @access  Teacher/Admin
exports.getMyMaterials = async (req, res) => {
    try {
        const materials = await Material.find({ uploadedBy: req.user._id, isActive: true })
            .populate('uploadedBy', 'name email')
            .sort({ createdAt: -1 });

        res.json({ success: true, materials });
    } catch (error) {
        console.error('Get my materials error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   POST /api/materials
// @desc    Upload new material
// @access  Teacher/Admin
exports.uploadMaterial = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const { title, description, course, category, fileType } = req.body;

        const material = new Material({
            title,
            description,
            course,
            category,
            fileType,
            fileName: req.file.originalname,
            fileUrl: `/uploads/materials/${req.file.filename}`,
            fileSize: req.file.size,
            uploadedBy: req.user._id
        });

        await material.save();

        res.status(201).json({ success: true, message: 'Material uploaded successfully', material });
    } catch (error) {
        console.error('Upload material error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   GET /api/materials/:id/download
// @desc    Download material
// @access  Private
exports.downloadMaterial = async (req, res) => {
    try {
        const material = await Material.findById(req.params.id);
        if (!material) {
            console.log('[Download] Material not found, id:', req.params.id);
            return res.status(404).json({ success: false, message: 'Material not found' });
        }

        console.log('[Download] Material found:', material.title);
        console.log('[Download] fileUrl:', material.fileUrl);

        material.downloadCount += 1;
        await material.save();

        // Fix: Use path.resolve and strip leading slashes to ensure the path is correctly located relative to the backend root
        const cleanPath = material.fileUrl.startsWith('/') ? material.fileUrl.substring(1) : material.fileUrl;
        const filePath = path.resolve(__dirname, '..', cleanPath);

        console.log('[Download] Resolved filePath:', filePath);

        if (!fs.existsSync(filePath)) {
            console.log('[Download] File not found at path:', filePath);
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }

        console.log('[Download] Serving file:', filePath);
        res.download(filePath, material.fileName);
    } catch (error) {
        console.error('Download material error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// @route   DELETE /api/materials/:id
// @desc    Delete material (soft delete)
// @access  Teacher/Admin
exports.deleteMaterial = async (req, res) => {
    try {
        const material = await Material.findById(req.params.id);
        if (!material) {
            return res.status(404).json({ success: false, message: 'Material not found' });
        }

        if (material.uploadedBy.toString() !== req.user._id.toString() &&
            req.user.role !== 'admin' && req.user.role !== 'superadmin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        material.isActive = false;
        await material.save();

        res.json({ success: true, message: 'Material deleted successfully' });
    } catch (error) {
        console.error('Delete material error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
