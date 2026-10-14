const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
const MAX_MESSAGE_LENGTH = 10000;
const MAX_ID_LENGTH = 256;

function optionalString(log, field, errors) {
    const v = log[field];
    if (v === undefined || v === null) return undefined;
    if (typeof v !== 'string') { errors.push(`${field} must be a string`); return undefined; }
    if (v.length > MAX_ID_LENGTH) { errors.push(`${field} longer than ${MAX_ID_LENGTH} characters`); return undefined; }
    return v.trim();
}

// Validates one incoming log and returns a clean copy with only known fields.
// Returns { value } on success or { error } with a readable message.
function validateLog(log) {
    if (!log || typeof log !== 'object' || Array.isArray(log)) {
        return { error: 'log must be a JSON object' };
    }

    const errors = [];

    const level = typeof log.level === 'string' ? log.level.trim().toLowerCase() : log.level;
    if (!LEVELS.includes(level)) errors.push(`level must be one of: ${LEVELS.join(', ')}`);

    if (typeof log.message !== 'string' || !log.message.trim()) errors.push('message is required');
    else if (log.message.length > MAX_MESSAGE_LENGTH) errors.push(`message longer than ${MAX_MESSAGE_LENGTH} characters`);

    const resourceId = optionalString(log, 'resourceId', errors);
    const traceId = optionalString(log, 'traceId', errors);
    const spanId = optionalString(log, 'spanId', errors);
    const commit = optionalString(log, 'commit', errors);

    let timestamp = new Date();
    if (log.timestamp !== undefined) {
        timestamp = new Date(log.timestamp);
        if (Number.isNaN(timestamp.getTime())) errors.push('timestamp must be a valid date');
    }

    let metadata;
    if (log.metadata !== undefined) {
        if (!log.metadata || typeof log.metadata !== 'object') errors.push('metadata must be an object');
        else metadata = { parentResourceId: optionalString(log.metadata, 'parentResourceId', errors) };
    }

    if (errors.length) return { error: errors.join('; ') };

    return {
        value: {
            level,
            message: log.message.trim(),
            resourceId,
            timestamp,
            traceId,
            spanId,
            commit,
            metadata,
        },
    };
}

module.exports = { validateLog, LEVELS };
