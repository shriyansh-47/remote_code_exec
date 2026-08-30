import {Queue} from 'bullmq'
import {redisConnection} from '../config/redis.js'
import { asyncHandler } from '../utils/asyncHandler.js'

const submissionQueue = new Queue('submission-queue' , {
    connection : redisConnection
})
// names a section (BullMQ queue) inside the redis db (BullMQ uses redis data-struct to manage the queue)
// where new jobs will be added and pending would be fetched from.

const addJobToQueue = async (jobID, language, srcCode) =>{
    // .add() returns metadata about the queue object like timestamp of addition,
    // payload data, internal ID, etc.
    const job = await submissionQueue.add("code-execution", {
        jobID,
        language,
        srcCode
    },
    {
        jobId : jobID // tells BullMQ that internal job.id will
        // be same as the uuidv4() we created
    })
    // code-execution is the name for the job
    // it adds a json object in the queue like {job-name , job-data}
    // where job-data = {jobID, language, srcCode}

    console.log(`Job-${job.id} added to the queue`)
    return job
}

// job.id == jobID so this is correct
const getJobById = async(jobID) => {
    return await submissionQueue.getJob(jobID)
}

// no error handling since Error-Bubbling will be used and the error
// will be caught by asyncHandler in submitCode controller.
export {addJobToQueue , getJobById}


