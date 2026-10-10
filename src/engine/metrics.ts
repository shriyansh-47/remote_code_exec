import fs from 'fs/promises'

// We define what kind output the function is returing encompassing all cases
// i.e. an object with properties execTime & memUsage
interface MetricsResult {
    executionTime: number | null;
    memoryUsage: number | null; 
}

// an async function always returns a Promise, this sitn explicitly visible in JS
// in TS we explicitly can see it tho.
const parseMetrics = async (metricsFilePath: string): Promise<MetricsResult> => {
    try{
        const data = await fs.readFile(metricsFilePath, 'utf8')

        const [time, memory] = data.trim().split(' ')
        
        // Prevents TS error in parse functions if Metrics files are empty or partially filled
        if(time === undefined || memory === undefined){
            throw new Error("idk")
        }

        const timeSec = parseFloat(time)
        const memoryKB = parseInt(memory, 10)

        return {
            executionTime : timeSec * 1000,
            memoryUsage : memoryKB
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
