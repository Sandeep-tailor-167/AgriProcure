'use strict';

const centres = require('../repositories/centre.repository');
const { appendAuditLog } = require('../repositories/audit.repository');
const { withTransaction } = require('../config/database');

function serviceError(code, message, status) { return Object.assign(new Error(message), { code, status }); }

async function listCentres(filters) { return centres.listCentres(filters); }
async function listCrops() { return centres.listCrops(); }
async function listSchedules(filters) { return centres.listSchedules({ ...filters, publicOnly: true }); }

async function getCentre(centreId) {
  const centre = await centres.findCentreById(centreId);
  if (!centre || centre.centre_status === 'inactive') throw serviceError('CENTRE_NOT_FOUND', 'Procurement centre not found.', 404);
  const [crops, schedules] = await Promise.all([centres.listCentreCrops(centreId), centres.listSchedules({ centreId, publicOnly: true })]);
  return { ...centre, crops, schedules };
}

async function requireCentreAccess(actor, centreId, connection) {
  if (actor.role === 'admin') return;
  if (actor.role !== 'officer' || !await centres.isOfficerAssigned(actor.userId, centreId, connection)) {
    throw serviceError('CENTRE_FORBIDDEN', 'You are not assigned to this procurement centre.', 403);
  }
}

async function createCentre(input, actor) {
  return withTransaction(async (connection) => {
    const centreId = await centres.insertCentre(input, actor.userId, connection);
    await appendAuditLog({ actorId: actor.userId, action: 'CENTRE_CREATED', entityType: 'procurement_centre', entityId: centreId, after: input }, connection);
    return centres.findCentreById(centreId, connection);
  });
}

async function createCrop(input, actor) {
  return withTransaction(async (connection) => {
    const cropId = await centres.insertCrop(input, connection);
    await appendAuditLog({ actorId: actor.userId, action: 'CROP_CREATED', entityType: 'crop', entityId: cropId, after: input }, connection);
    return { cropId, ...input, cropStatus: 'active' };
  });
}

async function validateScheduleCapacity(input, centre, excludeScheduleId, connection) {
  const existing = await centres.getScheduledDailyCapacity(input.centreId || centre.centre_id, input.procurementDate, excludeScheduleId, connection);
  if (existing + input.capacity > centre.physical_daily_capacity) {
    throw serviceError('PHYSICAL_CAPACITY_EXCEEDED', 'Published schedule capacity would exceed the centre’s physical daily capacity.', 409);
  }
}

async function createSchedule(input, actor) {
  return withTransaction(async (connection) => {
    await requireCentreAccess(actor, input.centreId, connection);
    const centre = await centres.findCentreById(input.centreId, connection, true);
    if (!centre || centre.centre_status === 'inactive') throw serviceError('CENTRE_NOT_FOUND', 'Procurement centre not found.', 404);
    if (centre.centre_status === 'closed' && input.scheduleStatus === 'published') throw serviceError('CENTRE_CLOSED', 'A closed centre cannot publish schedules.', 409);
    if (!await centres.isCropSupported(input.centreId, input.cropId, connection)) throw serviceError('CROP_NOT_SUPPORTED', 'This crop is not configured for the selected centre.', 409);
    await validateScheduleCapacity(input, centre, null, connection);
    const scheduleId = await centres.insertSchedule(input, actor.userId, connection);
    const schedule = await centres.findScheduleById(scheduleId, connection);
    await appendAuditLog({ actorId: actor.userId, action: 'SCHEDULE_CREATED', entityType: 'procurement_schedule', entityId: scheduleId, after: schedule }, connection);
    return schedule;
  });
}

function materialScheduleChange(before, input) {
  const date = String(before.procurement_date).slice(0, 10);
  return date !== input.procurementDate || String(before.start_time).slice(0, 8) !== input.startTime.padEnd(8, ':00').slice(0, 8) ||
    String(before.end_time).slice(0, 8) !== input.endTime.padEnd(8, ':00').slice(0, 8) || ['closed', 'cancelled'].includes(input.scheduleStatus);
}

async function updateSchedule(scheduleId, input, actor) {
  return withTransaction(async (connection) => {
    const before = await centres.findScheduleById(scheduleId, connection, true);
    if (!before) throw serviceError('SCHEDULE_NOT_FOUND', 'Schedule not found.', 404);
    await requireCentreAccess(actor, before.centre_id, connection);
    const centre = await centres.findCentreById(before.centre_id, connection, true);
    if (input.capacity < before.booked_count) throw serviceError('CAPACITY_BELOW_BOOKINGS', 'Capacity cannot be lower than confirmed bookings.', 409);
    await validateScheduleCapacity({ ...input, centreId: before.centre_id }, centre, scheduleId, connection);
    await centres.insertScheduleRevision(scheduleId, before.version, before, input.changeReason, actor.userId, connection);
    await centres.updateSchedule(scheduleId, input, before.version + 1, connection);
    let affectedAppointments = 0;
    if (before.booked_count > 0 && materialScheduleChange(before, input)) affectedAppointments = await centres.flagAffectedAppointmentsForSchedule(scheduleId, connection);
    const after = await centres.findScheduleById(scheduleId, connection);
    await appendAuditLog({ actorId: actor.userId, action: 'SCHEDULE_UPDATED', entityType: 'procurement_schedule', entityId: scheduleId, before, after, metadata: { changeReason: input.changeReason, affectedAppointments } }, connection);
    return { schedule: after, affectedAppointments };
  });
}

async function changeCentreStatus(centreId, input, actor) {
  return withTransaction(async (connection) => {
    const before = await centres.findCentreById(centreId, connection, true);
    if (!before) throw serviceError('CENTRE_NOT_FOUND', 'Procurement centre not found.', 404);
    await centres.updateCentreStatus(centreId, input.status, input.reason, connection);
    let closedSchedules = 0; let affectedAppointments = 0;
    if (input.status === 'closed' || input.status === 'inactive') {
      closedSchedules = await centres.closeFutureSchedules(centreId, input.reason, connection);
      affectedAppointments = await centres.flagAffectedAppointmentsForCentre(centreId, connection);
    }
    const after = await centres.findCentreById(centreId, connection);
    await appendAuditLog({ actorId: actor.userId, action: 'CENTRE_STATUS_CHANGED', entityType: 'procurement_centre', entityId: centreId, before, after, metadata: { closedSchedules, affectedAppointments } }, connection);
    return { centre: after, closedSchedules, affectedAppointments };
  });
}

async function scheduleHistory(scheduleId, actor) {
  const schedule = await centres.findScheduleById(scheduleId);
  if (!schedule) throw serviceError('SCHEDULE_NOT_FOUND', 'Schedule not found.', 404);
  await requireCentreAccess(actor, schedule.centre_id);
  return centres.listScheduleRevisions(scheduleId);
}

module.exports = { listCentres, getCentre, listCrops, listSchedules, createCentre, createCrop, createSchedule, updateSchedule, changeCentreStatus, scheduleHistory, requireCentreAccess };
