import mongoose from 'mongoose'
import { DB_NAME } from '../constants.js'

export const connectDB = async () => {
    try{
        const connectionInstance = await mongoose.connect(`${process.env.DB_URL}/${DB_NAME}`)
        console.log(`\nDatabase Connected Successfully !!\nDB HOST : ${connectionInstance.connection.host}`)
    }catch(error: any){
        console.log('DB Connection Error ',error)
        process.exit(1)
    }
}
