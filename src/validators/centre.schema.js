'use strict';

const { z } = require('zod');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const id = z.coerce.number().int().positive();

const discoveryQuerySchema = z.object({ q: z.string().trim().max(120).optional(), district: z.string().trim().max(100).optional(), cropId: id.optional() }).strict();
const scheduleQuerySchema = z.object({ centreId: id.optional(), cropId: id.optional(), dateFrom: date.optional(), dateTo: date.optional() }).strict();
const centreCreateSchema = z.object({
  centreCode: z.string().trim().min(3).max(32).regex(/^[A-Z0-9-]+$/), centreName: z.string().trim().min(3).max(160),
  addressLine: z.string().trim().min(5).max(255), village: z.string().trim().max(100).optional(), district: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100), postalCode: z.string().trim().max(12).optional(), latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(), publicPhone: z.string().regex(/^[0-9]{10,15}$/).optional(),
  openingTime: time, closingTime: time, physicalDailyCapacity: z.coerce.number().int().positive().max(100000),
  centreStatus: z.enum(['open', 'busy', 'closed']).default('open'), cropIds: z.array(id).min(1).max(100)
}).strict().refine((value) => value.openingTime < value.closingTime, { message: 'Closing time must be after opening time.', path: ['closingTime'] });
const cropCreateSchema = z.object({ cropCode: z.string().trim().min(2).max(32).regex(/^[A-Z0-9_]+$/), cropNameEn: z.string().trim().min(2).max(100), cropNameHi: z.string().trim().min(1).max(100), quantityUnit: z.enum(['quintal', 'kilogram', 'tonne']) }).strict();
const scheduleSchema = z.object({ centreId: id, cropId: id, procurementDate: date, startTime: time, endTime: time, capacity: z.coerce.number().int().positive().max(100000), scheduleStatus: z.enum(['draft', 'published']).default('draft') }).strict().refine((value) => value.startTime < value.endTime, { message: 'End time must be after start time.', path: ['endTime'] });
const scheduleUpdateSchema = z.object({ procurementDate: date, startTime: time, endTime: time, capacity: z.coerce.number().int().positive().max(100000), scheduleStatus: z.enum(['draft', 'published', 'closed', 'cancelled']), closureReason: z.string().trim().min(5).max(500).nullable().optional(), changeReason: z.string().trim().min(5).max(500) }).strict().refine((value) => value.startTime < value.endTime, { message: 'End time must be after start time.', path: ['endTime'] }).refine((value) => !['closed', 'cancelled'].includes(value.scheduleStatus) || value.closureReason, { message: 'A closure reason is required.', path: ['closureReason'] });
const centreStatusSchema = z.object({ status: z.enum(['open', 'busy', 'closed', 'inactive']), reason: z.string().trim().min(5).max(500).nullable().optional() }).strict().refine((value) => !['closed', 'inactive'].includes(value.status) || value.reason, { message: 'A reason is required.', path: ['reason'] });
const idParamSchema = z.object({ id }).strict();

module.exports = { discoveryQuerySchema, scheduleQuerySchema, centreCreateSchema, cropCreateSchema, scheduleSchema, scheduleUpdateSchema, centreStatusSchema, idParamSchema, id };
