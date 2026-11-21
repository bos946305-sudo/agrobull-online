/* server-ranked.js — единая рейтинговая очередь для карт, костей и покера. */
'use strict';

const crypto = require('crypto');

module.exports = function attachRanked(io, ctx = {}) {
  const { getRoomForSocket: roomFor, rooms, sendLobby } = ctx;
  if (typeof roomFor !== 'function' || !rooms || typeof sendLobby !== 'function') {
    throw new Error('server-ranked: нужны getRoomForSocket, rooms и sendLobby');
  }

  const EV = {
    queue: 'rankedQueue', cancel: 'rankedCancel', info: 'rankedInfo',
    infoData: 'rankedInfoData', status: 'rankedStatus', found: 'rankedFound',
    error: 'rankedError', left: 'rankedLeft', ...(ctx.events || {})
  };
  const CFG = {
    base: 100, perSec: 20, max: 500, fillAfter: 30, startIn: 5000,
    pairLimit: 5, providerMs: 1500, cacheMs: 20000, ...(ctx.window || {})
  };
  // Keep the queue modes aligned with server-accounts settlement and the client UI.
  const MODES = ctx.modes || ['cards', 'dice', 'poker'];
  const SIZES = [2, 4];
  const LOCKED = [
    // Manual starts/rematches must not override the mode selected by ranked matchmaking.
    'startGame', 'diceStart', 'pokerStart',
    'addBots', 'setSettings', 'kick', 'rematch', 'diceRematch', 'pokerRematch',
    ...(ctx.lockedEvents || [])
  ];
  const CHARS = ['walter', 'saul', 'jesse', 'gus'];
  const SKINS = ['classic', 'hazmat', 'lawyer', 'neon', 'copper', 'midnight'];
  // Resolve the provider when it is used, not when this module is attached.
  // server-accounts may finish wiring io.rankedProvider after other modules attach.
  function getProvider() {
    const candidates = [ctx.provider, io.rankedProvider];
    return candidates.find(candidate =>
      candidate &&
      typeof candidate.getRating === 'function' &&
      typeof candidate.getPairCount === 'function'
    ) || null;
  }

  function hasProviderMethod(method) {
    const current = getProvider();
    return !!(current && typeof current[method] === 'function');
  }

  async function providerCall(method, ...args) {
    const current = getProvider();
    if (!current || typeof current[method] !== 'function') {
      throw new Error('ranked-provider-' + method + '-unavailable');
    }
    return withTimeout(() => current[method](...args));
  }

  let queue = [];
  let seq = 0;
  let busy = false;
  const pairs = new Map();
  const getAccountId = ctx.getAccountId || (socket => socket.data && socket.data.accountId);
  const alive = entry => queue.includes(entry) && entry.socket.connected &&
    !entry.socket.data.roomCode && entry.socket.data._rankedTicket === entry.ticket;
  const waited = entry => Math.max(0, (Date.now() - entry.since) / 1000);
  const windowFor = entry => Math.min(CFG.max, CFG.base + CFG.perSec * waited(entry));
  const pairKey = (a, b) => [String(a), String(b)].sort().join('|');
  const unlist = socket => { queue = queue.filter(entry => entry.socket !== socket); };
  const roomCode = () => {
    let code;
    do { code = crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase(); }
    while (rooms.has(code));
    return code;
  };

  async function withTimeout(fn) {
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(fn),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('provider-timeout')), CFG.providerMs);
          if (timer.unref) timer.unref();
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function pairCount(a, b) {
    const key = pairKey(a, b);
    const cached = pairs.get(key);
    if (cached && Date.now() - cached.at < CFG.cacheMs) return cached.count;
    try {
      const rawCount = await providerCall('getPairCount', a, b);
      if (rawCount === null || rawCount === undefined || rawCount === '') return null;
      const count = Number(rawCount);
      if (!Number.isFinite(count) || count < 0) return null;
      pairs.set(key, { count, at: Date.now() });
      return count;
    } catch (error) {
      console.error('[ranked] pair counter unavailable:', error.message);
      return null;
    }
  }

  const ratingCompatible = (a, b) =>
    a.accountId !== b.accountId &&
    Math.abs(a.rating - b.rating) <= Math.min(windowFor(a), windowFor(b));

  const compatible = (a, b) => {
    const count = pairs.get(pairKey(a.accountId, b.accountId));
    return ratingCompatible(a, b) && !!count && count.count < CFG.pairLimit;
  };

  function pick(group) {
    for (const pivot of group) {
      const selected = [pivot];
      const candidates = group.filter(item => item !== pivot)
        .sort((a, b) => Math.abs(a.rating - pivot.rating) - Math.abs(b.rating - pivot.rating));
      for (const candidate of candidates) {
        if (selected.length >= pivot.want) break;
        if (selected.every(item => compatible(item, candidate))) selected.push(candidate);
      }
      if (selected.length === pivot.want ||
          (pivot.want === 4 && selected.length >= 2 && waited(pivot) >= CFG.fillAfter)) {
        return selected;
      }
    }
    return null;
  }

  function defaultCreateRoom({ entries, mode }) {
    const code = roomCode();
    const players = entries.map(entry => ({
      id: crypto.randomBytes(6).toString('hex'),
      socketId: entry.socket.id,
      accountId: entry.accountId,
      ratings: { [mode]: entry.rating },
      rating: entry.rating,
      name: entry.name,
      character: entry.character,
      skin: entry.skin,
      ready: true, connected: true, alive: true, rides: 0,
      fallAt: 2 + Math.floor(Math.random() * 4),
      hand: [], abilityUsed: false
    }));
    const room = { code, hostId: players[0].id, players, game: null, ranked: { mode } };
    rooms.set(code, room);
    entries.forEach((entry, index) => {
      const socket = entry.socket;
      socket.data.roomCode = code;
      socket.data.playerId = players[index].id;
      socket.join(code);
      socket.emit('joined', { playerId: players[index].id, roomCode: code });
    });
    sendLobby(room);
    return room;
  }

  function defaultStart(room, mode) {
    if (mode === 'cards' && typeof io.startCardsRoom === 'function') return io.startCardsRoom(room);
    if (mode === 'dice' && typeof io.startDiceRoom === 'function') return io.startDiceRoom(room);
    if (mode === 'poker' && typeof io.startPokerRoom === 'function') return io.startPokerRoom(room);
    console.error('[ranked] no public start function for mode:', mode);
    return false;
  }

  function makeRoom(selected, mode) {
    const room = (ctx.createRoom || defaultCreateRoom)({ entries: selected, mode });
    if (!room || !room.code) throw new Error('Не удалось создать рейтинговую комнату');
    selected.forEach(entry => unlist(entry.socket));
    room.ranked = { mode };
    io.to(room.code).emit(EV.found, {
      mode,
      startsIn: Math.ceil(CFG.startIn / 1000),
      players: selected.map(entry => ({ name: entry.name, rating: entry.rating }))
    });
    const code = room.code;
    setTimeout(() => {
      if (rooms.get(code) !== room || room.players.length < 2 || room.game ||
          (room.dice && room.dice.phase !== 'finished') ||
          (room.poker && room.poker.phase !== 'finished')) return;
      if (!room.players.every(player => player.connected !== false && player.ready)) return;
      (ctx.startMatch || defaultStart)(room, mode);
    }, CFG.startIn);
    return room;
  }

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      queue = queue.filter(entry => entry.socket.connected &&
        !entry.socket.data.roomCode && entry.socket.data._rankedTicket === entry.ticket);
      for (const mode of MODES) {
        for (const want of SIZES) {
          let group = queue.filter(entry => entry.mode === mode && entry.want === want)
            .sort((a, b) => a.since - b.since);
          if (group.length < 2) continue;

          const requiredPairs = new Map();
          for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
              if (ratingCompatible(group[i], group[j])) {
                requiredPairs.set(pairKey(group[i].accountId, group[j].accountId),
                  [group[i].accountId, group[j].accountId]);
              }
            }
          }
          await Promise.all([...requiredPairs.values()].map(([a, b]) => pairCount(a, b)));
          group = group.filter(alive);

          let match;
          while ((match = pick(group))) {
            if (!match.every(alive)) {
              group = group.filter(alive);
              continue;
            }
            try {
              makeRoom(match, mode);
            } catch (error) {
              console.error('[ranked] room creation failed:', error.message);
              match.forEach(entry => {
                if (alive(entry)) entry.socket.emit(EV.error, { message: 'Не удалось создать комнату. Попробуй ещё раз.' });
              });
              break;
            }
            group = group.filter(entry => !match.includes(entry) && alive(entry));
          }
        }
      }
      for (const entry of queue) {
        entry.socket.emit(EV.status, {
          mode: entry.mode, want: entry.want,
          waited: Math.floor(waited(entry)),
          window: Math.round(windowFor(entry)),
          queued: queue.filter(other => other.mode === entry.mode && other.want === entry.want).length
        });
      }
    } catch (error) {
      console.error('[ranked] queue tick failed:', error);
    } finally {
      busy = false;
    }
  }

  io.rankedInvalidatePairs = accountIds => {
    const ids = new Set((accountIds || []).map(String));
    for (const key of pairs.keys()) {
      const [a, b] = key.split('|');
      if (ids.has(a) && ids.has(b)) pairs.delete(key);
    }
  };

  io.on('connection', socket => {
    const fail = message => socket.emit(EV.error, { message });
    socket.use(([event, data], next) => {
      if (['createRoom', 'joinRoom', 'quickPlay'].includes(event)) {
        socket.data._rankedTicket = ++seq;
        const wasQueued = queue.some(entry => entry.socket === socket);
        unlist(socket);
        if (wasQueued) socket.emit(EV.left);
      }
      if (event === 'joinRoom') {
        const code = String(data && data.code || '').trim().toUpperCase().slice(0, 4);
        const target = rooms.get(code);
        if (target && target.ranked) {
          socket.emit('roomError', { message: 'Это рейтинговая комната — вход только через очередь.' });
          return next(new Error('ranked-locked'));
        }
      }
      if (LOCKED.includes(event)) {
        const room = roomFor(socket);
        if (room && room.ranked) {
          socket.emit('roomError', { message: 'В рейтинговой комнате это недоступно.' });
          return next(new Error('ranked-locked'));
        }
      }
      next();
    });

    socket.on(EV.info, async () => {
      const accountId = getAccountId(socket);
      if (!accountId) return socket.emit(EV.infoData, { loggedIn: false });
      try {
        const ratings = {};
        for (const mode of MODES) {
          const rawRating = await providerCall('getRating', accountId, mode);
          if (rawRating === null || rawRating === undefined || rawRating === '') throw new Error('rating-unavailable');
          const rating = Number(rawRating);
          if (!Number.isFinite(rating)) throw new Error('rating-unavailable');
          ratings[mode] = rating;
        }
        const name = hasProviderMethod('getName')
          ? await providerCall('getName', accountId).catch(() => null)
          : null;
        socket.emit(EV.infoData, { loggedIn: true, name, ratings });
      } catch (_) {
        fail('Сервис рейтинга временно недоступен. Попробуй чуть позже.');
      }
    });

    socket.on(EV.queue, async (data = {}) => {
      const accountId = getAccountId(socket);
      if (!accountId) return fail('Для рейтинговой игры нужен аккаунт — войди или зарегистрируйся.');
      if (socket.data.roomCode) return fail('Сначала выйди из текущей комнаты.');
      const mode = MODES.includes(data.mode) ? data.mode : MODES[0];
      const want = Number(data.want) === 4 ? 4 : 2;
      const ticket = socket.data._rankedTicket = ++seq;
      if (ctx.guard) {
        try {
          const guardError = await ctx.guard(socket);
          if (guardError) return fail(guardError);
        } catch (_) {
          return fail('Не удалось проверить доступ к рейтинговой игре.');
        }
      }
      if (socket.data._rankedTicket !== ticket || !socket.connected || socket.data.roomCode) return;

      let rating;
      let name = null;
      try {
        const rawRating = await providerCall('getRating', accountId, mode);
        if (rawRating === null || rawRating === undefined || rawRating === '') return fail('Рейтинг не найден — войди заново.');
        rating = Number(rawRating);
        if (!Number.isFinite(rating)) return fail('Рейтинг не найден — войди заново.');
        if (hasProviderMethod('getName')) name = await providerCall('getName', accountId).catch(() => null);
      } catch (_) {
        return fail('Сервис рейтинга временно недоступен. Попробуй чуть позже.');
      }
      if (socket.data._rankedTicket !== ticket || !socket.connected || socket.data.roomCode) return;

      // One account can occupy only one queue position, even across multiple sockets.
      queue = queue.filter(entry => {
        const duplicate = entry.accountId === accountId || entry.socket === socket;
        if (duplicate && entry.socket.connected) entry.socket.emit(EV.left);
        return !duplicate;
      });
      const entry = {
        socket, accountId, mode, want, rating, since: Date.now(), ticket,
        name: String(name || data.name || 'Игрок').slice(0, 16),
        character: CHARS.includes(data.character) ? data.character : 'walter',
        skin: SKINS.includes(data.skin) ? data.skin : 'classic'
      };
      queue.push(entry);
      socket.emit(EV.status, {
        mode, want, waited: 0, window: Math.round(windowFor(entry)),
        queued: queue.filter(other => other.mode === mode && other.want === want).length
      });
    });

    socket.on(EV.cancel, () => {
      socket.data._rankedTicket = ++seq;
      unlist(socket);
      socket.emit(EV.left);
    });
    socket.on('disconnect', () => {
      socket.data._rankedTicket = ++seq;
      unlist(socket);
    });
  });

  const timer = setInterval(tick, 1000);
  if (timer.unref) timer.unref();
  io.ranked = {
    tick,
    size: () => queue.length,
    close: () => clearInterval(timer)
  };
};
