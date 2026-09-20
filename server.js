'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const addDays = (days) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const now = () => new Date().toISOString();
const uid = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};
const verifyPassword = (password, stored) => {
  const [salt, expectedHex] = stored.split(':');
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

function createSeedData() {
  const passwordHash = hashPassword('demo123');
  const users = [
    { id: 'u_farmer', farmerId: 'F-2026-1048', name: 'Ramesh Kumar', phone: '9876543210', role: 'farmer', passwordHash, status: 'active', village: 'Rampur', district: 'Karnal', state: 'Haryana', language: 'en' },
    { id: 'u_officer', name: 'Anita Sharma', phone: '9876500001', role: 'officer', passwordHash, status: 'active', assignedCentreIds: ['ctr_karnal'] },
    { id: 'u_admin', name: 'Vikram Singh', phone: '9876500002', role: 'admin', passwordHash, status: 'active' }
  ];

  const centres = [
    { id: 'ctr_karnal', name: 'Karnal Grain Mandi', address: 'GT Road, Sector 12, Karnal', district: 'Karnal', distanceKm: 4.2, status: 'open', contact: '1800-120-4101', hours: '08:00–17:00', crops: ['Wheat', 'Paddy', 'Mustard'], rating: 4.8 },
    { id: 'ctr_assandh', name: 'Assandh Procurement Centre', address: 'Safidon Road, Assandh', district: 'Karnal', distanceKm: 18.7, status: 'open', contact: '1800-120-4102', hours: '07:30–16:00', crops: ['Wheat', 'Paddy'], rating: 4.6 },
    { id: 'ctr_nilokheri', name: 'Nilokheri Farmer Centre', address: 'Railway Road, Nilokheri', district: 'Karnal', distanceKm: 22.4, status: 'busy', contact: '1800-120-4103', hours: '08:00–16:30', crops: ['Wheat', 'Mustard', 'Bajra'], rating: 4.5 },
    { id: 'ctr_panipat', name: 'Panipat Kisan Seva Kendra', address: 'Sanauli Road, Panipat', district: 'Panipat', distanceKm: 38.1, status: 'closed', contact: '1800-120-4104', hours: '09:00–17:00', crops: ['Wheat', 'Paddy', 'Maize'], rating: 4.3 }
  ];

  const schedules = [
    { id: 'sch_1', centreId: 'ctr_karnal', crop: 'Wheat', date: addDays(1), startTime: '09:00', endTime: '11:00', capacity: 24, booked: 18, status: 'open' },
    { id: 'sch_2', centreId: 'ctr_karnal', crop: 'Wheat', date: addDays(1), startTime: '11:30', endTime: '13:30', capacity: 24, booked: 21, status: 'open' },
    { id: 'sch_3', centreId: 'ctr_karnal', crop: 'Paddy', date: addDays(2), startTime: '09:00', endTime: '11:00', capacity: 20, booked: 8, status: 'open' },
    { id: 'sch_4', centreId: 'ctr_assandh', crop: 'Wheat', date: addDays(1), startTime: '08:00', endTime: '10:00', capacity: 18, booked: 7, status: 'open' },
    { id: 'sch_5', centreId: 'ctr_assandh', crop: 'Paddy', date: addDays(3), startTime: '10:30', endTime: '12:30', capacity: 18, booked: 12, status: 'open' },
    { id: 'sch_6', centreId: 'ctr_nilokheri', crop: 'Mustard', date: addDays(2), startTime: '08:30', endTime: '10:30', capacity: 16, booked: 14, status: 'open' },
    { id: 'sch_7', centreId: 'ctr_panipat', crop: 'Maize', date: addDays(4), startTime: '09:00', endTime: '11:00', capacity: 20, booked: 0, status: 'closed' }
  ];

  const appointment = {
    id: 'apt_demo', reference: 'AP-2609-1842', farmerId: 'F-2026-1048', userId: 'u_farmer', scheduleId: 'sch_1', centreId: 'ctr_karnal', crop: 'Wheat', estimatedQuantity: 22.5,
    status: 'confirmed', createdAt: now(), token: { id: 'tok_demo', number: 'W-018', queueStatus: 'waiting', checkInTime: null },
    transaction: null
  };

  return {
    users,
    centres,
    schedules,
    appointments: [appointment],
    notifications: [
      { id: 'not_1', userId: 'u_farmer', title: 'Booking confirmed', message: 'Your token W-018 is ready for Karnal Grain Mandi.', type: 'success', read: false, createdAt: now() },
      { id: 'not_2', userId: 'u_farmer', title: 'Arrival reminder', message: 'Please arrive 20 minutes before your 09:00 slot.', type: 'info', read: false, createdAt: now() }
    ],
    auditLogs: [],
    queue: { centreId: 'ctr_karnal', crop: 'Wheat', currentToken: 'W-014', state: 'running', averageServiceMinutes: 8, lastUpdated: now() }
  };
}

let db = createSeedData();
const sessions = new Map();

function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function response(res, data, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

function failure(res, status, code, message, details) {
  return res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });
}

