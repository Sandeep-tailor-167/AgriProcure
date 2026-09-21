import { t } from '../js/i18n.js';
import { statusBadge } from '../components/status-badge.js';

function safe(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

export function farmerDashboard(user) {
  return `<div class="page-shell"><div class="system-notice">${t('developmentNotice')}</div><div class="page-heading"><div><p class="eyebrow">${t('farmer')}</p><h1>${t('namaste')}, ${safe(user.fullName.split(' ')[0])}</h1><p>${t('farmerOverview')}</p></div>${statusBadge(t('verifiedMobile'))}</div><section class="card"><h2>${t('latestNotifications')}</h2><div data-notifications></div></section><div class="dashboard-grid"><article class="hero-card"><p class="eyebrow">${t('manageBookings')}</p><h2>${t('findCentre')}</h2><p>${t('findCentreHelp')}</p><a class="button secondary" href="#/centres">${t('view')}</a></article><article class="card status-card"><h2>${t('account')}</h2><ul class="status-list"><li><span>${t('verifiedMobile')}</span><strong>${safe(user.phone)}</strong></li><li><span>${t('farmerId')}</span><strong>${safe(user.farmerCode || t('notAvailable'))}</strong></li><li><span>${t('district')}</span><strong>${safe(user.district || t('notAvailable'))}</strong></li></ul></article>${feature('⌖', 'findCentre', 'findCentreHelp', 'centres')}${feature('□', 'manageBookings', 'manageBookingsHelp', 'bookings')}${feature('≋', 'followQueue', 'followQueueHelp', 'queue')}${feature('✓', 'trackProcurement', 'trackProcurementHelp', 'bookings')}</div></div>`;
}

function feature(icon, title, body, route) { return `<article class="card feature-card"><span class="icon-box" aria-hidden="true">${icon}</span><h2>${t(title)}</h2><p>${t(body)}</p><footer><a class="button ghost" href="#/${route}">${t('view')} →</a></footer></article>`; }
