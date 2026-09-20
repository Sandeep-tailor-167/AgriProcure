'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('../server');

let baseUrl;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

test.after(async () => new Promise((resolve) => server.close(resolve)));

async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  return { status: response.status, body: await response.json() };
}

async function login(phone) {
  const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password: 'demo123' }) });
  assert.equal(result.status, 200);
  return result.body.data.token;
}

test('health endpoint reports the service as healthy', async () => {
  const result = await request('/health');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.status, 'healthy');
});

test('centre discovery is public and supports crop filtering', async () => {
  const result = await request('/centres?crop=Mustard');
  assert.equal(result.status, 200);
  assert.ok(result.body.data.length >= 1);
  assert.ok(result.body.data.every((centre) => centre.crops.includes('Mustard')));
});

test('private appointment data requires authentication', async () => {
  const result = await request('/appointments/my');
  assert.equal(result.status, 401);
  assert.equal(result.body.error.code, 'UNAUTHENTICATED');
});

test('farmer can book an open slot and receives a unique token', async () => {
  const token = await login('9876543210');
  const result = await request('/appointments', { token, method: 'POST', body: JSON.stringify({ scheduleId: 'sch_3', estimatedQuantity: 15.5 }) });
  assert.equal(result.status, 201);
  assert.match(result.body.data.reference, /^AP-/);
  assert.match(result.body.data.token.number, /^P-/);
  assert.equal(result.body.data.status, 'confirmed');
});

test('duplicate active booking is rejected', async () => {
  const token = await login('9876543210');
  const result = await request('/appointments', { token, method: 'POST', body: JSON.stringify({ scheduleId: 'sch_3', estimatedQuantity: 10 }) });
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, 'DUPLICATE_BOOKING');
});

test('farmer cannot access administrator dashboard', async () => {
  const token = await login('9876543210');
  const result = await request('/admin/dashboard', { token });
  assert.equal(result.status, 403);
  assert.equal(result.body.error.code, 'FORBIDDEN');
});

test('assigned officer can check in a farmer and update queue state', async () => {
  const token = await login('9876500001');
  const checkIn = await request('/queue/apt_demo/check-in', { token, method: 'POST' });
  assert.equal(checkIn.status, 200);
  assert.equal(checkIn.body.data.status, 'checked_in');
  const serving = await request('/queue/apt_demo/status', { token, method: 'PATCH', body: JSON.stringify({ status: 'in_service' }) });
  assert.equal(serving.status, 200);
  assert.equal(serving.body.data.status, 'in_service');
});

test('invalid queue state transition is rejected', async () => {
  const token = await login('9876500001');
  const result = await request('/queue/apt_demo/status', { token, method: 'PATCH', body: JSON.stringify({ status: 'completed' }) });
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, 'INVALID_STATE');
});

