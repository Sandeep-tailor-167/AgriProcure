'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { environment } = require('../src/config/environment');

async function seed() {
  if (environment.nodeEnv === 'production') throw new Error('Development seeds cannot run with NODE_ENV=production.');
  if (!environment.database.user) throw new Error('DB_USER is required in the ignored .env file.');
  const sql = await fs.readFile(path.resolve(__dirname, '../database/seeds/development.sql'), 'utf8');
  const connection = await mysql.createConnection({
    host: environment.database.host,
    port: environment.database.port,
    user: environment.database.user,
    password: environment.database.password,
    database: environment.database.name,
    multipleStatements: true,
    timezone: 'Z'
  });
  try {
    const [migration] = await connection.execute("SELECT 1 FROM schema_migrations WHERE migration_name = '001_core_schema.sql'");
    if (!migration.length) throw new Error('Run npm run db:migrate before seeding.');
    await connection.query(sql);
    console.info('Inserted labelled synthetic development reference data.');
  } finally {
    await connection.end();
  }
}

if (require.main === module) seed().catch((error) => { console.error(`Seed failed: ${error.message}`); process.exitCode = 1; });

module.exports = { seed };
