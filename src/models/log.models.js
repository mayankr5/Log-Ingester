const mongoose = require("mongoose");

const metaData = new mongoose.Schema ({
    parentResourceId: {
        type: String,
        trim: true,
        index: true
    }
});

const loggerSchema = new mongoose.Schema ({
    level: {
        type: String,
        trim: true,
        index: true
    },
    message: {
        type: String,
        trim: true,
        index: true
    },
    resourceId: {
        type: String,
        trim: true,
        index: true
    },
    timestamp:{
        type: Date,
        index: true
    },
    traceId:{
        type: String,
        trim: true,
        index: true
    },
    spanId: {
        type: String,
        trim: true,
        index: true
    },
    commit: {
        type: String,
        trim: true,
        index: true
    },
    metadata: {
        type: metaData
    }
});


const logModel = mongoose.model('LoggerSchema', loggerSchema);

module.exports = {logModel}