'use strict';

const { io: createClient } = require('socket.io-client');

const BOT_PROFILES = [
  { name: 'Бот Агрессор', character: 'gus', bluff: 0.70, suspicious: 0.80, chaos: 0 },
  { name: 'Бот Хитрец', character: 'saul', bluff: 0.50, suspicious: 0.58, chaos: 0 },
  { name: 'Бот Осторожный', character: 'walter', bluff: 0.18, suspicious: 0.32, chaos: 0 },
  { name: 'Бот Хаос', character: 'jesse', bluff: 0.52, suspicious: 0.50, chaos: 1 }
];
const DIFFICULTY_NOISE = { easy: 0.72, normal: 0.34, hard: 0.13 };
const randomBetween = (min, max) => min + Math.random() * (max - min);

function attachBots(io, options = {}) {
  const getRoomForSocket = options.getRoomForSocket;
  const maxPlayers = Number(options.maxPlayers) || 4;
  if (typeof getRoomForSocket !== 'function') {
    throw new TypeError('server-extras requires getRoomForSocket(socket).');
  }

  const pendingByRoom = new Map();
  let botSerial = 0;

  function finishPending(roomCode) {
    const next = Math.max(0, (pendingByRoom.get(roomCode) || 0) - 1);
    if (next) pendingByRoom.set(roomCode, next);
    else pendingByRoom.delete(roomCode);
  }

  function serverAddress() {
    const httpServer = io.engine && io.engine.httpServer;
    const address = httpServer && typeof httpServer.address === 'function' ? httpServer.address() : null;
    const port = address && typeof address === 'object' && address.port
      ? address.port
      : Number(process.env.PORT) || 3000;
    const host = process.env.AGROBULL_BOT_HOST || '127.0.0.1';
    return process.env.AGROBULL_BOT_URL || ('http://' + host + ':' + port);
  }

  function spawnBot(roomCode, profile, difficulty) {
    const client = createClient(serverAddress(), {
      transports: ['websocket'],
      reconnection: false,
      timeout: 8000,
      forceNew: true
    });

    let playerId = null;
    let latestState = null;
    let currentTurnKey = '';
    let rememberedReveal = '';
    let actionTimer = null;
    let finishTimer = null;
    let pendingFinished = false;
    let closed = false;
    const memory = new Map();
    const noise = DIFFICULTY_NOISE[difficulty] ?? DIFFICULTY_NOISE.normal;

    function stop(disconnectNow = true) {
      if (closed) return;
      closed = true;
      clearTimeout(actionTimer);
      clearTimeout(finishTimer);
      if (!pendingFinished) {
        pendingFinished = true;
        finishPending(roomCode);
      }
      if (disconnectNow) client.disconnect();
    }

    function rememberPlay(state) {
      const last = state.lastPlay;
      if (!last || !last.revealed || !Array.isArray(last.cards)) return;
      const key = [state.gameId, state.round, state.pileCount, last.playerId].join('|');
      if (key === rememberedReveal) return;
      rememberedReveal = key;
      const record = memory.get(last.playerId) || { lies: 0, reveals: 0 };
      record.reveals++;
      if (last.cards.some(card => card.id !== state.table?.id && card.id !== 'b')) record.lies++;
      memory.set(last.playerId, record);
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
      if (closed || !state || state.phase !== 'playing' || state.currentId !== playerId) return;
      const me = (state.players || []).find(player => player.id === playerId);
      if (!me || !Array.isArray(me.hand) || !me.hand.length || !state.table) return;

      const hand = me.hand;
      const tableId = state.table.id;
      const last = state.lastPlay;
      const opponents = (state.players || []).filter(p => p.alive && p.id !== playerId && p.handCount > 0);

      if (last && last.playerId !== playerId && opponents.length) {
        const validCount = hand.filter(card => card.id === tableId || card.id === 'b').length;
        const playedCount = Math.max(1, Number(last.count) || 1);
        const unknownValid = Math.max(0, 8 - validCount - Math.max(0, (state.pileCount - playedCount) * 0.55));
        let honestChance = 1;
        for (let i = 0; i < playedCount; i++) {
          honestChance *= Math.max(0, unknownValid - i) / Math.max(1, 15 - i);
        }

        const known = memory.get(last.playerId);
        const historyBias = known && known.reveals >= 2
          ? ((known.lies / known.reveals) - 0.4) * 0.34
          : 0;
        const chaosBias = profile.chaos ? (Math.random() - 0.5) * 0.58 : 0;
        const challengeScore =
          (1 - honestChance) +
          (profile.suspicious - 0.5) * 0.34 +
          historyBias +
          chaosBias +
          (Math.random() - 0.5) * noise;

        if (challengeScore > 0.62) {
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
      const playHonestly = bluff.length === 0 || (valid.length > 0 && Math.random() >= profile.bluff);
      const pool = playHonestly ? valid : bluff;
      const picked = chooseUnique(pool.length ? pool : hand.map((_, i) => i), count);
      if (picked.length) client.emit('playCards', { indexes: picked.sort((a, b) => a - b) });
    }

    client.on('connect', () => {
      client.emit('joinRoom', {
        name: profile.name,
        character: profile.character,
        skin: 'classic',
        code: roomCode
      });
    });

    client.on('joined', data => {
      playerId = data && data.playerId;
      if (!pendingFinished) {
        pendingFinished = true;
        finishPending(roomCode);
      }
      client.emit('setReady', true);
    });

    client.on('connect_error', () => {
      if (!playerId) stop();
    });

    client.on('roomError', () => stop());

    client.on('gameState', state => {
      if (closed || !state) return;
      latestState = state;
      rememberPlay(state);

      if (state.phase === 'finished') {
        clearTimeout(actionTimer);
        // Keep the bot in the results room briefly so the human can read the result.
        if (!finishTimer) finishTimer = setTimeout(() => stop(true), 45000);
        return;
      }
      if (state.phase !== 'playing' || !playerId) return;

      if (state.begging && state.begging.toId === playerId) {
        const requestId = state.begging.id;
        setTimeout(() => {
          if (closed || latestState?.begging?.id !== requestId) return;
          client.emit('begDecision', { accept: Math.random() < 0.38 });
        }, randomBetween(750, 1550));
      }

      if (state.currentId !== playerId) return;
      const key = [state.gameId, state.round, state.pileCount, state.currentId, state.lastPlay?.playerId || 'none'].join('|');
      if (key === currentTurnKey) return;
      currentTurnKey = key;
      clearTimeout(actionTimer);
      actionTimer = setTimeout(() => {
        if (closed) return;
        act(latestState);
      }, randomBetween(950, 2100));
    });
  }

  io.on('connection', socket => {
    socket.on('addBots', data => {
      const room = getRoomForSocket(socket);
      const requesterId = socket.data && socket.data.playerId;

      if (!room || !requesterId || room.hostId !== requesterId) {
        socket.emit('botsError', { message: 'Добавлять ботов может только создатель комнаты.' });
        return;
      }
      if (room.game) {
        socket.emit('botsError', { message: 'Ботов можно добавлять только до начала матча.' });
        return;
      }

      const difficulty = ['easy', 'normal', 'hard'].includes(data?.diff) ? data.diff : 'normal';
      const requested = Math.max(1, Math.min(3, Number(data?.count) || 1));
      const pending = pendingByRoom.get(room.code) || 0;
      const freeSeats = Math.max(0, maxPlayers - room.players.length - pending);
      const actualCount = Math.min(requested, freeSeats);

      if (!actualCount) {
        socket.emit('botsError', { message: 'В комнате больше нет свободных мест.' });
        return;
      }

      pendingByRoom.set(room.code, pending + actualCount);
      socket.emit('botsQueued', { count: actualCount });

      for (let i = 0; i < actualCount; i++) {
        const source = BOT_PROFILES[botSerial % BOT_PROFILES.length];
        const serial = ++botSerial;
        const profile = {
          name: source.name + (serial > BOT_PROFILES.length ? ' ' + serial : ''),
          character: source.character,
          bluff: source.bluff,
          suspicious: source.suspicious,
          chaos: source.chaos
        };
        setTimeout(() => {
          const liveRoom = getRoomForSocket(socket);
          if (!liveRoom || liveRoom.code !== room.code || liveRoom.game || liveRoom.players.length >= maxPlayers) {
            finishPending(room.code);
            return;
          }
          spawnBot(room.code, profile, difficulty);
        }, i * 420);
      }
    });
  });
}

module.exports = attachBots;
