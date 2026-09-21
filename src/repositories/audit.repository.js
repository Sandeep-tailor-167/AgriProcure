'use strict';

const { getPool } = require('../config/database');

async function appendAuditLog(entry, connection = getPool()) {
  const sql = `INSERT INTO audit_logs
    (actor_id, action, entity_type, entity_id, request_id, ip_address, before_snapshot, after_snapshot, metadata)
    VALUES (?, ?, ?, ?, ?, INET6_ATON(?), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON))`;
  const values = [
    entry.actorId || null,
    entry.action,
    entry.entityType,
    String(entry.entityId),
    entry.requestId || null,
    entry.ipAddress || null,
    entry.before ? JSON.stringify(entry.before) : null,
    entry.after ? JSON.stringify(entry.after) : null,
    entry.metadata ? JSON.stringify(entry.metadata) : null
  ];
  const [result] = await connection.execute(sql, values);
  return result.insertId;
}

async function listAuditLogs(filters, connection = getPool()) {
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 200);
  const clauses = [];
  const values = [];
  if (filters.actorId) { clauses.push('actor_id = ?'); values.push(filters.actorId); }
  if (filters.entityType) { clauses.push('entity_type = ?'); values.push(filters.entityType); }
  if (filters.entityId) { clauses.push('entity_id = ?'); values.push(String(filters.entityId)); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await connection.execute(
    `SELECT audit_id, actor_id, action, entity_type, entity_id, request_id, before_snapshot, after_snapshot, metadata, occurred_at
     FROM audit_logs ${where} ORDER BY occurred_at DESC LIMIT ${limit}`,
    values
  );
  return rows;
}

module.exports = { appendAuditLog, listAuditLogs };
