/* server-modes.js — настройки частной комнаты, реванш и кик из лобби.
 * Подключение: require('./server-modes')(io, { getRoomForSocket: roomFor, maxPlayers: MAX_PLAYERS });
 */
module.exports = function attach(io, ctx = {}) {
  const roomFor = ctx.getRoomForSocket, MAXP = ctx.maxPlayers || 4;
  if (typeof roomFor !== 'function') throw new Error('server-modes: передай { getRoomForSocket: roomFor }');
  const SET = new Map();
  const def = () => ({ maxPlayers: MAXP, turnSec: 30, abilities: true, fallMin: 2, fallMax: 5, mode: 'classic' });
  const clamp = (v, a, b, d) => Number.isFinite(+v) ? Math.max(a, Math.min(b, Math.round(+v))) : d;
  io.settingsOf = code => SET.get(code) || def();

  const lobby = r => ({
    code: r.code, hostId: r.hostId, maxPlayers: (SET.get(r.code) || def()).maxPlayers, mode: (SET.get(r.code) || def()).mode,
    players: r.players.map(p => ({ id: p.id, name: p.name, character: p.character, skin: p.skin, ready: p.ready, isHost: p.id === r.hostId, connected: p.connected })),
    canStart: r.players.length >= 2 && r.players.every(p => p.ready && p.connected)
  });

  io.on('connection', socket => {
    socket.use(([ev, d], next) => {
      d = d || {};
      if (ev === 'joinRoom') {
        const code = String(d.code || '').trim().toUpperCase().slice(0, 4), s = SET.get(code);
        const size = (io.sockets.adapter.rooms.get(code) || new Set()).size;
        if (s && size >= s.maxPlayers) { socket.emit('roomError', { message: `В комнате максимум ${s.maxPlayers} игрока.` }); return next(new Error('full')); }
      }
      if (ev === 'useAbility' || ev === 'ability2') {
        const r = roomFor(socket), s = r && SET.get(r.code);
        if (s && s.abilities === false) { socket.emit('roomError', { message: 'В этой комнате умения отключены.' }); return next(new Error('abilities-off')); }
      }
      if (ev === 'startGame') {
        next();
        setTimeout(() => {
          const r = roomFor(socket), s = r && SET.get(r.code);
          if (r && r.game && s) r.players.forEach(p => { p.fallAt = s.fallMin + Math.floor(Math.random() * (s.fallMax - s.fallMin + 1)); });
        }, 60);
        return;
      }
      next();
    });

    socket.on('getSettings', () => { const r = roomFor(socket); if (r) socket.emit('settings', SET.get(r.code) || def()); });

    socket.on('setSettings', (d = {}) => {
      const r = roomFor(socket); if (!r || r.game || (r.dice && r.dice.phase !== 'finished') || socket.data.playerId !== r.hostId) return;
      const lo = clamp(d.fallMin, 1, 5, 2), hi = clamp(d.fallMax, lo, 6, 5);
      const current = SET.get(r.code) || def();
      const mode = ['classic', 'double', 'chaos'].includes(d.mode) ? d.mode : current.mode;
      const s = { maxPlayers: clamp(d.maxPlayers, Math.max(2, r.players.length), MAXP, MAXP), turnSec: [15, 30, 60].includes(+d.turnSec) ? +d.turnSec : 30, abilities: d.abilities !== false, fallMin: lo, fallMax: hi, mode };
      SET.set(r.code, s); io.to(r.code).emit('settings', s); io.to(r.code).emit('lobby', lobby(r));
    });

    socket.on('rematch', () => {
      const r = roomFor(socket); if (!r || !r.game || r.game.phase !== 'finished' || socket.data.playerId !== r.hostId) return;
      r.game = null;
      // A rematch from a private room is unranked; rated quick-play results are final.
      r.ranked = false;
      r.rankedAccounts = [];
      r.rankedResultRecorded = false;
      r.players.forEach(p => { p.alive = true; p.rides = 0; p.hand = []; p.abilityUsed = false; p.ready = p.id === r.hostId; });
      const l = lobby(r);
      r.players.forEach(p => { if (p.socketId) io.to(p.socketId).emit('gameState', { roomCode: r.code, phase: 'lobby', lobby: l }); });
      io.to(r.code).emit('lobby', l);
    });

    socket.on('kick', (d = {}) => {
      const r = roomFor(socket); if (!r || r.game || (r.dice && r.dice.phase !== 'finished') || socket.data.playerId !== r.hostId) return;
      const p = r.players.find(x => x.id === d.id); if (!p || p.id === r.hostId) return;
      const s = io.sockets.sockets.get(p.socketId); if (!s) return;
      s.emit('kicked'); const h = s.listeners('leaveRoom')[0]; if (h) h();
    });
  });

  const cleanup = setInterval(() => {
    for (const code of SET.keys()) if (!io.sockets.adapter.rooms.has(code)) SET.delete(code);
  }, 60000);
  if (typeof cleanup.unref === 'function') cleanup.unref();
};
