const express = require('express');
const mongoose = require('mongoose');
const { validateLog } = require('../validation/log');
const { compile, QueryError } = require('../query/compile');

const MAX_BATCH = 1000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

// Cursor = base64 of "<timestamp ms>_<ObjectId>" of the last log on the previous page.
function encodeCursor(log) {
    return Buffer.from(`${log.timestamp.getTime()}_${log._id}`).toString('base64url');
}

function decodeCursor(cursor) {
    const [ms, id] = Buffer.from(cursor, 'base64url').toString().split('_');
    const ts = new Date(Number(ms));
    if (!id || Number.isNaN(ts.getTime()) || !mongoose.isValidObjectId(id)) {
        throw new QueryError('Invalid cursor');
    }
    return { ts, id: new mongoose.Types.ObjectId(id) };
}

function parseDate(raw, name) {
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) throw new QueryError(`${name} must be a valid date`);
    return d;
}

function parseLimit(raw) {
    if (raw === undefined) return DEFAULT_LIMIT;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) throw new QueryError('limit must be a positive integer');
    return Math.min(n, MAX_LIMIT);
}

function logsRouter({ model, writer }) {
    const router = express.Router();

    // Accepts one log object or an array of up to MAX_BATCH logs.
    async function ingest(req, res, next) {
        const isBatch = Array.isArray(req.body);
        const items = isBatch ? req.body : [req.body];

        if (items.length === 0) return res.status(400).json({ error: 'No logs in request' });
        if (items.length > MAX_BATCH) return res.status(413).json({ error: `At most ${MAX_BATCH} logs per request` });

        const valid = [];
        const rejected = [];
        items.forEach((item, index) => {
            const { value, error } = validateLog(item);
            if (error) rejected.push({ index, error });
            else valid.push(value);
        });

        if (valid.length === 0) {
            return res.status(400).json({ accepted: 0, rejected });
        }

        try {
            await writer.write(valid);
            res.status(201).json({ accepted: valid.length, rejected });
        } catch (err) {
            next(err);
        }
    }

    // GET /logs?q=<query>&from=<iso>&to=<iso>&limit=50&cursor=<nextCursor>
    async function search(req, res, next) {
        try {
            const limit = parseLimit(req.query.limit);
            const filter = compile(req.query.q);

            const clauses = [filter];
            // The time window is separate from q so it can't change the meaning of an OR in the query.
            const range = {};
            if (req.query.from) range.$gte = parseDate(req.query.from, 'from');
            if (req.query.to) range.$lte = parseDate(req.query.to, 'to');
            if (Object.keys(range).length) clauses.push({ timestamp: range });

            if (req.query.cursor) {
                // Keyset pagination: continue strictly after the last log of the previous page.
                const { ts, id } = decodeCursor(String(req.query.cursor));
                clauses.push({ $or: [{ timestamp: { $lt: ts } }, { timestamp: ts, _id: { $lt: id } }] });
            }

            const logs = await model
                .find(clauses.length === 1 ? clauses[0] : { $and: clauses })
                .sort({ timestamp: -1, _id: -1 })
                .limit(limit + 1)
                .lean();

            const hasMore = logs.length > limit;
            if (hasMore) logs.pop();

            res.json({
                logs,
                nextCursor: hasMore ? encodeCursor(logs[logs.length - 1]) : null,
            });
        } catch (err) {
            next(err);
        }
    }

    router.post('/', ingest);       // original endpoint from the assignment spec
    router.post('/logs', ingest);
    router.get('/logs', search);

    return router;
}

module.exports = { logsRouter };
