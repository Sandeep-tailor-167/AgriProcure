'use strict';

const { rateLimit } = require('express-rate-limit');

const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } } });
const otpRateLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, error: { code: 'OTP_RATE_LIMITED', message: 'Too many OTP requests. Try again later.' } } });

module.exports = { authRateLimit, otpRateLimit };
