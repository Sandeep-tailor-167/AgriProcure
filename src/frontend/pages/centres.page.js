import { t, getLocale } from '../js/i18n.js';
import { api, post, patch } from '../js/api-client.js';
import { loadingState, emptyState, errorState } from '../components/data-state.js';
import { statusBadge } from '../components/status-badge.js';

const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let cache = { centres: [], crops: [] };

export function centresPage(user) {
  const canManage = ['officer', 'admin'].includes(user.role);
  return `<div class="page-shell"><div class="page-heading"><div><p class="eyebrow">${t('centres')}</p><h1>${t('findCentre')}</h1><p>${t('findCentreHelp')}</p></div></div><section class="card filter-panel"><label class="field"><span class="sr-only">${t('searchCentres')}</span><input type="search" data-centre-search placeholder="${t('searchCentres')}"></label><label class="field"><span class="sr-only">${t('allCrops')}</span><select data-crop-filter><option value="">${t('allCrops')}</option></select></label><label class="field"><span class="sr-only">${t('allDistricts')}</span><select data-district-filter><option value="">${t('allDistricts')}</option></select></label></section>${canManage ? `<details class="card manage-panel"><summary>${t('manageSchedule')}</summary><form data-schedule-form><div class="field-grid"><label class="field">${t('centres')}<select name="centreId" required></select></label><label class="field">${t('supportedCrops')}<select name="cropId" required></select></label></div><div class="field-grid"><label class="field">${t('procurementDate')}<input name="procurementDate" type="date" required></label><label class="field">${t('capacity')}<input name="capacity" type="number" min="1" required></label></div><div class="field-grid"><label class="field">${t('startTime')}<input name="startTime" type="time" required></label><label class="field">${t('endTime')}<input name="endTime" type="time" required></label></div><input type="hidden" name="scheduleStatus" value="published"><p class="form-error" data-form-error hidden></p><button class="button primary" type="submit">${t('publish')}</button></form></details>` : ''}<div data-centre-results>${loadingState()}</div></div>`;
}

function statusLabel(status) { return status === 'open' ? t('centreOpen') : status === 'busy' ? t('centreBusy') : t('centreClosed'); }
function renderResults(user) {
  const query = document.querySelector('[data-centre-search]')?.value.toLowerCase() || '';
  const cropId = document.querySelector('[data-crop-filter]')?.value || '';
  const district = document.querySelector('[data-district-filter]')?.value || '';
  const items = cache.centres.filter((centre) => (!query || `${centre.centre_name} ${centre.district} ${centre.address_line}`.toLowerCase().includes(query)) && (!district || centre.district === district) && (!cropId || String(centre.crop_ids || '').split(',').includes(cropId)));
  const target = document.querySelector('[data-centre-results]');
  if (!items.length) { target.innerHTML = emptyState(); return; }
  target.innerHTML = `<div class="centre-list">${items.map((centre) => `<article class="card centre-card"><div><div class="centre-card-title"><h2>${safe(centre.centre_name)}</h2>${statusBadge(statusLabel(centre.centre_status))}</div><p>${safe(centre.address_line)}, ${safe(centre.district)}, ${safe(centre.state)}</p><dl><div><dt>${t('operatingHours')}</dt><dd>${safe(String(centre.opening_time).slice(0,5))}–${safe(String(centre.closing_time).slice(0,5))}</dd></div><div><dt>${t('availableSlots')}</dt><dd>${safe(centre.available_slots)}</dd></div></dl></div>${user.role === 'admin' ? `<footer><button class="button secondary" data-centre-status="${centre.centre_id}" data-next-status="${centre.centre_status === 'closed' ? 'open' : 'closed'}">${centre.centre_status === 'closed' ? t('reopenCentre') : t('closeCentre')}</button></footer>` : ''}</article>`).join('')}</div>`;
  target.querySelectorAll('[data-centre-status]').forEach((button) => button.addEventListener('click', async () => {
    const closing = button.dataset.nextStatus === 'closed'; const reason = closing ? window.prompt('Reason for closure') : null;
    if (closing && (!reason || reason.trim().length < 5)) return;
    try { await patch(`/centres/${button.dataset.centreStatus}/status`, { status: button.dataset.nextStatus, reason }); await loadCentres(user); } catch (error) { target.innerHTML = errorState(error.message); }
  }));
}

export async function loadCentres(user) {
  const target = document.querySelector('[data-centre-results]'); if (!target) return;
  target.innerHTML = loadingState();
  try {
    [cache.centres, cache.crops] = await Promise.all([api('/centres'), api('/crops')]);
    const cropSelect = document.querySelector('[data-crop-filter]');
    cropSelect.innerHTML = `<option value="">${t('allCrops')}</option>` + cache.crops.map((crop) => `<option value="${crop.crop_id}">${safe(getLocale() === 'hi' ? crop.crop_name_hi : crop.crop_name_en)}</option>`).join('');
    const districts = [...new Set(cache.centres.map((centre) => centre.district))].sort();
    document.querySelector('[data-district-filter]').innerHTML = `<option value="">${t('allDistricts')}</option>` + districts.map((value) => `<option>${safe(value)}</option>`).join('');
    document.querySelectorAll('[data-centre-search],[data-crop-filter],[data-district-filter]').forEach((input) => input.addEventListener('input', () => renderResults(user)));
    const form = document.querySelector('[data-schedule-form]');
    if (form) {
      form.centreId.innerHTML = cache.centres.map((centre) => `<option value="${centre.centre_id}">${safe(centre.centre_name)}</option>`).join('');
      form.cropId.innerHTML = cache.crops.map((crop) => `<option value="${crop.crop_id}">${safe(getLocale() === 'hi' ? crop.crop_name_hi : crop.crop_name_en)}</option>`).join('');
      form.addEventListener('submit', async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(form)); const button = form.querySelector('button'); button.disabled = true; try { await post('/schedules', values); form.reset(); window.dispatchEvent(new CustomEvent('agriprocure:toast', { detail: t('scheduleSaved') })); } catch (error) { const node = form.querySelector('[data-form-error]'); node.textContent = error.message; node.hidden = false; } finally { button.disabled = false; } });
    }
    renderResults(user);
  } catch (error) { target.innerHTML = errorState(error.message); target.querySelector('[data-retry]')?.addEventListener('click', () => loadCentres(user)); }
}
