'use strict';

const state = {
  token: sessionStorage.getItem('agriprocure_token'),
  user: JSON.parse(sessionStorage.getItem('agriprocure_user') || 'null'),
  centres: [],
  appointments: [],
  notifications: [],
  bookingStep: 1,
  selectedSchedule: null,
  language: localStorage.getItem('agriprocure_language') || 'en',
  socket: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const rolePhones = { farmer: '9876543210', officer: '9876500001', admin: '9876500002' };
const activeStatuses = ['confirmed', 'checked_in', 'in_service', 'inspection'];

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`/api/v1${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({ success: false, error: { message: 'The server returned an unreadable response.' } }));
  if (response.status === 401 && !path.includes('/auth/login')) {
    clearSession();
    showLogin();
  }
  if (!response.ok) throw new Error(payload.error?.message || 'Something went wrong.');
  return payload.data;
}

function clearSession() {
  state.token = null;
  state.user = null;
  sessionStorage.removeItem('agriprocure_token');
  sessionStorage.removeItem('agriprocure_user');
}

function storeSession(data) {
  state.token = data.token;
  state.user = data.user;
  sessionStorage.setItem('agriprocure_token', data.token);
  sessionStorage.setItem('agriprocure_user', JSON.stringify(data.user));
}

function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Intl.DateTimeFormat(state.language === 'hi' ? 'hi-IN' : 'en-IN', options).format(new Date(`${value}T12:00:00`));
}

function initials(name) {
  return String(name).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function titleCase(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function relativeTime(value) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 15) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `<svg class="icon"><use href="#check"></use></svg><span>${escapeHtml(message)}</span>`;
  $('#toastRegion').append(node);
  setTimeout(() => node.remove(), 3800);
}

function showLogin() {
  const dialog = $('#loginDialog');
  if (!dialog.open) dialog.showModal();
}

async function login(phone, password = 'demo123') {
  const button = $('#loginForm button[type="submit"]');
  const error = $('#loginError');
  error.hidden = true;
  button.disabled = true;
  button.firstChild.textContent = 'Signing in ';
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) });
    storeSession(data);
    $('#loginDialog').close();
    await initialiseApp();
    toast(`Welcome, ${state.user.name.split(' ')[0]}`);
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.firstChild.textContent = 'Sign in ';
  }
}

async function initialiseApp() {
  if (!state.token || !state.user) return showLogin();
  document.body.dataset.role = state.user.role;
  updateIdentity();
  connectSocket();
  try {
    state.centres = await api('/centres');
    if (state.user.role === 'farmer') {
      [state.appointments, state.notifications] = await Promise.all([api('/appointments/my'), api('/notifications')]);
      renderFarmer();
      navigate(location.hash.slice(1) || 'dashboard');
    } else if (state.user.role === 'officer') {
      await renderOfficer();
      navigate('officer');
    } else {
      await renderAdmin();
      navigate('admin');
    }
  } catch (err) {
    toast(err.message);
  }
}

function updateIdentity() {
  const user = state.user;
  const avatarText = initials(user.name);
  $$('.avatar').forEach((avatar) => { avatar.textContent = avatarText; });
  $('#headerName').textContent = user.name;
  $('#profileName').textContent = user.name;
  $('#profilePhone').textContent = `+91 ••••• ${user.phone.slice(-5)}`;
  const roleDetail = user.role === 'farmer' ? `Farmer · ${user.farmerId}` : titleCase(user.role);
  $('#headerRole').textContent = roleDetail;
  $('#firstName').textContent = user.name.split(' ')[0];
  const today = new Intl.DateTimeFormat(state.language === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  $('#todayLabel').textContent = today;
  applyLanguage();
}

function navigate(route) {
  if (!state.user) return;
  const allowed = state.user.role === 'farmer' ? ['dashboard', 'centres', 'appointments', 'support'] : [state.user.role];
  if (!allowed.includes(route)) route = allowed[0];
  $$('.view').forEach((view) => view.classList.toggle('active', view.id === `${route}View`));
  $$('[data-route]').forEach((link) => link.classList.toggle('active', link.dataset.route === route));
  if (location.hash !== `#${route}`) history.replaceState(null, '', `#${route}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $('#app').focus({ preventScroll: true });
}

