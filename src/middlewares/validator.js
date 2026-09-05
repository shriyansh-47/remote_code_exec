import {z} from 'zod' // a library that can be used for schema definition and validations
import {apiError} from '../utils/apiError.js'

// z.object defines the schema of request.body must be an object 
// having fields language, srcCode, stdin(optional)
const submissionSchema = z.object({
    language : z.enum(['python','cpp','java'] , {
        message: 'Language not supported !!'
    }),
    
    srcCode: z.string() // means srcCode must be a string
    .min(1, "Source Code cannot be empty !!")
    .max(64000, "Source Code is too large (>64KB) !!"),

    stdin : z.string()
    .max(64000, "Input is too large (>64KB) !!")
    .optional()
})
// Note -> Zod captures all validations fails not just the 1st one

// this is the actual middleware
// this hasnt been made async becase Zod's parse() is itself sync
const validateSubmission = (request,response,next)=>{
    try{
        // here Zod actually performs validations
        submissionSchema.parse(request.body)
        next() // passes control to the next handler/middleware
    }catch(error){
        const message = error.issues.map((issue) => {
            return issue.message
        }).join(', ')
        next(new apiError(400 , message))
        // best practice to use next(error), this directly 
        // passes control to the global error handler in app.js

        // throw error works weel in sync middlewares 
        // but for async middlewares throwing errors makes Node.js loose
        // track of the error and crash the server
        // so best to use next(error), works well for both
    }
}

export {validateSubmission}