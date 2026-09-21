'use strict';
const TRANSACTION_STATES = Object.freeze(['inspection_in_progress','accepted','rejected','on_hold','purchase_recorded','payment_pending','payment_initiated','payment_completed','payment_failed','corrected']);
const TRANSACTION_TRANSITIONS = Object.freeze({
  inspection_in_progress: ['accepted','rejected','on_hold'], on_hold: ['accepted','rejected'], accepted: ['purchase_recorded'],
  purchase_recorded: ['payment_pending'], payment_pending: ['payment_initiated','payment_completed','payment_failed'],
  payment_initiated: ['payment_completed','payment_failed'], payment_failed: ['payment_initiated'], corrected: ['payment_pending']
});
const PAYMENT_STATES = Object.freeze(['pending','initiated','completed','failed','unknown','corrected']);
module.exports = { TRANSACTION_STATES, TRANSACTION_TRANSITIONS, PAYMENT_STATES };
