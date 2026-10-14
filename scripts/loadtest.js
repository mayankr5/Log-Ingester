// Load test for the running service.
//
//   node scripts/loadtest.js [baseUrl]        (default http://localhost:3000)
//
// Runs three scenarios with autocannon and prints throughput and latency:
//   1. one log per POST request
//   2. 100 logs per POST request (batch ingestion)
//   3. search queries

const autocannon = require('autocannon');

const BASE = process.argv[2] || 'http://localhost:3000';
const DURATION = Number(process.env.DURATION) || 20;
const CONNECTIONS = Number(process.env.CONNECTIONS) || 100;

const LEVELS = ['error', 'warn', 'info', 'debug'];
const makeLog = (i) => ({
    level: LEVELS[i % LEVELS.length],
    message: `Request ${i} failed to connect to upstream service`,
    resourceId: `server-${i % 50}`,
    timestamp: new Date().toISOString(),
    traceId: `trace-${i}`,
    spanId: `span-${i}`,
    commit: '5e5342f',
    metadata: { parentResourceId: `server-${i % 10}` },
});

function run(title, opts) {
    return new Promise((resolve, reject) => {
        const { path, ...rest } = opts;
        autocannon({ url: BASE + path, connections: CONNECTIONS, duration: DURATION, ...rest }, (err, r) => {
            if (err) return reject(err);
            const logsPerReq = opts.logsPerRequest || 0;
            console.log(`\n${title}`);
            console.log(`  requests/sec : ${Math.round(r.requests.average)}`);
            if (logsPerReq) console.log(`  logs/sec     : ${Math.round(r.requests.average * logsPerReq)}`);
            console.log(`  latency p50  : ${r.latency.p50} ms`);
            console.log(`  latency p99  : ${r.latency.p99} ms`);
            console.log(`  errors/non2xx: ${r.errors} / ${r.non2xx}`);
            resolve(r);
        });
    });
}

async function main() {
    console.log(`Target ${BASE}, ${CONNECTIONS} connections, ${DURATION}s per scenario`);

    let i = 0;
    await run('Single-log ingestion (POST /logs, 1 log/request)', {
        method: 'POST',
        path: '/logs',
        headers: { 'content-type': 'application/json' },
        logsPerRequest: 1,
        setupClient: (client) => client.setBody(JSON.stringify(makeLog(i++))),
    });

    const batch = JSON.stringify(Array.from({ length: 100 }, (_, k) => makeLog(k)));
    await run('Batch ingestion (POST /logs, 100 logs/request)', {
        method: 'POST',
        path: '/logs',
        headers: { 'content-type': 'application/json' },
        body: batch,
        logsPerRequest: 100,
    });

    const q = encodeURIComponent('level:error AND resourceId:server-1*');
    await run('Search (GET /logs?q=level:error AND resourceId:server-1*&limit=50)', {
        method: 'GET',
        path: `/logs?q=${q}&limit=50`,
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
