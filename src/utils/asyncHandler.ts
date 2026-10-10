import { Request, Response, NextFunction } from 'express'

// Declaring a type which has to be a function that returns a Promise of any-type
// in TS Promises are defined as generics Promise<T> so TS expects us to define the type of Promise too.
type RequestHandlerFunction = (req: Request, res: Response, next: NextFunction) => Promise<any>

// asyncHandler accepts a parameter called requestHandler
// and that parameter must be a function matching RequestHandlerFunction.
const asyncHandler = (requestHandler: RequestHandlerFunction) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(requestHandler(req, res, next))
            .catch((error) => {
                next(error)
            })
    }
}

export { asyncHandler }