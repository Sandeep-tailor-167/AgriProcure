import { api, post, setSession, clearSession, hasSession, getRefreshToken, getAccessToken, ApiError } from './api-client.js';
import { t, toggleLocale } from './i18n.js';
import { authPage } from '../pages/auth.page.js';
import { navigation } from '../components/navigation.js';
import { loadingState, errorState } from '../components/data-state.js';
import { farmerDashboard } from '../pages/farmer-dashboard.page.js';
import { officerDashboard } from '../pages/officer-dashboard.page.js';
import { adminDashboard } from '../pages/admin-dashboard.page.js';
import { centresPage, loadCentres } from '../pages/centres.page.js';
import { appointmentsPage, loadAppointments } from '../pages/appointments.page.js';
import { queuePage, loadQueue } from '../pages/queue.page.js';
import { analyticsPage, loadAnalytics } from '../pages/analytics.page.js';
import { intelligencePage, loadIntelligence } from '../pages/intelligence.page.js';

const root = document.querySelector('#app');
let currentUser = null;
let authMode = 'login';
let pendingChallenge = '';
let notificationSocket;
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
async function loadNotifications() { const target=document.querySelector('[data-notifications]');if(!target)return;try{const items=await api('/notifications');target.innerHTML=items.length?`<ul class="notification-list">${items.slice(0,5).map(x=>`<li class="${x.read_at?'':'unread'}"><strong>${safe(x.title)}</strong><span>${safe(x.message)}</span><small>${new Date(x.created_at).toLocaleString()}</small></li>`).join('')}</ul>`:`<p>${t('emptyBody')}</p>`;}catch(e){target.textContent=e.message;} }
function connectNotifications(){if(!window.io||notificationSocket)return;notificationSocket=window.io({auth:{token:getAccessToken()}});notificationSocket.on('notification:new',(item)=>{showToast(item.message);loadNotifications();});}

function route() { return location.hash.replace(/^#\//, '').split('/')[0] || 'dashboard'; }
function showToast(message, tone = '') {
  const toast = document.createElement('div'); toast.className = `toast ${tone}`; toast.textContent = message;
  document.querySelector('#toast-region').append(toast); setTimeout(() => toast.remove(), 4500);
}

function translatedError(error) {
  const keys = { INVALID_CREDENTIALS: 'invalidCredentials', AUTH_NOT_CONFIGURED: 'authUnavailable', DATABASE_NOT_CONFIGURED: 'authUnavailable' };
  return keys[error.code] ? t(keys[error.code]) : error.message || t('genericError');
}

function dashboard(user) {
  if (user.role === 'admin') return adminDashboard(user);
  if (user.role === 'officer') return officerDashboard(user);
  return farmerDashboard(user);
}

function pageForRoute(active) {
  const pages = { dashboard: () => dashboard(currentUser), centres: () => centresPage(currentUser), bookings: appointmentsPage, queue: () => queuePage(currentUser), analytics: analyticsPage, intelligence: () => intelligencePage(currentUser) };
  return (pages[active] || pages.dashboard)();
}

function renderApplication() {
  const active = route();
  root.innerHTML = `${navigation(currentUser, active)}<main id="main-content" tabindex="-1">${pageForRoute(active)}</main>`;
  wireCommon();
  if (active === 'centres') loadCentres(currentUser);
  if (active === 'bookings' && currentUser.role === 'farmer') loadAppointments();
  if (active === 'queue') loadQueue();
  if (active === 'dashboard') loadNotifications();
  if (active === 'analytics') loadAnalytics();
  if (active === 'intelligence') loadIntelligence();
  connectNotifications();
  document.querySelector('#main-content')?.focus({ preventScroll: true });
}

function renderAuth() {
  currentUser = null;
  root.innerHTML = authPage(authMode, pendingChallenge);
  wireCommon();
  document.querySelectorAll('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => { authMode = button.dataset.authMode; renderAuth(); }));
  document.querySelector('[data-auth-form]')?.addEventListener('submit', submitAuth);
}

function wireCommon() {
  document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', toggleLocale));
  document.querySelector('[data-logout]')?.addEventListener('click', signOut);
  document.querySelectorAll('[data-route]').forEach((link) => link.addEventListener('click', () => setTimeout(renderApplication)));
}

async function submitAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const errorNode = form.querySelector('[data-form-error]');
  const values = Object.fromEntries(new FormData(form));
  errorNode.hidden = true; submit.disabled = true;
  try {
    if (form.dataset.authForm === 'login') {
      const result = await post('/auth/login', values); setSession(result); currentUser = result.user; location.hash = '#/dashboard'; renderApplication();
    } else if (form.dataset.authForm === 'register') {
      const result = await post('/auth/register/request-otp', values); pendingChallenge = result.challengeId; authMode = 'otp'; showToast(t('submittedOtp')); renderAuth();
    } else {
      const result = await post('/auth/register/verify-otp', values); setSession(result); currentUser = result.user; pendingChallenge = ''; showToast(t('accountCreated')); location.hash = '#/dashboard'; renderApplication();
    }
  } catch (error) {
    errorNode.textContent = translatedError(error); errorNode.hidden = false;
  } finally { submit.disabled = false; }
}

async function signOut() {
  const token = getRefreshToken();
  try { if (token) await post('/auth/logout', { refreshToken: token }); } catch { /* local session still cleared */ }
  clearSession(); authMode = 'login'; pendingChallenge = ''; renderAuth();
  notificationSocket?.disconnect(); notificationSocket = undefined;
}

async function boot() {
  if (!hasSession()) return renderAuth();
  root.innerHTML = loadingState();
  try { currentUser = await api('/auth/me'); renderApplication(); }
  catch (error) { clearSession(); renderAuth(); if (error instanceof ApiError) showToast(translatedError(error), 'error'); }
}

window.addEventListener('hashchange', () => { if (currentUser) renderApplication(); });
window.addEventListener('agriprocure:locale', () => currentUser ? renderApplication() : renderAuth());
window.addEventListener('unhandledrejection', (event) => { console.error(event.reason); showToast(t('genericError'), 'error'); });
window.addEventListener('agriprocure:toast', (event) => showToast(event.detail));

boot();
