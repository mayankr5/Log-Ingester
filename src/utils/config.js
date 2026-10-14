// Defaults to the local MongoDB started by `make mongo`. Override with MONGODB_URI (or a .env file).
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/logs';

module.exports = { MONGODB_URI };
