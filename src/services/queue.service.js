'use strict';
const queue = require('../repositories/queue.repository');
const centres = require('../repositories/centre.repository');
const { appendAuditLog } = require('../repositories/audit.repository');
const { withTransaction } = require('../config/database');
const { emitQueueUpdate } = require('../config/socket');

function serviceError(code, message, status) { return Object.assign(new Error(message), { code, status }); }
function dateOnly(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10); }
function estimate(row) {
  const minutes = row.queue_state === 'paused' ? null : Math.ceil((Number(row.farmers_ahead || 0) * Number(row.avg_service_minutes || 15)) / Math.max(1, Number(row.active_counters || 1)));
  return { ...row, estimated_wait_minutes: minutes, estimate_method: 'recent_service_rate', estimate_updated_at: new Date().toISOString() };
}
async function assertScope(userId, role, centreId, connection) {
  if (role === 'admin') return;
  if (!await centres.isOfficerAssigned(userId, centreId, connection)) throw serviceError('CENTRE_FORBIDDEN', 'You are not assigned to this centre.', 403);
}
async function checkIn(appointmentId, userId) {
  const result = await withTransaction(async (connection) => {
    const token = await queue.findFarmerToken(appointmentId, userId, connection, true);
    if (!token) throw serviceError('TOKEN_NOT_FOUND', 'No token was found for this appointment.', 404);
    if (token.booking_status !== 'confirmed') throw serviceError('BOOKING_NOT_ACTIVE', 'Only a confirmed appointment can check in.', 409);
    if (dateOnly(token.queue_date) !== new Date().toISOString().slice(0, 10)) throw serviceError('CHECK_IN_DATE_INVALID', 'Check-in is available only on the appointment date.', 409);
    if (token.queue_status !== 'not_checked_in') throw serviceError('ALREADY_CHECKED_IN', 'This token has already been checked in or closed.', 409);
    if (!await queue.setTokenStatus(token.token_id, ['not_checked_in'], 'waiting', userId, connection)) throw serviceError('CHECK_IN_CONFLICT', 'The token changed before check-in completed.', 409);
    await appendAuditLog({ actorId: userId, action: 'QUEUE_CHECK_IN', entityType: 'queue_token', entityId: token.token_id, before: { status: token.queue_status }, after: { status: 'waiting' } }, connection);
    return queue.findToken(token.token_id, connection);
  });
  emitQueueUpdate(result.centre_id, result.queue_date, { type: 'token_checked_in', tokenId: result.token_id, updatedAt: new Date().toISOString() });
  return result;
}
async function myQueue(userId) { return (await queue.listFarmerQueue(userId)).map(estimate); }
async function centreQueue(input, actor) {
  await assertScope(actor.userId, actor.role, input.centreId);
  return { centreId: input.centreId, date: input.date, updatedAt: new Date().toISOString(), tokens: await queue.listCentreQueue(input.centreId, input.date) };
}
async function next(input, actor) {
  const token = await withTransaction(async (connection) => {
    await assertScope(actor.userId, actor.role, input.centreId, connection);
    const control = await queue.lockQueueControl(input.centreId, input.date, actor.userId, connection);
    if (control.queue_state !== 'running') throw serviceError('QUEUE_NOT_RUNNING', 'Resume the queue before calling another token.', 409);
    const claimed = await queue.claimNextWaiting(input.centreId, input.date, actor.userId, connection);
    if (!claimed) throw serviceError('QUEUE_EMPTY', 'No waiting token is available.', 404);
    await appendAuditLog({ actorId: actor.userId, action: 'QUEUE_TOKEN_CALLED', entityType: 'queue_token', entityId: claimed.token_id, after: { status: 'called' } }, connection);
    return claimed;
  });
  emitQueueUpdate(input.centreId, input.date, { type: 'token_called', tokenId: token.token_id, tokenNumber: token.token_number, updatedAt: new Date().toISOString() });
  return token;
}
const allowed = Object.freeze({ called: ['in_service', 'no_show'], in_service: ['inspection', 'completed'], inspection: ['completed'] });
async function transition(tokenId, input, actor) {
  const token = await withTransaction(async (connection) => {
    const current = await queue.findToken(tokenId, connection, true);
    if (!current) throw serviceError('TOKEN_NOT_FOUND', 'Queue token not found.', 404);
    await assertScope(actor.userId, actor.role, current.centre_id, connection);
    if (!(allowed[current.queue_status] || []).includes(input.status)) throw serviceError('INVALID_QUEUE_TRANSITION', `Cannot move a ${current.queue_status} token to ${input.status}.`, 409);
    if (!await queue.setTokenStatus(tokenId, [current.queue_status], input.status, actor.userId, connection, input.reason)) throw serviceError('QUEUE_TRANSITION_CONFLICT', 'Another operator changed this token.', 409);
    await appendAuditLog({ actorId: actor.userId, action: 'QUEUE_STATUS_CHANGED', entityType: 'queue_token', entityId: tokenId, before: { status: current.queue_status }, after: { status: input.status }, metadata: { reason: input.reason || null } }, connection);
    return queue.findToken(tokenId, connection);
  });
  emitQueueUpdate(token.centre_id, token.queue_date, { type: 'token_status', tokenId, status: input.status, updatedAt: new Date().toISOString() });
  return token;
}
async function control(input, actor) {
  const result = await withTransaction(async (connection) => {
    await assertScope(actor.userId, actor.role, input.centreId, connection);
    const state = await queue.updateQueueControl(input, actor.userId, connection);
    await appendAuditLog({ actorId: actor.userId, action: 'QUEUE_CONTROL_CHANGED', entityType: 'procurement_centre', entityId: input.centreId, after: input }, connection);
    return state;
  });
  emitQueueUpdate(input.centreId, input.date, { type: 'queue_control', state: input.state, updatedAt: new Date().toISOString() });
  return result;
}
async function interruption(input, actor) {
  await assertScope(actor.userId, actor.role, input.centreId);
  const id = await queue.insertInterruption(input, actor.userId);
  return { interruptionId: id, ...input, startedAt: new Date().toISOString() };
}
module.exports = { checkIn, myQueue, centreQueue, next, transition, control, interruption, estimate, allowed };
