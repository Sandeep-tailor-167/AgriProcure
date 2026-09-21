'use strict';

const { z } = require('zod');

const phone = z.string().trim().regex(/^[0-9]{10,15}$/, 'Enter a valid mobile number.');
const password = z.string().min(10).max(128).regex(/[a-z]/, 'Password requires a lowercase letter.').regex(/[A-Z]/, 'Password requires an uppercase letter.').regex(/[0-9]/, 'Password requires a number.');
const noUnknown = (shape) => z.object(shape).strict();

const registrationRequestSchema = noUnknown({
  fullName: z.string().trim().min(2).max(120), phone, password,
  village: z.string().trim().max(100).optional().default(''),
  district: z.string().trim().min(2).max(100), state: z.string().trim().min(2).max(100),
  preferredLanguage: z.enum(['en', 'hi']).default('en')
});
const otpVerificationSchema = noUnknown({ challengeId: z.string().uuid(), otp: z.string().regex(/^[0-9]{6}$/) });
const loginSchema = noUnknown({ phone, password: z.string().min(1).max(128) });
const refreshSchema = noUnknown({ refreshToken: z.string().min(40).max(500) });
const logoutSchema = noUnknown({ refreshToken: z.string().min(40).max(500) });
const profileUpdateSchema = noUnknown({
  fullName: z.string().trim().min(2).max(120), village: z.string().trim().max(100).optional().default(''),
  district: z.string().trim().min(2).max(100), state: z.string().trim().min(2).max(100),
  preferredLanguage: z.enum(['en', 'hi']), preferredCentreId: z.coerce.number().int().positive().nullable().optional()
});
const officerProvisionSchema = noUnknown({
  fullName: z.string().trim().min(2).max(120), phone, temporaryPassword: password,
  centreIds: z.array(z.coerce.number().int().positive()).min(1).max(20)
});

module.exports = { registrationRequestSchema, otpVerificationSchema, loginSchema, refreshSchema, logoutSchema, profileUpdateSchema, officerProvisionSchema };
