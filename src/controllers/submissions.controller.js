import {v4 as uuidv4} from 'uuid'
import { addJobToQueue, getJobById } from '../queues/producer.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import {apiError} from '../utils/apiError.js' 


const submitCode = asyncHandler( async (request,response) => {
    const {language , srcCode} = request.body

    if(!language){
        throw new apiError(400, "Langauge not specified !!")
    }
    if(!srcCode){
        throw new apiError(400, "Source Code not specified !!")
    }

    const jobID = uuidv4()

    await addJobToQueue(jobID, language, srcCode)

    return response.status(202).json({
        jobID,
        status : "QUEUED"
    })
})
// Splitting submission controller into POST & GET
// POST -> adds a client submitted job into the queue and then breaks the HTTP
// connection (returning response before job is completed)

// This separates fast HTTP/request handling from slow background work.
// It prevents multiple HTTP requests from staying open on the Express server
// for the entire duration of code compilation, execution & output processing.

// GET -> once user submits his code, his frontend would keep sending get requests
// with that JobID and the submission-status-controller would respond back with the status of the job.
// This is known as Polling where an endpoint is contantly hit with a request
// until desired result is obtained. This is not efficient and is very resource
// intensive. More efficient alternative is websockets.


const getSubmissionStatus = asyncHandler( async (request, response) => {
    const {jobID} = request.params // gets jobID from URL of HTTP request
    
    const job = await getJobById(jobID) // returns the BullMQ object job

    if(!job){
        throw new apiError(404, "Invalid Job-ID !!")
    }

    const status = await job.getState() // in-built func of BullMQ to get the state of the job 

    if(status === 'completed'){
        return response.status(200).json({
            jobID,
            status : status.toUpperCase(),
            result : job.returnvalue // in-built property of a completed BullMQ job object
        })
    }
    else if(status === 'failed'){
        // was sending JSON.stringify() from worker
        // this parsers back it to JSON format
        // better for Error-handling since this specifies the
        // kind of error too.
        const parsedError = JSON.parse(job.failedReason)
        return response.status(200).json({
            jobID,
            status : parsedError.type,
            error : parsedError.message
        })
    }
    else {
        return response.status(200).json({
            jobID,
            status : "PROCESSING"
        })
    }
})
export {submitCode , getSubmissionStatus}