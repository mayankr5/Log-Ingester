// Fills the running service with realistic sample logs for trying out the UI.
//
//   node scripts/seed.js [baseUrl] [count]     (defaults: http://localhost:3000, 500)
//
// Logs are spread over the last 24 hours and grouped into traces, so you can
// click a traceId in the UI and see every log from that request.

const BASE = process.argv[2] || 'http://localhost:3000';
const COUNT = Number(process.argv[3]) || 500;

const SERVICES = ['api-gateway', 'orders', 'payments', 'inventory', 'auth'];
const TEMPLATES = [
    ['info', 'Received request GET /api/orders/{id}'],
    ['info', 'User {user} logged in successfully'],
    ['info', 'Order {id} created'],
    ['info', 'Cache hit for product catalog'],
    ['debug', 'Query took {ms}ms: SELECT * FROM orders WHERE user_id = ?'],
    ['debug', 'Retrying request to payments (attempt 2 of 3)'],
    ['warn', 'Slow query detected on orders table ({ms}ms)'],
    ['warn', 'Disk usage above 85% on /var/log'],
    ['warn', 'Rate limit almost reached for client {user}'],
    ['error', 'Failed to connect to DB: connection refused'],
    ['error', 'Timeout while calling inventory service after 5000ms'],
    ['error', 'Payment declined for order {id}: insufficient funds'],
    ['fatal', 'Out of memory, process exiting'],
];
// Most logs are info/debug, like in a real system.
const WEIGHTS = [20, 15, 12, 12, 10, 6, 6, 3, 3, 4, 3, 3, 1];

const rand = (n) => Math.floor(Math.random() * n);
const hex = (n) => Array.from({ length: n }, () => rand(16).toString(16)).join('');

function pickTemplate() {
    let r = rand(WEIGHTS.reduce((a, b) => a + b, 0));
    for (let i = 0; i < WEIGHTS.length; i++) {
        if ((r -= WEIGHTS[i]) < 0) return TEMPLATES[i];
    }
    return TEMPLATES[0];
}

function makeLogs() {
    const commits = Array.from({ length: 3 }, () => hex(7));
    const logs = [];
    while (logs.length < COUNT) {
        // One trace = one request touching 2-5 services within a second.
        const traceId = `${hex(8)}-${hex(4)}`;
        const start = Date.now() - rand(24 * 60 * 60 * 1000);
        const steps = 2 + rand(4);
        for (let s = 0; s < steps && logs.length < COUNT; s++) {
            const service = SERVICES[(s + rand(SERVICES.length)) % SERVICES.length];
            const [level, template] = pickTemplate();
            logs.push({
                level,
                message: template
                    .replace('{id}', String(10000 + rand(90000)))
                    .replace('{user}', `user-${rand(500)}`)
                    .replace('{ms}', String(200 + rand(3000))),
                resourceId: `${service}-${1 + rand(3)}`,
                timestamp: new Date(start + s * rand(300)).toISOString(),
                traceId,
                spanId: `span-${hex(6)}`,
                commit: commits[rand(commits.length)],
                metadata: { parentResourceId: s === 0 ? 'load-balancer-1' : `${SERVICES[0]}-1` },
            });
        }
    }
    return logs;
}

async function main() {
    const logs = makeLogs();
    let accepted = 0;
    for (let i = 0; i < logs.length; i += 1000) {
        const res = await fetch(`${BASE}/logs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(logs.slice(i, i + 1000)),
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}: ${await res.text()}`);
        accepted += (await res.json()).accepted;
    }
    console.log(`Added ${accepted} sample logs to ${BASE}. Open ${BASE}/explorer/`);
}

main().catch((err) => {
    console.error(`Could not seed logs: ${err.message}. Is the service running (make run)?`);
    process.exit(1);
});
