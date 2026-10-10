import express from 'express'
import cors from 'cors'
import { Request, Response, NextFunction } from 'express'

const app = express()

app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true
}))

app.use(express.json({
    limit: '16kb'
}))

import SubmissionRouter from './routes/submissions.routes.js'
app.use('/api/v1', SubmissionRouter)

app.use( (error: any, request: Request, response: Response, next: NextFunction) => {
    const statusCode = error.statusCode || 500
    return response.status(statusCode).json({
        success : false,
        message : error.message || "Some Error Occurred !!",
        error : error.errors || [],
        stack : error.stack || ""
        
    })
})
// This is a Global Error Handler which is called by the asyncHandler where it calls
// next(error) on catching some error
// Error Bubbling concept is used where an error thrown by submissions controller
// is caught by asyncHandler and this handler is called which present a proper
// JSON response for the client.
// all errors thrown by any controller & caught by asynchHandler would reach here
// at the end
// Express identifies a global error handler by seeing exactly 
// 4 parameters (error, req, res, next). TypeScript needs all 4 typed. 
// The error is any because errors thrown across your app can be your apiError, 
// a Zod error, a random string — literally anything.

export { app }