import { Router } from 'express'
import { submitCode, getSubmissionStatus } from '../controllers/submissions.controller.js'
const router = Router()

router.route('/submissions').post(submitCode)
router.route('/submissions/:jobID').get(getSubmissionStatus)

export default router