import {Worker} from 'bullmq' // Worker class from BullMQ, responsible for fetching a job from queue & processing it
import {redisConnection} from '../config/redis.js'
import {createTempFolder, clearFolder} from '../utils/fileManager.js'
import {exec} from 'child_process' // lets Node run shell commands
import util from 'util'
import path from 'path'
import { executorContainer } from '../engine/executor.js'

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
    const {jobID , language, srcCode, stdin} = job.data 
    // .data returns the payload (jobID, language, srcCode) producer stored while adding the job to the queue

    console.log(`Worker picked the job ${job.id}`)

    try{
        // this renames jobFolder ot absoluteTempPath
        const {jobFolder:absoluteTempPath} = await createTempFolder(jobID, language, srcCode, stdin)
        // const absoluteTempPath = path.join(process.cwd() , 'temp' , jobID)
        // We were originally ignoring the returned value of createTempFolder,
        // it was giving correct result because process.cwd() returns \rce
        // i.e. the directory in which the server started
        // so rce\temp\jobID gives the correct & intended results.
        // But this is better.

        // The code-execution phase is split into 2 parts :-
        // 1. Compilation Container -> Spin separate container for compilation
        // this helps in better error handling on Compilation error.
        // This contianer is not that highly restricted on read only restrictions
        // & memory usage since compilers create large intermediate and executable files.
        // Compilation can also be used to compromise a system, using Template Bombing in C++
        // & Malicious includes to freeze the compiler itself.
        // Since memory limit cant be imposed so execPromise's timeout property
        // is used to watch over such malpractices.

        // 2. Execution Container -> If compilation success, spin this container
        // it is heavily restricted sandboxed container.

        let stdout=''
        let stderr=''
        if (language === 'cpp' || language === 'java'){
            let compileCommand=''
            if(language === 'cpp'){
                compileCommand = `docker run --rm -v "${absoluteTempPath}:/workspace" rce-sandbox-cpp g++ /workspace/Solution.cpp -o /workspace/execSolution`
            }
            else if(language === 'java'){
                compileCommand = `docker run --rm -v "${absoluteTempPath}:/workspace" rce-sandbox-java javac /workspace/Solution.java -d /workspace`
                // -d specifies the directory where Solution.class file must be saved after successful compilation
            }

            try{
                await execPromise(compileCommand , {timeout : 10000})
                // even if we are not storing the result in stdout & stderr
                // if the compilation fails Node itself
                // attaches the outputs stderr & stdout to the compilationError object
                // passed in the catch()
            }catch(compilationError){
                throw new Error(JSON.stringify({
                    type:'COMPILATION-ERROR',
                    message:compilationError.stderr || compilationError.message
                }))
                // JSON.stringify() converts the error object into a string.
                // BullMQ stores Error.message as failedReason in Redis.
                // Stringifying lets us preserve structured error data (type, message, etc.)
                // so the Controller can later use JSON.parse() and send it to the frontend.
            }
        }

        let executeCommand=''
        
        const sandboxRestrictions = `--network none \
        --read-only \
        --tmpfs /tmp:rw,noexec,nosuid,size=64m \
        --user 1729:1729 \
        --cap-drop=ALL \
        --security-opt=no-new-privileges \
        --pids-limit 64 \
        --memory=256m \
        --memory-swap=256m -v "${absoluteTempPath}:/workspace:rw"`
        // :ro(read-only) changed to :rw(read-write) so that the Docker Container
        // can write back a file on the Host OS.


        
        // Some Explanations on mounting of dirs :-
        // -v "${absoluteTempPath}:/workspace:rw" creates a bind mount:
        //
        // ${absoluteTempPath} -> directory on the Host OS
        // /workspace          -> corresponding directory inside the container
        // rw                  -> read + write access
        //
        // Both paths refer to the same underlying files.
        // Therefore, changes made inside /workspace are reflected in the Host directory,
        // and changes made in the Host directory are visible inside /workspace.
        //
        // Example:
        // Host:      absoluteTempPath/Solution.cpp
        // Container: /workspace/Solution.cpp
        //
        // If the container creates /workspace/metrics.txt,
        // it will also appear in absoluteTempPath/metrics.txt on the Host.



        // /usr/bin/time -f "%e %M" -o /workspace/metrics.txt program_that_need_metric_measurements
        // This writes the elapsed-time(%e) and max-memory(%M) to a file metrics.txt on the Host OS
        // /usr/bin/time is an executable from GNU time utility, /usr/bin/time is itself a program 
        // that runs another program and measures how much time and memory that program uses.
        // -f -> means formating
        // %e -> means elapsed time in seconds / wall-clock time
        // %M -> means the Maximum Resident Set Size used by the process (in KB)
        // -o -> means write the measurements to a specified file and not the terminal
        // Since /workspace is bind-mounted to the host, the file is
        // also available on the Host OS.
        if(language === 'python'){
            executeCommand = `docker run --rm ${sandboxRestrictions} rce-sandbox-python /usr/bin/time -f "%e %M" -o /workspace/metrics.txt python3 /workspace/Solution.py`
        }
        else if(language === 'cpp'){
            executeCommand = `docker run --rm ${sandboxRestrictions} rce-sandbox-cpp /usr/bin/time -f "%e %M" -o /workspace/metrics.txt /workspace/execSolution`
        }
        else if(language === 'java'){
            executeCommand = `docker run --rm ${sandboxRestrictions} rce-sandbox-java /usr/bin/time -f "%e %M" -o /workspace/metrics.txt java -cp /workspace Solution`
        }
        else{
            throw new Error(JSON.stringify({
                type:'RUNTIME-ERROR',
                message:'Language not supported !!'
            }))
        }

        try{
            const inputPath = path.join(absoluteTempPath,'input.txt')
            const result = await executorContainer(executeCommand , inputPath)
            stdout = result.stdout
            stderr = result.stderr
        }catch(executionError){
            throw new Error(JSON.stringify(executionError))
        }

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