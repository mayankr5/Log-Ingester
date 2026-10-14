// Starts a throwaway local MongoDB for development and load testing,
// so you don't need MongoDB or Docker installed.
//
//   node scripts/dev-mongo.js            (listens on port 27017 until Ctrl+C)

const { MongoMemoryServer } = require('mongodb-memory-server');

const PORT = Number(process.env.MONGO_PORT) || 27017;

MongoMemoryServer.create({ instance: { port: PORT } }).then((mongo) => {
    console.log(`MongoDB running at ${mongo.getUri()}logs`);
    const stop = async () => { await mongo.stop(); process.exit(0); };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
});
