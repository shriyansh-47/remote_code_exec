import { Router } from 'express'
import { submitCode, getSubmissionStatus } from '../controllers/submissions.controller.js'
import { apiRateLimiter } from '../middlewares/rateLimiter.js'
import { validateSubmission } from '../middlewares/validator.js'

const router = Router()

router.route('/submissions').post(apiRateLimiter, validateSubmission, submitCode)
router.route('/submissions/:jobID').get(apiRateLimiter, getSubmissionStatus)

export default router