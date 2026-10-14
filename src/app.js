const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { logsRouter } = require('./routes/logs');
const { QueryError } = require('./query/compile');

function createApp({ model, writer }) {
    const app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use(cors());

    app.get('/health', (req, res) => {
        const dbUp = mongoose.connection.readyState === 1;
        res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' });
    });

    app.use('/explorer', express.static(path.join(__dirname, '..', 'public')));
    app.use(logsRouter({ model, writer }));

    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err instanceof QueryError) return res.status(400).json({ error: err.message });
        if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
        if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    });

    return app;
}

module.exports = { createApp };