function audit(actorId, entityType, entityId, action, metadata = {}) {
  db.auditLogs.unshift({ id: uid('log'), actorId, entityType, entityId, action, metadata, timestamp: now() });
}

function authenticate(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  const userId = token && sessions.get(token);
  const user = db.users.find((item) => item.id === userId && item.status === 'active');
  if (!user) return failure(res, 401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  req.user = user;
  req.sessionToken = token;
  next();
}

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return failure(res, 403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  next();
};

function canOperateCentre(user, centreId) {
  return user.role === 'admin' || (user.role === 'officer' && user.assignedCentreIds?.includes(centreId));
}

app.get('/api/v1/health', (_req, res) => response(res, { status: 'healthy', timestamp: now() }, 'AgriProcure API is healthy'));

app.post('/api/v1/auth/login', (req, res) => {
  const phone = String(req.body.phone || '').replace(/\D/g, '').slice(-10);
  const password = String(req.body.password || '');
  const user = db.users.find((item) => item.phone === phone);
  if (!user || !verifyPassword(password, user.passwordHash)) return failure(res, 401, 'INVALID_CREDENTIALS', 'The phone number or password is incorrect.');
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, user.id);
  audit(user.id, 'session', user.id, 'LOGIN');
  return response(res, { token, user: publicUser(user) }, `Welcome back, ${user.name.split(' ')[0]}`);
});

app.post('/api/v1/auth/register', (req, res) => {
  const { name, phone, password, village, district, state, language = 'en' } = req.body;
  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
  if (!name || cleanPhone.length !== 10 || String(password || '').length < 8 || !district || !state) {
    return failure(res, 400, 'VALIDATION_ERROR', 'Name, valid mobile, password (8+ characters), district and state are required.');
  }
  if (db.users.some((item) => item.phone === cleanPhone)) return failure(res, 409, 'DUPLICATE_USER', 'An account already exists for this mobile number.');
  const user = { id: uid('u'), farmerId: `F-${new Date().getFullYear()}-${String(db.users.length + 1048).padStart(4, '0')}`, name: String(name).trim(), phone: cleanPhone, passwordHash: hashPassword(String(password)), role: 'farmer', status: 'active', village: String(village || '').trim(), district: String(district).trim(), state: String(state).trim(), language };
  db.users.push(user);
  audit(user.id, 'user', user.id, 'REGISTER');
  return response(res, { user: publicUser(user) }, 'Registration complete. Mobile OTP is simulated in this demo.', 201);
});

app.post('/api/v1/auth/logout', authenticate, (req, res) => {
  sessions.delete(req.sessionToken);
  return response(res, null, 'Signed out successfully');
});

app.get('/api/v1/me', authenticate, (req, res) => response(res, publicUser(req.user)));

