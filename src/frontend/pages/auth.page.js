import { t, getLocale } from '../js/i18n.js';

function field(name, label, type = 'text', attributes = '') { return `<label class="field">${label}<input name="${name}" type="${type}" ${attributes} required></label>`; }

export function authPage(mode = 'login', challengeId = '') {
  const isLogin = mode === 'login';
  const isOtp = mode === 'otp';
  let form;
  if (isOtp) {
    form = `<form data-auth-form="otp"><input type="hidden" name="challengeId" value="${challengeId}">${field('otp', t('otpCode'), 'text', 'inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"')}<p class="auth-footnote">${t('otpHelp')}</p><p class="form-error" data-form-error hidden></p><button class="button primary full" type="submit">${t('verifyOtp')}</button></form>`;
  } else if (isLogin) {
    form = `<form data-auth-form="login">${field('phone', t('mobile'), 'tel', 'inputmode="numeric" minlength="10" maxlength="15" autocomplete="tel"')}${field('password', t('password'), 'password', 'autocomplete="current-password"')}<p class="form-error" data-form-error hidden></p><button class="button primary full" type="submit">${t('signIn')}</button></form>`;
  } else {
    form = `<form data-auth-form="register">${field('fullName', t('fullName'), 'text', 'maxlength="120" autocomplete="name"')}${field('phone', t('mobile'), 'tel', 'inputmode="numeric" minlength="10" maxlength="15" autocomplete="tel"')}${field('password', t('password'), 'password', 'minlength="10" autocomplete="new-password"')}<div class="field-grid">${field('village', t('village'), 'text', 'maxlength="100"')}${field('district', t('district'), 'text', 'maxlength="100"')}</div><div class="field-grid">${field('state', t('state'), 'text', 'maxlength="100"')}<label class="field">${t('preferredLanguage')}<select name="preferredLanguage"><option value="en" ${getLocale() === 'en' ? 'selected' : ''}>${t('english')}</option><option value="hi" ${getLocale() === 'hi' ? 'selected' : ''}>${t('hindi')}</option></select></label></div><p class="form-error" data-form-error hidden></p><button class="button primary full" type="submit">${t('requestOtp')}</button></form>`;
  }
  return `<main class="auth-layout"><section class="auth-visual"><a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span><span>${t('brand')}</span></a><div class="auth-message"><p class="eyebrow">${t('phoneOnly')}</p><h1>${isLogin ? t('welcome') : t('createAccount')}</h1><p>${isLogin ? t('signInHelp') : t('registerHelp')}</p></div></section><section class="auth-form-shell"><button class="button ghost language-switch" data-language>${t('language')}</button><div class="auth-panel"><header><p class="eyebrow">${t('brand')}</p><h1>${isOtp ? t('verifyOtp') : isLogin ? t('signIn') : t('register')}</h1><p>${t('noEmail')}</p></header>${!isOtp ? `<div class="auth-tabs" role="tablist"><button type="button" data-auth-mode="login" aria-selected="${isLogin}">${t('signIn')}</button><button type="button" data-auth-mode="register" aria-selected="${!isLogin}">${t('register')}</button></div>` : ''}${form}<p class="auth-footnote">${t('securityNote')}</p></div></section></main>`;
}
