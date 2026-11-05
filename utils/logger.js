const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');
const ACCESS_LOG = path.join(LOG_DIR, 'access.log');

if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const safeStringify = (obj) => {
    if (obj === null || obj === undefined) {
        return String(obj);
    }
    try {
        return JSON.stringify(obj);
    } catch (e) {
        // If we still can't stringify, return a string indicating the type
        return `[Object: ${typeof obj}]`;
    }
};

const formatLog = (level, message, meta = {}) => {
    const timestamp = new Date().toISOString();
    const messageStr = String(message);
    const metaStr = Object.keys(meta).length > 0 ? ' | ' + safeStringify(meta) : '';
    return `[${timestamp}] [${level}] ${messageStr}${metaStr}\n`;
};

const logger = {
    error: (message, meta = {}) => {
        const log = formatLog('ERROR', message, meta);
        fs.appendFileSync(ERROR_LOG, log);
        console.error(log.trim());
    },
    
    warn: (message, meta = {}) => {
        const log = formatLog('WARN', message, meta);
        fs.appendFileSync(ERROR_LOG, log);
        console.warn(log.trim());
    },
    
    info: (message, meta = {}) => {
        const log = formatLog('INFO', message, meta);
        fs.appendFileSync(ACCESS_LOG, log);
        console.log(log.trim());
    },
    
    logError: (err, context = {}) => {
        const meta = {
            error: err.message,
            stack: err.stack,
            ...context
        };
        const log = formatLog('ERROR', 'Uncaught exception', meta);
        fs.appendFileSync(ERROR_LOG, log);
        console.error(log.trim());
    }
};

process.on('uncaughtException', (err) => {
    logger.logError(err, { type: 'uncaughtException' });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
});

module.exports = logger;