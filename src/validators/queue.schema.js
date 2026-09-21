'use strict';
const { z } = require('zod');
const id = z.coerce.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const centreDateSchema = z.object({ centreId: id, date });
const checkInSchema = z.object({ appointmentId: id });
const tokenParamSchema = z.object({ id });
const transitionSchema = z.object({ status: z.enum(['in_service', 'inspection', 'completed', 'no_show']), reason: z.string().trim().max(500).optional() })
  .superRefine((v, ctx) => { if (v.status === 'no_show' && !v.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A no-show reason is required.' }); });
const controlSchema = z.object({ centreId: id, date, state: z.enum(['running', 'paused', 'closed']), activeCounters: z.coerce.number().int().min(1).max(50), reason: z.string().trim().max(500).optional() })
  .superRefine((v, ctx) => { if (v.state === 'paused' && !v.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A pause reason is required.' }); });
const interruptionSchema = z.object({ centreId: id, type: z.enum(['equipment', 'staffing', 'weather', 'connectivity', 'storage', 'other']), description: z.string().trim().min(3).max(1000) });
module.exports = { centreDateSchema, checkInSchema, tokenParamSchema, transitionSchema, controlSchema, interruptionSchema };