function renderFarmer() {
  renderNextAppointment();
  renderCentres();
  renderAppointments();
  renderNotifications();
  refreshQueue(false);
}

function renderNextAppointment() {
  const appointment = state.appointments.find((item) => activeStatuses.includes(item.status));
  const card = $('#nextAppointmentCard');
  if (!appointment) {
    card.innerHTML = `<div class="empty-state"><svg class="icon"><use href="#calendar"></use></svg><h2>No upcoming appointment</h2><p>Book a procurement slot when you are ready to sell.</p><button class="primary-button" data-action="open-booking">Book appointment</button></div>`;
    bindDynamicActions(card);
    return;
  }
  const date = new Date(`${appointment.schedule.date}T12:00:00`);
  $('#appointmentMonth').textContent = new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date).toUpperCase();
  $('#appointmentDay').textContent = date.getDate();
  $('#appointmentWeekday').textContent = new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(date).toUpperCase();
  $('#appointmentCentre').textContent = appointment.centre.name;
  $('#appointmentTime').textContent = `${appointment.schedule.startTime} – ${appointment.schedule.endTime}`;
  $('#appointmentCrop').textContent = `${appointment.crop} · Est. ${appointment.estimatedQuantity} quintals`;
  $('#appointmentAddress').textContent = appointment.centre.address;
  $('#appointmentToken').textContent = appointment.token.number;
  $('#bookingReference').textContent = appointment.reference;
  $('#yourToken').textContent = appointment.token.number;
  $('#timelineVisit').textContent = `${formatDate(appointment.schedule.date, { day: 'numeric', month: 'short' })} · ${appointment.schedule.startTime}`;

  $('#ticketToken').textContent = appointment.token.number;
  $('#ticketCentre').textContent = appointment.centre.name;
  $('#ticketDate').textContent = formatDate(appointment.schedule.date);
  $('#ticketTime').textContent = `${appointment.schedule.startTime}–${appointment.schedule.endTime}`;
  $('#ticketCrop').textContent = appointment.crop;
  $('#ticketQuantity').textContent = `${appointment.estimatedQuantity} qtl`;
  $('#ticketReference').textContent = appointment.reference;
}

function centreStatus(centre) {
  if (centre.status === 'closed') return ['closed', 'Closed'];
  if (centre.status === 'busy') return ['warning', 'Busy'];
  return ['success', 'Open'];
}

function renderCentres(items = state.centres) {
  $('#resultCount').textContent = `${items.length} centre${items.length === 1 ? '' : 's'}`;
  $('#centresList').innerHTML = items.length ? items.map((centre) => {
    const [statusClass, statusLabel] = centreStatus(centre);
    return `<article class="centre-list-card">
      <div class="centre-icon"><svg class="icon"><use href="#map-pin"></use></svg></div>
      <div><h3>${escapeHtml(centre.name)}</h3><p>${escapeHtml(centre.address)} · ${centre.distanceKm} km away</p><div class="tags">${centre.crops.map((crop) => `<span class="tag">${escapeHtml(crop)}</span>`).join('')}<span class="tag">${escapeHtml(centre.hours)}</span></div></div>
      <div class="centre-meta"><span class="status-pill ${statusClass}"><span></span>${statusLabel}</span><strong>${centre.availableSlots} slots available</strong><small>★ ${centre.rating} · ${escapeHtml(centre.district)}</small><button class="secondary-button" data-book-centre="${centre.id}" ${centre.status === 'closed' ? 'disabled' : ''}>View & book</button></div>
    </article>`;
  }).join('') : `<div class="card empty-state"><h2>No matching centres</h2><p>Try a different crop, district, or search term.</p></div>`;

  const nearby = items.filter((centre) => centre.status !== 'closed').slice(0, 2);
  $('#nearbyCentres').innerHTML = nearby.map((centre) => `<button class="centre-mini" data-book-centre="${centre.id}"><span class="centre-icon"><svg class="icon"><use href="#map-pin"></use></svg></span><span><h3>${escapeHtml(centre.name)}</h3><p>${centre.distanceKm} km · ${centre.availableSlots} slots available</p></span><span>View <svg class="icon"><use href="#arrow-right"></use></svg></span></button>`).join('');
  bindDynamicActions($('#centresList'));
  bindDynamicActions($('#nearbyCentres'));
}

