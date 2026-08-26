import { v4 as uuidv4 } from 'uuid'
import { createTempFolder , clearFolder } from '../utils/fileManager.js'
import { exec } from 'child_process'
import util from 'util'
import path from 'path'

const execPromise = util.promisify(exec)
const __dirname = path.resolve(path.dirname(''))

const submitCode = async (request, response) => {
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
        if(language == 'python'){
            dockerCommand = `docker run --rm -v "${absoluteTempPath}:/workspace" python:3.11-alpine python3 /workspace/Solution.py`
        }
        else{
            return response.status(400).json(
                {
                    error : "Only Python supported till now !!"
                }
            )
        }

        const {stdout , stderr} = await execPromise(dockerCommand)

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
        return response.status(500).json({
            jobID,
            status:"ERROR",
            stdout: error.stdout || '',
            stderr: error.stderr || error.message
        })
    }
}

export {submitCode}