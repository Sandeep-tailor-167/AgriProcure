'use strict';

const { getPool } = require('../config/database');

async function findUserByPhone(phone, connection = getPool()) {
  const [rows] = await connection.execute(
    `SELECT u.user_id, u.full_name, u.phone, u.password_hash, u.role, u.account_status,
            u.phone_verified_at, u.failed_login_count, u.locked_until, u.last_login_at,
            f.farmer_id, f.farmer_code, f.village, f.district, f.state, f.preferred_language, f.preferred_centre_id
       FROM users u LEFT JOIN farmers f ON f.user_id = u.user_id WHERE u.phone = ? LIMIT 1`,
    [phone]
  );
  return rows[0] || null;
}

async function findUserById(userId, connection = getPool()) {
  const [rows] = await connection.execute(
    `SELECT u.user_id, u.full_name, u.phone, u.role, u.account_status, u.phone_verified_at, u.last_login_at,
            f.farmer_id, f.farmer_code, f.village, f.district, f.state, f.preferred_language, f.preferred_centre_id
       FROM users u LEFT JOIN farmers f ON f.user_id = u.user_id WHERE u.user_id = ? LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function insertPendingFarmer(input, connection) {
  const [userResult] = await connection.execute(
    `INSERT INTO users (full_name, phone, password_hash, role, account_status)
     VALUES (?, ?, ?, 'farmer', 'pending_verification')`,
    [input.fullName, input.phone, input.passwordHash]
  );
  const userId = userResult.insertId;
  const [farmerResult] = await connection.execute(
    `INSERT INTO farmers (farmer_code, user_id, village, district, state, preferred_language)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.farmerCode, userId, input.village || null, input.district, input.state, input.preferredLanguage]
  );
  return { userId, farmerId: farmerResult.insertId };
}

async function insertOtpChallenge(challenge, connection) {
  await connection.execute(
    `INSERT INTO otp_challenges
      (challenge_id, phone, purpose, otp_hash, provider_name, delivery_status, maximum_attempts, expires_at)
     VALUES (?, ?, ?, ?, ?, 'unknown', ?, ?)`,
    [challenge.challengeId, challenge.phone, challenge.purpose, challenge.otpHash, challenge.providerName, challenge.maximumAttempts, challenge.expiresAt]
  );
}

async function updateOtpDelivery(challengeId, delivery, connection = getPool()) {
  await connection.execute(
    `UPDATE otp_challenges SET provider_name = ?, provider_message_id = ?, delivery_status = ?, failed_reason = ?
     WHERE challenge_id = ?`,
    [delivery.providerName, delivery.providerMessageId || null, delivery.deliveryStatus, delivery.failedReason || null, challengeId]
  );
}

async function findOtpChallengeForUpdate(challengeId, connection) {
  const [rows] = await connection.execute(
    `SELECT challenge_id, phone, purpose, otp_hash, delivery_status, attempts_used, maximum_attempts, expires_at, consumed_at
     FROM otp_challenges WHERE challenge_id = ? FOR UPDATE`,
    [challengeId]
  );
  return rows[0] || null;
}

async function incrementOtpAttempt(challengeId, connection) {
  await connection.execute('UPDATE otp_challenges SET attempts_used = attempts_used + 1 WHERE challenge_id = ?', [challengeId]);
}

async function consumeOtpAndActivateUser(challengeId, phone, connection) {
  await connection.execute('UPDATE otp_challenges SET consumed_at = UTC_TIMESTAMP(3) WHERE challenge_id = ?', [challengeId]);
  const [result] = await connection.execute(
    `UPDATE users SET account_status = 'active', phone_verified_at = UTC_TIMESTAMP(3), failed_login_count = 0, locked_until = NULL
     WHERE phone = ? AND account_status = 'pending_verification'`,
    [phone]
  );
  return result.affectedRows;
}

async function recordLoginSuccess(userId, connection = getPool()) {
  await connection.execute('UPDATE users SET last_login_at = UTC_TIMESTAMP(3), failed_login_count = 0, locked_until = NULL WHERE user_id = ?', [userId]);
}

async function recordLoginFailure(userId, shouldLock, connection = getPool()) {
  await connection.execute(
    `UPDATE users SET failed_login_count = failed_login_count + 1,
      locked_until = CASE WHEN ? THEN DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE) ELSE locked_until END
     WHERE user_id = ?`,
    [shouldLock ? 1 : 0, userId]
  );
}

async function insertRefreshSession(session, connection = getPool()) {
  await connection.execute(
    `INSERT INTO auth_refresh_sessions (session_id, user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES (?, ?, ?, ?, INET6_ATON(?), ?)`,
    [session.sessionId, session.userId, session.tokenHash, session.userAgent || null, session.ipAddress || null, session.expiresAt]
  );
}

async function findRefreshSessionForUpdate(tokenHash, connection) {
  const [rows] = await connection.execute(
    `SELECT s.session_id, s.user_id, s.expires_at, s.revoked_at, u.role, u.account_status
     FROM auth_refresh_sessions s JOIN users u ON u.user_id = s.user_id
     WHERE s.token_hash = ? FOR UPDATE`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function revokeRefreshSession(sessionId, reason, connection = getPool()) {
  const [result] = await connection.execute(
    `UPDATE auth_refresh_sessions SET revoked_at = UTC_TIMESTAMP(3), revoke_reason = ?
     WHERE session_id = ? AND revoked_at IS NULL`,
    [reason, sessionId]
  );
  return result.affectedRows;
}

async function rotateRefreshSession(sessionId, replacement, connection) {
  await revokeRefreshSession(sessionId, 'rotated', connection);
  await insertRefreshSession(replacement, connection);
}

async function updateFarmerProfile(userId, patch, connection = getPool()) {
  await connection.execute('UPDATE users SET full_name = ? WHERE user_id = ?', [patch.fullName, userId]);
  await connection.execute(
    `UPDATE farmers SET village = ?, district = ?, state = ?, preferred_language = ?, preferred_centre_id = ? WHERE user_id = ?`,
    [patch.village || null, patch.district, patch.state, patch.preferredLanguage, patch.preferredCentreId || null, userId]
  );
  return findUserById(userId, connection);
}

async function insertOfficer(input, connection) {
  const [result] = await connection.execute(
    `INSERT INTO users (full_name, phone, password_hash, role, account_status, phone_verified_at)
     VALUES (?, ?, ?, 'officer', 'active', UTC_TIMESTAMP(3))`,
    [input.fullName, input.phone, input.passwordHash]
  );
  for (const centreId of input.centreIds) {
    await connection.execute(
      `INSERT INTO officer_assignments (user_id, centre_id, assigned_by) VALUES (?, ?, ?)`,
      [result.insertId, centreId, input.assignedBy]
    );
  }
  return result.insertId;
}

async function insertAuthenticationEvent(event, connection = getPool()) {
  await connection.execute(
    `INSERT INTO authentication_events (user_id, phone, event_type, outcome, reason_code, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, INET6_ATON(?), ?)`,
    [event.userId || null, event.phone || null, event.eventType, event.outcome, event.reasonCode || null, event.ipAddress || null, event.userAgent || null]
  );
}

module.exports = {
  findUserByPhone, findUserById, insertPendingFarmer, insertOtpChallenge, updateOtpDelivery,
  findOtpChallengeForUpdate, incrementOtpAttempt, consumeOtpAndActivateUser,
  recordLoginSuccess, recordLoginFailure, insertRefreshSession, findRefreshSessionForUpdate,
  revokeRefreshSession, rotateRefreshSession, updateFarmerProfile, insertOfficer, insertAuthenticationEvent
};