app.patch('/api/v1/me', authenticate, allowRoles('farmer'), (req, res) => {
  const allowed = ['name', 'village', 'district', 'state', 'language'];
  for (const key of allowed) if (req.body[key] !== undefined) req.user[key] = String(req.body[key]).trim();
  audit(req.user.id, 'user', req.user.id, 'PROFILE_UPDATED');
  return response(res, publicUser(req.user), 'Profile updated');
});

app.get('/api/v1/centres', (req, res) => {
  const query = String(req.query.q || '').toLowerCase();
  const district = String(req.query.district || '').toLowerCase();
  const crop = String(req.query.crop || '').toLowerCase();
  const items = db.centres.filter((centre) => {
    const matchesQuery = !query || `${centre.name} ${centre.address} ${centre.district}`.toLowerCase().includes(query);
    const matchesDistrict = !district || centre.district.toLowerCase() === district;
    const matchesCrop = !crop || centre.crops.some((item) => item.toLowerCase() === crop);
    return matchesQuery && matchesDistrict && matchesCrop;
  }).map((centre) => ({ ...centre, availableSlots: db.schedules.filter((schedule) => schedule.centreId === centre.id && schedule.status === 'open').reduce((sum, schedule) => sum + schedule.capacity - schedule.booked, 0) }));
  return response(res, items);
});

app.get('/api/v1/centres/:id', (req, res) => {
  const centre = db.centres.find((item) => item.id === req.params.id);
  if (!centre) return failure(res, 404, 'NOT_FOUND', 'Procurement centre not found.');
  return response(res, { ...centre, schedules: db.schedules.filter((item) => item.centreId === centre.id) });
});

app.get('/api/v1/schedules', (req, res) => {
  const { centreId, crop, date } = req.query;
  const schedules = db.schedules.filter((item) => (!centreId || item.centreId === centreId) && (!crop || item.crop.toLowerCase() === String(crop).toLowerCase()) && (!date || item.date === date)).map((item) => ({ ...item, remaining: Math.max(0, item.capacity - item.booked), centre: db.centres.find((centre) => centre.id === item.centreId) }));
  return response(res, schedules);
});

app.post('/api/v1/appointments', authenticate, allowRoles('farmer'), (req, res) => {
  const schedule = db.schedules.find((item) => item.id === req.body.scheduleId);
  const estimatedQuantity = Number(req.body.estimatedQuantity);
  if (!schedule || !Number.isFinite(estimatedQuantity) || estimatedQuantity <= 0) return failure(res, 400, 'VALIDATION_ERROR', 'Select a valid schedule and enter an estimated quantity.');
  if (schedule.status !== 'open') return failure(res, 409, 'SCHEDULE_CLOSED', 'This schedule is no longer accepting bookings.');
  if (schedule.booked >= schedule.capacity) return failure(res, 409, 'CAPACITY_FULL', 'This slot is full. Please choose another time.');
  const duplicate = db.appointments.find((item) => item.userId === req.user.id && item.scheduleId === schedule.id && ['confirmed', 'checked_in', 'in_service'].includes(item.status));
  if (duplicate) return failure(res, 409, 'DUPLICATE_BOOKING', 'You already have an active booking for this slot.');

  schedule.booked += 1;
  const sequence = db.appointments.filter((item) => item.scheduleId === schedule.id).length + 19;
  const appointment = {
    id: uid('apt'), reference: `AP-${new Date().getFullYear().toString().slice(-2)}${String(new Date().getMonth() + 1).padStart(2, '0')}-${crypto.randomInt(1000, 9999)}`,
    farmerId: req.user.farmerId, userId: req.user.id, scheduleId: schedule.id, centreId: schedule.centreId, crop: schedule.crop, estimatedQuantity,
    status: 'confirmed', createdAt: now(), token: { id: uid('tok'), number: `${schedule.crop.charAt(0).toUpperCase()}-${String(sequence).padStart(3, '0')}`, queueStatus: 'not_checked_in', checkInTime: null }, transaction: null
  };
  db.appointments.push(appointment);
  db.notifications.unshift({ id: uid('not'), userId: req.user.id, title: 'Booking confirmed', message: `Your token ${appointment.token.number} is ready.`, type: 'success', read: false, createdAt: now() });
  audit(req.user.id, 'appointment', appointment.id, 'BOOKED', { scheduleId: schedule.id });
  io.to(`user:${req.user.id}`).emit('appointment:created', appointment);
  return response(res, appointment, 'Appointment confirmed', 201);
});

