import {z} from 'zod' // a library that can be used for schema definition and validations
import {apiError} from '../utils/apiError.js'
import { Request, Response, NextFunction } from 'express'

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

// since Zod already knows the submission-schema
// therefore it can automatically infer and generate a TS type
// this saves us from maually recreating an interface/type
export type submissionPayload = z.infer<typeof submissionSchema>
// We export this as SubmissionPayload.
// We will use this in the next file so our API controller knows exactly what request.body looks like.
// Here it has no use, we do so to save from manually creating type everywhere we use request.body.

// this is the actual middleware
// this hasnt been made async becase Zod's parse() is itself sync
const validateSubmission = (request: Request,response: Response,next: NextFunction)=>{
    try{
        // here Zod actually performs validations
        submissionSchema.parse(request.body)
        next() // passes control to the next handler/middleware
    }catch(error){

        if(error instanceof z.ZodError){
            const message = error.issues.map((issue) => {
                return issue.message
            }).join(', ')
            next(new apiError(400 , message))
        }
        else{
            next(error) // to handles cases where the error isnt due to Zod/validation check
        }
        // best practice to use next(error), this directly 
        // passes control to the global error handler in app.js

        // throw error works well in sync middlewares 
        // but for async middlewares throwing errors makes Node.js loose
        // track of the error and crash the server
        // so best to use next(error), works well for both
    }
}

export {validateSubmission}