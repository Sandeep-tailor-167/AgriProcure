'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { environment } = require('../config/environment');
const { withTransaction, getPool } = require('../config/database');
const users = require('../repositories/user.repository');
const { appendAuditLog } = require('../repositories/audit.repository');
const { getOtpProvider } = require('../providers/otp.provider');

const DUMMY_PASSWORD_HASH = '$2b$12$dFYtzC4wRbws4VfRDoaLO.7tRjWpZ6QFUhZ6pA7lbQWPgUkOYi7Iy';

function serviceError(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

function parseDuration(value) {
  const match = String(value).match(/^(\d+)([mhd])$/);
  if (!match) throw serviceError('AUTH_CONFIGURATION_ERROR', 'Authentication token duration is invalid.', 500);
  const factors = { m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * factors[match[2]];
}

function hashToken(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function normalizePhone(value) { return String(value).replace(/\D/g, ''); }

function assertTokenConfiguration(config = environment.auth) {
  if (config.accessTokenSecret.length < 32 || config.refreshTokenSecret.length < 32) {
    throw serviceError('AUTH_NOT_CONFIGURED', 'Authentication secrets are not configured.', 503);
  }
}

function createAccessToken({ userId, role, sessionId }, config = environment.auth) {
  assertTokenConfiguration(config);
  return jwt.sign({ role, sid: sessionId }, config.accessTokenSecret, {
    algorithm: 'HS256', subject: String(userId), issuer: 'agriprocure-api', audience: 'agriprocure-web', expiresIn: config.accessTokenTtl
  });
}

function createRefreshMaterial(config = environment.auth) {
  assertTokenConfiguration(config);
  const sessionId = crypto.randomUUID();
  const secret = crypto.randomBytes(48).toString('base64url');
  const refreshToken = `${sessionId}.${secret}`;
  return { sessionId, refreshToken, tokenHash: hashToken(`${refreshToken}.${config.refreshTokenSecret}`), expiresAt: new Date(Date.now() + parseDuration(config.refreshTokenTtl)) };
}

function refreshHash(refreshToken, config = environment.auth) {
  assertTokenConfiguration(config);
  return hashToken(`${refreshToken}.${config.refreshTokenSecret}`);
}

function publicUser(user) {
  return {
    userId: user.user_id, fullName: user.full_name, phone: user.phone, role: user.role,
    farmerId: user.farmer_id || null, farmerCode: user.farmer_code || null,
    village: user.village || null, district: user.district || null, state: user.state || null,
    preferredLanguage: user.preferred_language || 'en', preferredCentreId: user.preferred_centre_id || null
  };
}

async function issueSession(user, context, connection) {
  const refresh = createRefreshMaterial();
  await users.insertRefreshSession({ ...refresh, userId: user.user_id, userAgent: context.userAgent, ipAddress: context.ipAddress }, connection);
  return {
    accessToken: createAccessToken({ userId: user.user_id, role: user.role, sessionId: refresh.sessionId }),
    refreshToken: refresh.refreshToken,
    expiresIn: environment.auth.accessTokenTtl,
    user: publicUser(user)
  };
}

async function requestRegistrationOtp(input, context = {}) {
  const phone = normalizePhone(input.phone);
  const existing = await users.findUserByPhone(phone);
  if (existing) throw serviceError('PHONE_ALREADY_REGISTERED', 'This mobile number is already registered or awaiting verification.', 409);
  const provider = getOtpProvider();
  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const otpHash = await bcrypt.hash(otp, 12);
  const farmerCode = `F-${new Date().getUTCFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  await withTransaction(async (connection) => {
    await users.insertPendingFarmer({ ...input, phone, passwordHash, farmerCode }, connection);
    await users.insertOtpChallenge({ challengeId, phone, purpose: 'registration', otpHash, providerName: provider.name, maximumAttempts: 5, expiresAt }, connection);
    await users.insertAuthenticationEvent({ phone, eventType: 'otp_requested', outcome: 'success', ipAddress: context.ipAddress, userAgent: context.userAgent }, connection);
  });

  try {
    const delivery = await provider.send({ phone, otp, expiresInMinutes: 5 });
    await users.updateOtpDelivery(challengeId, delivery);
    return { challengeId, expiresAt: expiresAt.toISOString(), deliveryStatus: delivery.deliveryStatus };
  } catch (error) {
    await users.updateOtpDelivery(challengeId, { providerName: provider.name, deliveryStatus: 'failed', failedReason: error.code || 'PROVIDER_ERROR' }).catch(() => {});
    throw error;
  }
}

async function verifyRegistrationOtp(input, context = {}) {
  assertTokenConfiguration();
  let verifiedPhone;
  await withTransaction(async (connection) => {
    const challenge = await users.findOtpChallengeForUpdate(input.challengeId, connection);
    if (!challenge || challenge.purpose !== 'registration') throw serviceError('INVALID_OTP_CHALLENGE', 'The OTP request is invalid.', 400);
    if (challenge.consumed_at) throw serviceError('OTP_ALREADY_USED', 'This OTP was already used.', 409);
    if (new Date(challenge.expires_at).getTime() <= Date.now()) throw serviceError('OTP_EXPIRED', 'This OTP has expired. Request a new code.', 410);
    if (challenge.attempts_used >= challenge.maximum_attempts) throw serviceError('OTP_ATTEMPTS_EXCEEDED', 'Too many incorrect attempts. Request a new code.', 429);
    const valid = await bcrypt.compare(input.otp, challenge.otp_hash);
    if (!valid) {
      await users.incrementOtpAttempt(challenge.challenge_id, connection);
      await users.insertAuthenticationEvent({ phone: challenge.phone, eventType: 'otp_failed', outcome: 'failure', reasonCode: 'INVALID_OTP', ipAddress: context.ipAddress, userAgent: context.userAgent }, connection);
      throw serviceError('INVALID_OTP', 'The OTP is incorrect.', 400);
    }
    const activated = await users.consumeOtpAndActivateUser(challenge.challenge_id, challenge.phone, connection);
    if (activated !== 1) throw serviceError('ACCOUNT_ACTIVATION_FAILED', 'The pending account could not be activated.', 409);
    await users.insertAuthenticationEvent({ phone: challenge.phone, eventType: 'otp_verified', outcome: 'success', ipAddress: context.ipAddress, userAgent: context.userAgent }, connection);
    verifiedPhone = challenge.phone;
  });
  const user = await users.findUserByPhone(verifiedPhone);
  return withTransaction((connection) => issueSession(user, context, connection));
}

async function login(input, context = {}) {
  assertTokenConfiguration();
  const phone = normalizePhone(input.phone);
  const user = await users.findUserByPhone(phone);
  const passwordMatches = await bcrypt.compare(input.password, user?.password_hash || DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches) {
    if (user) await users.recordLoginFailure(user.user_id, user.failed_login_count + 1 >= 5);
    await users.insertAuthenticationEvent({ userId: user?.user_id, phone, eventType: 'login_failed', outcome: 'failure', reasonCode: 'INVALID_CREDENTIALS', ...context });
    throw serviceError('INVALID_CREDENTIALS', 'The mobile number or password is incorrect.', 401);
  }
  if (user.account_status !== 'active') throw serviceError('ACCOUNT_NOT_ACTIVE', 'This account is not active.', 403);
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) throw serviceError('ACCOUNT_TEMPORARILY_LOCKED', 'Too many failed attempts. Try again later.', 423);
  return withTransaction(async (connection) => {
    await users.recordLoginSuccess(user.user_id, connection);
    await users.insertAuthenticationEvent({ userId: user.user_id, phone, eventType: 'login_succeeded', outcome: 'success', ...context }, connection);
    return issueSession(user, context, connection);
  });
}

async function refreshSession(refreshToken, context = {}) {
  const tokenHash = refreshHash(refreshToken);
  return withTransaction(async (connection) => {
    const current = await users.findRefreshSessionForUpdate(tokenHash, connection);
    if (!current || current.revoked_at || new Date(current.expires_at).getTime() <= Date.now() || current.account_status !== 'active') {
      throw serviceError('INVALID_REFRESH_TOKEN', 'The refresh session is invalid or expired.', 401);
    }
    const replacement = createRefreshMaterial();
    await users.rotateRefreshSession(current.session_id, { ...replacement, userId: current.user_id, userAgent: context.userAgent, ipAddress: context.ipAddress }, connection);
    return {
      accessToken: createAccessToken({ userId: current.user_id, role: current.role, sessionId: replacement.sessionId }),
      refreshToken: replacement.refreshToken,
      expiresIn: environment.auth.accessTokenTtl
    };
  });
}

async function logout(refreshToken) {
  const tokenHash = refreshHash(refreshToken);
  return withTransaction(async (connection) => {
    const session = await users.findRefreshSessionForUpdate(tokenHash, connection);
    if (session && !session.revoked_at) await users.revokeRefreshSession(session.session_id, 'logout', connection);
    return { revoked: Boolean(session) };
  });
}

async function getProfile(userId) {
  const user = await users.findUserById(userId);
  if (!user) throw serviceError('USER_NOT_FOUND', 'User not found.', 404);
  return publicUser(user);
}

async function updateProfile(userId, patch) {
  const updated = await withTransaction(async (connection) => {
    const before = await users.findUserById(userId, connection);
    if (!before || before.role !== 'farmer') throw serviceError('USER_NOT_FOUND', 'Farmer profile not found.', 404);
    const after = await users.updateFarmerProfile(userId, patch, connection);
    await appendAuditLog({ actorId: userId, action: 'FARMER_PROFILE_UPDATED', entityType: 'user', entityId: userId, before: publicUser(before), after: publicUser(after) }, connection);
    return after;
  });
  return publicUser(updated);
}

async function provisionOfficer(input, administratorId) {
  const existing = await users.findUserByPhone(normalizePhone(input.phone));
  if (existing) throw serviceError('PHONE_ALREADY_REGISTERED', 'This mobile number is already registered.', 409);
  const passwordHash = await bcrypt.hash(input.temporaryPassword, 12);
  return withTransaction(async (connection) => {
    const userId = await users.insertOfficer({ ...input, phone: normalizePhone(input.phone), passwordHash, assignedBy: administratorId }, connection);
    await appendAuditLog({ actorId: administratorId, action: 'OFFICER_PROVISIONED', entityType: 'user', entityId: userId, after: { role: 'officer', centreIds: input.centreIds } }, connection);
    return { userId, role: 'officer', centreIds: input.centreIds };
  });
}

module.exports = {
  requestRegistrationOtp, verifyRegistrationOtp, login, refreshSession, logout, getProfile, updateProfile, provisionOfficer,
  normalizePhone, parseDuration, hashToken, createAccessToken, createRefreshMaterial, refreshHash, publicUser
};
