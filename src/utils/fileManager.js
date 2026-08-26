import fs from 'fs'
import path from 'path' // for better working with \ & /

const tempDirectoryPath = path.join(process.cwd(), 'temp')
// process.cwd() -> absolute path to the current working directory

const createTempFolder = (jobID, language, srcCode) => {
    if(!fs.existsSync(tempDirectoryPath)){
        fs.mkdirSync(tempDirectoryPath)
    }

    let ext=""
    if(language == 'cpp')  ext="cpp"
    else if(language == 'java') ext="java"
    else if(language == 'python') ext="py"

    const jobFolder=path.join(tempDirectoryPath, jobID)
    fs.mkdirSync(jobFolder)

    const filePath = path.join(jobFolder , `Solution.${ext}`)
    fs.writeFileSync(filePath , srcCode)

    return {
        jobFolder,
        filePath
    }
}


const clearFolder = (jobID) => {
    const jobFolder = path.join(tempDirectoryPath , jobID)

    if(fs.existsSync(jobFolder)){
        fs.rmSync(
            jobFolder,
            {
                recursive : true,
                force : true
            }
        )
    }
}

export {createTempFolder, clearFolder}
