import {Worker} from 'bullmq' // Worker class from BullMQ, responsible for fetching a job from queue & processing it
import {redisConnection} from '../config/redis.js'
import {createTempFolder, clearFolder} from '../utils/fileManager.js'
import {exec} from 'child_process' // lets Node run shell commands
import util from 'util'
import path from 'path'

/*
This is the flow of a job till now in Phase-2 :-

                 PRODUCER
Frontend ──POST──► Express
                    │
                    │ addJobToQueue()
                    ▼
              BullMQ Queue
           "submission-queue"
                    │
                    ▼
                  Redis
                    │
                    │ job waiting
                    ▼
                 WORKER
                    │
                    ├── create files
                    ├── Docker
                    ├── compile
                    ├── execute
                    └── collect output
                    │
                    ▼
              BullMQ stores result
                    │
                    ▼
                  Redis
                    │
                    ▼
              GET /submissions/:id
*/
const execPromise = util.promisify(exec) // converting to a Promise so as to use async/await

// creating an instance of Worker class that listens on the queue named
// 'submission-queue' & runs the given processor function whenever a job is available
// job object passed in the function is provided by BullMQ itself & not the one I returned in producer.js
const worker = new Worker('submission-queue' , async(job)=>{
    const {jobID , language, srcCode} = job.data 
    // .data returns the payload (jobID, language, srcCode) producer stored while adding the job to the queue

    console.log(`Worker picked the job ${job.id}`)

    try{
        await createTempFolder(jobID, language, srcCode)
        const absoluteTempPath = path.join(process.cwd() , 'temp' , jobID)

        let dockerCommand = ''

        if(language == 'python'){
            dockerCommand = `docker run --rm -v "${absoluteTempPath}:/workspace" python:3.11-alpine python3 /workspace/Solution.py`
        }
        else if(language == 'cpp'){
            dockerCommand = `docker run --rm -v "${absoluteTempPath}:/workspace" gcc:latest sh -c "g++ /workspace/Solution.cpp -o /workspace/execSolution && /workspace/execSolution"`
        }
        else if(language == 'java'){
            dockerCommand = `docker run --rm -v "${absoluteTempPath}:/workspace" eclipse-temurin:17-jdk-alpine sh -c "javac /workspace/Solution.java -d /workspace && java -cp /workspace Solution"`
        }
        else{
            throw new Error("Language not Supported !!") // apiError class was for HTTP request only
        }

        const {stdout , stderr} = await execPromise(dockerCommand , {timeout : 10000})

        await clearFolder(jobID)

        return {stdout, stderr}
        // here BullMQ itslef marks the state of job : completed
        // this return tells BullMQ that the job has been completed
        // and BullMQ stores the returned data Redis as
        // {
        //      job_state = COMPLETED, 
        //      returnvalue = {
        //          stdout: "...",
        //          stderr: "..."
        //      }
        // }
    }
    catch(error){
        await clearFolder(jobID)
        throw new Error(error.stderr || error.message)
        // on error occurence BullMQ sees the thrown error and marks the state : failed
    }
},
{
    connection : redisConnection,
    concurrency: 5
    // defines how many max jobs can be executed concurrently
})

worker.on('completed' , (job) => {
    console.log(`Job ${job.id} Completed Successfully !!`)
})

worker.on('failed' , (job , error) => {
    console.log(`Job ${job.id} failed : ${error.message}`)
})

export {worker}