import './workers/worker.js' // Node executes the top-level code of a module while
// importing it. So the worker instance would be created instantly & starts listening
// as the server of the app starts.

import dotenv from 'dotenv'
dotenv.config({
    path: './.env'
})

import { app } from './app.js'

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server is listening at ${process.env.PORT || 3000}`)
})