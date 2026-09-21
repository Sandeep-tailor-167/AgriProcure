'use strict';

const { getPool } = require('../config/database');

async function findFarmerToken(appointmentId, userId, connection = getPool(), lock = false) {
  const [rows] = await connection.execute(
    `SELECT qt.*, a.booking_status, a.farmer_id, s.centre_id, s.schedule_id, s.procurement_date,
            c.centre_name, crop.crop_name_en, crop.crop_name_hi
       FROM queue_tokens qt JOIN appointments a ON a.appointment_id = qt.appointment_id
       JOIN farmers f ON f.farmer_id = a.farmer_id JOIN procurement_schedules s ON s.schedule_id = a.schedule_id
       JOIN procurement_centres c ON c.centre_id = s.centre_id JOIN crops crop ON crop.crop_id = s.crop_id
      WHERE a.appointment_id = ? AND f.user_id = ?${lock ? ' FOR UPDATE' : ''}`, [appointmentId, userId]);
  return rows[0] || null;
}

async function findToken(tokenId, connection = getPool(), lock = false) {
  const [rows] = await connection.execute(
    `SELECT qt.*, a.booking_status, a.appointment_id, s.centre_id, s.schedule_id, s.procurement_date,
            f.user_id AS farmer_user_id, c.centre_name
       FROM queue_tokens qt JOIN appointments a ON a.appointment_id = qt.appointment_id
       JOIN farmers f ON f.farmer_id = a.farmer_id JOIN procurement_schedules s ON s.schedule_id = a.schedule_id
       JOIN procurement_centres c ON c.centre_id = s.centre_id WHERE qt.token_id = ?${lock ? ' FOR UPDATE' : ''}`, [tokenId]);
  return rows[0] || null;
}

async function listFarmerQueue(userId, connection = getPool()) {
  const [rows] = await connection.execute(
    `SELECT qt.token_id, qt.token_number, qt.queue_date, qt.queue_status, qt.check_in_time,
            qt.called_at, qt.service_started_at, qt.service_completed_at, qt.updated_at,
            a.appointment_id, c.centre_id, c.centre_name, crop.crop_name_en, crop.crop_name_hi,
            (SELECT COUNT(*) FROM queue_tokens ahead JOIN appointments aa ON aa.appointment_id = ahead.appointment_id
              JOIN procurement_schedules ss ON ss.schedule_id = aa.schedule_id
             WHERE ss.centre_id = s.centre_id AND ahead.queue_date = qt.queue_date AND ahead.queue_status = 'waiting'
               AND (ahead.priority_rank < qt.priority_rank OR (ahead.priority_rank = qt.priority_rank AND ahead.check_in_time < qt.check_in_time))) AS farmers_ahead,
            COALESCE((SELECT AVG(TIMESTAMPDIFF(SECOND, recent.service_started_at, recent.service_completed_at))/60
              FROM queue_tokens recent JOIN appointments ra ON ra.appointment_id = recent.appointment_id
              JOIN procurement_schedules rs ON rs.schedule_id = ra.schedule_id
             WHERE rs.centre_id = s.centre_id AND recent.service_completed_at IS NOT NULL
               AND recent.service_completed_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY), 15) AS avg_service_minutes,
            COALESCE(ctrl.active_counters, 1) AS active_counters, COALESCE(ctrl.queue_state, 'running') AS queue_state
       FROM queue_tokens qt JOIN appointments a ON a.appointment_id = qt.appointment_id
       JOIN farmers f ON f.farmer_id = a.farmer_id JOIN procurement_schedules s ON s.schedule_id = a.schedule_id
       JOIN procurement_centres c ON c.centre_id = s.centre_id JOIN crops crop ON crop.crop_id = s.crop_id
       LEFT JOIN centre_queue_controls ctrl ON ctrl.centre_id = s.centre_id AND ctrl.queue_date = qt.queue_date
      WHERE f.user_id = ? AND qt.queue_date >= UTC_DATE() - INTERVAL 1 DAY ORDER BY qt.queue_date, qt.created_at`, [userId]);
  return rows;
}

