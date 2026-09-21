'use strict';

const jwt = require('jsonwebtoken');
const { environment } = require('../config/environment');

function verifyAccessToken(token, secret = environment.auth.accessTokenSecret) {
  if (!secret || secret.length < 32) {
    const error = new Error('Authentication secrets are not configured.');
    error.code = 'AUTH_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }
  return jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'agriprocure-api', audience: 'agriprocure-web' });
}

function authenticate(request, response, next) {
  try {
    const header = request.get('authorization') || '';
    if (!header.startsWith('Bearer ')) return response.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
    const payload = verifyAccessToken(header.slice(7));
    request.auth = { userId: Number(payload.sub), role: payload.role, sessionId: payload.sid };
    next();
  } catch (error) {
    if (error.code === 'AUTH_NOT_CONFIGURED') return next(error);
    return response.status(401).json({ success: false, error: { code: 'INVALID_ACCESS_TOKEN', message: 'Your session is invalid or expired.' } });
  }
}

module.exports = { authenticate, verifyAccessToken };
