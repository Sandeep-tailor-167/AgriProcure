'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { authorize } = require('../../src/middlewares/authorize');
const { verifyAccessToken } = require('../../src/middlewares/authenticate');
const { createAccessToken, createRefreshMaterial, refreshHash, parseDuration } = require('../../src/services/auth.service');
const { DisabledOtpProvider, HttpOtpProvider } = require('../../src/providers/otp.provider');
const { DisabledSmsProvider, HttpSmsProvider } = require('../../src/providers/sms.provider');
const { scheduleSchema, scheduleUpdateSchema, centreStatusSchema } = require('../../src/validators/centre.schema');

const testAuthConfig = Object.freeze({ accessTokenSecret: 'a'.repeat(48), refreshTokenSecret: 'r'.repeat(48), accessTokenTtl: '15m', refreshTokenTtl: '7d' });

test('email credentials are rejected by the strict phone-only login contract', async () => {
  const response = await request(createApp()).post('/api/v1/auth/login').send({ email: 'farmer@example.test', password: 'Password123' });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('public administrator registration route does not exist', async () => {
  const response = await request(createApp()).post('/api/v1/auth/admin/register').send({ phone: '9999999999' });
  assert.equal(response.status, 404);
});

test('role middleware prevents privilege escalation', async () => {
  const app = express();
  app.get('/admin', (req, _res, next) => { req.auth = { userId: 7, role: 'farmer' }; next(); }, authorize('admin'), (_req, res) => res.json({ success: true }));
  const response = await request(app).get('/admin');
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'FORBIDDEN');
});

test('access tokens are signed with constrained issuer, audience, algorithm, and role', () => {
  const token = createAccessToken({ userId: 42, role: 'officer', sessionId: 'session-1' }, testAuthConfig);
  const payload = verifyAccessToken(token, testAuthConfig.accessTokenSecret);
  assert.equal(payload.sub, '42');
  assert.equal(payload.role, 'officer');
  assert.equal(payload.sid, 'session-1');
  assert.throws(() => verifyAccessToken(token, 'wrong-secret-that-is-at-least-thirty-two-characters'));
});

test('refresh tokens are opaque, hashed, and time limited', () => {
  const material = createRefreshMaterial(testAuthConfig);
  assert.match(material.sessionId, /^[0-9a-f-]{36}$/);
  assert.ok(material.refreshToken.length > 60);
  assert.match(material.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(refreshHash(material.refreshToken, testAuthConfig), material.tokenHash);
  assert.equal(parseDuration('7d'), 604800000);
});

test('disabled OTP provider fails closed and never reports delivery', async () => {
  await assert.rejects(new DisabledOtpProvider().send({ phone: '9999999999', otp: '123456' }), (error) => error.code === 'OTP_PROVIDER_NOT_CONFIGURED' && error.status === 503);
});

test('HTTP OTP provider requires a provider message ID before reporting submission', async () => {
  const provider = new HttpOtpProvider({ name: 'test-provider', url: 'https://provider.invalid/otp', apiKey: 'test-key', senderId: 'AGRIPROC', fetchImplementation: async () => ({ ok: true, json: async () => ({}) }) });
  await assert.rejects(provider.send({ phone: '9999999999', otp: '123456', expiresInMinutes: 5 }), (error) => error.code === 'OTP_PROVIDER_INVALID_RESPONSE');
});

test('disabled notification SMS fails closed and never reports delivery', async () => {
  await assert.rejects(() => new DisabledSmsProvider().send({ phone: '9999999999', message: 'test' }), (error) => error.code === 'SMS_PROVIDER_NOT_CONFIGURED');
});

test('SMS submission is distinct from provider-confirmed delivery', async () => {
  const provider = new HttpSmsProvider({ name: 'test-provider', url: 'https://provider.invalid', apiKey: 'secret', senderId: 'AGRI', fetchImplementation: async () => ({ ok: true, json: async () => ({ messageId: 'provider-42' }) }) });
  const result = await provider.send({ phone: '9999999999', message: 'Appointment confirmed', reference: '10' });
  assert.equal(result.deliveryStatus, 'submitted');
  assert.notEqual(result.deliveryStatus, 'delivered');
});

test('schedule validation rejects invalid hours, capacity, and unexplained closure', () => {
  assert.equal(scheduleSchema.safeParse({ centreId: 1, cropId: 1, procurementDate: '2026-10-01', startTime: '12:00', endTime: '09:00', capacity: 10, scheduleStatus: 'published' }).success, false);
  assert.equal(scheduleSchema.safeParse({ centreId: 1, cropId: 1, procurementDate: '2026-10-01', startTime: '09:00', endTime: '12:00', capacity: 0, scheduleStatus: 'published' }).success, false);
  assert.equal(scheduleUpdateSchema.safeParse({ procurementDate: '2026-10-01', startTime: '09:00', endTime: '12:00', capacity: 10, scheduleStatus: 'closed', changeReason: 'Weather closure' }).success, false);
  assert.equal(centreStatusSchema.safeParse({ status: 'closed' }).success, false);
});

test('schedule management requires authentication', async () => {
  const response = await request(createApp()).post('/api/v1/schedules').send({});
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'UNAUTHENTICATED');
});