async function listCentreQueue(centreId, date, connection = getPool()) {
  const [rows] = await connection.execute(
    `SELECT qt.token_id, qt.token_number, qt.queue_status, qt.priority_rank, qt.check_in_time,
            qt.called_at, qt.service_started_at, qt.service_completed_at, qt.updated_at,
            a.appointment_id, u.full_name AS farmer_name, crop.crop_name_en, crop.crop_name_hi
       FROM queue_tokens qt JOIN appointments a ON a.appointment_id = qt.appointment_id
       JOIN farmers f ON f.farmer_id = a.farmer_id JOIN users u ON u.user_id = f.user_id
       JOIN procurement_schedules s ON s.schedule_id = a.schedule_id JOIN crops crop ON crop.crop_id = s.crop_id
      WHERE s.centre_id = ? AND qt.queue_date = ?
      ORDER BY FIELD(qt.queue_status,'in_service','called','waiting','inspection','completed','no_show','not_checked_in','cancelled'),
               qt.priority_rank, qt.check_in_time, qt.token_id`, [centreId, date]);
  return rows;
}

async function insertEvent(tokenId, fromStatus, toStatus, reason, actorId, connection) {
  await connection.execute('INSERT INTO queue_events (token_id, from_status, to_status, reason, actor_id) VALUES (?, ?, ?, ?, ?)', [tokenId, fromStatus, toStatus, reason || null, actorId]);
}

async function setTokenStatus(tokenId, expectedStatuses, status, actorId, connection, reason = null) {
  const timestamps = { waiting: 'check_in_time = COALESCE(check_in_time, UTC_TIMESTAMP(3))', called: 'called_at = UTC_TIMESTAMP(3)', in_service: 'service_started_at = UTC_TIMESTAMP(3)', completed: 'service_completed_at = UTC_TIMESTAMP(3)' };
  const marks = expectedStatuses.map(() => '?').join(',');
  const [result] = await connection.execute(
    `UPDATE queue_tokens SET queue_status = ?, claimed_by = COALESCE(?, claimed_by), claim_version = claim_version + 1,
       ${timestamps[status] || 'updated_at = UTC_TIMESTAMP(3)'} WHERE token_id = ? AND queue_status IN (${marks})`,
    [status, actorId || null, tokenId, ...expectedStatuses]);
  if (result.affectedRows) await insertEvent(tokenId, expectedStatuses.length === 1 ? expectedStatuses[0] : null, status, reason, actorId, connection);
  return result.affectedRows === 1;
}

async function lockQueueControl(centreId, date, actorId, connection) {
  await connection.execute(`INSERT INTO centre_queue_controls (centre_id, queue_date, queue_state, active_counters, last_updated_by)
    VALUES (?, ?, 'running', 1, ?) ON DUPLICATE KEY UPDATE centre_id = VALUES(centre_id)`, [centreId, date, actorId]);
  const [rows] = await connection.execute('SELECT * FROM centre_queue_controls WHERE centre_id = ? AND queue_date = ? FOR UPDATE', [centreId, date]);
  return rows[0];
}

async function claimNextWaiting(centreId, date, actorId, connection) {
  const [rows] = await connection.execute(
    `SELECT qt.token_id FROM queue_tokens qt JOIN appointments a ON a.appointment_id = qt.appointment_id
      JOIN procurement_schedules s ON s.schedule_id = a.schedule_id
     WHERE s.centre_id = ? AND qt.queue_date = ? AND qt.queue_status = 'waiting'
     ORDER BY qt.priority_rank, qt.check_in_time, qt.token_id LIMIT 1 FOR UPDATE SKIP LOCKED`, [centreId, date]);
  if (!rows[0]) return null;
  return await setTokenStatus(rows[0].token_id, ['waiting'], 'called', actorId, connection) ? findToken(rows[0].token_id, connection) : null;
}

async function updateQueueControl(input, actorId, connection) {
  await connection.execute(`INSERT INTO centre_queue_controls (centre_id, queue_date, queue_state, active_counters, pause_reason, last_updated_by)
    VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE queue_state=VALUES(queue_state), active_counters=VALUES(active_counters),
    pause_reason=VALUES(pause_reason), last_updated_by=VALUES(last_updated_by)`, [input.centreId, input.date, input.state, input.activeCounters, input.reason || null, actorId]);
  return lockQueueControl(input.centreId, input.date, actorId, connection);
}

async function insertInterruption(input, actorId, connection = getPool()) {
  const [result] = await connection.execute(`INSERT INTO operational_interruptions
    (centre_id, started_at, interruption_type, description, reported_by) VALUES (?, UTC_TIMESTAMP(3), ?, ?, ?)`, [input.centreId, input.type, input.description, actorId]);
  return result.insertId;
}

module.exports = { findFarmerToken, findToken, listFarmerQueue, listCentreQueue, setTokenStatus, insertEvent,
  lockQueueControl, claimNextWaiting, updateQueueControl, insertInterruption };
