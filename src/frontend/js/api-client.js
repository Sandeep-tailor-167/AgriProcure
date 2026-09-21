const API_BASE = '/api/v1';
let accessToken = sessionStorage.getItem('agriprocure.accessToken') || '';
let refreshToken = sessionStorage.getItem('agriprocure.refreshToken') || '';

export class ApiError extends Error {
  constructor(message, status, code, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

export function setSession(tokens) {
  accessToken = tokens?.accessToken || '';
  refreshToken = tokens?.refreshToken || refreshToken;
  if (accessToken) sessionStorage.setItem('agriprocure.accessToken', accessToken); else sessionStorage.removeItem('agriprocure.accessToken');
  if (refreshToken) sessionStorage.setItem('agriprocure.refreshToken', refreshToken); else sessionStorage.removeItem('agriprocure.refreshToken');
}

export function clearSession() { accessToken = ''; refreshToken = ''; sessionStorage.removeItem('agriprocure.accessToken'); sessionStorage.removeItem('agriprocure.refreshToken'); }
export function hasSession() { return Boolean(accessToken); }
export function getRefreshToken() { return refreshToken; }
export function getAccessToken() { return accessToken; }

async function parse(response) {
  const payload = await response.json().catch(() => ({ success: false, error: { message: 'Unreadable server response.' } }));
  if (!response.ok) throw new ApiError(payload.error?.message || 'Request failed.', response.status, payload.error?.code || 'REQUEST_FAILED', payload.error?.details);
  return payload.data;
}

async function refresh() {
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
    const tokens = await parse(response); setSession(tokens); return true;
  } catch { clearSession(); return false; }
}

export async function api(path, options = {}, retried = false) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 401 && accessToken && !retried && await refresh()) return api(path, options, true);
  return parse(response);
}

export function post(path, body) { return api(path, { method: 'POST', body: JSON.stringify(body) }); }
export function patch(path, body) { return api(path, { method: 'PATCH', body: JSON.stringify(body) }); }
export async function download(path, filename) { const response=await fetch(`${API_BASE}${path}`,{headers:accessToken?{authorization:`Bearer ${accessToken}`}:{}});if(!response.ok)await parse(response);const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
