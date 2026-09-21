'use strict';

const { getPool } = require('../config/database');

async function findFarmerByUserId(userId, connection = getPool()) {
  const [rows] = await connection.execute('SELECT farmer_id, farmer_code FROM farmers WHERE user_id = ? LIMIT 1', [userId]);
  return rows[0] || null;
}

async function findScheduleForBooking(scheduleId, connection, lock = true) {
  const [rows] = await connection.execute(
    `SELECT s.schedule_id, s.centre_id, s.crop_id, s.procurement_date, s.start_time, s.end_time,
            s.capacity, s.booked_count, s.schedule_status, c.centre_code, c.centre_name, c.centre_status,
            crop.crop_code, crop.crop_name_en, crop.quantity_unit
       FROM procurement_schedules s JOIN procurement_centres c ON c.centre_id = s.centre_id
       JOIN crops crop ON crop.crop_id = s.crop_id WHERE s.schedule_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [scheduleId]
  );
  return rows[0] || null;
}

async function findAppointmentForUpdate(appointmentId, farmerId, connection) {
  const [rows] = await connection.execute(
    `SELECT appointment_id, booking_reference, farmer_id, schedule_id, estimated_quantity, booking_status, created_at
       FROM appointments WHERE appointment_id = ? AND farmer_id = ? FOR UPDATE`,
    [appointmentId, farmerId]
  );
  return rows[0] || null;
}

async function findDuplicateActive(farmerId, scheduleId, connection) {
  const [rows] = await connection.execute(
    `SELECT appointment_id FROM appointments WHERE farmer_id = ? AND schedule_id = ?
      AND booking_status IN ('confirmed','checked_in','in_service','inspection') LIMIT 1 FOR UPDATE`,
    [farmerId, scheduleId]
  );
  return rows[0] || null;
}

async function reserveScheduleCapacity(scheduleId, connection) {
  const [result] = await connection.execute(
    `UPDATE procurement_schedules
        SET booked_count = booked_count + 1,
            schedule_status = CASE WHEN booked_count + 1 >= capacity THEN 'full' ELSE schedule_status END
      WHERE schedule_id = ? AND schedule_status = 'published' AND booked_count < capacity`,
    [scheduleId]
  );
  return result.affectedRows === 1;
}

async function releaseScheduleCapacity(scheduleId, connection) {
  await connection.execute(
    `UPDATE procurement_schedules SET booked_count = GREATEST(booked_count - 1, 0),
      schedule_status = CASE WHEN schedule_status = 'full' THEN 'published' ELSE schedule_status END WHERE schedule_id = ?`,
    [scheduleId]
  );
}

async function insertAppointment(input, connection) {
  const [result] = await connection.execute(
    `INSERT INTO appointments
      (booking_reference, farmer_id, schedule_id, estimated_quantity, booking_status, rescheduled_from_id)
     VALUES (?, ?, ?, ?, 'confirmed', ?)`,
    [input.bookingReference, input.farmerId, input.scheduleId, input.estimatedQuantity, input.rescheduledFromId || null]
  );
  return result.insertId;
}

async function insertToken(input, connection) {
  const [result] = await connection.execute(
    `INSERT INTO queue_tokens (appointment_id, token_number, queue_date, queue_status)
     VALUES (?, ?, ?, 'not_checked_in')`,
    [input.appointmentId, input.tokenNumber, input.queueDate]
  );
  return result.insertId;
}

async function allocateTokenSequence(centreId, queueDate, cropId, connection) {
  await connection.execute(
    `INSERT INTO queue_token_sequences (centre_id, queue_date, crop_id, next_sequence) VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE next_sequence = next_sequence + 1`,
    [centreId, queueDate, cropId]
  );
  const [rows] = await connection.execute(
    'SELECT next_sequence FROM queue_token_sequences WHERE centre_id = ? AND queue_date = ? AND crop_id = ? FOR UPDATE',
    [centreId, queueDate, cropId]
  );
  return Number(rows[0].next_sequence);
}

async function cancelAppointment(appointmentId, reason, connection) {
  const [result] = await connection.execute(
    `UPDATE appointments SET booking_status = 'cancelled', cancellation_reason = ?, cancelled_at = UTC_TIMESTAMP(3)
      WHERE appointment_id = ? AND booking_status = 'confirmed'`,
    [reason || null, appointmentId]
  );
  await connection.execute("UPDATE queue_tokens SET queue_status = 'cancelled' WHERE appointment_id = ?", [appointmentId]);
  return result.affectedRows === 1;
}

async function listFarmerAppointments(farmerId, connection = getPool()) {
  const [rows] = await connection.execute(
    `SELECT a.appointment_id, a.booking_reference, a.estimated_quantity, a.booking_status, a.rescheduled_from_id,
            a.cancellation_reason, a.created_at, a.cancelled_at,
            s.schedule_id, s.procurement_date, s.start_time, s.end_time, s.schedule_status,
            c.centre_id, c.centre_name, c.address_line, c.district, c.state,
            crop.crop_id, crop.crop_name_en, crop.crop_name_hi, crop.quantity_unit,
            token.token_id, token.token_number, token.queue_status, token.check_in_time
       FROM appointments a JOIN procurement_schedules s ON s.schedule_id = a.schedule_id
       JOIN procurement_centres c ON c.centre_id = s.centre_id JOIN crops crop ON crop.crop_id = s.crop_id
       LEFT JOIN queue_tokens token ON token.appointment_id = a.appointment_id
      WHERE a.farmer_id = ? ORDER BY s.procurement_date DESC, s.start_time DESC`,
    [farmerId]
  );
  return rows;
}

async function findAppointmentDetail(appointmentId, farmerId, connection = getPool()) {
  const [rows] = await connection.execute(
    `SELECT a.appointment_id, a.booking_reference, a.estimated_quantity, a.booking_status, a.created_at,
            s.schedule_id, s.procurement_date, s.start_time, s.end_time,
            c.centre_id, c.centre_name, c.address_line, c.district, c.state,
            crop.crop_id, crop.crop_name_en, crop.crop_name_hi, crop.quantity_unit,
            token.token_id, token.token_number, token.queue_status, token.check_in_time
       FROM appointments a JOIN procurement_schedules s ON s.schedule_id = a.schedule_id
       JOIN procurement_centres c ON c.centre_id = s.centre_id JOIN crops crop ON crop.crop_id = s.crop_id
       LEFT JOIN queue_tokens token ON token.appointment_id = a.appointment_id
      WHERE a.appointment_id = ? AND a.farmer_id = ? LIMIT 1`,
    [appointmentId, farmerId]
  );
  return rows[0] || null;
}

module.exports = {
  findFarmerByUserId, findScheduleForBooking, findAppointmentForUpdate, findDuplicateActive,
  reserveScheduleCapacity, releaseScheduleCapacity, insertAppointment, insertToken, allocateTokenSequence, cancelAppointment,
  listFarmerAppointments, findAppointmentDetail
};
