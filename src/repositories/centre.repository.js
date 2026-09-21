'use strict';

const { getPool } = require('../config/database');

async function listCentres(filters = {}, connection = getPool()) {
  const clauses = ["c.centre_status <> 'inactive'"];
  const values = [];
  if (filters.q) { clauses.push('(c.centre_name LIKE ? OR c.address_line LIKE ? OR c.district LIKE ?)'); const q = `%${filters.q}%`; values.push(q, q, q); }
  if (filters.district) { clauses.push('c.district = ?'); values.push(filters.district); }
  if (filters.cropId) { clauses.push('EXISTS (SELECT 1 FROM centre_crops x WHERE x.centre_id = c.centre_id AND x.crop_id = ?)'); values.push(filters.cropId); }
  const [rows] = await connection.execute(
    `SELECT c.centre_id, c.centre_code, c.centre_name, c.address_line, c.village, c.district, c.state,
            c.postal_code, c.latitude, c.longitude, c.public_phone, c.opening_time, c.closing_time,
            c.physical_daily_capacity, c.centre_status, c.closure_reason,
            (SELECT GROUP_CONCAT(cc.crop_id ORDER BY cc.crop_id) FROM centre_crops cc WHERE cc.centre_id = c.centre_id) AS crop_ids,
            COALESCE(SUM(CASE WHEN s.schedule_status IN ('published','full') AND s.procurement_date >= UTC_DATE()
              THEN GREATEST(s.capacity - s.booked_count, 0) ELSE 0 END), 0) AS available_slots
       FROM procurement_centres c
       LEFT JOIN procurement_schedules s ON s.centre_id = c.centre_id
      WHERE ${clauses.join(' AND ')}
      GROUP BY c.centre_id ORDER BY c.district, c.centre_name`,
    values
  );
  return rows;
}

async function findCentreById(centreId, connection = getPool(), lock = false) {
  const [rows] = await connection.execute(
    `SELECT centre_id, centre_code, centre_name, address_line, village, district, state, postal_code,
            latitude, longitude, public_phone, opening_time, closing_time, physical_daily_capacity,
            centre_status, closure_reason, created_at, updated_at
       FROM procurement_centres WHERE centre_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [centreId]
  );
  return rows[0] || null;
}

async function listCrops(connection = getPool(), includeInactive = false) {
  const [rows] = await connection.execute(
    `SELECT crop_id, crop_code, crop_name_en, crop_name_hi, quantity_unit, crop_status
       FROM crops ${includeInactive ? '' : "WHERE crop_status = 'active'"} ORDER BY crop_name_en`
  );
  return rows;
}

async function listCentreCrops(centreId, connection = getPool()) {
  const [rows] = await connection.execute(
    `SELECT crop.crop_id, crop.crop_code, crop.crop_name_en, crop.crop_name_hi, crop.quantity_unit
       FROM centre_crops cc JOIN crops crop ON crop.crop_id = cc.crop_id
      WHERE cc.centre_id = ? AND crop.crop_status = 'active' ORDER BY crop.crop_name_en`,
    [centreId]
  );
  return rows;
}

async function listSchedules(filters = {}, connection = getPool()) {
  const clauses = [];
  const values = [];
  if (filters.publicOnly !== false) { clauses.push("s.schedule_status IN ('published','full')"); clauses.push('s.procurement_date >= UTC_DATE()'); }
  if (filters.centreId) { clauses.push('s.centre_id = ?'); values.push(filters.centreId); }
  if (filters.cropId) { clauses.push('s.crop_id = ?'); values.push(filters.cropId); }
  if (filters.dateFrom) { clauses.push('s.procurement_date >= ?'); values.push(filters.dateFrom); }
  if (filters.dateTo) { clauses.push('s.procurement_date <= ?'); values.push(filters.dateTo); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await connection.execute(
    `SELECT s.schedule_id, s.centre_id, s.crop_id, s.procurement_date, s.start_time, s.end_time,
            s.capacity, s.booked_count, GREATEST(s.capacity - s.booked_count, 0) AS remaining_capacity,
            s.schedule_status, s.closure_reason, s.version, s.published_at,
            c.centre_name, c.district, c.state, c.centre_status,
            crop.crop_code, crop.crop_name_en, crop.crop_name_hi, crop.quantity_unit
       FROM procurement_schedules s JOIN procurement_centres c ON c.centre_id = s.centre_id
       JOIN crops crop ON crop.crop_id = s.crop_id ${where}
      ORDER BY s.procurement_date, s.start_time, c.centre_name`,
    values
  );
  return rows;
}

async function findScheduleById(scheduleId, connection = getPool(), lock = false) {
  const [rows] = await connection.execute(
    `SELECT schedule_id, centre_id, crop_id, procurement_date, start_time, end_time, capacity,
            booked_count, schedule_status, closure_reason, version, created_by, published_at
       FROM procurement_schedules WHERE schedule_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [scheduleId]
  );
  return rows[0] || null;
}

async function isOfficerAssigned(userId, centreId, connection = getPool()) {
  const [rows] = await connection.execute(
    `SELECT 1 AS assigned FROM officer_assignments
      WHERE user_id = ? AND centre_id = ? AND assignment_status = 'active' AND ended_at IS NULL LIMIT 1`,
    [userId, centreId]
  );
  return Boolean(rows[0]);
}

async function isCropSupported(centreId, cropId, connection = getPool()) {
  const [rows] = await connection.execute('SELECT 1 AS supported FROM centre_crops WHERE centre_id = ? AND crop_id = ? LIMIT 1', [centreId, cropId]);
  return Boolean(rows[0]);
}

