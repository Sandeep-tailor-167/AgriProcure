'use strict';

const express = require('express');
const controller = require('../controllers/appointment.controller');
const schemas = require('../validators/appointment.schema');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { authorize } = require('../middlewares/authorize');
const { asyncHandler } = require('../utils/async-handler');
const { ROLES } = require('../constants/roles');

const router = express.Router();
const farmerOnly = [authenticate, authorize(ROLES.FARMER)];
router.post('/appointments', ...farmerOnly, validate(schemas.bookingSchema), asyncHandler(controller.create));
router.get('/appointments/my', ...farmerOnly, asyncHandler(controller.mine));
router.patch('/appointments/:id/cancel', ...farmerOnly, validate(schemas.idParamSchema, 'params'), validate(schemas.cancelSchema), asyncHandler(controller.cancel));
router.post('/appointments/:id/reschedule', ...farmerOnly, validate(schemas.idParamSchema, 'params'), validate(schemas.rescheduleSchema), asyncHandler(controller.reschedule));
router.get('/appointments/:id/token', ...farmerOnly, validate(schemas.idParamSchema, 'params'), asyncHandler(controller.token));

module.exports = router;
