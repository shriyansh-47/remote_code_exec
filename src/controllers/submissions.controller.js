import { v4 as uuidv4 } from 'uuid'
import { createTempFolder , clearFolder } from '../utils/fileManager.js'
import { exec } from 'child_process'
import util from 'util'
import path from 'path'
import { asyncHandler } from '../utils/asyncHandler.js'

const execPromise = util.promisify(exec)
// converting it to a promise to prevent callback usage

// exec() executes a command in an invisible child terminal
// and gives you the command's output (stdout), errors (stderr).

const submitCode = asyncHandler( async (request, response) => {
    const {language , srcCode} = request.body

    if(!language || !srcCode){
        return response.status(400).json(
            {
                error : "Language or Source-Code not found !!"
            }
        )
    }

    const jobID = uuidv4()

    try{
        await createTempFolder(jobID, language, srcCode)

        const absoluteTempPath = path.join(process.cwd(), 'temp' , jobID)

        let dockerCommand = ''

        // Docker-Container Creation :-
        // container gets created on the server's disk & runs on server's RAM
        // hence we dont need docker engine ruunning on client's system
        // the first time we run a code it takes time coz first docker has to download the image
        // from docker-hub, once downloaded its permanent in the cache.

        // python -> interpreted language so no compilation step
        if(language == 'python'){
            dockerCommand = `docker run --rm -v "${absoluteTempPath}:/workspace" python:3.11-alpine python3 /workspace/Solution.py`
            // --rm -> auto deletes the conatiner
            // -v -> means volume/blind mount, helps connect a dir on host machine(server's machine) to any location specified inside the container created
            // inside the container, it gets created with the name: '/workspace'
            // Any changes made inside /workspace would get reflected back onto the file shared o the host machine & vice versa
            // python:3.11-alpine -> this is the "image" we are using to create the container, it contains python 3.11 & Alpine Linux is a lightweight os
        }

        else if(language == 'cpp'){
            dockerCommand = `docker run --rm -v "${absoluteTempPath}:/workspace" gcc:latest sh -c "g++ /workspace/Solution.cpp -o /workspace/exeFile && /workspace/exeFile"`
            // in dockers :-
            // docker run [options] <image> <command>
            // sh -> starts a shell
            // -c -> tells the string following this is going to be a shell command
            // enclosed within "" so that the path with spaces are handled correctly
            // inside the container, the path: '/workspace' is the same as absoluteTempPath of host machine
            // hence, file '/workspace/Solution.cpp' is the same as '/absoluteTempPath/Solution.cpp' on host machine
            // && means executable will run only when compilation is successful.
        }

        else if(language == 'java'){
            dockerCommand = `docker run --rm -v "${absoluteTempPath}:/workspace" eclipse-temurin:17-jdk-alpine sh -c "javac /workspace/Solution.java -d /workspace && java -cp /workspace Solution"`
            // -cp -> indicates where the class of compiled source code is kept
            // java -cp class-location class-name
            // javac Solution.java
            // java Solution
            // this is the natural way to compile & execute a Java command

            // class_name == name of class containing main
            // so we mustn't always name it Solution.java else error
            // implement later
        }

        else{
            return response.status(400).json({
                error:"Language not supported !!"
            })
        }

        const { stdout, stderr } = await execPromise(dockerCommand,{
            timeout:10000
        });
        // if the child terminal doesnt finish the task in 10sec its KILLED
        // preventing while(true) shenanigans
        
        // successfull compilation/exec of code returns exit code of 0
        // so execPromise doesn't reject the output

        // for a non-0 exit code (i.e. error occurred) the catch block runs
        // when execPromise reject the code execution
        // the stdout and stderr are attached to error object used in catch block

        await clearFolder(jobID)

        return response.status(200).json({
            jobID,
            status : "COMPLETED",
            stdout,
            stderr
        })
    }
    catch(error){
        await clearFolder(jobID)
        return response.status(200).json({
            jobID,
            status:"ERROR",
            stdout: error.stdout || '',
            stderr: error.stderr || error.message
        })
    }
})

export {submitCode}