'use strict';

const { z } = require('zod');
const id = z.coerce.number().int().positive();
const quantity = z.coerce.number().positive().max(100000);
const bookingSchema = z.object({ scheduleId: id, estimatedQuantity: quantity }).strict();
const cancelSchema = z.object({ reason: z.string().trim().min(5).max(500).optional() }).strict();
const rescheduleSchema = z.object({ newScheduleId: id, estimatedQuantity: quantity.optional() }).strict();
const idParamSchema = z.object({ id }).strict();

module.exports = { bookingSchema, cancelSchema, rescheduleSchema, idParamSchema };