function renderAppointments(filter = 'active') {
  const items = state.appointments.filter((item) => {
    if (filter === 'active') return activeStatuses.includes(item.status);
    if (filter === 'cancelled') return item.status === 'cancelled';
    return item.status === 'completed';
  });
  $('#appointmentsList').innerHTML = items.length ? items.map((item) => {
    const date = new Date(`${item.schedule.date}T12:00:00`);
    return `<article class="card booking-list-card">
      <div class="date-tile"><span>${new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date).toUpperCase()}</span><strong>${date.getDate()}</strong><small>${new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(date).toUpperCase()}</small></div>
      <div><span class="status-pill ${item.status === 'cancelled' ? 'closed' : item.status === 'completed' ? 'success' : 'warning'}"><span></span>${titleCase(item.status)}</span><h3>${escapeHtml(item.centre.name)}</h3><p>${escapeHtml(item.crop)} · ${item.estimatedQuantity} qtl · ${item.schedule.startTime}–${item.schedule.endTime}</p><p>Booking ${escapeHtml(item.reference)}</p></div>
      <div class="token-block"><small>TOKEN</small><strong>${escapeHtml(item.token.number)}</strong>${item.status === 'confirmed' ? `<span class="token-actions"><button class="text-button" data-token-id="${item.id}">View token</button><button class="text-button danger-text" data-cancel-id="${item.id}">Cancel</button></span>` : `<span>${titleCase(item.token.queueStatus)}</span>`}</div>
    </article>`;
  }).join('') : `<div class="card empty-state"><h2>No ${filter} bookings</h2><p>Your ${filter} appointments will appear here.</p></div>`;
  bindDynamicActions($('#appointmentsList'));
}

function renderNotifications() {
  const unread = state.notifications.filter((item) => !item.read).length;
  $('#notificationCount').textContent = unread;
  $('#notificationCount').hidden = unread === 0;
  $('#notificationList').innerHTML = state.notifications.length ? state.notifications.map((item) => `<button class="notification-item ${item.read ? 'read' : ''}" data-notification-id="${item.id}"><i></i><span><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.message)}</p></span></button>`).join('') : '<div class="empty-state">You’re all caught up.</div>';
}

async function refreshQueue(showToast = true) {
  if (state.user?.role !== 'farmer') return;
  try {
    const queue = await api('/queue/live');
    $('#currentToken').textContent = queue.currentToken;
    $('#yourToken').textContent = queue.ownToken || '—';
    $('#peopleAhead').textContent = queue.peopleAhead;
    $('#estimatedWait').textContent = queue.estimatedWait;
    $('#queueUpdated').textContent = relativeTime(queue.lastUpdated);
    if (showToast) toast('Live queue updated');
  } catch (err) { if (showToast) toast(err.message); }
}

function filterCentres() {
  const query = $('#centreSearch').value.toLowerCase().trim();
  const crop = $('#cropFilter').value;
  const district = $('#districtFilter').value;
  const filtered = state.centres.filter((centre) => (!query || `${centre.name} ${centre.address}`.toLowerCase().includes(query)) && (!crop || centre.crops.includes(crop)) && (!district || centre.district === district));
  renderCentres(filtered);
}

