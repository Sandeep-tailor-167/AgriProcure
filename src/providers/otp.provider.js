'use strict';

const { environment } = require('../config/environment');

class OtpProviderNotConfiguredError extends Error {
  constructor() {
    super('Mobile OTP delivery is unavailable because no genuine provider is configured.');
    this.code = 'OTP_PROVIDER_NOT_CONFIGURED';
    this.status = 503;
  }
}

class DisabledOtpProvider {
  name = 'disabled';
  async send() { throw new OtpProviderNotConfiguredError(); }
}

class HttpOtpProvider {
  constructor({ name, url, apiKey, senderId, fetchImplementation = fetch }) {
    if (!name || !url || !apiKey || !senderId) throw new OtpProviderNotConfiguredError();
    this.name = name;
    this.url = url;
    this.apiKey = apiKey;
    this.senderId = senderId;
    this.fetch = fetchImplementation;
  }

  async send({ phone, otp, expiresInMinutes }) {
    const response = await this.fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ to: phone, senderId: this.senderId, template: 'AGRIPROCURE_LOGIN_OTP', variables: { otp, expiresInMinutes } }),
      signal: AbortSignal.timeout(5000)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error('OTP provider rejected the delivery request.');
      error.code = 'OTP_DELIVERY_REJECTED';
      error.status = 502;
      error.providerStatus = response.status;
      throw error;
    }
    const messageId = payload.messageId || payload.id;
    if (!messageId) {
      const error = new Error('OTP provider response did not include a message identifier.');
      error.code = 'OTP_PROVIDER_INVALID_RESPONSE';
      error.status = 502;
      throw error;
    }
    return { providerName: this.name, providerMessageId: String(messageId), deliveryStatus: 'submitted' };
  }
}

function getOtpProvider() {
  if (environment.providers.otp === 'disabled') return new DisabledOtpProvider();
  return new HttpOtpProvider({
    name: environment.providers.otp,
    url: environment.providers.otpUrl,
    apiKey: environment.providers.otpApiKey,
    senderId: environment.providers.otpSenderId
  });
}

module.exports = { DisabledOtpProvider, HttpOtpProvider, OtpProviderNotConfiguredError, getOtpProvider };
