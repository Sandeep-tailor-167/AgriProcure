'use strict';
const { getPool } = require('../config/database');
async function maySubscribe(socket, centreId, date) {
  const pool = getPool();
  if (socket.auth.role === 'admin') return true;
  if (socket.auth.role === 'officer') {
    const [rows] = await pool.execute(`SELECT 1 FROM officer_assignments WHERE user_id=? AND centre_id=?
      AND assignment_status='active' AND ended_at IS NULL LIMIT 1`, [socket.auth.userId, centreId]);
    return Boolean(rows[0]);
  }
  const [rows] = await pool.execute(`SELECT 1 FROM queue_tokens qt JOIN appointments a ON a.appointment_id=qt.appointment_id
    JOIN farmers f ON f.farmer_id=a.farmer_id JOIN procurement_schedules s ON s.schedule_id=a.schedule_id
    WHERE f.user_id=? AND s.centre_id=? AND qt.queue_date=? LIMIT 1`, [socket.auth.userId, centreId, date]);
  return Boolean(rows[0]);
}
function registerQueueSocket(socket) {
  socket.on('queue:subscribe', async (input = {}, acknowledge = () => {}) => {
    try {
      const centreId = Number(input.centreId); const date = String(input.date || '').slice(0, 10);
      if (!Number.isInteger(centreId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !await maySubscribe(socket, centreId, date)) return acknowledge({ ok: false, code: 'FORBIDDEN' });
      for (const room of socket.rooms) if (room.startsWith('queue:')) socket.leave(room);
      socket.join(`queue:${centreId}:${date}`); acknowledge({ ok: true, lastUpdatedAt: new Date().toISOString() });
    } catch { acknowledge({ ok: false, code: 'SUBSCRIPTION_FAILED' }); }
  });
}
module.exports = { registerQueueSocket, maySubscribe };
