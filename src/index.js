import dotenv from 'dotenv'
dotenv.config({
    path: './.env'
})

import { app } from './app.js'

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server is listening at ${process.env.PORT || 3000}`)
})