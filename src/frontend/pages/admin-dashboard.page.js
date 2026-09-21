import { t } from '../js/i18n.js';

export function adminDashboard(user) {
  return `<div class="page-shell"><div class="system-notice">${t('developmentNotice')}</div><div class="page-heading"><div><p class="eyebrow">${t('admin')}</p><h1>${t('namaste')}, ${safe(user.fullName)}</h1><p>${t('adminOverview')}</p></div></div><div class="dashboard-grid"><article class="hero-card"><p class="eyebrow">${t('networkAdmin')}</p><h2>${t('networkAdmin')}</h2><p>${t('networkAdminHelp')}</p><a class="button secondary" href="#/centres">${t('view')}</a></article>${card('⌖', 'centres', 'networkAdminHelp', 'centres')}${card('▥', 'analytics', 'operationalAnalyticsHelp', 'analytics')}${card('✦', 'intelligence', 'aiIntelligenceHelp', 'intelligence')}</div></div>`;
}
function safe(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function card(icon, title, body, route) { return `<article class="card feature-card"><span class="icon-box">${icon}</span><h2>${t(title)}</h2><p>${t(body)}</p><footer><a class="button ghost" href="#/${route}">${t('view')} →</a></footer></article>`; }
