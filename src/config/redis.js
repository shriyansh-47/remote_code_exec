import {Redis} from 'ioredis' // Node.js module for interaction with Redis db

const redisConnection = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    maxRetriesPerRequest: null // always used with BullMQ
    // this field decides how many times does a request retry for a res
    // from redis become throwing an error  

    // Waiting for jobs is inherent to how a BullMQ Worker works

    // Redis() returns the connection object instantly 
    // and tries to connect in the background, since background thus
    // cant use try/catch or await so use event listeners
})


redisConnection.on('connect', () => {
    console.log("Redis Connected Successfully !!")
})

// cant use process.exit(1) since redis isnt a primary db
// so these may restart or fail for some time so we
// keep retrying connecting to them.
redisConnection.on('error' , (error) => {
    console.log("Connection to Redis failed : ", error)
})

export {redisConnection}