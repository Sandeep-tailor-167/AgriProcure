'use strict';

const express = require('express');
const authRoutes = require('./auth.routes');
const centreRoutes = require('./centre.routes');
const appointmentRoutes = require('./appointment.routes');
const queueRoutes = require('./queue.routes');
const transactionRoutes = require('./transaction.routes');
const notificationRoutes = require('./notification.routes');
const analyticsRoutes = require('./analytics.routes');
const predictionRoutes = require('./prediction.routes');
const recommendationRoutes = require('./recommendation.routes');

const router = express.Router();
router.use('/auth', authRoutes);
router.use('/', centreRoutes);
router.use('/', appointmentRoutes);
router.use('/', queueRoutes);
router.use('/', transactionRoutes);
router.use('/', notificationRoutes);
router.use('/', analyticsRoutes);
router.use('/', predictionRoutes);
router.use('/', recommendationRoutes);

module.exports = router;
