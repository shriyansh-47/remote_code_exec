class apiError extends Error {
    // Class Properties aren't declared using const/let
    // only local data members are declared so.
    statusCode: number
    data: null
    success: boolean
    errors: string[]
    constructor(
        statusCode: number,
        message: string = "Error Occurred !!",
        errors: string[] = [],
        stack: string = ""
    ){
        super(message)
        this.statusCode=statusCode
        this.data=null
        this.message=message
        this.success=false
        this.errors=errors

        if(stack){
            this.stack=stack
        }
        else{
            Error.captureStackTrace(this,this.constructor) // Node.js specific API
        }
    }
}

export {apiError}