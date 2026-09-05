import rateLimit from "express-rate-limit";
import {apiError} from "../utils/apiError.js";

const apiRateLimiter = rateLimit({
    windowMs : 1*60*1000, // === 1 min
    max : 20, // IP address is used as identifier & limits to 20 requests/minute
    // handler specifies what happens on violation of rate limit
    handler : (request , response, next) => {
        next(new apiError(429, "Too many requests from this IP, please try again later"))
    }
})

export {apiRateLimiter}