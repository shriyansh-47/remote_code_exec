import fs from 'fs/promises'

const parseMetrics = async (metricsFilePath) => {
    try{
        const data = await fs.readFile(metricsFilePath, 'utf8')

        const [time, memory] = data.trim().split(' ')
        const timeSec = parseFloat(time)
        const memoryKB = parseInt(memory, 10)

        return {
            executionTime : timeSec,
            memoryUsage : memoryKB / 1024 
        }
    }catch(error){
        return{
            // if metrics.txt doesnt exist that means the code resulted in some error
            // thus /usr/bin/time wasnt able to write the required parameters
            executionTime : null,
            memoryUsage : null
        }
    }
}

export { parseMetrics }