app.get('/api/v1/appointments/my', authenticate, allowRoles('farmer'), (req, res) => {
  const items = db.appointments.filter((item) => item.userId === req.user.id).map(enrichAppointment);
  return response(res, items);
});

app.patch('/api/v1/appointments/:id/cancel', authenticate, allowRoles('farmer'), (req, res) => {
  const appointment = db.appointments.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!appointment) return failure(res, 404, 'NOT_FOUND', 'Appointment not found.');
  if (appointment.status !== 'confirmed') return failure(res, 409, 'INVALID_STATE', 'Only confirmed appointments can be cancelled.');
  appointment.status = 'cancelled';
  appointment.token.queueStatus = 'cancelled';
  const schedule = db.schedules.find((item) => item.id === appointment.scheduleId);
  if (schedule) schedule.booked = Math.max(0, schedule.booked - 1);
  audit(req.user.id, 'appointment', appointment.id, 'CANCELLED');
  return response(res, enrichAppointment(appointment), 'Appointment cancelled. The slot is available again.');
});

function enrichAppointment(item) {
  return { ...item, centre: db.centres.find((centre) => centre.id === item.centreId), schedule: db.schedules.find((schedule) => schedule.id === item.scheduleId) };
}

app.get('/api/v1/queue/live', authenticate, (req, res) => {
  const appointment = req.user.role === 'farmer' ? db.appointments.find((item) => item.userId === req.user.id && !['cancelled', 'completed'].includes(item.status)) : null;
  const currentNumber = Number(db.queue.currentToken.split('-')[1]);
  const ownNumber = appointment ? Number(appointment.token.number.split('-')[1]) : currentNumber;
  const peopleAhead = Math.max(0, ownNumber - currentNumber);
  return response(res, { ...db.queue, ownToken: appointment?.token.number || null, peopleAhead, estimatedWait: peopleAhead ? `${Math.max(5, peopleAhead * 6)}–${peopleAhead * 10} min` : 'Now serving' });
});

app.post('/api/v1/queue/:id/check-in', authenticate, allowRoles('officer', 'admin'), (req, res) => {
  const appointment = db.appointments.find((item) => item.id === req.params.id);
  if (!appointment) return failure(res, 404, 'NOT_FOUND', 'Appointment not found.');
  if (!canOperateCentre(req.user, appointment.centreId)) return failure(res, 403, 'CENTRE_FORBIDDEN', 'You are not assigned to this centre.');
  if (appointment.status !== 'confirmed') return failure(res, 409, 'INVALID_STATE', 'This appointment cannot be checked in.');
  appointment.status = 'checked_in';
  appointment.token.queueStatus = 'waiting';
  appointment.token.checkInTime = now();
  db.queue.lastUpdated = now();
  audit(req.user.id, 'queue_token', appointment.token.id, 'CHECKED_IN');
  io.emit('queue:update', db.queue);
  return response(res, enrichAppointment(appointment), `${appointment.token.number} checked in`);
});

