'use strict';

const auth = require('../services/auth.service');

function context(request) {
  return { ipAddress: request.ip, userAgent: request.get('user-agent') || null };
}

async function requestRegistrationOtp(request, response) {
  const data = await auth.requestRegistrationOtp(request.body, context(request));
  response.status(202).json({ success: true, message: 'OTP request submitted to the configured mobile provider.', data });
}

async function verifyRegistrationOtp(request, response) {
  const data = await auth.verifyRegistrationOtp(request.body, context(request));
  response.status(201).json({ success: true, message: 'Mobile verified and account activated.', data });
}

async function login(request, response) {
  const data = await auth.login(request.body, context(request));
  response.json({ success: true, message: 'Signed in successfully.', data });
}

async function refresh(request, response) {
  const data = await auth.refreshSession(request.body.refreshToken, context(request));
  response.json({ success: true, message: 'Session refreshed.', data });
}

async function logout(request, response) {
  const data = await auth.logout(request.body.refreshToken);
  response.json({ success: true, message: 'Signed out successfully.', data });
}

async function getProfile(request, response) {
  response.json({ success: true, data: await auth.getProfile(request.auth.userId) });
}

async function updateProfile(request, response) {
  response.json({ success: true, message: 'Profile updated.', data: await auth.updateProfile(request.auth.userId, request.body) });
}

async function provisionOfficer(request, response) {
  const data = await auth.provisionOfficer(request.body, request.auth.userId);
  response.status(201).json({ success: true, message: 'Officer account provisioned.', data });
}

module.exports = { requestRegistrationOtp, verifyRegistrationOtp, login, refresh, logout, getProfile, updateProfile, provisionOfficer };
