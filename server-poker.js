/* server-poker.js — server-authoritative 36-card bluff poker. */
'use strict';

const P = require('./poker-core');
const HAND_SIZE = 5;
const START_LIVES = 3;
const TURN_MS = 25000;
const REVEAL_MS = 3500;

module.exports = function attachPoker(io, ctx = {}) {
  const { getRoomForSocket: roomFor, rooms, sendLobby } = ctx;
  if (typeof roomFor !== 'function' || !rooms) throw new TypeError('server-poker: pass getRoomForSocket and rooms');
  const playerById = (room, id) => room.players.find(p => p.id === id);
  const alive = room => room.players.filter(p => p.pokerAlive !== false);
  const shuffle = deck => {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  };
  const nextAlive = (room, afterId) => {
    const list = room.players;
    const start = Math.max(0, list.findIndex(p => p.id === afterId));
    for (let step = 1; step <= list.length; step++) {
      const p = list[(start + step) % list.length];
      if (p && p.pokerAlive !== false) return p;
    }
    return null;
  };
  function snapshot(room, viewerId) {
    const game = room.poker;
    return {
      roomCode: room.code, phase: game.phase, ranked: !!room.ranked,
      round: game.round, turnId: game.turnId, deadline: game.deadline,
      ms: game.phase === 'playing' ? Math.max(0, game.deadline - Date.now()) : 0,
      claim: game.claim ? { ...game.claim, label: P.label(game.claim), by: game.claimBy } : null,
      message: game.message, reveal: game.reveal, winnerId: game.winnerId,
      claims: P.ALL.map(c => ({ ...c, label: P.label(c) })),
      players: room.players.map(p => ({
        id: p.id, name: p.name, character: p.character, skin: p.skin,
        lives: p.pokerLives, alive: p.pokerAlive !== false,
        handCount: (p.pokerHand || []).length,
        hand: p.id === viewerId ? (p.pokerHand || []).map(P.cardName) : undefined
      }))
    };
  }
  function send(room) {
    for (const p of room.players) if (p.socketId) io.to(p.socketId).emit('pokerState', snapshot(room, p.id));
  }
  function finish(room, winnerId) {
    const game = room.poker;
    if (!game || game.phase === 'finished') return;
    clearTimeout(game.timer);
    game.phase = 'finished'; game.turnId = null; game.deadline = 0;
    game.winnerId = winnerId || null;
    game.message = winnerId ? (playerById(room, winnerId)?.name || 'Игрок') + ' победил в покере!' : 'Игра завершена';
    send(room);
    if (typeof io.settleRankedRoom === 'function') {
      io.settleRankedRoom(room, winnerId || null, 'poker', game.matchId).catch(error =>
        console.error('[accounts] poker result settlement failed:', error && error.message || error));
    }
  }
  function deal(room, starterId) {
    const active = alive(room);
    if (active.length <= 1) return finish(room, active[0]?.id || null);
    const deck = shuffle(P.newDeck());
    for (const p of room.players) p.pokerHand = [];
    for (let i = 0; i < HAND_SIZE; i++) for (const p of active) p.pokerHand.push(deck.pop());
    const starter = starterId ? nextAlive(room, starterId) : active[0];
    const game = room.poker;
    game.round++;
    game.phase = 'playing'; game.turnId = (starter || active[0]).id;
    game.claim = null; game.claimBy = null; game.reveal = null;
    game.message = 'Раунд ' + game.round + '. Сделай заявку или проверь блеф.';
    arm(room);
    send(room);
  }
  function arm(room) {
    const game = room.poker;
    clearTimeout(game.timer);
    game.deadline = Date.now() + TURN_MS;
    game.timer = setTimeout(() => {
      if (rooms.get(room.code) !== room || room.poker !== game || game.phase !== 'playing') return;
      const current = playerById(room, game.turnId);
      if (!current) return finish(room, alive(room)[0]?.id || null);
      if (!game.claim) {
        const first = P.ALL[0];
        claim(room, current.id, first);
      } else {
        challenge(room, current.id, true);
      }
    }, TURN_MS);
    if (game.timer.unref) game.timer.unref();
  }
  function startPoker(room) {
    if (!room || rooms.get(room.code) !== room || room.poker && room.poker.phase !== 'finished' ||
        room.players.length < 2 || room.players.length > 4 ||
        !room.players.every(p => p.ready && p.connected !== false)) return false;
    if (room.game && room.game.phase !== 'finished') return false;
    if (room.dice && room.dice.phase !== 'finished') return false;
    room.game = null; room.dice = null;
    if (typeof io.prepareRankedRoom === 'function') io.prepareRankedRoom(room, 'poker');
    room.rankedMode = 'poker';
    room.players.forEach(p => { p.pokerLives = START_LIVES; p.pokerAlive = true; p.pokerHand = []; });
    room.poker = {
      matchId: room.code + '-poker-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      phase: 'playing', round: 0, turnId: null, claim: null, claimBy: null,
      reveal: null, winnerId: null, deadline: 0, timer: null
    };
    deal(room, null);
    return true;
  }
  io.startPokerRoom = startPoker;

  function claim(room, playerId, rawClaim) {
    const game = room.poker;
    if (!game || game.phase !== 'playing' || game.turnId !== playerId) return 'Сейчас не твой ход';
    const normalized = P.norm(rawClaim);
    if (!normalized) return 'Некорректная заявка';
    if (game.claim && P.cmp(normalized, game.claim) <= 0) return 'Новая заявка должна быть выше предыдущей';
    game.claim = normalized; game.claimBy = playerId;
    game.message = (playerById(room, playerId)?.name || 'Игрок') + ' заявляет: ' + P.label(normalized);
    game.turnId = (nextAlive(room, playerId) || {}).id || null;
    if (!game.turnId) return finish(room, playerId);
    arm(room); send(room); return null;
  }
  function challenge(room, playerId, automatic = false) {
    const game = room.poker;
    if (!game || game.phase !== 'playing' || game.turnId !== playerId || !game.claim) return 'Проверять пока нечего';
    clearTimeout(game.timer);
    const pool = alive(room).flatMap(p => p.pokerHand || []);
    const trueClaim = P.holds(game.claim, pool);
    const loserId = trueClaim ? playerId : game.claimBy;
    const loser = playerById(room, loserId);
    if (loser) {
      loser.pokerLives = Math.max(0, (loser.pokerLives || 0) - 1);
      if (!loser.pokerLives) loser.pokerAlive = false;
    }
    game.phase = 'reveal'; game.turnId = null; game.deadline = 0;
    game.reveal = {
      claim: { ...game.claim, label: P.label(game.claim) },
      cards: pool.map(P.cardName), trueClaim, loserId,
      callerId: playerId, automatic: !!automatic
    };
    game.message = trueClaim
      ? 'Заявка верна! Проверявший теряет жизнь.'
      : 'Это был блеф! Последний заявивший теряет жизнь.';
    send(room);
    const code = room.code, round = game.round;
    game.timer = setTimeout(() => {
      if (rooms.get(code) !== room || room.poker !== game || game.phase !== 'reveal' || game.round !== round) return;
      const remaining = alive(room);
      if (remaining.length <= 1) return finish(room, remaining[0]?.id || null);
      deal(room, loserId);
    }, REVEAL_MS);
    if (game.timer.unref) game.timer.unref();
    return null;
  }
  io.pokerPlayerLeft = (room, playerId) => {
    const game = room && room.poker;
    if (!game || game.phase === 'finished') return;
    const player = playerById(room, playerId);
    if (player) { player.pokerAlive = false; player.pokerLives = 0; }
    if (alive(room).length <= 1) return finish(room, alive(room)[0]?.id || null);
    if (game.phase === 'playing' && game.turnId === playerId) {
      game.turnId = (nextAlive(room, playerId) || {}).id || null;
      if (!game.turnId) return finish(room, null);
      arm(room);
    }
    send(room);
  };

  io.on('connection', socket => {
    const error = message => socket.emit('roomError', { message });
    socket.on('pokerStart', () => {
      const room = roomFor(socket);
      if (!room || socket.data.playerId !== room.hostId) return error('Начать может только хост.');
      if (!startPoker(room)) return error('Нужно 2–4 готовых игрока. Заверши текущую игру перед стартом покера.');
      if (sendLobby) sendLobby(room);
    });
    socket.on('pokerClaim', data => {
      const room = roomFor(socket);
      if (!room) return error('Ты не в комнате.');
      const message = claim(room, socket.data.playerId, data && data.claim);
      if (message) error(message);
    });
    socket.on('pokerCall', () => {
      const room = roomFor(socket);
      if (!room) return error('Ты не в комнате.');
      const message = challenge(room, socket.data.playerId);
      if (message) error(message);
    });
    socket.on('pokerRematch', () => {
      const room = roomFor(socket);
      if (!room || !room.poker || room.poker.phase !== 'finished' || socket.data.playerId !== room.hostId) return;
      room.poker = null;
      startPoker(room);
    });
  });
  const timer = setInterval(() => {
    for (const room of rooms.values()) {
      const game = room.poker;
      if (game && game.phase === 'playing' && game.deadline && Date.now() > game.deadline + 1000) {
        const player = playerById(room, game.turnId);
        if (player && player.connected === false) {
          if (game.claim) challenge(room, player.id, true);
          else claim(room, player.id, P.ALL[0]);
        }
      }
    }
  }, 1000);
  if (timer.unref) timer.unref();
};
