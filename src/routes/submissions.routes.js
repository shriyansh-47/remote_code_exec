import { Router } from 'express'
import { submitCode } from '../controllers/submissions.controller.js'
const router = Router()

router.route('/submissions').post(submitCode)

export default router