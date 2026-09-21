import en from '../locales/en.js';
import hi from '../locales/hi.js';

const locales = { en, hi };
let locale = localStorage.getItem('agriprocure.locale') === 'hi' ? 'hi' : 'en';

export function t(key, variables = {}) {
  const template = locales[locale][key] ?? locales.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (_match, name) => variables[name] ?? `{${name}}`);
}

export function getLocale() { return locale; }
export function setLocale(next) {
  locale = next === 'hi' ? 'hi' : 'en';
  localStorage.setItem('agriprocure.locale', locale);
  document.documentElement.lang = locale;
  window.dispatchEvent(new CustomEvent('agriprocure:locale', { detail: { locale } }));
}

export function toggleLocale() { setLocale(locale === 'en' ? 'hi' : 'en'); }

document.documentElement.lang = locale;
