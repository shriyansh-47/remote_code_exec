import {v4 as uuidv4} from 'uuid'
import { addJobToQueue } from '../queues/producer'
import { asyncHandler } from '../utils/asyncHandler'
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

export {submitCode}