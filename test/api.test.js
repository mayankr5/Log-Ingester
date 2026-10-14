const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { logModel } = require('../src/models/log.models');
const { BatchWriter } = require('../src/ingest/batchWriter');
const { createApp } = require('../src/app');

let mongo, app, writer;

const log = (overrides = {}) => ({
    level: 'error',
    message: 'Failed to connect to DB',
    resourceId: 'server-1234',
    timestamp: '2023-09-15T08:00:00Z',
    traceId: 'abc-xyz-123',
    spanId: 'span-456',
    commit: '5e5342f',
    metadata: { parentResourceId: 'server-0987' },
    ...overrides,
});

test.before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await logModel.init();
    writer = new BatchWriter(logModel, { maxBatchSize: 100, maxInFlight: 2 });
    app = createApp({ model: logModel, writer });
});

test.after(async () => {
    await writer.close();
    await mongoose.disconnect();
    await mongo.stop();
});

test.beforeEach(async () => {
    await logModel.deleteMany({});
});

test('ingests a single log on POST / (original spec)', async () => {
    const res = await request(app).post('/').send(log()).expect(201);
    assert.deepStrictEqual(res.body, { accepted: 1, rejected: [] });
    assert.strictEqual(await logModel.countDocuments(), 1);
});

test('ingests a batch and reports invalid entries by index', async () => {
    const res = await request(app)
        .post('/logs')
        .send([log(), log({ level: 'nope' }), log({ message: '' }), log()])
        .expect(201);
    assert.strictEqual(res.body.accepted, 2);
    assert.deepStrictEqual(res.body.rejected.map(r => r.index), [1, 2]);
    assert.strictEqual(await logModel.countDocuments(), 2);
});

test('rejects bad input', async () => {
    await request(app).post('/logs').send([log({ level: 'nope' })]).expect(400);
    await request(app).post('/logs').send([]).expect(400);
    await request(app).post('/logs').set('Content-Type', 'application/json').send('{bad json').expect(400);
    await request(app).post('/logs').send(Array.from({ length: 1001 }, () => log())).expect(413);
});

test('strips unknown fields', async () => {
    await request(app).post('/logs').send(log({ $where: 'x', evil: true })).expect(201);
    const doc = await logModel.findOne().lean();
    assert.strictEqual(doc.evil, undefined);
});

test('many concurrent single-log requests are all stored', async () => {
    await Promise.all(Array.from({ length: 250 }, (_, i) =>
        request(app).post('/logs').send(log({ message: `msg ${i}` })).expect(201)));
    assert.strictEqual(await logModel.countDocuments(), 250);
});

test('searches by fields, free text and time range', async () => {
    await request(app).post('/logs').send([
        log({ level: 'error', message: 'Failed to connect to DB', timestamp: '2023-09-15T08:00:00Z' }),
        log({ level: 'warn', message: 'Slow query detected', timestamp: '2023-09-15T09:00:00Z' }),
        log({ level: 'info', message: 'Server started', resourceId: 'server-9', timestamp: '2023-09-16T08:00:00Z' }),
    ]).expect(201);

    const q = (query) => request(app).get('/logs').query({ q: query }).expect(200).then(r => r.body.logs);

    assert.strictEqual((await q('level:error')).length, 1);
    assert.strictEqual((await q('level:error OR level:warn')).length, 2);
    assert.strictEqual((await q('NOT level:info')).length, 2);
    assert.strictEqual((await q('resourceId:server-9*')).length, 1);
    assert.strictEqual((await q('connect')).length, 1); // full-text on message (stemmed)
    assert.strictEqual((await q('timestamp:[2023-09-15T00:00:00Z TO 2023-09-15T23:59:59Z]')).length, 2);

    const windowed = await request(app).get('/logs')
        .query({ q: 'level:error OR level:info', from: '2023-09-16T00:00:00Z', to: '2023-09-17T00:00:00Z' })
        .expect(200);
    assert.deepStrictEqual(windowed.body.logs.map(l => l.level), ['info']);
    await request(app).get('/logs').query({ from: 'yesterday-ish' }).expect(400);

    const all = await q('');
    assert.deepStrictEqual(all.map(l => l.level), ['info', 'warn', 'error']); // newest first
});

test('returns 400 for invalid queries instead of crashing', async () => {
    const res = await request(app).get('/logs').query({ q: '$where:sleep(1000)' }).expect(400);
    assert.match(res.body.error, /Unknown field/);
    await request(app).get('/logs').query({ q: '(level:error' }).expect(400);
    await request(app).get('/logs').query({ limit: 'abc' }).expect(400);
    await request(app).get('/logs').query({ cursor: 'garbage' }).expect(400);
});

test('cursor pagination walks every log exactly once', async () => {
    // Several logs share a timestamp, which is where naive pagination skips or repeats rows.
    const logs = Array.from({ length: 25 }, (_, i) =>
        log({ message: `m${i}`, timestamp: new Date(Date.UTC(2023, 8, 15, 0, 0, Math.floor(i / 3))).toISOString() }));
    await request(app).post('/logs').send(logs).expect(201);

    const seen = [];
    let cursor;
    let pages = 0;
    do {
        const res = await request(app).get('/logs').query({ limit: 10, ...(cursor && { cursor }) }).expect(200);
        seen.push(...res.body.logs.map(l => l.message));
        cursor = res.body.nextCursor;
        pages++;
    } while (cursor);

    assert.strictEqual(pages, 3);
    assert.strictEqual(seen.length, 25);
    assert.strictEqual(new Set(seen).size, 25);
});

test('health check', async () => {
    const res = await request(app).get('/health').expect(200);
    assert.deepStrictEqual(res.body, { status: 'ok', db: 'up' });
});

test('batch writer groups concurrent writes into fewer inserts', async () => {
    const before = { ...writer.stats };
    await Promise.all(Array.from({ length: 200 }, (_, i) =>
        request(app).post('/logs').send(log({ message: `g${i}` })).expect(201)));
    const batches = writer.stats.batches - before.batches;
    assert.strictEqual(writer.stats.logs - before.logs, 200);
    assert.ok(batches < 200, `expected fewer than 200 inserts, got ${batches}`);
});
