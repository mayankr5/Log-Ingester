require('dotenv').config()
const cors = require('cors')
const connectDB = require("./src/db/index").connectDB;
const express = require('express');
const compile = require('lucene-mongo-query')
const { logModel } = require("./src/models/log.models");

const app = express();
app.use(express.json())
app.use(cors())
// app.use(express.static('public'))

const addLog = async (req, res) => {
    let {level, message, resourceId, timestamp, traceId, spanId, commit, metadata} = req.body;
    timestamp = new Date(timestamp);
    try{
        const logingest = new logModel({
            level,
            message,
            resourceId,
            timestamp,
            traceId,
            spanId,
            commit,
            metadata
        })

        let save = await logingest.save();
        if(save){
            return res.json({success: "update successfully"})
        }
    }
    catch(err){
        return res.json({error: err})
    }
}

const retrieveLog = async (req, res) => {
    const str = req.query['q'];
    try{
        const query = compile(str);
        const logs = await logModel
                                .find(query)
                                .sort({timestamp: -1});
        if(logs){
            return res.json(logs);
        }else{
            return res.json("")
        }
    }
    catch(err){
        return res.json({error : err})
    }
}

app.post('/', async (req, res) => {
    await addLog(req, res);
})


app.get('/query', async (req, res) => {
    await retrieveLog(req, res);
})

connectDB()
.then(() => {
    app.listen(process.env.PORT || 3000, () => {
        console.log(` Server is running at port ${process.env.PORT || 3000} .... `);
    })
})
.catch((err) => {
    console.log("MONGO db connection failed !!! ", err);
})

