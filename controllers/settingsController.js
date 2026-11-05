const AuditLog = require('../models/AuditLog');
const SystemConfig = require('../models/SystemConfig');
const {
    ensureDefaultConfigs,
    buildSettingsFromConfigs,
    flattenSettings
} = require('../utils/systemSettings');

exports.getSettings = async (req, res) => {
    try {
        await ensureDefaultConfigs();
        const configs = await SystemConfig.find().sort({ category: 1, key: 1 });

        res.json({
            success: true,
            settings: buildSettingsFromConfigs(configs),
            configs
        });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const settings = req.body.settings || req.body;
        const updates = flattenSettings(settings);

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid settings were provided' });
        }

        await Promise.all(updates.map(update =>
            SystemConfig.findOneAndUpdate(
                { key: update.key },
                {
                    key: update.key,
                    value: update.value,
                    category: update.category,
                    description: update.description,
                    updatedBy: req.user._id
                },
                { upsert: true, new: true, runValidators: true }
            )
        ));

        await AuditLog.create({
            user: req.user._id,
            action: 'config.update',
            resource: 'SystemConfig',
            details: `Updated ${updates.length} system setting(s)`,
            newValue: settings,
            ipAddress: req.ip,
            userAgent: req.headers?.['user-agent']
        });

        const configs = await SystemConfig.find().sort({ category: 1, key: 1 });

        res.json({
            success: true,
            message: 'Settings updated successfully',
            settings: buildSettingsFromConfigs(configs),
            configs
        });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
