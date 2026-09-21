'use strict';
const { Server } = require('socket.io');
const { verifyAccessToken } = require('../middlewares/authenticate');
let io;
function initialiseSocket(server) {
  io = new Server(server, { cors: { origin: require('./environment').environment.appBaseUrl, credentials: true }, transports: ['websocket', 'polling'] });
  io.use((socket, next) => {
    try {
      const raw = socket.handshake.auth?.token || socket.handshake.headers.authorization?.replace(/^Bearer /, '');
      const payload = verifyAccessToken(raw || '');
      socket.auth = { userId: Number(payload.sub), role: payload.role };
      next();
    } catch { next(new Error('UNAUTHENTICATED')); }
  });
  io.on('connection', (socket) => {
    socket.join(`user:${socket.auth.userId}`);
    require('../sockets/queue.socket').registerQueueSocket(socket);
    require('../sockets/notification.socket').registerNotificationSocket?.(socket);
  });
  return io;
}
function emitQueueUpdate(centreId, date, payload) { io?.to(`queue:${Number(centreId)}:${String(date).slice(0, 10)}`).emit('queue:update', payload); }
function emitUserUpdate(userId, event, payload) { io?.to(`user:${Number(userId)}`).emit(event, payload); }
module.exports = { initialiseSocket, emitQueueUpdate, emitUserUpdate, getSocketServer: () => io };
