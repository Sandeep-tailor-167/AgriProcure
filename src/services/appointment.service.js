'use strict';

const crypto = require('node:crypto');
const appointments = require('../repositories/appointment.repository');
const { appendAuditLog } = require('../repositories/audit.repository');
const { withTransaction } = require('../config/database');

function serviceError(code, message, status) { return Object.assign(new Error(message), { code, status }); }
function isoDate(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }
function bookingReference() { return `AP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; }
function tokenNumber(schedule, sequence) { return `${schedule.centre_code.slice(-7)}-${schedule.crop_code.slice(0, 3)}-${String(sequence).padStart(5, '0')}`.toUpperCase(); }

function validateBookableSchedule(schedule) {
  if (!schedule) throw serviceError('SCHEDULE_NOT_FOUND', 'The selected schedule was not found.', 404);
  if (schedule.schedule_status !== 'published') throw serviceError('SCHEDULE_NOT_AVAILABLE', 'The selected schedule is not open for booking.', 409);
  if (!['open', 'busy'].includes(schedule.centre_status)) throw serviceError('CENTRE_CLOSED', 'The procurement centre is closed.', 409);
  if (isoDate(schedule.procurement_date) < new Date().toISOString().slice(0, 10)) throw serviceError('SCHEDULE_EXPIRED', 'The selected schedule has already passed.', 409);
  if (schedule.booked_count >= schedule.capacity) throw serviceError('CAPACITY_FULL', 'The selected slot is full.', 409);
}

async function createBooking(input, userId) {
  try {
    return await withTransaction(async (connection) => {
      const farmer = await appointments.findFarmerByUserId(userId, connection);
      if (!farmer) throw serviceError('FARMER_PROFILE_NOT_FOUND', 'Farmer profile not found.', 404);
      const schedule = await appointments.findScheduleForBooking(input.scheduleId, connection, true);
      validateBookableSchedule(schedule);
      if (await appointments.findDuplicateActive(farmer.farmer_id, schedule.schedule_id, connection)) throw serviceError('DUPLICATE_ACTIVE_BOOKING', 'You already have an active booking for this schedule.', 409);
      if (!await appointments.reserveScheduleCapacity(schedule.schedule_id, connection)) throw serviceError('CAPACITY_FULL', 'The final slot was booked by another farmer. Choose another schedule.', 409);
      const reference = bookingReference();
      const appointmentId = await appointments.insertAppointment({ bookingReference: reference, farmerId: farmer.farmer_id, scheduleId: schedule.schedule_id, estimatedQuantity: input.estimatedQuantity }, connection);
      const date = isoDate(schedule.procurement_date);
      const sequence = await appointments.allocateTokenSequence(schedule.centre_id, date, schedule.crop_id, connection);
      const number = tokenNumber(schedule, sequence);
      await appointments.insertToken({ appointmentId, tokenNumber: number, queueDate: date }, connection);
      await appendAuditLog({ actorId: userId, action: 'APPOINTMENT_BOOKED', entityType: 'appointment', entityId: appointmentId, after: { reference, scheduleId: schedule.schedule_id, estimatedQuantity: input.estimatedQuantity, tokenNumber: number } }, connection);
      return appointments.findAppointmentDetail(appointmentId, farmer.farmer_id, connection);
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw serviceError('DUPLICATE_ACTIVE_BOOKING', 'An active booking or token already exists.', 409);
    throw error;
  }
}

async function listMyBookings(userId) {
  const farmer = await appointments.findFarmerByUserId(userId);
  if (!farmer) throw serviceError('FARMER_PROFILE_NOT_FOUND', 'Farmer profile not found.', 404);
  return appointments.listFarmerAppointments(farmer.farmer_id);
}

async function cancelBooking(appointmentId, input, userId) {
  return withTransaction(async (connection) => {
    const farmer = await appointments.findFarmerByUserId(userId, connection);
    if (!farmer) throw serviceError('FARMER_PROFILE_NOT_FOUND', 'Farmer profile not found.', 404);
    const appointment = await appointments.findAppointmentForUpdate(appointmentId, farmer.farmer_id, connection);
    if (!appointment) throw serviceError('APPOINTMENT_NOT_FOUND', 'Appointment not found.', 404);
    if (appointment.booking_status !== 'confirmed') throw serviceError('INVALID_APPOINTMENT_STATE', 'Only confirmed appointments can be cancelled.', 409);
    await appointments.findScheduleForBooking(appointment.schedule_id, connection, true);
    if (!await appointments.cancelAppointment(appointmentId, input.reason, connection)) throw serviceError('CANCELLATION_CONFLICT', 'The appointment state changed before cancellation.', 409);
    await appointments.releaseScheduleCapacity(appointment.schedule_id, connection);
    await appendAuditLog({ actorId: userId, action: 'APPOINTMENT_CANCELLED', entityType: 'appointment', entityId: appointmentId, before: appointment, after: { bookingStatus: 'cancelled' }, metadata: { reason: input.reason || null } }, connection);
    return appointments.findAppointmentDetail(appointmentId, farmer.farmer_id, connection);
  });
}

async function rescheduleBooking(appointmentId, input, userId) {
  try {
    return await withTransaction(async (connection) => {
      const farmer = await appointments.findFarmerByUserId(userId, connection);
      if (!farmer) throw serviceError('FARMER_PROFILE_NOT_FOUND', 'Farmer profile not found.', 404);
      const oldAppointment = await appointments.findAppointmentForUpdate(appointmentId, farmer.farmer_id, connection);
      if (!oldAppointment) throw serviceError('APPOINTMENT_NOT_FOUND', 'Appointment not found.', 404);
      if (oldAppointment.booking_status !== 'confirmed') throw serviceError('INVALID_APPOINTMENT_STATE', 'Only confirmed appointments can be rescheduled.', 409);
      if (Number(oldAppointment.schedule_id) === Number(input.newScheduleId)) throw serviceError('SAME_SCHEDULE', 'Choose a different schedule.', 400);
      const scheduleIds = [Number(oldAppointment.schedule_id), Number(input.newScheduleId)].sort((a, b) => a - b);
      const locked = new Map();
      for (const scheduleId of scheduleIds) locked.set(scheduleId, await appointments.findScheduleForBooking(scheduleId, connection, true));
      const target = locked.get(Number(input.newScheduleId));
      validateBookableSchedule(target);
      if (await appointments.findDuplicateActive(farmer.farmer_id, target.schedule_id, connection)) throw serviceError('DUPLICATE_ACTIVE_BOOKING', 'You already have an active booking for the new schedule.', 409);
      if (!await appointments.reserveScheduleCapacity(target.schedule_id, connection)) throw serviceError('CAPACITY_FULL', 'The final slot was booked by another farmer.', 409);
      const reference = bookingReference();
      const newAppointmentId = await appointments.insertAppointment({ bookingReference: reference, farmerId: farmer.farmer_id, scheduleId: target.schedule_id, estimatedQuantity: input.estimatedQuantity || oldAppointment.estimated_quantity, rescheduledFromId: appointmentId }, connection);
      const targetDate = isoDate(target.procurement_date);
      const sequence = await appointments.allocateTokenSequence(target.centre_id, targetDate, target.crop_id, connection);
      await appointments.insertToken({ appointmentId: newAppointmentId, tokenNumber: tokenNumber(target, sequence), queueDate: targetDate }, connection);
      await appointments.cancelAppointment(appointmentId, 'Rescheduled to a new appointment', connection);
      await appointments.releaseScheduleCapacity(oldAppointment.schedule_id, connection);
      await appendAuditLog({ actorId: userId, action: 'APPOINTMENT_RESCHEDULED', entityType: 'appointment', entityId: newAppointmentId, before: oldAppointment, after: { newAppointmentId, newScheduleId: target.schedule_id, reference } }, connection);
      return appointments.findAppointmentDetail(newAppointmentId, farmer.farmer_id, connection);
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw serviceError('RESCHEDULE_CONFLICT', 'The appointment could not be rescheduled because the target changed.', 409);
    throw error;
  }
}

async function getToken(appointmentId, userId) {
  const farmer = await appointments.findFarmerByUserId(userId);
  if (!farmer) throw serviceError('FARMER_PROFILE_NOT_FOUND', 'Farmer profile not found.', 404);
  const detail = await appointments.findAppointmentDetail(appointmentId, farmer.farmer_id);
  if (!detail) throw serviceError('APPOINTMENT_NOT_FOUND', 'Appointment not found.', 404);
  return detail;
}

module.exports = { createBooking, listMyBookings, cancelBooking, rescheduleBooking, getToken, validateBookableSchedule, tokenNumber };
