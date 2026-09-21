import { t } from '../js/i18n.js';

export function loadingState() { return `<section class="card data-state" role="status"><div><span class="spinner"></span><p>${t('loading')}</p></div></section>`; }
export function emptyState(title = t('emptyTitle'), body = t('emptyBody')) { return `<section class="card data-state"><div><span class="state-icon" aria-hidden="true">◇</span><h2>${title}</h2><p>${body}</p></div></section>`; }
export function errorState(message = t('genericError')) { return `<section class="card data-state" role="alert"><div><span class="state-icon" aria-hidden="true">!</span><h2>${t('errorTitle')}</h2><p>${message}</p><button class="button secondary" data-retry>${t('retry')}</button></div></section>`; }
