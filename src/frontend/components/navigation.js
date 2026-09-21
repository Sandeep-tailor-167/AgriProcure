import { t } from '../js/i18n.js';

const roleLinks = {
  farmer: [['dashboard', 'dashboard'], ['centres', 'centres'], ['bookings', 'bookings'], ['queue', 'queue']],
  officer: [['dashboard', 'dashboard'], ['centres', 'centres'], ['queue', 'queue'], ['analytics', 'analytics'], ['intelligence', 'intelligence']],
  admin: [['dashboard', 'dashboard'], ['centres', 'centres'], ['analytics', 'analytics'], ['intelligence', 'intelligence']]
};

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function initials(name) { return String(name || '').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }

export function navigation(user, active = 'dashboard') {
  const links = roleLinks[user.role] || roleLinks.farmer;
  const list = links.map(([route, key]) => `<a href="#/${route}" data-route="${route}" class="${route === active ? 'active' : ''}">${t(key)}</a>`).join('');
  return `<header class="app-header"><a class="brand" href="#/dashboard"><span class="brand-mark" aria-hidden="true"></span><span>${t('brand')}</span></a><nav class="app-nav" aria-label="Primary">${list}</nav><div class="header-actions"><button class="button ghost" data-language>${t('language')}</button><button class="user-chip" data-profile><span class="avatar">${initials(user.fullName)}</span><div><strong>${escapeHtml(user.fullName)}</strong><small>${t(user.role)}</small></div></button><button class="button secondary" data-logout>${t('signOut')}</button></div></header><nav class="mobile-nav" aria-label="Mobile primary">${list}</nav>`;
}