function openBooking(centreId = '') {
  if (state.user.role !== 'farmer') return toast('Switch to the farmer demo to create a booking.');
  state.bookingStep = 1;
  state.selectedSchedule = null;
  $('#bookingForm').reset();
  const select = $('#bookingCentre');
  select.innerHTML = '<option value="">Choose centre</option>' + state.centres.filter((item) => item.status !== 'closed').map((centre) => `<option value="${centre.id}">${escapeHtml(centre.name)} · ${centre.distanceKm} km</option>`).join('');
  if (centreId) select.value = centreId;
  updateBookingStep();
  $('#bookingDialog').showModal();
}

function updateBookingStep() {
  $$('.booking-step').forEach((step) => step.classList.toggle('active', Number(step.dataset.step) === state.bookingStep));
  $$('.step-indicator > div').forEach((node, index) => {
    node.classList.toggle('active', index + 1 === state.bookingStep);
    node.classList.toggle('done', index + 1 < state.bookingStep);
  });
  $('#bookingBack').hidden = state.bookingStep === 1;
  $('#bookingNext').innerHTML = state.bookingStep === 3 ? 'Confirm booking <svg class="icon"><use href="#check"></use></svg>' : 'Continue <svg class="icon"><use href="#arrow-right"></use></svg>';
}

async function bookingNext() {
  if (state.bookingStep === 1) {
    const crop = $('#bookingCrop').value;
    const centreId = $('#bookingCentre').value;
    const quantity = Number($('#bookingQuantity').value);
    if (!crop || !centreId || !(quantity > 0)) return toast('Choose a crop, centre, and valid quantity.');
    try {
      const schedules = await api(`/schedules?centreId=${encodeURIComponent(centreId)}&crop=${encodeURIComponent(crop)}`);
      const available = schedules.filter((item) => item.status === 'open' && item.remaining > 0);
      $('#slotList').innerHTML = available.length ? available.map((slot) => `<label class="slot-option"><input type="radio" name="schedule" value="${slot.id}"><span><strong>${formatDate(slot.date, { weekday: 'short', day: 'numeric', month: 'short' })}</strong><small>${slot.startTime}–${slot.endTime} · ${slot.remaining} slots left</small></span></label>`).join('') : '<div class="empty-state">No open slots for this crop. Please choose another centre.</div>';
      state.bookingStep = 2;
      updateBookingStep();
      $$('#slotList input').forEach((radio) => radio.addEventListener('change', () => {
        $$('.slot-option').forEach((label) => label.classList.toggle('selected', label.contains(radio) && radio.checked));
        state.selectedSchedule = available.find((item) => item.id === radio.value);
      }));
    } catch (err) { toast(err.message); }
    return;
  }
  if (state.bookingStep === 2) {
    if (!state.selectedSchedule) return toast('Select an available time slot.');
    const centre = state.centres.find((item) => item.id === $('#bookingCentre').value);
    $('#bookingReview').innerHTML = `<h3>Please review your visit</h3><dl><div><dt>Crop</dt><dd>${escapeHtml($('#bookingCrop').value)}</dd></div><div><dt>Quantity</dt><dd>${escapeHtml($('#bookingQuantity').value)} qtl</dd></div><div><dt>Centre</dt><dd>${escapeHtml(centre.name)}</dd></div><div><dt>Date & time</dt><dd>${formatDate(state.selectedSchedule.date)} · ${state.selectedSchedule.startTime}</dd></div></dl>`;
    state.bookingStep = 3;
    updateBookingStep();
    return;
  }
  if (!$('#bookingConsent').checked) return toast('Please confirm the booking details.');
  const button = $('#bookingNext');
  button.disabled = true;
  try {
    const appointment = await api('/appointments', { method: 'POST', body: JSON.stringify({ scheduleId: state.selectedSchedule.id, estimatedQuantity: Number($('#bookingQuantity').value) }) });
    const centre = state.centres.find((item) => item.id === appointment.centreId);
    appointment.centre = centre;
    appointment.schedule = state.selectedSchedule;
    state.appointments.unshift(appointment);
    $('#bookingDialog').close();
    renderNextAppointment();
    renderAppointments();
    navigate('appointments');
    toast(`Booked! Your token is ${appointment.token.number}`);
  } catch (err) { toast(err.message); }
  finally { button.disabled = false; }
}

