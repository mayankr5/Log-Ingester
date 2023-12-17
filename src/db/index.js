const mongoose =  require("mongoose");

const { MONGODB_URI } = require('../utils/config')


const connectDB = async () => {
    try {
        const connectionInstance = await mongoose.connect(MONGODB_URI)
        console.log(`\n MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`);
    } catch (error) {
        console.log("MONGODB connection FAILED ", error);
        process.exit(1)
    }
}


module.exports = { connectDB };
