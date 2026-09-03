// Purpose of this file :-
// exec() can use stdin, but spawn() is designed around streams, 
// making it much better suited for feeding input to and reading 
// output from a running process.
// It provides streams like child.stdin, child.stdout, child.stderr
// which provide smooth functionality in case of interactive processes.

import {spawn} from 'child_process'
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

// commandStr -> contains docker command 
export const executorContainer = (commandStr, inputPath) => {

    // spawn is wrapped in a promise because inherently it is event
    // based function i.e. doesnt use async/await rather uses event
    // listeners to end the process or function like child.on('close')
    // In order to use async/await in worker.js we wrap this in a Promise
    // so process spawned wont stop until resolve() or reject() is called.
    return new Promise((resolve,reject) => {
        let stdout=''
        let stderr=''
        
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

        child.stdout.on('data', (data)=>{
            // since stdout is also a stream so it may send
            // outputs in byte chunks so we keep appending as 
            // the output arrives.
            stdout+=data.toString()
        })

        child.stderr.on('data', (data) => {
            stderr+=data.toString()
        })
        
        // if the program doesnt complete its execution in 5 seconds
        // child.kill kills the docker container that was spawned

        // Note-> We havent implemented any internal time-limits on docker containers
        // only time limit till now is the the setTimeouts' 5 sec lim & compilation time
        // limit of 10 sec
        const timer = setTimeout(() => {
            child.kill('SIGKILL')
            reject({
                type:'TIME-LIMIT-EXCEEDED',
                message:'Execution took too long (> 5sec)'
            })
        } , 5000)

        // This executes when the child process has finished and 
        // its stdio streams have been closed.
        // code == 0 -> success
        // else some kind of error
        child.on('close' , (code)=>{
            // cancel the timer if the code executed before 5 sec
            clearTimeout(timer)
            
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