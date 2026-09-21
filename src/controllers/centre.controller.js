'use strict';

const service = require('../services/centre.service');
const actor = (request) => ({ userId: request.auth.userId, role: request.auth.role });

async function listCentres(request, response) { response.json({ success: true, data: await service.listCentres(request.validatedQuery || {}) }); }
async function getCentre(request, response) { response.json({ success: true, data: await service.getCentre(Number(request.params.id)) }); }
async function listCrops(_request, response) { response.json({ success: true, data: await service.listCrops() }); }
async function listSchedules(request, response) { response.json({ success: true, data: await service.listSchedules(request.validatedQuery || {}) }); }
async function createCentre(request, response) { response.status(201).json({ success: true, message: 'Procurement centre created.', data: await service.createCentre(request.body, actor(request)) }); }
async function createCrop(request, response) { response.status(201).json({ success: true, message: 'Crop created.', data: await service.createCrop(request.body, actor(request)) }); }
async function createSchedule(request, response) { response.status(201).json({ success: true, message: 'Schedule created.', data: await service.createSchedule(request.body, actor(request)) }); }
async function updateSchedule(request, response) { response.json({ success: true, message: 'Schedule updated.', data: await service.updateSchedule(Number(request.params.id), request.body, actor(request)) }); }
async function changeCentreStatus(request, response) { response.json({ success: true, message: 'Centre status updated.', data: await service.changeCentreStatus(Number(request.params.id), request.body, actor(request)) }); }
async function scheduleHistory(request, response) { response.json({ success: true, data: await service.scheduleHistory(Number(request.params.id), actor(request)) }); }

module.exports = { listCentres, getCentre, listCrops, listSchedules, createCentre, createCrop, createSchedule, updateSchedule, changeCentreStatus, scheduleHistory };
