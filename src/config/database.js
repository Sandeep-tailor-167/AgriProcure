'use strict';

const mysql = require('mysql2/promise');
const { environment } = require('./environment');

let pool;

function hasDatabaseCredentials() {
  return Boolean(environment.database.user && environment.database.name);
}

function getPool() {
  if (!hasDatabaseCredentials()) {
    const error = new Error('MySQL credentials are not configured. Set DB_USER and DB_PASSWORD in the ignored .env file.');
    error.code = 'DATABASE_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }
  if (!pool) {
    pool = mysql.createPool({
      host: environment.database.host,
      port: environment.database.port,
      database: environment.database.name,
      user: environment.database.user,
      password: environment.database.password,
      waitForConnections: true,
      connectionLimit: environment.database.connectionLimit,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      timezone: 'Z',
      decimalNumbers: false,
      multipleStatements: false,
      namedPlaceholders: false
    });
  }
  return pool;
}

async function getDatabaseHealth() {
  if (!hasDatabaseCredentials()) return { status: 'unconfigured', latencyMs: null };
  const startedAt = performance.now();
  try {
    const connectionPool = getPool();
    const [rows] = await connectionPool.execute('SELECT 1 AS healthy');
    return { status: rows[0]?.healthy === 1 ? 'healthy' : 'unhealthy', latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return { status: 'unavailable', latencyMs: Math.round(performance.now() - startedAt), code: error.code || 'DATABASE_ERROR' };
  }
}

async function withTransaction(operation, options = {}) {
  if (typeof operation !== 'function') throw new TypeError('Transaction operation must be a function');
  const connection = options.connection || await getPool().getConnection();
  const ownsConnection = !options.connection;
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = { getPool, getDatabaseHealth, hasDatabaseCredentials, withTransaction, closePool };