app.patch('/api/v1/queue/:id/status', authenticate, allowRoles('officer', 'admin'), (req, res) => {
  const appointment = db.appointments.find((item) => item.id === req.params.id);
  const next = String(req.body.status || '');
  if (!appointment) return failure(res, 404, 'NOT_FOUND', 'Appointment not found.');
  if (!canOperateCentre(req.user, appointment.centreId)) return failure(res, 403, 'CENTRE_FORBIDDEN', 'You are not assigned to this centre.');
  const valid = { checked_in: ['in_service', 'no_show'], in_service: ['inspection'], inspection: ['completed'] };
  if (!valid[appointment.status]?.includes(next)) return failure(res, 409, 'INVALID_STATE', `Cannot move from ${appointment.status} to ${next}.`);
  appointment.status = next;
  appointment.token.queueStatus = next;
  if (next === 'in_service') db.queue.currentToken = appointment.token.number;
  db.queue.lastUpdated = now();
  audit(req.user.id, 'queue_token', appointment.token.id, 'STATUS_CHANGED', { status: next });
  io.emit('queue:update', { ...db.queue, changedToken: appointment.token.number, status: next });
  return response(res, enrichAppointment(appointment), 'Queue status updated');
});

app.post('/api/v1/transactions/:appointmentId/inspection', authenticate, allowRoles('officer', 'admin'), (req, res) => {
  const appointment = db.appointments.find((item) => item.id === req.params.appointmentId);
  if (!appointment) return failure(res, 404, 'NOT_FOUND', 'Appointment not found.');
  if (!canOperateCentre(req.user, appointment.centreId)) return failure(res, 403, 'CENTRE_FORBIDDEN', 'You are not assigned to this centre.');
  const result = String(req.body.result || '').toLowerCase();
  const actualQuantity = Number(req.body.actualQuantity);
  if (!['accepted', 'rejected', 'on_hold'].includes(result) || !Number.isFinite(actualQuantity) || actualQuantity <= 0) return failure(res, 400, 'VALIDATION_ERROR', 'A valid decision and actual quantity are required.');
  if (result !== 'accepted' && !String(req.body.notes || '').trim()) return failure(res, 400, 'REASON_REQUIRED', 'A reason is required for rejected or on-hold produce.');
  appointment.transaction = { id: appointment.transaction?.id || uid('txn'), status: 'procurement_decision', decision: result, actualQuantity, acceptedQuantity: result === 'accepted' ? actualQuantity : 0, notes: String(req.body.notes || '').trim(), officerId: req.user.id, inspectedAt: now(), paymentStatus: 'pending' };
  appointment.status = 'inspection';
  audit(req.user.id, 'transaction', appointment.transaction.id, 'INSPECTION_RECORDED', { result });
  return response(res, enrichAppointment(appointment), 'Inspection recorded');
});

app.post('/api/v1/transactions/:appointmentId/purchase', authenticate, allowRoles('officer', 'admin'), (req, res) => {
  const appointment = db.appointments.find((item) => item.id === req.params.appointmentId);
  if (!appointment?.transaction) return failure(res, 404, 'NOT_FOUND', 'Inspection record not found.');
  if (!canOperateCentre(req.user, appointment.centreId)) return failure(res, 403, 'CENTRE_FORBIDDEN', 'You are not assigned to this centre.');
  if (appointment.transaction.decision !== 'accepted') return failure(res, 409, 'INSPECTION_NOT_ACCEPTED', 'Only accepted produce can be purchased.');
  const rate = Number(req.body.rate);
  const acceptedQuantity = Number(req.body.acceptedQuantity);
  const deduction = Math.max(0, Number(req.body.deduction || 0));
  if (!(rate > 0) || !(acceptedQuantity > 0) || acceptedQuantity > appointment.transaction.actualQuantity) return failure(res, 400, 'VALIDATION_ERROR', 'Enter a valid rate and accepted quantity.');
  Object.assign(appointment.transaction, { status: 'purchase_recorded', rate, acceptedQuantity, deduction, totalAmount: Number((rate * acceptedQuantity - deduction).toFixed(2)), purchasedAt: now(), paymentStatus: 'pending' });
  appointment.status = 'completed';
  appointment.token.queueStatus = 'completed';
  audit(req.user.id, 'transaction', appointment.transaction.id, 'PURCHASE_RECORDED', { totalAmount: appointment.transaction.totalAmount });
  db.notifications.unshift({ id: uid('not'), userId: appointment.userId, title: 'Purchase recorded', message: `Purchase recorded for ${acceptedQuantity} qtl of ${appointment.crop}. Payment remains pending.`, type: 'success', read: false, createdAt: now() });
  return response(res, enrichAppointment(appointment), 'Purchase recorded. Payment remains pending.');
});

