'use strict';

/* AGROBULL server bots, 30-second turn timer and quick chat.
 * socket.io-client is already included in package.json.
 */
const { io: ioc } = require('socket.io-client');

const BOTS = [
  { n: 'Бот Агрессор', ch: 'gus', skin: 'copper', bluff: 0.70, sus: 0.80, wild: 0 },
  { n: 'Бот Хитрец', ch: 'saul', skin: 'lawyer', bluff: 0.50, sus: 0.55, wild: 0 },
  { n: 'Бот Осторожный', ch: 'walter', skin: 'classic', bluff: 0.20, sus: 0.35, wild: 0 },
  { n: 'Бот Хаос', ch: 'jesse', skin: 'neon', bluff: 0.50, sus: 0.50, wild: 1 }
];
const NOISE = { easy: 0.70, normal: 0.30, hard: 0.12 };
const TURN_MS = 30_000;
const rnd = (a, b) => a + Math.random() * (b - a);

module.exports = function attachBots(io, ctx = {}) {
  const roomFor = ctx.getRoomForSocket;
  const maxPlayers = Number(ctx.maxPlayers) || 4;
  if (typeof roomFor !== 'function') throw new TypeError('server-bots: pass getRoomForSocket(socket).');

  const pendingByRoom = new Map();
  const turnTimers = new Map();
  let botSerial = 0;

  function finishPending(code) {
    const next = Math.max(0, (pendingByRoom.get(code) || 0) - 1);
    if (next) pendingByRoom.set(code, next);
    else pendingByRoom.delete(code);
  }

  function serverUrl() {
    const httpServer = io.engine && io.engine.httpServer;
    const address = httpServer && typeof httpServer.address === 'function' ? httpServer.address() : null;
    const port = address && typeof address === 'object' && address.port
      ? address.port : Number(process.env.PORT) || 3000;
    const host = process.env.AGROBULL_BOT_HOST || '127.0.0.1';
    return process.env.AGROBULL_BOT_URL || ('http://' + host + ':' + port);
  }

  function spawnBot(code, profile, difficulty) {
    const client = ioc(serverUrl(), {
      transports: ['websocket'], reconnection: false, timeout: 8000, forceNew: true
    });
    let playerId = null;
    let latestState = null;
    let turnKey = '';
    let rememberedKey = '';
    let actionTimer = null;
    let finishTimer = null;
    let pendingReleased = false;
    let closed = false;
    const memory = new Map();
    const noise = NOISE[difficulty] ?? NOISE.normal;

    function releasePending() {
      if (pendingReleased) return;
      pendingReleased = true;
      finishPending(code);
    }
    function stop() {
      if (closed) return;
      closed = true;
      clearTimeout(actionTimer);
      clearTimeout(finishTimer);
      releasePending();
      client.disconnect();
    }

    function remember(state) {
      const last = state.lastPlay;
      if (!last || !last.revealed || !Array.isArray(last.cards)) return;
      const key = [state.gameId, state.round, state.pileCount, last.playerId].join('|');
      if (key === rememberedKey) return;
      rememberedKey = key;
      const rec = memory.get(last.playerId) || { lies: 0, seen: 0 };
      rec.seen++;
      if (last.cards.some(card => card.id !== state.table?.id && card.id !== 'b')) rec.lies++;
      memory.set(last.playerId, rec);
    }

    function chooseUnique(items, count) {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, count);
    }

    function act(state) {
      if (closed || !state || state.phase !== 'playing' || state.currentId !== playerId || !state.table) return;
      const me = (state.players || []).find(p => p.id === playerId);
      if (!me || !Array.isArray(me.hand) || !me.hand.length) return;
      const hand = me.hand;
      const tableId = state.table.id;
      const last = state.lastPlay;
      const opponents = (state.players || []).filter(p => p.alive && p.id !== playerId && p.handCount > 0);

      if (last && last.playerId !== playerId && opponents.length) {
        const validCount = hand.filter(card => card.id === tableId || card.id === 'b').length;
        const playedCount = Math.max(1, Number(last.count) || 1);
        const possible = Math.max(0, 8 - validCount - Math.max(0, (state.pileCount - playedCount) * 0.6));
        let honestChance = 1;
        for (let i = 0; i < playedCount; i++) {
          honestChance *= Math.max(0, possible - i) / Math.max(1, 15 - i);
        }
        const history = memory.get(last.playerId);
        const historyBias = history && history.seen > 1
          ? ((history.lies / history.seen) - 0.4) * 0.3 : 0;
        const chaosBias = profile.wild ? (Math.random() - 0.5) * 0.6 : 0;
        const score = (1 - honestChance) + (profile.sus - 0.5) * 0.4 +
          historyBias + chaosBias + (Math.random() - 0.5) * noise;
        if (score > 0.62) {
          client.emit('callBluff');
          return;
        }
      }

      const valid = [];
      const bluff = [];
      hand.forEach((card, index) => {
        if (card.id === tableId || card.id === 'b') valid.push(index);
        else bluff.push(index);
      });
      const count = Math.min(hand.length, 1 + (Math.random() < 0.35 ? 1 : 0) + (Math.random() < 0.12 ? 1 : 0));
      const useBluff = bluff.length > 0 && (valid.length === 0 || Math.random() < profile.bluff);
      const pool = useBluff ? bluff : valid;
      const indexes = chooseUnique(pool.length ? pool : hand.map((_, i) => i), count);
      if (indexes.length) client.emit('playCards', { indexes: indexes.sort((a, b) => a - b) });
    }

    client.on('connect', () => client.emit('joinRoom', {
      name: profile.n, character: profile.ch, skin: profile.skin, code
    }));
    client.on('joined', data => {
      playerId = data && data.playerId;
      releasePending();
      client.emit('setReady', true);
    });
    client.on('connect_error', () => { if (!playerId) stop(); });
    client.on('roomError', () => stop());
    client.on('gameState', state => {
      if (closed || !state) return;
      latestState = state;
      remember(state);
      const me = (state.players || []).find(p => p.id === playerId);

      if (state.phase === 'finished') {
        clearTimeout(actionTimer);
        if (!finishTimer) finishTimer = setTimeout(() => {
          client.emit('leaveRoom');
          stop();
        }, 45_000);
        return;
      }
      if (state.phase === 'rodeo') {
        if (state.rodeo?.playerId === playerId && state.rodeo.out && !state.rodeo.saved &&
            me?.ability?.id === 'revive' && !me.abilityUsed) {
          client.emit('useAbility', { type: 'revive' });
        }
        clearTimeout(actionTimer);
        return;
      }
      if (state.phase !== 'playing' || !playerId) return;

      if (state.begging?.toId === playerId) {
        const requestId = state.begging.id;
        setTimeout(() => {
          if (!closed && latestState?.begging?.id === requestId) {
            client.emit('begDecision', { accept: Math.random() < 0.4 });
          }
        }, rnd(800, 1800));
      }
      if (state.currentId !== playerId) return;
      const key = [state.gameId, state.round, state.pileCount, state.currentId,
        state.lastPlay?.playerId || 'none'].join('|');
      if (key === turnKey) return;
      turnKey = key;
      clearTimeout(actionTimer);
      actionTimer = setTimeout(() => act(latestState), rnd(1200, 2800));
    });

    const maxLifetime = setTimeout(() => {
      if (closed) return;
      if (playerId) client.emit('leaveRoom');
      stop();
    }, 30 * 60 * 1000);
    client.on('disconnect', () => {
      clearTimeout(maxLifetime);
      clearTimeout(actionTimer);
      clearTimeout(finishTimer);
      releasePending();
      closed = true;
    });
  }

  io.on('connection', socket => {
    socket.on('addBots', (data = {}) => {
      const room = roomFor(socket);
      const requesterId = socket.data && socket.data.playerId;
      if (!room || !requesterId || room.hostId !== requesterId) {
        socket.emit('botsError', { message: 'Добавлять ботов может только создатель комнаты.' });
        return;
      }
      if (room.game) {
        socket.emit('botsError', { message: 'Ботов можно добавлять только до начала матча.' });
        return;
      }
      const difficulty = ['easy', 'normal', 'hard'].includes(data.diff) ? data.diff : 'normal';
      const requested = Math.max(1, Math.min(3, Number(data.count) || 1));
      const pending = pendingByRoom.get(room.code) || 0;
      const free = Math.max(0, maxPlayers - room.players.length - pending);
      const count = Math.min(requested, free);
      if (!count) {
        socket.emit('botsError', { message: 'В комнате больше нет свободных мест.' });
        return;
      }
      pendingByRoom.set(room.code, pending + count);
      socket.emit('botsQueued', { count });

      for (let i = 0; i < count; i++) {
        const template = BOTS[botSerial++ % BOTS.length];
        const serial = botSerial;
        const profile = { ...template, n: template.n + (serial > BOTS.length ? ' ' + serial : '') };
        setTimeout(() => {
          const live = roomFor(socket);
          if (!live || live.code !== room.code || live.game || live.players.length >= maxPlayers) {
            finishPending(room.code);
            return;
          }
          spawnBot(room.code, profile, difficulty);
        }, i * 350);
      }
    });

    socket.on('chat', (data = {}) => {
      const room = roomFor(socket);
      const player = room && room.players.find(p => p.id === socket.data.playerId);
      if (!room || !player) return;
      const now = Date.now();
      if (socket.data.lastChatAt && now - socket.data.lastChatAt < 800) return;
      socket.data.lastChatAt = now;
      const message = String(data.t || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 80);
      if (!message) return;
      io.to(room.code).emit('chat', { from: player.id, name: player.name, t: message });
    });
  });

  const tick = setInterval(() => {
    const liveRooms = new Set();
    for (const connected of io.sockets.sockets.values()) {
      const room = roomFor(connected);
      if (room) liveRooms.add(room);
    }
    for (const room of liveRooms) {
      const game = room.game;
      if (!game || game.phase !== 'playing' || !game.currentId) {
        turnTimers.delete(room.code);
        continue;
      }
      const key = [game.gameId, game.round, game.pileCount, game.currentId,
        game.lastPlay ? game.lastPlay.cards.length : 0].join('|');
      let timer = turnTimers.get(room.code);
      if (!timer || timer.key !== key) {
        timer = { key, deadline: Date.now() + TURN_MS };
        turnTimers.set(room.code, timer);
        io.to(room.code).emit('turnTimer', { id: game.currentId, deadline: timer.deadline });
        continue;
      }
      if (Date.now() < timer.deadline || game.begging) continue;

      const player = room.players.find(p => p.id === game.currentId);
      const playerSocket = player && io.sockets.sockets.get(player.socketId);
      if (!player || !playerSocket || !player.hand.length) {
        timer.deadline = Date.now() + TURN_MS;
        io.to(room.code).emit('turnTimer', { id: game.currentId, deadline: timer.deadline });
        continue;
      }
      timer.deadline = Date.now() + TURN_MS;
      io.to(room.code).emit('turnTimer', { id: game.currentId, deadline: timer.deadline });
      const noOtherHands = !room.players.some(p => p.alive && p.id !== player.id && p.hand.length > 0);
      io.to(room.code).emit('chat', { from: 'timer', name: '⏱', t: player.name + ': время вышло' });

      try {
        if (game.lastPlay && game.lastPlay.playerId !== player.id && noOtherHands) {
          const handler = playerSocket.listeners('callBluff')[0];
          if (handler) handler();
        } else {
          const handler = playerSocket.listeners('playCards')[0];
          if (handler) handler({ indexes: [Math.floor(Math.random() * player.hand.length)] });
        }
      } catch (error) {
        console.error('[server-bots] timeout action failed:', error);
      }
    }
    const liveCodes = new Set([...liveRooms].map(room => room.code));
    for (const code of turnTimers.keys()) if (!liveCodes.has(code)) turnTimers.delete(code);
  }, 1000);
  if (typeof tick.unref === 'function') tick.unref();
};
