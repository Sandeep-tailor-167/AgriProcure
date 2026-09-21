'use strict';
const service = require('../services/queue.service');
const notifications = require('../services/notification.service');
const actor = (request) => ({ userId: request.auth.userId, role: request.auth.role });
async function checkIn(request, response) { response.json({ success: true, message: 'Checked in to the live queue.', data: await service.checkIn(request.body.appointmentId, request.auth.userId) }); }
async function mine(request, response) { response.json({ success: true, data: await service.myQueue(request.auth.userId) }); }
async function list(request, response) { response.json({ success: true, data: await service.centreQueue(request.query, actor(request)) }); }
async function next(request, response) { const data=await service.next(request.body, actor(request));try{await notifications.create({userId:data.farmer_user_id,eventType:'queue_turn',title:'Your turn is approaching',message:`Token ${data.token_number} has been called at ${data.centre_name}.`,data:{tokenId:data.token_id},deduplicationKey:`queue-called:${data.token_id}:${data.claim_version}`});}catch(error){console.error('Queue notification failed',error.code||error.message);}response.json({ success: true, data }); }
async function transition(request, response) { response.json({ success: true, data: await service.transition(Number(request.params.id), request.body, actor(request)) }); }
async function control(request, response) { response.json({ success: true, data: await service.control(request.body, actor(request)) }); }
async function interruption(request, response) { response.status(201).json({ success: true, data: await service.interruption(request.body, actor(request)) }); }
module.exports = { checkIn, mine, list, next, transition, control, interruption };