async function getScheduledDailyCapacity(centreId, date, excludeScheduleId, connection = getPool()) {
  const [rows] = await connection.execute(
    `SELECT COALESCE(SUM(capacity), 0) AS scheduled_capacity FROM procurement_schedules
      WHERE centre_id = ? AND procurement_date = ? AND schedule_status NOT IN ('cancelled','closed')
        AND (? IS NULL OR schedule_id <> ?)`,
    [centreId, date, excludeScheduleId || null, excludeScheduleId || null]
  );
  return Number(rows[0].scheduled_capacity);
}

async function insertCentre(input, actorId, connection) {
  const [result] = await connection.execute(
    `INSERT INTO procurement_centres
      (centre_code, centre_name, address_line, village, district, state, postal_code, latitude, longitude,
       public_phone, opening_time, closing_time, physical_daily_capacity, centre_status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.centreCode, input.centreName, input.addressLine, input.village || null, input.district, input.state,
      input.postalCode || null, input.latitude || null, input.longitude || null, input.publicPhone || null,
      input.openingTime, input.closingTime, input.physicalDailyCapacity, input.centreStatus, actorId]
  );
  for (const cropId of input.cropIds) await connection.execute('INSERT INTO centre_crops (centre_id, crop_id) VALUES (?, ?)', [result.insertId, cropId]);
  return result.insertId;
}

async function insertCrop(input, connection = getPool()) {
  const [result] = await connection.execute(
    `INSERT INTO crops (crop_code, crop_name_en, crop_name_hi, quantity_unit, crop_status) VALUES (?, ?, ?, ?, 'active')`,
    [input.cropCode, input.cropNameEn, input.cropNameHi, input.quantityUnit]
  );
  return result.insertId;
}

async function insertSchedule(input, actorId, connection) {
  const publishedAt = input.scheduleStatus === 'published' ? new Date() : null;
  const [result] = await connection.execute(
    `INSERT INTO procurement_schedules
      (centre_id, crop_id, procurement_date, start_time, end_time, capacity, schedule_status, created_by, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.centreId, input.cropId, input.procurementDate, input.startTime, input.endTime, input.capacity, input.scheduleStatus, actorId, publishedAt]
  );
  return result.insertId;
}

async function updateSchedule(scheduleId, input, nextVersion, connection) {
  const publishedAt = input.scheduleStatus === 'published' ? new Date() : null;
  await connection.execute(
    `UPDATE procurement_schedules SET procurement_date = ?, start_time = ?, end_time = ?, capacity = ?,
      schedule_status = ?, closure_reason = ?, version = ?, published_at = COALESCE(published_at, ?)
     WHERE schedule_id = ?`,
    [input.procurementDate, input.startTime, input.endTime, input.capacity, input.scheduleStatus,
      input.closureReason || null, nextVersion, publishedAt, scheduleId]
  );
}

async function insertScheduleRevision(scheduleId, version, snapshot, reason, actorId, connection) {
  await connection.execute(
    `INSERT INTO schedule_revisions (schedule_id, version, snapshot, change_reason, changed_by) VALUES (?, ?, CAST(? AS JSON), ?, ?)`,
    [scheduleId, version, JSON.stringify(snapshot), reason, actorId]
  );
}

async function listScheduleRevisions(scheduleId, connection = getPool()) {
  const [rows] = await connection.execute(
    `SELECT revision_id, schedule_id, version, snapshot, change_reason, changed_by, changed_at
       FROM schedule_revisions WHERE schedule_id = ? ORDER BY version DESC`,
    [scheduleId]
  );
  return rows;
}

async function updateCentreStatus(centreId, status, reason, connection) {
  await connection.execute('UPDATE procurement_centres SET centre_status = ?, closure_reason = ? WHERE centre_id = ?', [status, reason || null, centreId]);
}

async function closeFutureSchedules(centreId, reason, connection) {
  const [result] = await connection.execute(
    `UPDATE procurement_schedules SET schedule_status = 'closed', closure_reason = ?, version = version + 1
      WHERE centre_id = ? AND procurement_date >= UTC_DATE() AND schedule_status IN ('published','full')`,
    [reason, centreId]
  );
  return result.affectedRows;
}

async function flagAffectedAppointmentsForCentre(centreId, connection) {
  const [result] = await connection.execute(
    `UPDATE appointments a JOIN procurement_schedules s ON s.schedule_id = a.schedule_id
        SET a.booking_status = 'reschedule_required', a.updated_at = UTC_TIMESTAMP(3)
      WHERE s.centre_id = ? AND s.procurement_date >= UTC_DATE() AND a.booking_status = 'confirmed'`,
    [centreId]
  );
  return result.affectedRows;
}

async function flagAffectedAppointmentsForSchedule(scheduleId, connection) {
  const [result] = await connection.execute(
    `UPDATE appointments SET booking_status = 'reschedule_required', updated_at = UTC_TIMESTAMP(3)
      WHERE schedule_id = ? AND booking_status = 'confirmed'`,
    [scheduleId]
  );
  return result.affectedRows;
}

module.exports = {
  listCentres, findCentreById, listCrops, listCentreCrops, listSchedules, findScheduleById,
  isOfficerAssigned, isCropSupported, getScheduledDailyCapacity, insertCentre, insertCrop, insertSchedule, updateSchedule, insertScheduleRevision,
  listScheduleRevisions, updateCentreStatus, closeFutureSchedules, flagAffectedAppointmentsForCentre,
  flagAffectedAppointmentsForSchedule
};
