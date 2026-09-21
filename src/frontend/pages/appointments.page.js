import { t, getLocale } from '../js/i18n.js';
import { api, post, patch } from '../js/api-client.js';
import { loadingState, emptyState, errorState } from '../components/data-state.js';
import { statusBadge } from '../components/status-badge.js';

const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let schedules = [];

export function appointmentsPage() {
  return `<div class="page-shell"><div class="page-heading"><div><p class="eyebrow">${t('bookings')}</p><h1>${t('manageBookings')}</h1><p>${t('manageBookingsHelp')}</p></div><button class="button primary" data-open-booking>${t('newBooking')}</button></div><div data-booking-results>${loadingState()}</div><section><h2>${t('trackProcurement')}</h2><div data-procurement-results>${loadingState()}</div></section><dialog class="app-dialog" data-booking-dialog><form data-booking-form><input type="hidden" name="appointmentId"><header><div><p class="eyebrow">${t('newBooking')}</p><h2 data-dialog-title>${t('chooseSchedule')}</h2></div><button type="button" class="button ghost" data-close-dialog aria-label="Close">×</button></header><label class="field">${t('chooseSchedule')}<select name="scheduleId" required></select></label><label class="field">${t('estimatedQuantity')}<input name="estimatedQuantity" type="number" min="0.001" step="0.001" required><small>${t('quintals')}</small></label><p class="form-error" data-form-error hidden></p><button class="button primary full" type="submit">${t('confirmBooking')}</button></form></dialog><dialog class="app-dialog token-dialog" data-token-dialog><div data-token-content></div><button class="button secondary full" data-close-dialog>Close</button></dialog></div>`;
}

