'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { createApp } = require('../../src/app');
const { calculatePurchase } = require('../../src/services/transaction.service');
const { TRANSACTION_TRANSITIONS } = require('../../src/constants/states');
const { summarise } = require('../../src/services/analytics.service');
const { bounds } = require('../../src/services/prediction.service');
const { calculate: calculateRecommendation } = require('../../src/services/recommendation.service');
const { closePool } = require('../../src/config/database');
test.after(closePool);

test('health endpoint reports database configuration truthfully', async () => {
  const response = await request(createApp()).get('/api/v1/health').expect(200);
  assert.equal(response.body.success, true);
  assert.ok(response.body.data.developmentStep >= 2 && response.body.data.developmentStep <= 14);
  assert.ok(['healthy', 'unconfigured', 'unavailable'].includes(response.body.data.database.status));
});

test('unknown API paths use the consistent error shape', async () => {
  const response = await request(createApp()).get('/api/v1/not-real').expect(404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'NOT_FOUND');
});

test('database-specific health endpoint fails safely without configured credentials', async () => {
  const response = await request(createApp()).get('/api/v1/health/database');
  if (response.status === 503) {
    assert.equal(response.body.success, false);
    assert.ok(['unconfigured', 'unavailable'].includes(response.body.data.status));
  } else {
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, 'healthy');
  }
});

test('authentication contract explicitly excludes email login and verification', () => {
  const productRequirements = fs.readFileSync(path.resolve(__dirname, '../../docs/PRD.md'), 'utf8');
  assert.match(productRequirements, /Email login and email verification are explicitly excluded/i);
  assert.match(productRequirements, /verified mobile number/i);
});

test('purchase calculation uses decimal-safe units and applies deductions', () => {
  assert.deepEqual(calculatePurchase('12.345', '2375.50', '100.25'), { grossAmount: '29325.55', totalAmount: '29225.30' });
  assert.throws(() => calculatePurchase('1', '100', '101'), (error) => error.code === 'INVALID_DEDUCTION');
});

test('procurement state machine separates purchase and verified payment completion', () => {
  assert.deepEqual(TRANSACTION_TRANSITIONS.accepted, ['purchase_recorded']);
  assert.ok(!TRANSACTION_TRANSITIONS.purchase_recorded.includes('payment_completed'));
  assert.ok(TRANSACTION_TRANSITIONS.payment_pending.includes('payment_completed'));
});

test('analytics summary is calculated from supplied operational rows', () => {
  const summary=summarise([{capacity:'10',appointments:8,check_ins:6,completed:5,no_shows:1,average_wait_minutes:'12.50',procured_quantity:'20.125',purchase_value:'5000.50'},{capacity:'10',appointments:2,check_ins:2,completed:1,no_shows:0,average_wait_minutes:'7.50',procured_quantity:'4.875',purchase_value:'1000.25'}]);
  assert.equal(summary.capacityUtilisation,50);assert.equal(summary.completionRate,60);assert.equal(summary.averageWaitMinutes,11.25);assert.equal(summary.procuredQuantity,25);assert.equal(summary.purchaseValue,'6000.75');
});

test('prediction fallbacks expose bounded estimates and timeout-controlled integration', () => {
  assert.deepEqual(bounds(50),{value:50,lower_bound:40,upper_bound:60});
  const source=fs.readFileSync(path.resolve(__dirname,'../../src/services/prediction.service.js'),'utf8');
  assert.match(source,/AbortSignal\.timeout/);assert.match(source,/statistical_fallback/);assert.match(source,/fallback_reason/);
});

test('capacity recommendations are explainable and bounded by physical headroom', () => {
  const result=calculateRecommendation({prediction_value:'80',available_capacity:50,physical_daily_capacity:100,total_scheduled:90,recurring_bottlenecks:4});
  assert.equal(result.type,'add_window');assert.equal(result.capacityGap,30);assert.equal(result.recommendedCapacity,60);assert.match(result.reason,/only 10 physical-capacity slots/);assert.match(result.reason,/Historical utilisation/);
  assert.equal(calculateRecommendation({prediction_value:20,available_capacity:25,physical_daily_capacity:30,total_scheduled:25,recurring_bottlenecks:0}).type,'monitor');
});

test('frontend entry point uses the modular application and responsive design', async () => {
  const response = await request(createApp()).get('/').expect(200);
  assert.match(response.text, /id="app"/);
  assert.match(response.text, /type="module" src="\/frontend\/js\/main\.js"/);
  const css = fs.readFileSync(path.resolve(__dirname, '../../src/frontend/css/main.css'), 'utf8');
  assert.match(css, /@media \(max-width: 850px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test('frontend authentication UI remains mobile-only and centrally localised', () => {
  const authSource = fs.readFileSync(path.resolve(__dirname, '../../src/frontend/pages/auth.page.js'), 'utf8');
  const i18nSource = fs.readFileSync(path.resolve(__dirname, '../../src/frontend/js/i18n.js'), 'utf8');
  assert.doesNotMatch(authSource, /type=["']email/i);
  assert.match(authSource, /field\('phone',[^\n]+?'tel'/i);
  assert.match(i18nSource, /import en/);
  assert.match(i18nSource, /import hi/);
});
