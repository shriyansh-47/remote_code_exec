// Purpose of this file :-
// exec() can use stdin, but spawn() is designed around streams, 
// making it much better suited for feeding input to and reading 
// output from a running process.
// It provides streams like child.stdin, child.stdout, child.stderr
// which provide smooth functionality in case of interactive processes.

import {spawn, exec} from 'child_process'
import fs from 'fs'

/*
                 Node.js Worker
                       │
                       │ executeContainer()
                       ▼
              ┌─────────────────┐
              │ spawn("docker") │
              └────────┬────────┘
                       │
             ┌─────────┼─────────┐
             │         │         │
             ▼         ▼         ▼
          stdin      stdout    stderr
             ▲         │         │
             │         │         │
        input.txt      │         │
             │         │         │
             └─────────┼─────────┘
                       │
                       ▼
                 Docker Container
                       │
                       ▼
                  User Program
                       │
                ┌──────┴──────┐
                │             │
             success        failure
             code=0         code!=0
                │             │
                ▼             ▼
             resolve        reject
*/

interface executionOutput {
    stdout: string;
    stderr: string;
}
interface executionError {
    type: 'TIME-LIMIT-EXCEEDED' | 'MEMORY-LIMIT-EXCEEDED' | 'RUNTIME-ERROR' | 'COMPILATION-ERROR';
    message: string;
}
// Now TypeScript knows that this Promise will either resolve with an ExecutionResult,
// or it will reject. (TypeScript doesn't type-check Promise rejections directly, 
// but having the ExecutionError interface is amazing for documenting it).

// commandStr -> contains docker command 
// This function returns a Promise which, if successful, resolves to an ExecutionResult.
export const executorContainer = (commandStr: string, inputPath: string, jobID:string): Promise<executionOutput> => {
    // undefined because inputfile is optional so when no fileinput then inputpath is undefined

    // spawn is wrapped in a promise because inherently it is event
    // based function i.e. doesnt use async/await rather uses event
    // listeners to end the process or function like child.on('close')
    // In order to use async/await in worker.js we wrap this in a Promise
    // so process spawned wont stop until resolve() or reject() is called.
    return new Promise((resolve,reject) => {
        let stdout=''
        let stderr=''
        let isTimeLimitExceeded = false;
        
        // { shell: true } lets us pass the entire command as a single string,
        // which is interpreted and executed by the shell.
        // Inherently spawn() expects executable & arguments separately
        const child = spawn(commandStr, {
            shell : true
        })

        if(inputPath){
            // createReadStream doesnt necessarily copies the input.txt
            // into the docker container, rather it build a stream of bytes
            const inputStream = fs.createReadStream(inputPath)

            // this creates a pipe from input.txt to the stdin of Docker container
            // and writes its contents into the stdin
            inputStream.pipe(child.stdin)
            
            // ts is imp since this tells stdin (signals EOF to stdin)
            // that input file has been exhausted and no more input is left.
            inputStream.on('end' , ()=>{
                child.stdin.end();
            })
        }

        // Note this buffer thingy, data is a Buffer in Node.js streams
        child.stdout.on('data', (data: Buffer)=>{
            // since stdout is also a stream so it may send
            // outputs in byte chunks so we keep appending as 
            // the output arrives.
            stdout+=data.toString()
        })

        child.stderr.on('data', (data: Buffer) => {
            stderr+=data.toString()
        })
        
        // if the program doesnt complete its execution in 5 seconds
        // we forcefully kill the docker container by name
        const timer = setTimeout(() => {
            isTimeLimitExceeded = true;
            exec(`docker rm -f rce-${jobID}`, () => {
                reject({
                    type:'TIME-LIMIT-EXCEEDED',
                    message:'Execution took too long (> 5sec)'
                })
            })
        } , 5000)

        // This executes when the child process has finished and 
        // its stdio streams have been closed.
        // code == 0 -> success
        // else some kind of error

        // Node's spawn strictly types the exit code as number | null. 
        // It can be null if the process was completely abruptly killed by the OS (like a power outage or a SIGKILL before it could finish shutting down).
        child.on('close' , (code: number | null)=>{
            // cancel the timer if the code executed before 5 sec
            clearTimeout(timer)
            
            // If the timeout triggered `docker rm -f`, the container is killed with SIGKILL (137)
            if(isTimeLimitExceeded) return; // Promise already rejected in setTimeout

            // Linux's OOM (out-of-memory) killer returns code = 137
            // when terminating a process consuming more memory than we specified
            if(code === 137){
                return reject({
                    type:'MEMORY-LIMIT-EXCEEDED',
                    message:'Code consumed all my memory (>256MB)'
                })
            }

            if(code !== 0){
                return reject({
                    type:'RUNTIME-ERROR',
                    message:stderr||'Execution Failed'
                })
            }

            resolve({stdout,stderr})
        })
    })
}