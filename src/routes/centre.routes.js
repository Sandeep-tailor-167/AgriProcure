'use strict';

const express = require('express');
const controller = require('../controllers/centre.controller');
const schemas = require('../validators/centre.schema');
const { validate } = require('../middlewares/validate');
const { authenticate } = require('../middlewares/authenticate');
const { authorize } = require('../middlewares/authorize');
const { asyncHandler } = require('../utils/async-handler');
const { ROLES } = require('../constants/roles');

const router = express.Router();
router.get('/centres', validate(schemas.discoveryQuerySchema, 'query'), asyncHandler(controller.listCentres));
router.get('/centres/:id', validate(schemas.idParamSchema, 'params'), asyncHandler(controller.getCentre));
router.get('/crops', asyncHandler(controller.listCrops));
router.get('/schedules', validate(schemas.scheduleQuerySchema, 'query'), asyncHandler(controller.listSchedules));
router.post('/centres', authenticate, authorize(ROLES.ADMIN), validate(schemas.centreCreateSchema), asyncHandler(controller.createCentre));
router.patch('/centres/:id/status', authenticate, authorize(ROLES.ADMIN), validate(schemas.idParamSchema, 'params'), validate(schemas.centreStatusSchema), asyncHandler(controller.changeCentreStatus));
router.post('/crops', authenticate, authorize(ROLES.ADMIN), validate(schemas.cropCreateSchema), asyncHandler(controller.createCrop));
router.post('/schedules', authenticate, authorize(ROLES.OFFICER, ROLES.ADMIN), validate(schemas.scheduleSchema), asyncHandler(controller.createSchedule));
router.patch('/schedules/:id', authenticate, authorize(ROLES.OFFICER, ROLES.ADMIN), validate(schemas.idParamSchema, 'params'), validate(schemas.scheduleUpdateSchema), asyncHandler(controller.updateSchedule));
router.get('/schedules/:id/history', authenticate, authorize(ROLES.OFFICER, ROLES.ADMIN), validate(schemas.idParamSchema, 'params'), asyncHandler(controller.scheduleHistory));

module.exports = router;
