'use strict';
const crypto = require('crypto');

module.exports = function attachResilience(io, ctx = {}) {
  const { getRoomForSocket: roomFor, rooms, broadcastState, sendLobby, leaveCurrentRoom } = ctx;
  if (![roomFor, rooms, broadcastState, sendLobby, leaveCurrentRoom].every(Boolean)) {
    throw new Error('server-resilience: missing room/state callbacks');
  }
  const GRACE_MS = 60000, MAX_IP = 8, penalties = new Map(), ipCounts = new Map();
  const ipOf = socket => String(socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || 'unknown').split(',')[0].trim();

  function penalize(deviceId) {
    if (!deviceId) return;
    const now = Date.now(), rec = penalties.get(deviceId) || { count: 0, last: 0, until: 0 };
    if (now - rec.last > 86400000) rec.count = 0;
    rec.count++; rec.last = now;
    rec.until = now + Math.min(30, 3 * (2 ** (rec.count - 1))) * 60000;
    penalties.set(deviceId, rec);
  }
  function penaltyMinutes(deviceId) {
    const rec = deviceId && penalties.get(deviceId);
    return rec && rec.until > Date.now() ? Math.ceil((rec.until - Date.now()) / 60000) : 0;
  }
  const playerOf = socket => {
    const room = roomFor(socket);
    return { room, player: room && room.players.find(p => p.id === socket.data.playerId) };
  };

  io.use((socket, next) => {
    const ip = ipOf(socket), count = (ipCounts.get(ip) || 0) + 1;
    if (count > MAX_IP) return next(new Error('too-many-connections'));
    ipCounts.set(ip, count);
    socket.once('disconnect', () => {
      const left = (ipCounts.get(ip) || 1) - 1;
      if (left > 0) ipCounts.set(ip, left); else ipCounts.delete(ip);
    });
    next();
  });

  io.on('connection', socket => {
    let windowAt = Date.now(), eventCount = 0, violations = 0, joins = [];
    socket.use(([event, data], next) => {
      const now = Date.now();
      if (now - windowAt >= 1000) { windowAt = now; eventCount = 0; }
      if (++eventCount > 40) {
        if (++violations >= 4) socket.disconnect(true);
        return next(new Error('rate-limit'));
      }
      if (data && typeof data === 'object' && data.deviceId) {
        socket.data.deviceId = String(data.deviceId).slice(0, 64);
      }
      if (event === 'joinRoom') {
        joins = joins.filter(t => now - t < 20000);
        if (joins.length >= 6) {
          socket.emit('roomError', { message: 'Слишком много попыток входа. Подожди 20 секунд.' });
          return next(new Error('join-rate-limit'));
        }
        joins.push(now);
      }
      if (event === 'quickPlay') {
        const mins = penaltyMinutes(socket.data.deviceId);
        if (mins) {
          socket.emit('roomError', { message: 'Быстрая игра будет доступна через ' + mins + ' мин.' });
          return next(new Error('quick-play-penalty'));
        }
      }
      if (event === 'leaveRoom') {
        const { room, player } = playerOf(socket);
        if (room && room.game && room.game.phase !== 'finished' && player && player.alive) {
          penalize(player.deviceId || socket.data.deviceId);
        }
      }
      next();
    });

    socket.on('getSession', () => {
      const { room, player } = playerOf(socket);
      if (!room || !player) return;
      player.token = player.token || crypto.randomBytes(24).toString('hex');
      player.deviceId = socket.data.deviceId || player.deviceId || null;
      player._sock = socket;
      socket.emit('session', { code: room.code, playerId: player.id, token: player.token });
    });

    socket.on('rejoin', data => {
      if (socket.data.roomCode || !data) return;
      const code = String(data.code || '').toUpperCase().slice(0, 4);
      const room = rooms.get(code);
      const player = room && room.players.find(p => p.id === data.playerId);
      if (!player || !player.token || player.token !== data.token ||
          (player.deviceId && data.deviceId !== player.deviceId) ||
          !player.dcAt || Date.now() - player.dcAt > GRACE_MS) {
        socket.emit('rejoinFailed');
        return;
      }
      const oldSocket = io.sockets.sockets.get(player.socketId);
      if (oldSocket && oldSocket.id !== socket.id) {
        oldSocket.data.roomCode = null;
        oldSocket.data.playerId = null;
        oldSocket.leave(room.code);
        oldSocket.emit('replaced');
      }
      player.socketId = socket.id;
      player.connected = true;
      delete player.dcAt;
      player._sock = socket;
      socket.data.roomCode = room.code;
      socket.data.playerId = player.id;
      socket.data.deviceId = player.deviceId || socket.data.deviceId;
      socket.join(room.code);
      socket.emit('joined', { playerId: player.id, roomCode: room.code, rejoined: true });
      if (room.game) broadcastState(room); else sendLobby(room);
      sendLobby(room);
    });

    socket.on('ping2', (_sentAt, ack) => { if (typeof ack === 'function') ack(); });
  });

  io.onDisconnect = socket => {
    const { room, player } = playerOf(socket);
    if (!room || !player || !room.game || room.game.phase === 'finished' || !player.alive) return false;
    player.connected = false;
    player.dcAt = Date.now();
    player._sock = socket;
    broadcastState(room);
    sendLobby(room);
    setTimeout(() => {
      if (player.connected || rooms.get(room.code) !== room || !room.players.includes(player)) return;
      penalize(player.deviceId || socket.data.deviceId);
      leaveCurrentRoom({ data: { roomCode: room.code, playerId: player.id }, leave() {} });
    }, GRACE_MS);
    return true;
  };
};