async function renderOfficer() {
  const data = await api('/officer/dashboard');
  const metricItems = [
    ['calendar', data.metrics.capacity, 'Published capacity'],
    ['receipt', data.metrics.reservations, 'Reservations'],
    ['users', data.metrics.checkedIn, 'Checked in'],
    ['check', data.metrics.completed, 'Completed']
  ];
  $('#officerMetrics').innerHTML = metricItems.map(([icon, value, label]) => `<article class="card metric-card"><span><svg class="icon"><use href="#${icon}"></use></svg></span><strong>${value}</strong><small>${label}</small></article>`).join('');
  $('#operatorQueue').innerHTML = data.appointments.length ? data.appointments.map((item) => {
    const action = item.status === 'confirmed' ? ['Check in', 'checkin'] : item.status === 'checked_in' ? ['Start service', 'serve'] : item.status === 'in_service' ? ['Inspect', 'inspect'] : [titleCase(item.status), 'none'];
    return `<div class="operator-row"><strong>${escapeHtml(item.token.number)}</strong><div><h3>${escapeHtml(item.farmerId)} · ${escapeHtml(item.crop)}</h3><p>Est. ${item.estimatedQuantity} qtl · ${item.schedule.startTime}</p></div>${action[1] === 'none' ? `<span class="status-pill success"><span></span>${action[0]}</span>` : `<button class="secondary-button" data-queue-action="${action[1]}" data-appointment-id="${item.id}">${action[0]}</button>`}</div>`;
  }).join('') : '<div class="empty-state">No appointments today.</div>';
  bindDynamicActions($('#operatorQueue'));
}

