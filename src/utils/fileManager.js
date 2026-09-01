import fs from 'fs/promises'
import path from 'path' // for better working with \ & /

const tempDirectoryPath = path.join(process.cwd(), 'temp')
// process.cwd() -> absolute path to the current working directory

const createTempFolder = async (jobID, language, srcCode, stdin) => {
    // if(!fs.existsSync(tempDirectoryPath)){
    //     fs.mkdirSync(tempDirectoryPath)
    // }
    
    await fs.mkdir(tempDirectoryPath, {recursive : true})
    // recursive: true -> ensures that parent folders are also created
    // so no need to check for existence of /temp since recursive:true
    // already hadnles it and creates if it doesnt exist.

    let ext=""
    if(language == 'cpp')  ext="cpp"
    else if(language == 'java') ext="java"
    else if(language == 'python') ext="py"

    const jobFolder=path.join(tempDirectoryPath, jobID)
    
    // fs.mkdirSync(jobFolder)
    await fs.mkdir(jobFolder , {recursive:true})

    const filePath = path.join(jobFolder , `Solution.${ext}`)
    
    // fs.writeFileSync(filePath , srcCode)
    await fs.writeFile(filePath , srcCode)

    // writing the input to /temp/jobID/input.txt
    const inputPath=path.join(jobFolder,'input.txt')
    await fs.writeFile(inputPath,stdin)

    return {
        jobFolder,
        filePath,
        inputPath
    }
}


const clearFolder = async (jobID) => {
    const jobFolder = path.join(tempDirectoryPath , jobID)

    // if(fs.existsSync(jobFolder)){
    //     fs.rmSync(
    //         jobFolder,
    //         {
    //             recursive : true,
    //             force : true
    //         }
    //     )
    // }
    try{
        await fs.rm(jobFolder , {
            recursive:true,
            force:true
        })
    } catch(error){
        console.log("Error Clearing the Folder : " , error)
    }
}

export {createTempFolder, clearFolder}
