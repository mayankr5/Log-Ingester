require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('./src/db/index');
const { logModel } = require('./src/models/log.models');
const { BatchWriter } = require('./src/ingest/batchWriter');
const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;

async function main() {
    await connectDB();
    await logModel.init(); // make sure indexes exist before serving traffic

    const writer = new BatchWriter(logModel, {
        maxBatchSize: Number(process.env.BATCH_SIZE) || 1000,
        maxInFlight: Number(process.env.MAX_IN_FLIGHT) || 4,
    });

    const app = createApp({ model: logModel, writer });
    const server = app.listen(PORT, () => {
        console.log(`Server is running at port ${PORT}`);
    });
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Port ${PORT} is already in use. Is another instance running? Try \`make stop\`.`);
            process.exit(1);
        }
        throw err;
    });

    // Graceful shutdown: stop taking requests, write buffered logs, then close the DB.
    const shutdown = async (signal) => {
        console.log(`${signal} received, shutting down`);
        server.close(async () => {
            await writer.close();
            await mongoose.disconnect();
            process.exit(0);
        });
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

main().catch((err) => {
    console.error('Failed to start server', err);
    process.exit(1);
});