async function queueAction(action, appointmentId) {
  try {
    if (action === 'checkin') await api(`/queue/${appointmentId}/check-in`, { method: 'POST' });
    if (action === 'serve') await api(`/queue/${appointmentId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'in_service' }) });
    if (action === 'inspect') {
      await api(`/transactions/${appointmentId}/inspection`, { method: 'POST', body: JSON.stringify({ result: 'accepted', actualQuantity: 22.2, notes: 'Quality grade A — demo inspection' }) });
    }
    toast(action === 'inspect' ? 'Demo inspection accepted and recorded' : 'Queue updated for all connected dashboards');
    await renderOfficer();
  } catch (err) { toast(err.message); }
}

async function renderAdmin() {
  const data = await api('/admin/dashboard');
  const items = [['map-pin', data.metrics.centres, 'Centres'], ['check', data.metrics.openCentres, 'Open now'], ['users', data.metrics.farmers, 'Farmers'], ['calendar', data.metrics.activeBookings, 'Active bookings'], ['receipt', data.metrics.transactions, 'Transactions']];
  $('#adminMetrics').innerHTML = items.map(([icon, value, label]) => `<article class="card metric-card"><span><svg class="icon"><use href="#${icon}"></use></svg></span><strong>${value}</strong><small>${label}</small></article>`).join('');
  $('#adminCentres').innerHTML = data.centres.map((centre) => { const [statusClass, statusLabel] = centreStatus(centre); return `<div><span><h3>${escapeHtml(centre.name)}</h3><p>${escapeHtml(centre.district)} · ${centre.bookings} bookings</p></span><span class="status-pill ${statusClass}"><span></span>${statusLabel}</span><strong>${centre.availableSlots ?? 0} slots</strong></div>`; }).join('');
  const logs = data.auditLogs.length ? data.auditLogs : [{ action: 'DEMO_INITIALISED', entityType: 'system', timestamp: new Date().toISOString(), actorId: 'system' }];
  $('#auditList').innerHTML = logs.slice(0, 7).map((log) => `<div><span><svg class="icon"><use href="#shield"></use></svg></span><div><h3>${titleCase(log.action)}</h3><p>${escapeHtml(log.entityType)} · ${escapeHtml(log.actorId)} · ${relativeTime(log.timestamp)}</p></div></div>`).join('');
}

async function switchRole(role) {
  closePopovers();
  clearSession();
  $('#loginPhone').value = rolePhones[role];
  $('#loginPassword').value = 'demo123';
  await login(rolePhones[role]);
}

function connectSocket() {
  if (state.socket) state.socket.disconnect();
  if (typeof io === 'undefined') return;
  state.socket = io();
  state.socket.on('connect', () => state.socket.emit('authenticate', state.token));
  state.socket.on('queue:update', () => {
    if (state.user?.role === 'farmer') {
      refreshQueue(false);
      toast('The live queue has changed');
    }
  });
  state.socket.on('appointment:created', () => toast('Your booking was confirmed'));
}

function closePopovers(except) {
  ['notificationPopover', 'profilePopover', 'demoPopover'].forEach((id) => { if (id !== except) $(`#${id}`).hidden = true; });
}

function togglePopover(id) {
  const popover = $(`#${id}`);
  const wasHidden = popover.hidden;
  closePopovers(id);
  popover.hidden = !wasHidden;
}

function bindDynamicActions(root) {
  $$('[data-action="open-booking"]', root).forEach((button) => button.addEventListener('click', () => openBooking()));
  $$('[data-book-centre]', root).forEach((button) => button.addEventListener('click', () => openBooking(button.dataset.bookCentre)));
  $$('[data-token-id]', root).forEach((button) => button.addEventListener('click', () => $('#tokenDialog').showModal()));
  $$('[data-cancel-id]', root).forEach((button) => button.addEventListener('click', () => cancelBooking(button.dataset.cancelId)));
  $$('[data-queue-action]', root).forEach((button) => button.addEventListener('click', () => queueAction(button.dataset.queueAction, button.dataset.appointmentId)));
}

async function cancelBooking(appointmentId) {
  if (!window.confirm('Cancel this appointment? The slot will become available to another farmer.')) return;
  try {
    const updated = await api(`/appointments/${appointmentId}/cancel`, { method: 'PATCH' });
    const index = state.appointments.findIndex((item) => item.id === appointmentId);
    if (index >= 0) state.appointments[index] = updated;
    renderAppointments('active');
    renderNextAppointment();
    toast('Appointment cancelled and capacity released');
  } catch (err) { toast(err.message); }
}

const translations = {
  en: { welcome: 'Namaste', welcomeCopy: 'Here’s everything you need for your next procurement visit.', dashboard: 'Dashboard', centres: 'Centres', bookings: 'My bookings', support: 'Support', book: 'Book new appointment' },
  hi: { welcome: 'नमस्ते', welcomeCopy: 'आपकी अगली खरीद यात्रा के लिए सभी ज़रूरी जानकारी यहाँ है।', dashboard: 'डैशबोर्ड', centres: 'केंद्र', bookings: 'मेरी बुकिंग', support: 'सहायता', book: 'नई अपॉइंटमेंट बुक करें' }
};

function applyLanguage() {
  const t = translations[state.language];
  $('#welcomeTitle').childNodes[0].textContent = `${t.welcome}, `;
  $('#welcomeCopy').textContent = t.welcomeCopy;
  $('#languageToggle').innerHTML = state.language === 'en' ? '<span>अ</span> हिंदी' : '<span>A</span> English';
  const navLabels = [t.dashboard, t.centres, t.bookings, t.support];
  $$('.main-nav a').forEach((link, index) => {
    const svg = link.querySelector('svg').outerHTML;
    link.innerHTML = `${svg}${navLabels[index]}`;
  });
  $('[data-action="open-booking"]')?.lastChild && ($('[data-action="open-booking"]').lastChild.textContent = t.book);
}

function wireEvents() {
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
  $$('[data-route]').forEach((link) => link.addEventListener('click', (event) => { event.preventDefault(); navigate(link.dataset.route); }));
  $$('[data-route-link]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.routeLink)));
  $$('[data-action="open-booking"]').forEach((button) => button.addEventListener('click', () => openBooking()));
  $$('[data-action="view-token"]').forEach((button) => button.addEventListener('click', () => $('#tokenDialog').showModal()));
  $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
  $('[data-action="print-token"]').addEventListener('click', () => window.print());
  $('[data-action="refresh-queue"]').addEventListener('click', () => refreshQueue());
  $$('[data-action^="toast-"]').forEach((button) => button.addEventListener('click', () => toast('This action is available in the connected production service.')));

  $('#profileButton').addEventListener('click', (event) => { event.stopPropagation(); togglePopover('profilePopover'); });
  $('#notificationButton').addEventListener('click', (event) => { event.stopPropagation(); togglePopover('notificationPopover'); });
  $('#demoHelp').addEventListener('click', (event) => { event.stopPropagation(); togglePopover('demoPopover'); });
  document.addEventListener('click', (event) => { if (!event.target.closest('.popover')) closePopovers(); });
  $$('[data-switch-role]').forEach((button) => button.addEventListener('click', () => switchRole(button.dataset.switchRole)));

  $('#signOutButton').addEventListener('click', async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch (_) { /* session may already be gone */ }
    if (state.socket) state.socket.disconnect();
    closePopovers(); clearSession(); showLogin();
  });

  $('#loginForm').addEventListener('submit', (event) => { event.preventDefault(); login($('#loginPhone').value, $('#loginPassword').value); });
  $$('[data-demo-login]').forEach((button) => button.addEventListener('click', () => { const role = button.dataset.demoLogin; $('#loginPhone').value = rolePhones[role]; $('#loginPassword').value = 'demo123'; login(rolePhones[role]); }));
  $('#showPassword').addEventListener('click', () => { const input = $('#loginPassword'); input.type = input.type === 'password' ? 'text' : 'password'; });

  $('#languageToggle').addEventListener('click', () => { state.language = state.language === 'en' ? 'hi' : 'en'; localStorage.setItem('agriprocure_language', state.language); applyLanguage(); toast(state.language === 'hi' ? 'भाषा हिन्दी में बदल गई' : 'Language changed to English'); });
  $('#centreSearch').addEventListener('input', filterCentres);
  $('#cropFilter').addEventListener('change', filterCentres);
  $('#districtFilter').addEventListener('change', filterCentres);
  $$('[data-booking-tab]').forEach((button) => button.addEventListener('click', () => { $$('[data-booking-tab]').forEach((tab) => tab.classList.toggle('active', tab === button)); renderAppointments(button.dataset.bookingTab); }));

  $('#bookingNext').addEventListener('click', bookingNext);
  $('#bookingBack').addEventListener('click', () => { state.bookingStep = Math.max(1, state.bookingStep - 1); updateBookingStep(); });
  $('#markAllRead').addEventListener('click', async () => {
    await Promise.all(state.notifications.filter((item) => !item.read).map((item) => api(`/notifications/${item.id}/read`, { method: 'PATCH' })));
    state.notifications.forEach((item) => { item.read = true; });
    renderNotifications();
  });

  $('#notificationList').addEventListener('click', async (event) => {
    const item = event.target.closest('[data-notification-id]');
    if (!item) return;
    const notification = state.notifications.find((entry) => entry.id === item.dataset.notificationId);
    if (notification && !notification.read) {
      await api(`/notifications/${notification.id}/read`, { method: 'PATCH' });
      notification.read = true; renderNotifications();
    }
  });
}

wireEvents();
initialiseApp();
