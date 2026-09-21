'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { environment } = require('../src/config/environment');

const migrationsDirectory = path.resolve(__dirname, '../database/migrations');

function validateIdentifier(identifier) {
  if (!/^[A-Za-z0-9_]+$/.test(identifier)) throw new Error('DB_NAME may contain only letters, numbers, and underscores.');
  return `\`${identifier}\``;
}

function executableSql(sql) {
  return sql.replace(/^\s*--.*$/gm, '').replace(/^\s*\/\*[^]*?\*\/\s*$/gm, '').trim();
}

async function readMigrations() {
  const names = (await fs.readdir(migrationsDirectory)).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
  return Promise.all(names.map(async (name) => {
    const sql = await fs.readFile(path.join(migrationsDirectory, name), 'utf8');
    return { name, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
  }));
}

async function openMigrationConnection() {
  if (!environment.database.user) throw Object.assign(new Error('DB_USER is required in the ignored .env file.'), { code: 'DATABASE_NOT_CONFIGURED' });
  const connection = await mysql.createConnection({
    host: environment.database.host,
    port: environment.database.port,
    user: environment.database.user,
    password: environment.database.password,
    multipleStatements: true,
    timezone: 'Z'
  });
  const databaseName = validateIdentifier(environment.database.name);
  await connection.query(`CREATE DATABASE IF NOT EXISTS ${databaseName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.query(`USE ${databaseName}`);
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_name VARCHAR(255) NOT NULL PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
  return connection;
}

async function migrate() {
  const connection = await openMigrationConnection();
  const lockName = `${environment.database.name}:migrations`;
  try {
    const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
    if (lock.acquired !== 1) throw new Error('Could not acquire the migration lock.');
    const [appliedRows] = await connection.execute('SELECT migration_name, checksum FROM schema_migrations');
    const applied = new Map(appliedRows.map((row) => [row.migration_name, row.checksum]));
    for (const migration of await readMigrations()) {
      if (!executableSql(migration.sql)) continue;
      if (applied.has(migration.name)) {
        if (applied.get(migration.name) !== migration.checksum) throw new Error(`Applied migration checksum changed: ${migration.name}`);
        console.info(`Already applied: ${migration.name}`);
        continue;
      }
      await connection.query(migration.sql);
      await connection.execute('INSERT INTO schema_migrations (migration_name, checksum) VALUES (?, ?)', [migration.name, migration.checksum]);
      console.info(`Applied: ${migration.name}`);
    }
  } finally {
    try { await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]); } catch { /* connection cleanup */ }
    await connection.end();
  }
}

if (require.main === module) migrate().catch((error) => { console.error(`Migration failed: ${error.message}`); process.exitCode = 1; });

module.exports = { migrate, readMigrations, executableSql, validateIdentifier };
