const mongoose = require("mongoose");

const metaData = new mongoose.Schema({
    parentResourceId: { type: String, trim: true },
}, { _id: false });

const loggerSchema = new mongoose.Schema({
    level: { type: String, trim: true, required: true },
    message: { type: String, trim: true, required: true },
    resourceId: { type: String, trim: true },
    timestamp: { type: Date, required: true },
    traceId: { type: String, trim: true },
    spanId: { type: String, trim: true },
    commit: { type: String, trim: true },
    metadata: { type: metaData },
}, { versionKey: false });

// Results are always sorted newest first, so every filter field is paired with
// timestamp in a compound index. MongoDB can then read matches already in order
// and stop after one page, instead of sorting in memory.
// _id is the tie-breaker for logs with the same timestamp (needed for cursor pagination).
loggerSchema.index({ timestamp: -1, _id: -1 });
loggerSchema.index({ level: 1, timestamp: -1, _id: -1 });
loggerSchema.index({ resourceId: 1, timestamp: -1, _id: -1 });
loggerSchema.index({ traceId: 1, timestamp: -1, _id: -1 });
loggerSchema.index({ spanId: 1, timestamp: -1, _id: -1 });
loggerSchema.index({ commit: 1, timestamp: -1, _id: -1 });
loggerSchema.index({ 'metadata.parentResourceId': 1, timestamp: -1, _id: -1 });
// Full-text search on log messages.
loggerSchema.index({ message: 'text' });

const logModel = mongoose.model('LoggerSchema', loggerSchema);

module.exports = { logModel };
