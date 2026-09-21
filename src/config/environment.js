'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

function integer(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

const environment = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: integer('PORT', 3000),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  trustProxy: integer('TRUST_PROXY', 0),
  database: Object.freeze({
    host: process.env.DB_HOST || '127.0.0.1',
    port: integer('DB_PORT', 3306),
    name: process.env.DB_NAME || 'agriprocure',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    connectionLimit: integer('DB_CONNECTION_LIMIT', 10)
  }),
  providers: Object.freeze({
    otp: process.env.OTP_PROVIDER || 'disabled',
    otpUrl: process.env.OTP_PROVIDER_URL || '',
    otpApiKey: process.env.OTP_PROVIDER_API_KEY || '',
    otpSenderId: process.env.OTP_SENDER_ID || '',
    sms: process.env.SMS_PROVIDER || 'disabled',
    smsUrl: process.env.SMS_PROVIDER_URL || '',
    smsApiKey: process.env.SMS_PROVIDER_API_KEY || '',
    smsSenderId: process.env.SMS_SENDER_ID || ''
  }),
  auth: Object.freeze({
    accessTokenSecret: process.env.AUTH_ACCESS_TOKEN_SECRET || '',
    refreshTokenSecret: process.env.AUTH_REFRESH_TOKEN_SECRET || '',
    accessTokenTtl: process.env.AUTH_ACCESS_TOKEN_TTL || '15m',
    refreshTokenTtl: process.env.AUTH_REFRESH_TOKEN_TTL || '7d'
  }),
  aiService: Object.freeze({
    url: process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000',
    apiKey: process.env.AI_SERVICE_API_KEY || '',
    timeoutMs: integer('AI_REQUEST_TIMEOUT_MS', 3000)
  }),
  notificationWebhookSecret: process.env.NOTIFICATION_WEBHOOK_SECRET || ''
});

module.exports = { environment };
