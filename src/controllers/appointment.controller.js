'use strict';

const service = require('../services/appointment.service');
const notifications = require('../services/notification.service');
async function notify(input) { try { await notifications.create(input); } catch (error) { console.error('Notification persistence failed', error.code || error.message); } }

async function create(request, response) { const data=await service.createBooking(request.body, request.auth.userId);await notify({userId:request.auth.userId,eventType:'appointment_confirmed',title:'Appointment confirmed',message:`Booking ${data.booking_reference} is confirmed. Token: ${data.token_number}.`,data:{appointmentId:data.appointment_id},deduplicationKey:`appointment-confirmed:${data.appointment_id}`});response.status(201).json({ success: true, message: 'Appointment confirmed.', data }); }
async function mine(request, response) { response.json({ success: true, data: await service.listMyBookings(request.auth.userId) }); }
async function cancel(request, response) { const data=await service.cancelBooking(Number(request.params.id), request.body, request.auth.userId);await notify({userId:request.auth.userId,eventType:'appointment_cancelled',title:'Appointment cancelled',message:`Booking ${data.booking_reference} was cancelled.`,data:{appointmentId:data.appointment_id},deduplicationKey:`appointment-cancelled:${data.appointment_id}`});response.json({ success: true, message: 'Appointment cancelled and capacity released.', data }); }
async function reschedule(request, response) { const data=await service.rescheduleBooking(Number(request.params.id), request.body, request.auth.userId);await notify({userId:request.auth.userId,eventType:'appointment_rescheduled',title:'Appointment rescheduled',message:`Your new booking is ${data.booking_reference}; token ${data.token_number}.`,data:{appointmentId:data.appointment_id},deduplicationKey:`appointment-rescheduled:${request.params.id}:${data.appointment_id}`});response.status(201).json({ success: true, message: 'Appointment rescheduled atomically.', data }); }
async function token(request, response) { response.json({ success: true, data: await service.getToken(Number(request.params.id), request.auth.userId) }); }

module.exports = { create, mine, cancel, reschedule, token };
