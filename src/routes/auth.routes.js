'use strict';

const express = require('express');
const controller = require('../controllers/auth.controller');
const schemas = require('../validators/auth.schema');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { authorize } = require('../middlewares/authorize');
const { authRateLimit, otpRateLimit } = require('../middlewares/rate-limit');
const { asyncHandler } = require('../utils/async-handler');
const { ROLES } = require('../constants/roles');

const router = express.Router();

router.post('/register/request-otp', otpRateLimit, validate(schemas.registrationRequestSchema), asyncHandler(controller.requestRegistrationOtp));
router.post('/register/verify-otp', authRateLimit, validate(schemas.otpVerificationSchema), asyncHandler(controller.verifyRegistrationOtp));
router.post('/login', authRateLimit, validate(schemas.loginSchema), asyncHandler(controller.login));
router.post('/refresh', authRateLimit, validate(schemas.refreshSchema), asyncHandler(controller.refresh));
router.post('/logout', validate(schemas.logoutSchema), asyncHandler(controller.logout));
router.get('/me', authenticate, asyncHandler(controller.getProfile));
router.patch('/me', authenticate, authorize(ROLES.FARMER), validate(schemas.profileUpdateSchema), asyncHandler(controller.updateProfile));
router.post('/admin/officers', authenticate, authorize(ROLES.ADMIN), validate(schemas.officerProvisionSchema), asyncHandler(controller.provisionOfficer));

module.exports = router;
