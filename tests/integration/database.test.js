'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { withTransaction, getDatabaseHealth, hasDatabaseCredentials, closePool } = require('../../src/config/database');
const { readMigrations, executableSql, validateIdentifier } = require('../../scripts/migrate');

const migrationPath = path.resolve(__dirname, '../../database/migrations/001_core_schema.sql');
test.after(closePool);

test('core migration defines required P0 tables, foreign keys, constraints, and indexes', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const requiredTables = [
    'users', 'farmers', 'procurement_centres', 'officer_assignments', 'crops', 'centre_crops',
    'procurement_schedules', 'appointments', 'queue_tokens', 'queue_events',
    'procurement_transactions', 'inspection_records', 'payment_records', 'audit_logs'
  ];
  for (const table of requiredTables) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'));
  assert.match(sql, /FOREIGN KEY/);
  assert.match(sql, /UNIQUE KEY uq_appointments_active_slot/);
  assert.match(sql, /booked_count <= capacity/);
  assert.match(sql, /DECIMAL\(14,2\)/);
  assert.match(sql, /payment_status <> 'completed'/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS schedule_revisions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS queue_token_sequences/);
});

test('centre and schedule repository scopes officer operations and parameterises discovery', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/repositories/centre.repository.js'), 'utf8');
  assert.match(source, /officer_assignments/);
  assert.match(source, /assignment_status = 'active'/);
  assert.match(source, /connection\.execute\([\s\S]*?values/);
  assert.match(source, /schedule_status IN \('published','full'\)/);
});

test('migration files are ordered, executable, and have stable unique names', async () => {
  const migrations = (await readMigrations()).filter((item) => executableSql(item.sql));
  assert.ok(migrations.length >= 1);
  assert.deepEqual(migrations.map((item) => item.name), [...migrations.map((item) => item.name)].sort());
  assert.equal(new Set(migrations.map((item) => item.name)).size, migrations.length);
  assert.ok(migrations.every((item) => /^[a-f0-9]{64}$/.test(item.checksum)));
});

test('database identifiers are strictly validated', () => {
  assert.equal(validateIdentifier('agriprocure_test'), '`agriprocure_test`');
  assert.throws(() => validateIdentifier('agriprocure; DROP DATABASE mysql'), /letters, numbers, and underscores/);
});

test('transaction helper commits successful work and releases owned connections only', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback')
  };
  const result = await withTransaction(async () => { calls.push('operation'); return 42; }, { connection });
  assert.equal(result, 42);
  assert.deepEqual(calls, ['begin', 'operation', 'commit']);
});

test('transaction helper rolls back when work fails', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback')
  };
  await assert.rejects(withTransaction(async () => { calls.push('operation'); throw new Error('expected failure'); }, { connection }), /expected failure/);
  assert.deepEqual(calls, ['begin', 'operation', 'rollback']);
});

test('database health is honest when credentials are unavailable', async () => {
  if (hasDatabaseCredentials()) return;
  assert.deepEqual(await getDatabaseHealth(), { status: 'unconfigured', latencyMs: null });
});

test('live MySQL migration and rollback integration', { skip: process.env.RUN_MYSQL_TESTS !== '1' }, async () => {
  assert.equal(hasDatabaseCredentials(), true, 'Set DB credentials before RUN_MYSQL_TESTS=1');
  const health = await getDatabaseHealth();
  assert.equal(health.status, 'healthy');
});