function formatDate(value) { return new Intl.DateTimeFormat(getLocale() === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${String(value).slice(0,10)}T12:00:00`)); }
function renderBookings(items) {
  const target = document.querySelector('[data-booking-results]');
  if (!items.length) { target.innerHTML = emptyState(); return; }
  target.innerHTML = `<div class="booking-list">${items.map((item) => `<article class="card booking-card"><div><div class="centre-card-title"><h2>${safe(item.centre_name)}</h2>${statusBadge(safe(item.booking_status.replaceAll('_',' ')))}</div><p>${safe(getLocale() === 'hi' ? item.crop_name_hi : item.crop_name_en)} · ${safe(item.estimated_quantity)} ${safe(item.quantity_unit)}</p><p>${formatDate(item.procurement_date)} · ${safe(String(item.start_time).slice(0,5))}–${safe(String(item.end_time).slice(0,5))}</p></div><dl><div><dt>${t('token')}</dt><dd>${safe(item.token_number || t('notAvailable'))}</dd></div><div><dt>${t('bookingReference')}</dt><dd>${safe(item.booking_reference)}</dd></div></dl><footer>${item.booking_status === 'confirmed' ? `<button class="button secondary" data-view-token="${item.appointment_id}">${t('token')}</button><button class="button secondary" data-reschedule="${item.appointment_id}" data-quantity="${item.estimated_quantity}">${t('reschedule')}</button><button class="button ghost danger" data-cancel="${item.appointment_id}">${t('cancel')}</button>` : ''}</footer></article>`).join('')}</div>`;
  target.querySelectorAll('[data-view-token]').forEach((button) => button.addEventListener('click', () => showToken(items.find((item) => String(item.appointment_id) === button.dataset.viewToken))));
  target.querySelectorAll('[data-cancel]').forEach((button) => button.addEventListener('click', () => cancelAppointment(button.dataset.cancel)));
  target.querySelectorAll('[data-reschedule]').forEach((button) => button.addEventListener('click', () => openDialog(button.dataset.reschedule, button.dataset.quantity)));
}

function scheduleOptions() {
  return schedules.filter((item) => item.remaining_capacity > 0).map((item) => `<option value="${item.schedule_id}">${safe(item.centre_name)} · ${safe(getLocale() === 'hi' ? item.crop_name_hi : item.crop_name_en)} · ${formatDate(item.procurement_date)} ${safe(String(item.start_time).slice(0,5))} (${safe(item.remaining_capacity)})</option>`).join('');
}
function openDialog(appointmentId = '', quantity = '') {
  const dialog = document.querySelector('[data-booking-dialog]'); const form = dialog.querySelector('form'); form.reset();
  form.appointmentId.value = appointmentId; form.estimatedQuantity.value = quantity; form.scheduleId.innerHTML = scheduleOptions();
  dialog.querySelector('[data-dialog-title]').textContent = appointmentId ? t('rescheduleBooking') : t('chooseSchedule');
  if (!form.scheduleId.options.length) return window.dispatchEvent(new CustomEvent('agriprocure:toast', { detail: t('noSchedules') }));
  dialog.showModal();
}
function showToken(item) {
  const dialog = document.querySelector('[data-token-dialog]');
  dialog.querySelector('[data-token-content]').innerHTML = `<div class="ticket"><p class="eyebrow">${t('token')}</p><strong>${safe(item.token_number)}</strong><h2>${safe(item.centre_name)}</h2><p>${formatDate(item.procurement_date)} · ${safe(String(item.start_time).slice(0,5))}</p><small>${safe(item.booking_reference)}</small></div>`;
  dialog.showModal();
}

async function cancelAppointment(id) {
  const reason = window.prompt(t('cancellationReason')) || '';
  if (reason && reason.trim().length < 5) return;
  try { await patch(`/appointments/${id}/cancel`, { reason: reason || undefined }); window.dispatchEvent(new CustomEvent('agriprocure:toast', { detail: t('bookingCancelled') })); await loadAppointments(); }
  catch (error) { window.dispatchEvent(new CustomEvent('agriprocure:toast', { detail: error.message })); }
}

export async function loadAppointments() {
  const target = document.querySelector('[data-booking-results]'); if (!target) return;
  target.innerHTML = loadingState();
  try {
    const [items, available, transactions] = await Promise.all([api('/appointments/my'), api('/schedules'), api('/transactions/my')]); schedules = available;
    renderBookings(items);
    const history=document.querySelector('[data-procurement-results]');history.innerHTML=transactions.length?`<div class="booking-list">${transactions.map(x=>`<article class="card"><div class="centre-card-title"><h3>${safe(x.centre_name)}</h3>${statusBadge(safe(x.transaction_status.replaceAll('_',' ')))}</div><p>${safe(getLocale()==='hi'?x.crop_name_hi:x.crop_name_en)} · ${safe(x.transaction_reference)}</p><dl><div><dt>${t('actualQuantity')}</dt><dd>${safe(x.actual_quantity||t('notAvailable'))}</dd></div><div><dt>${t('purchaseValue')}</dt><dd>${x.total_amount?`₹${safe(x.total_amount)}`:t('notAvailable')}</dd></div><div><dt>${t('paymentStatus')}</dt><dd>${safe(x.payment_status||t('notAvailable'))}</dd></div></dl></article>`).join('')}</div>`:emptyState();
    document.querySelector('[data-open-booking]')?.addEventListener('click', () => openDialog());
    document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
    document.querySelector('[data-booking-form]')?.addEventListener('submit', async (event) => {
      event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); button.disabled = true;
      const values = Object.fromEntries(new FormData(form)); const appointmentId = values.appointmentId; delete values.appointmentId;
      try {
        if (appointmentId) await post(`/appointments/${appointmentId}/reschedule`, { newScheduleId: values.scheduleId, estimatedQuantity: values.estimatedQuantity });
        else await post('/appointments', values);
        form.closest('dialog').close(); window.dispatchEvent(new CustomEvent('agriprocure:toast', { detail: appointmentId ? t('bookingRescheduled') : t('bookingConfirmed') })); await loadAppointments();
      } catch (error) { const node = form.querySelector('[data-form-error]'); node.textContent = error.message; node.hidden = false; } finally { button.disabled = false; }
    });
  } catch (error) { target.innerHTML = errorState(error.message); target.querySelector('[data-retry]')?.addEventListener('click', loadAppointments); }
}