app.get('/api/v1/transactions/:id', authenticate, (req, res) => {
  const appointment = db.appointments.find((item) => item.transaction?.id === req.params.id);
  if (!appointment) return failure(res, 404, 'NOT_FOUND', 'Transaction not found.');
  const allowed = req.user.role === 'admin' || appointment.userId === req.user.id || canOperateCentre(req.user, appointment.centreId);
  if (!allowed) return failure(res, 403, 'FORBIDDEN', 'You cannot view this transaction.');
  return response(res, enrichAppointment(appointment));
});

app.get('/api/v1/notifications', authenticate, (req, res) => response(res, db.notifications.filter((item) => item.userId === req.user.id)));

app.patch('/api/v1/notifications/:id/read', authenticate, (req, res) => {
  const notification = db.notifications.find((item) => item.id === req.params.id && item.userId === req.user.id);
  if (!notification) return failure(res, 404, 'NOT_FOUND', 'Notification not found.');
  notification.read = true;
  return response(res, notification, 'Notification marked as read');
});

app.get('/api/v1/officer/dashboard', authenticate, allowRoles('officer', 'admin'), (req, res) => {
  const centreIds = req.user.role === 'admin' ? db.centres.map((item) => item.id) : req.user.assignedCentreIds;
  const appointments = db.appointments.filter((item) => centreIds.includes(item.centreId)).map(enrichAppointment);
  const capacity = db.schedules.filter((item) => centreIds.includes(item.centreId)).reduce((sum, item) => sum + item.capacity, 0);
  return response(res, { appointments, queue: db.queue, metrics: { capacity, reservations: appointments.filter((item) => item.status !== 'cancelled').length, checkedIn: appointments.filter((item) => ['checked_in', 'in_service', 'inspection'].includes(item.status)).length, completed: appointments.filter((item) => item.status === 'completed').length } });
});

app.get('/api/v1/admin/dashboard', authenticate, allowRoles('admin'), (_req, res) => {
  const activeBookings = db.appointments.filter((item) => !['cancelled'].includes(item.status)).length;
  return response(res, { metrics: { centres: db.centres.length, openCentres: db.centres.filter((item) => item.status !== 'closed').length, farmers: db.users.filter((item) => item.role === 'farmer').length, activeBookings, transactions: db.appointments.filter((item) => item.transaction).length }, centres: db.centres.map((centre) => ({ ...centre, bookings: db.appointments.filter((item) => item.centreId === centre.id).length, availableSlots: db.schedules.filter((schedule) => schedule.centreId === centre.id && schedule.status === 'open').reduce((sum, schedule) => sum + schedule.capacity - schedule.booked, 0) })), auditLogs: db.auditLogs.slice(0, 20) });
});

app.post('/api/v1/admin/demo/reset', authenticate, allowRoles('admin'), (req, res) => {
  db = createSeedData();
  sessions.clear();
  return response(res, null, 'Demo data reset. Please sign in again.');
});

io.on('connection', (socket) => {
  socket.on('authenticate', (token) => {
    const userId = sessions.get(token);
    if (userId) socket.join(`user:${userId}`);
  });
});

app.use('/api', (_req, res) => failure(res, 404, 'NOT_FOUND', 'API endpoint not found.'));
app.use((_err, _req, res, _next) => failure(res, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.'));

if (require.main === module) {
  server.listen(PORT, () => console.log(`AgriProcure running at http://localhost:${PORT}`));
}

module.exports = { app, server, createSeedData };
