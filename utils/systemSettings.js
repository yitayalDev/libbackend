const SystemConfig = require('../models/SystemConfig');

const DEFAULT_CONFIGS = [
    { key: 'general.systemName', value: 'CLM System', category: 'system', description: 'System display name' },
    { key: 'general.adminEmail', value: 'admin@clm.edu', category: 'system', description: 'Primary administrator email' },
    { key: 'general.timezone', value: 'UTC', category: 'system', description: 'Default system timezone' },
    { key: 'general.dateFormat', value: 'YYYY-MM-DD', category: 'display', description: 'Default date format' },
    { key: 'general.timeFormat', value: '24h', category: 'display', description: 'Default time format' },
    { key: 'booking.maxPerUser', value: 5, category: 'booking', description: 'Maximum bookings per user per day' },
    { key: 'booking.maxDuration', value: 4, category: 'booking', description: 'Maximum booking duration in hours' },
    { key: 'booking.minDuration', value: 1, category: 'booking', description: 'Minimum booking duration in hours' },
    { key: 'booking.advanceDays', value: 14, category: 'booking', description: 'Days in advance users can book' },
    { key: 'booking.cancellationHours', value: 24, category: 'booking', description: 'Hours before booking to allow cancellation' },
    { key: 'booking.autoCancelNoShow', value: 30, category: 'booking', description: 'Auto-cancel no-show bookings after minutes' },
    { key: 'notification.emailEnabled', value: true, category: 'notification', description: 'Enable email notifications' },
    { key: 'notification.bookingConfirmation', value: true, category: 'notification', description: 'Enable booking confirmation notifications' },
    { key: 'notification.bookingReminder', value: true, category: 'notification', description: 'Enable booking reminder notifications' },
    { key: 'notification.faultReport', value: true, category: 'notification', description: 'Enable fault report notifications' },
    { key: 'notification.maintenanceAlerts', value: true, category: 'notification', description: 'Enable maintenance alert notifications' },
    { key: 'security.passwordMinLength', value: 8, category: 'security', description: 'Minimum password length' },
    { key: 'security.requireSpecialChars', value: true, category: 'security', description: 'Require special characters in passwords' },
    { key: 'system.sessionTimeout', value: 30, category: 'security', description: 'Session timeout in minutes' },
    { key: 'system.maxLoginAttempts', value: 5, category: 'security', description: 'Maximum login attempts before lockout' },
    { key: 'security.lockoutDuration', value: 15, category: 'security', description: 'Account lockout duration in minutes' },
    { key: 'maintenance.autoBackup', value: true, category: 'system', description: 'Enable automatic backups' },
    { key: 'maintenance.backupFrequency', value: 'daily', category: 'system', description: 'Automatic backup frequency' },
    { key: 'maintenance.backupRetention', value: 30, category: 'system', description: 'Backup retention in days' },
    { key: 'system.maintenanceMode', value: false, category: 'system', description: 'Enable maintenance mode' },
    { key: 'system.maintenanceMessage', value: 'System is under maintenance. Please try again later.', category: 'system', description: 'Maintenance mode message' },
    { key: 'display.itemsPerPage', value: 20, category: 'display', description: 'Default items per page' }
];

const SETTINGS_MAP = {
    general: {
        systemName: 'general.systemName',
        adminEmail: 'general.adminEmail',
        timezone: 'general.timezone',
        dateFormat: 'general.dateFormat',
        timeFormat: 'general.timeFormat'
    },
    booking: {
        maxBookingsPerUser: 'booking.maxPerUser',
        maxBookingDuration: 'booking.maxDuration',
        minBookingDuration: 'booking.minDuration',
        advanceBookingDays: 'booking.advanceDays',
        cancellationDeadline: 'booking.cancellationHours',
        autoCancelNoShow: 'booking.autoCancelNoShow'
    },
    notifications: {
        emailNotifications: 'notification.emailEnabled',
        bookingConfirmation: 'notification.bookingConfirmation',
        bookingReminder: 'notification.bookingReminder',
        faultReportNotification: 'notification.faultReport',
        maintenanceAlerts: 'notification.maintenanceAlerts'
    },
    security: {
        passwordMinLength: 'security.passwordMinLength',
        requireSpecialChars: 'security.requireSpecialChars',
        sessionTimeout: 'system.sessionTimeout',
        maxLoginAttempts: 'system.maxLoginAttempts',
        lockoutDuration: 'security.lockoutDuration'
    },
    maintenance: {
        autoBackup: 'maintenance.autoBackup',
        backupFrequency: 'maintenance.backupFrequency',
        backupRetention: 'maintenance.backupRetention',
        maintenanceMode: 'system.maintenanceMode',
        maintenanceMessage: 'system.maintenanceMessage'
    }
};

const defaultByKey = new Map(DEFAULT_CONFIGS.map(config => [config.key, config]));

const ensureDefaultConfigs = async () => {
    await Promise.all(DEFAULT_CONFIGS.map(config =>
        SystemConfig.updateOne(
            { key: config.key },
            { $setOnInsert: config },
            { upsert: true }
        )
    ));
};

const buildSettingsFromConfigs = (configs) => {
    const values = new Map(configs.map(config => [config.key, config.value]));
    const settings = {};

    Object.entries(SETTINGS_MAP).forEach(([section, fields]) => {
        settings[section] = {};
        Object.entries(fields).forEach(([field, key]) => {
            const fallback = defaultByKey.get(key)?.value;
            settings[section][field] = values.has(key) ? values.get(key) : fallback;
        });
    });

    return settings;
};

const flattenSettings = (settings = {}) => {
    const updates = [];

    Object.entries(SETTINGS_MAP).forEach(([section, fields]) => {
        Object.entries(fields).forEach(([field, key]) => {
            if (settings[section] && Object.prototype.hasOwnProperty.call(settings[section], field)) {
                const defaultConfig = defaultByKey.get(key);
                updates.push({
                    key,
                    value: settings[section][field],
                    category: defaultConfig?.category || 'system',
                    description: defaultConfig?.description || key
                });
            }
        });
    });

    return updates;
};

const getConfigValue = async (key, fallback) => {
    await ensureDefaultConfigs();
    const config = await SystemConfig.findOne({ key });
    return config ? config.value : fallback;
};

const getSessionTimeoutMinutes = async () => {
    const value = await getConfigValue('system.sessionTimeout', 30);
    const minutes = Number(value);
    return Number.isFinite(minutes) && minutes >= 1 ? minutes : 30;
};

module.exports = {
    DEFAULT_CONFIGS,
    SETTINGS_MAP,
    ensureDefaultConfigs,
    buildSettingsFromConfigs,
    flattenSettings,
    getSessionTimeoutMinutes
};
