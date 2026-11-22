'use strict';

const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 3000);
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const CROPS = [
  { id: 'w', name: 'Пшеница', icon: '🌾' },
  { id: 'c', name: 'Кукуруза', icon: '🌽' },
  { id: 'k', name: 'Морковь', icon: '🥕' }
];
const rooms = new Map();
const quickQueue = [];
const { findBestQueueMatch, queueStatus } = require('./quick-matchmaking');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { serveClient: true, maxHttpBufferSize: 1e5, pingInterval: 10000, pingTimeout: 8000, cors: { origin: true, credentials: false } });
require('./server-accounts')(io, { rooms, sendLobby });
require('./server-bots')(io, { getRoomForSocket: roomFor, maxPlayers: MAX_PLAYERS });
require('./server-modes')(io, { getRoomForSocket: roomFor, maxPlayers: MAX_PLAYERS });
require('./server-resilience')(io, { getRoomForSocket: roomFor, maxPlayers: MAX_PLAYERS, rooms, broadcastState, sendLobby, leaveCurrentRoom });
require('./server-dice')(io, { getRoomForSocket: roomFor, rooms, sendLobby, publicLobby });
require('./server-poker')(io, { getRoomForSocket: roomFor, rooms, sendLobby, publicLobby });

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', setHeaders(res, filePath) { if (/\.(?:html|js)$/i.test(filePath)) { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'); res.setHeader('Pragma', 'no-cache'); res.setHeader('Expires', '0'); } } }));
app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'AGROBULL online',
  rooms: rooms.size,
  accountsDatabaseConfigured: !!io.accountDatabaseReady
}));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

function id() { return crypto.randomBytes(6).toString('hex'); }
function roomCode() {
  let code;
  do { code = crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase(); } while (rooms.has(code));
  return code;
}
function safeText(value, fallback, max = 18) {
  const clean = String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
  return clean || fallback;
}
function profileFrom(data = {}) {
  const allowedCharacters = new Set(['walter', 'saul', 'jesse', 'gus']);
  const allowedSkins = new Set(['classic', 'hazmat', 'lawyer', 'neon', 'copper', 'midnight']);
  const character = allowedCharacters.has(data.character) ? data.character : 'walter';
  const skin = allowedSkins.has(data.skin) ? data.skin : 'classic';
  return { name: safeText(data.name, 'Игрок'), character, skin };
}
function profileForSocket(socket, data = {}) {
  const profile = profileFrom(data);
  const account = socket.data && socket.data.account;
  if (account) profile.name = safeText(account.name, profile.name);
  return {
    ...profile,
    accountId: account ? account.id : null,
    ratings: account ? account.ratings : null,
    rating: account ? Number(account.ratings.cards) || 1000 : null
  };
}
function skillFor(player) {
  return ({
    walter: { id: 'swap', name: 'Химический обмен', hint: 'Поменять одну карту на случайную карту соперника' },
    saul: { id: 'beg', name: 'Адвокатская мольба', hint: 'Попросить соперника не проверять блеф' },
    jesse: { id: 'peek', name: 'Подглядеть', hint: 'Тайно посмотреть карты одного соперника' },
    gus: { id: 'revive', name: 'Второе дыхание', hint: 'Один раз пережить решающий сброс с быка' }
  })[player.character] || { id: 'peek', name: 'Подглядеть', hint: 'Тайно посмотреть карты соперника' };
}
function roomFor(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}
function publicLobby(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    ranked: !!room.ranked,
    pokerActive: !!(room.poker && room.poker.phase !== 'finished'),
    players: room.players.map(p => ({
      id: p.id, name: p.name, character: p.character, skin: p.skin,
      rating: Number.isFinite(p.rating) ? p.rating : null,
      ready: p.ready, isHost: p.id === room.hostId, connected: p.connected
    })),
    maxPlayers: typeof io.settingsOf === 'function' ? io.settingsOf(room.code).maxPlayers : MAX_PLAYERS,
    canStart: room.players.length >= MIN_PLAYERS && room.players.every(p => p.ready && p.connected)
  };
}
function sendLobby(room) {
  io.to(room.code).emit('lobby', publicLobby(room));
}
function playerById(room, playerId) { return room.players.find(p => p.id === playerId); }
function activePlayers(room) { return room.players.filter(p => p.alive); }
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
function personalizedState(room, viewerId) {
  const game = room.game;
  if (!game) return { roomCode: room.code, phase: 'lobby', lobby: publicLobby(room) };
  return {
    roomCode: room.code,
    phase: game.phase,
    gameId: game.gameId,
    ranked: !!room.ranked,
    round: game.round,
    table: game.table,
    table2: game.table2 || null,
    event: game.event || null,
    dir: game.dir === -1 ? -1 : 1,
    pileCount: game.pileCount,
    currentId: game.currentId,
    lastPlay: game.lastPlay ? {
      playerId: game.lastPlay.playerId,
      count: game.lastPlay.cards.length,
      cards: game.reveal ? game.lastPlay.cards : null,
      revealed: !!game.reveal
    } : null,
    reveal: game.reveal,
    message: game.message,
    rodeo: game.rodeo,
    begging: game.begging ? { id: game.begging.id, fromId: game.begging.fromId, toId: game.begging.toId, expiresAt: game.begging.expiresAt } : null,
    winnerId: game.winnerId,
    players: room.players.map(p => ({
      id: p.id, name: p.name, character: p.character, skin: p.skin,
      rating: Number.isFinite(p.rating) ? p.rating : null,
      alive: p.alive, rides: p.rides, fallAt: 6,
      handCount: p.hand.length,
      ability: skillFor(p),
      abilityUsed: !!p.abilityUsed,
      cursed: !!p.cursed,
      hand: p.id === viewerId ? p.hand : undefined,
      ready: p.ready
    }))
  };
}
function broadcastState(room) {
  for (const p of room.players) {
    if (p.socketId) io.to(p.socketId).emit('gameState', personalizedState(room, p.id));
  }
}
function nextPlayerWithCards(room, afterId) {
  const n = room.players.length;
  const start = Math.max(0, room.players.findIndex(p => p.id === afterId));
  for (let step = 1; step <= n; step++) {
    const dir = (room.game && room.game.dir === -1) ? -1 : 1;
    const p = room.players[(((start + dir * step) % n) + n) % n];
    if (p && p.alive && p.hand.length > 0) return p;
  }
  return null;
}
function finishGame(room, winnerId) {
  if (!room.game || room.game.phase === 'finished') return;
  room.game.phase = 'finished';
  room.game.currentId = null;
  room.game.winnerId = winnerId || null;
  room.game.message = winnerId ? `${playerById(room, winnerId)?.name || 'Игрок'} победил!` : 'Игра завершена';
  broadcastState(room);
  if (typeof io.settleRankedRoom === 'function') {
    io.settleRankedRoom(room, winnerId || null, 'cards', room.game.gameId).catch(error => {
      console.error('[accounts] card result settlement failed:', error && error.message || error);
    });
  }
}
function dealRound(room, afterId = null) {
  const alive = activePlayers(room);
  if (alive.length <= 1) {
    finishGame(room, alive[0]?.id || null);
    return;
  }
  const deck = [];
  for (const crop of CROPS) for (let i = 0; i < 6; i++) deck.push({ id: crop.id, icon: crop.icon, name: crop.name });
  deck.push({ id: 'b', icon: '🐂', name: 'Бык' }, { id: 'b', icon: '🐂', name: 'Бык' });
  if (io.cardFx) io.cardFx.extendDeck(room, deck);
  shuffle(deck);
  for (const p of room.players) p.hand = [];
  for (let i = 0; i < 5; i++) for (const p of alive) p.hand.push(deck.pop());
  const table = CROPS[Math.floor(Math.random() * CROPS.length)];
  if (room.game) room.game.dir = 1;
  let first = afterId ? nextPlayerWithCards(room, afterId) : alive[0];
  if (!first) first = alive[0];
  const fxInit = io.cardFx ? io.cardFx.roundInit(room, table) : null;
  const previousGameId = room.game?.gameId;
  room.game = {
    gameId: previousGameId || id(),
    phase: 'playing',
    round: (room.game?.round || 0) + 1,
    table,
    pileCount: 0,
    currentId: first.id,
    lastPlay: null,
    reveal: null,
    rodeo: null,
    begging: null,
    winnerId: null,
    message: `Раунд ${((room.game?.round || 0) + 1)}. На столе ${table.name}.`,
    ...(fxInit || {})
  };
  broadcastState(room);
}
function startRoomGame(room) {
  if (!room || rooms.get(room.code) !== room || room.game) return false;
  if (room.players.length < MIN_PLAYERS || !room.players.every(p => p.ready && p.connected)) return false;
  for (const p of room.players) { p.alive = true; p.rides = 0; p.fallAt = 2 + Math.floor(Math.random() * 4); p.abilityUsed = false; p.cursed = false; }
  // Snapshot accounts once at match start; guest and bot matches stay unranked.
  if (typeof io.prepareRankedRoom === 'function') io.prepareRankedRoom(room, 'cards');
  // A room can run only one mode at a time. Clear a finished dice match before cards start.
  room.dice = null;
  room.game = { gameId: id(), round: 0 };
  dealRound(room);
  return true;
}

// Public entry point used by the unified ranked queue (no private Socket.IO listener calls).
io.startCardsRoom = startRoomGame;
require('./server-ranked')(io, { getRoomForSocket: roomFor, rooms, sendLobby });
require('./server-social')(io, { getRoomForSocket: roomFor, rooms, maxPlayers: MAX_PLAYERS });
require('./server-voice')(io, { getRoomForSocket: roomFor });
require('./server-specials')(io, { getRoomForSocket: roomFor, rooms, broadcastState, nextPlayerWithCards, playerById });

function resolveCall(room, caller) {
  const game = room.game;
  const last = game.lastPlay;
  if (!last || game.phase !== 'playing') return;

  // A crop card must match the declared table crop. The bull is a wild card.
  const cardResults = last.cards.map(card => ({
    ...card,
    isWild: card.id === 'b' && !(game.event && game.event.id === 'noBull'),
    matchesTable: card.id === game.table.id || (card.id === 'b' && !(game.event && game.event.id === 'noBull')) || (!!game.table2 && card.id === game.table2.id)
  }));
  const falseCards = cardResults.filter(card => !card.matchesTable);
  const validCards = cardResults.filter(card => card.matchesTable);
  const isLie = falseCards.length > 0;
  const playedBy = playerById(room, last.playerId);
  const loser = playerById(room, isLie ? last.playerId : caller.id);
  if (!loser || !loser.alive || !playedBy) return;

  const fxr = io.cardFx ? io.cardFx.beforeRide(room, loser) : { add: 1 };
  loser.rides += fxr.add;
  const out = loser.rides >= loser.fallAt;
  game.phase = 'rodeo';
  game.currentId = null;
  game.reveal = {
    cards: cardResults,
    table: { ...game.table },
    isLie,
    callerId: caller.id,
    callerName: caller.name,
    playedById: playedBy.id,
    playedByName: playedBy.name,
    loserId: loser.id,
    loserName: loser.name,
    falseCards,
    validCards,
    reason: isLie
      ? 'Есть карта, которая не совпадает с культурой на столе. Бык считается джокером.'
      : 'Все карты совпадают с культурой на столе или являются быками.'
  };
  game.rodeo = {
    playerId: loser.id,
    callerId: caller.id,
    level: loser.rides,
    threshold: out ? loser.rides : 6,
    out,
    startedAt: Date.now(),
    isLie,
    playedById: playedBy.id,
    falseCardCount: falseCards.length,
    added: fxr.add
  };
  game.message = isLie
    ? `БЛЕФ РАСКРЫТ: ${playedBy.name} положил ${falseCards.map(card => card.name).join(', ')} вместо ${game.table.name}. ${caller.name} правильно раскрыл блеф — ${loser.name} на быка!`
    : `ОБВИНЕНИЕ ОШИБОЧНО: карты ${playedBy.name} соответствуют столу (${game.table.name}) или являются быками. ${caller.name} ошибся — на быка!`;
  if (io.cardFx) io.cardFx.afterCall(room, { loser, caller, playedBy, fxr });
  broadcastState(room);
  broadcastState(room);

  const code = room.code;
  const gameId = game.gameId;
  setTimeout(() => {
    const currentRoom = rooms.get(code);
    if (!currentRoom || !currentRoom.game || currentRoom.game.gameId !== gameId || currentRoom.game.phase !== 'rodeo') return;
    const rd = currentRoom.game.rodeo || {};
    const target = playerById(currentRoom, rd.playerId || loser.id);
    if (target && (rd.out !== undefined ? rd.out : out) && !rd.saved) target.alive = false;
    if (activePlayers(currentRoom).length <= 1) {
      finishGame(currentRoom, activePlayers(currentRoom)[0]?.id || null);
      return;
    }
    dealRound(currentRoom, rd.playerId || loser.id);
  }, 5200);
}
function removeQuickQueue(socket, notify = false) {
  let removed = false;
  for (let i = quickQueue.length - 1; i >= 0; i--) {
    if (quickQueue[i].socket === socket) {
      quickQueue.splice(i, 1);
      removed = true;
    }
  }
  if (removed && notify && socket.connected) socket.emit('quickSearchCancelled');
  return removed;
}

function publishQuickQueueStatus() {
  const now = Date.now();
  for (let i = quickQueue.length - 1; i >= 0; i--) {
    const entry = quickQueue[i];
    if (!entry.socket.connected || entry.socket.data.roomCode) {
      quickQueue.splice(i, 1);
      continue;
    }
    entry.socket.emit('quickQueueStatus', queueStatus(entry, now));
  }
}
const quickQueueHeartbeat = setInterval(publishQuickQueueStatus, 2500);
if (typeof quickQueueHeartbeat.unref === 'function') quickQueueHeartbeat.unref();

function roomError(socket, message) { socket.emit('roomError', { message }); }

io.on('connection', socket => {
  // Room-scoped emoji relay. Sender identity is taken from the authenticated room session.
  const allowedEmotes = new Set(['😂', '🤡', '💀', '🍅', '🥚', '🔥', '😡', '👍']);
  socket.on('emote', (data = {}) => {
    const room = roomFor(socket);
    const sender = room && playerById(room, socket.data.playerId);
    if (!room || !sender || !allowedEmotes.has(data.e)) return;
    const targetId = String(data.to || '');
    const target = playerById(room, targetId);
    if (!target || target.id === sender.id) return;
    const now = Date.now();
    if (socket.data.lastEmoteAt && now - socket.data.lastEmoteAt < 650) return;
    socket.data.lastEmoteAt = now;
    socket.to(room.code).emit('emote', { from: sender.id, to: target.id, e: data.e });
  });

  socket.on('rankedQueue', () => {
    // A socket may search in exactly one matchmaking queue at a time.
    removeQuickQueue(socket, true);
  });

  socket.on('quickSearchCancel', () => {
    removeQuickQueue(socket, true);
  });

  socket.on('quickPlay', (data = {}) => {
    if (socket.data.roomCode) return roomError(socket, 'Сначала выйди из текущей комнаты.');
    removeQuickQueue(socket);
    const profile = profileForSocket(socket, data);
    const mode = data.mode === 'dice' ? 'dice' : 'cards';
    const accountId = profile.accountId;
    if (accountId) return roomError(socket, 'Для рейтингового поиска используй кнопку «Рейтинговая игра». Быстрый поиск оставлен для гостей.');
    const rating = 1000;
    const now = Date.now();
    const currentEntry = { socket, profile, accountId, rating, mode, queuedAt: now };

    // Prune stale sockets before searching. Rated and guest queues stay isolated.
    for (let i = quickQueue.length - 1; i >= 0; i--) {
      const candidate = quickQueue[i];
      if (!candidate.socket.connected || candidate.socket.data.roomCode) quickQueue.splice(i, 1);
    }
    const match = findBestQueueMatch(quickQueue, currentEntry, now);
    const waiting = match && match.entry;
    const waitingIndex = match ? match.index : -1;

    if (waitingIndex >= 0) quickQueue.splice(waitingIndex, 1);
    if (!waiting) {
      quickQueue.push(currentEntry);
      const status = queueStatus(currentEntry, now);
      socket.emit('quickSearching', status);
      socket.emit('quickQueueStatus', status);
      return;
    }

    const code = roomCode();
    const hostPlayer = {
      id: id(), socketId: waiting.socket.id, ...waiting.profile,
      ready: true, connected: true, alive: true, rides: 0,
      fallAt: 2 + Math.floor(Math.random() * 4), hand: [], abilityUsed: false
    };
    const guestPlayer = {
      id: id(), socketId: socket.id, ...profile,
      ready: true, connected: true, alive: true, rides: 0,
      fallAt: 2 + Math.floor(Math.random() * 4), hand: [], abilityUsed: false
    };
    const ranked = !!(hostPlayer.accountId && guestPlayer.accountId);
    const room = {
      code,
      hostId: hostPlayer.id,
      players: [hostPlayer, guestPlayer],
      game: null,
      quickMode: mode,
      ranked,
      rankedResultRecorded: false,
      rankedAccounts: ranked ? [
        { accountId: hostPlayer.accountId, rating: hostPlayer.rating },
        { accountId: guestPlayer.accountId, rating: guestPlayer.rating }
      ] : []
    };
    rooms.set(code, room);
    waiting.socket.data.roomCode = code;
    waiting.socket.data.playerId = hostPlayer.id;
    socket.data.roomCode = code;
    socket.data.playerId = guestPlayer.id;
    waiting.socket.join(code);
    socket.join(code);
    waiting.socket.emit('joined', { playerId: hostPlayer.id, roomCode: code });
    socket.emit('joined', { playerId: guestPlayer.id, roomCode: code });
    sendLobby(room);

    const countdownSeconds = 8;
    io.to(code).emit('quickMatchFound', {
      mode, ranked: !!room.ranked, countdown: countdownSeconds,
      ratingDistance: match ? match.distance : 0
    });
    for (let seconds = countdownSeconds - 1; seconds >= 1; seconds--) {
      setTimeout(() => {
        if (rooms.get(code) === room && !room.game &&
            !(room.dice && room.dice.phase !== 'finished')) {
          io.to(code).emit('quickMatchCountdown', { mode, seconds });
        }
      }, (countdownSeconds - seconds) * 1000);
    }
    setTimeout(() => {
      if (rooms.get(code) !== room) return;
      if (mode === 'dice') {
        if (typeof io.startDiceRoom === 'function') io.startDiceRoom(room);
      } else {
        startRoomGame(room);
      }
    }, countdownSeconds * 1000);
  });

  socket.on('tableGesture', (data = {}) => {
    const room = roomFor(socket);
    const sender = room && playerById(room, socket.data.playerId);
    if (!room || !sender || !['tap', 'slam'].includes(data.action)) return;
    const now = Date.now();
    if (socket.data.lastTableGestureAt && now - socket.data.lastTableGestureAt < 650) return;
    socket.data.lastTableGestureAt = now;
    socket.to(room.code).emit('tableGesture', { from: sender.id, action: data.action });
  });

  socket.on('createRoom', (data = {}) => {
    removeQuickQueue(socket, true);
    if (socket.data.roomCode) return roomError(socket, 'Сначала выйди из текущей комнаты.');
    const profile = profileForSocket(socket, data);
    const code = roomCode();
    const player = {
      id: id(), socketId: socket.id, ...profile,
      ready: true, connected: true, alive: true, rides: 0,
      fallAt: 2 + Math.floor(Math.random() * 4), hand: [], abilityUsed: false
    };
    const room = { code, hostId: player.id, players: [player], game: null };
    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.data.playerId = player.id;
    socket.join(code);
    socket.emit('joined', { playerId: player.id, roomCode: code });
    sendLobby(room);
  });

  socket.on('joinRoom', (data = {}) => {
    removeQuickQueue(socket, true);
    if (socket.data.roomCode) return roomError(socket, 'Сначала выйди из текущей комнаты.');
    const code = String(data.code || '').trim().toUpperCase().slice(0, 4);
    const room = rooms.get(code);
    if (!room) return roomError(socket, 'Комната не найдена. Проверь код.');
    if (room.dice && room.dice.phase !== 'finished') return roomError(socket, 'Игра в кости уже идёт. Войти по коду можно после её завершения.');
    if (room.poker && room.poker.phase !== 'finished') return roomError(socket, 'Игра в покер уже идёт. Войти по коду можно после её завершения.');
    if (socket.data.accountId && room.players.some(player => player.accountId === socket.data.accountId)) {
      return roomError(socket, 'Этот аккаунт уже находится в этой комнате.');
    }
    if (room.game) return roomError(socket, 'Игра уже началась. Создай новую комнату.');
    if (room.players.length >= MAX_PLAYERS) return roomError(socket, 'В комнате уже 4 игрока.');
    const profile = profileForSocket(socket, data);
    const player = {
      id: id(), socketId: socket.id, ...profile,
      ready: false, connected: true, alive: true, rides: 0,
      fallAt: 2 + Math.floor(Math.random() * 4), hand: [], abilityUsed: false
    };
    room.players.push(player);
    socket.data.roomCode = code;
    socket.data.playerId = player.id;
    socket.join(code);
    socket.emit('joined', { playerId: player.id, roomCode: code });
    sendLobby(room);
  });

  socket.on('setReady', ready => {
    const room = roomFor(socket);
    const player = room && playerById(room, socket.data.playerId);
    if (!room || room.game || (room.dice && room.dice.phase !== 'finished') || (room.poker && room.poker.phase !== 'finished') || !player) return;
    player.ready = !!ready;
    sendLobby(room);
  });

  socket.on('startGame', () => {
    const room = roomFor(socket);
    if (!room || socket.data.playerId !== room.hostId) return roomError(socket, 'Начать игру может только хост.');
    if (room.dice && room.dice.phase !== 'finished') return roomError(socket, 'Сначала заверши игру в кости.');
    if (room.poker && room.poker.phase !== 'finished') return roomError(socket, 'Сначала заверши игру в покер.');
    if (room.players.length < MIN_PLAYERS) return roomError(socket, 'Нужно минимум 2 игрока.');
    if (!room.players.every(p => p.ready && p.connected)) return roomError(socket, 'Дождись готовности всех игроков.');
    startRoomGame(room);
  });


  socket.on('useAbility', (data = {}) => {
    const room = roomFor(socket);
    const game = room?.game;
    const player = room && playerById(room, socket.data.playerId);
    if (!room || !game || !player || game.phase === 'finished') return;
    const skill = skillFor(player);
    if (data.type !== skill.id) return roomError(socket, 'Это умение недоступно выбранному персонажу.');
    if (player.abilityUsed) return roomError(socket, 'Умение уже использовано в этом матче.');

    if (skill.id === 'swap') {
      if (game.phase !== 'playing' || !player.alive || game.currentId !== player.id) return roomError(socket, 'Обмен можно сделать только в свой ход.');
      const index = Number(data.index), target = playerById(room, data.targetId);
      if (!Number.isInteger(index) || index < 0 || index >= player.hand.length || !target || !target.alive || target.id === player.id || !target.hand.length) return roomError(socket, 'Выбери одну свою карту и соперника с картами.');
      const targetIndex = Math.floor(Math.random() * target.hand.length);
      const ownCard = player.hand[index];
      player.hand[index] = target.hand[targetIndex];
      target.hand[targetIndex] = ownCard;
      player.abilityUsed = true;
      game.message = `${player.name} использовал «Химический обмен». Карты поменялись тайно.`;
      broadcastState(room);
      return;
    }

    if (skill.id === 'peek') {
      if (game.phase !== 'playing' || !player.alive) return roomError(socket, 'Подглядывать можно только во время игры.');
      const target = playerById(room, data.targetId);
      if (!target || !target.alive || target.id === player.id || !target.hand.length) return roomError(socket, 'Выбери соперника, у которого остались карты.');
      player.abilityUsed = true;
      socket.emit('privatePeek', { targetId: target.id, name: target.name, cards: target.hand.map(card => ({ icon: card.icon, name: card.name })) });
      game.message = `${player.name} незаметно подсмотрел карты соперника.`;
      broadcastState(room);
      return;
    }

    if (skill.id === 'beg') {
      if (game.phase !== 'playing' || !player.alive || !game.lastPlay || game.lastPlay.playerId !== player.id || game.currentId === player.id || game.begging) return roomError(socket, 'Умолять можно только после своего хода, пока соперник решает, проверять ли блеф.');
      player.abilityUsed = true;
      const request = { id: id(), fromId: player.id, toId: game.currentId, expiresAt: Date.now() + 8000 };
      game.begging = request;
      game.message = `${player.name} умоляет не проверять его карты…`;
      broadcastState(room);
      const code = room.code, gameId = game.gameId, requestId = request.id;
      setTimeout(() => {
        const currentRoom = rooms.get(code);
        if (!currentRoom?.game || currentRoom.game.gameId !== gameId || currentRoom.game.begging?.id !== requestId) return;
        currentRoom.game.begging = null;
        currentRoom.game.message = 'Мольба закончилась. Решение за игроком, чей сейчас ход.';
        broadcastState(currentRoom);
      }, 8000);
      return;
    }

    if (skill.id === 'revive') {
      if (game.phase !== 'rodeo' || game.rodeo?.playerId !== player.id || !game.rodeo.out || game.rodeo.saved || !player.alive) return roomError(socket, 'Второе дыхание доступно только во время решающего падения с быка.');
      player.abilityUsed = true;
      game.rodeo.saved = true;
      game.message = `${player.name} поднялся после падения — второе дыхание!`;
      broadcastState(room);
      return;
    }
  });

  socket.on('begDecision', (data = {}) => {
    const room = roomFor(socket), game = room?.game;
    const player = room && playerById(room, socket.data.playerId);
    const request = game?.begging;
    if (!room || !game || game.phase !== 'playing' || !player || !request || request.toId !== player.id || game.currentId !== player.id) return;
    game.begging = null;
    if (data.accept === true) {
      game.lastPlay = null;
      game.reveal = null;
      const next = nextPlayerWithCards(room, player.id);
      if (!next) { finishGame(room, player.id); return; }
      game.currentId = next.id;
      game.message = `${player.name} принял мольбу. Проверки не будет — ход переходит дальше.`;
    } else {
      game.message = `${player.name} отказался от мольбы. Можно продолжить ход или проверить блеф.`;
    }
    broadcastState(room);
  });

  socket.on('playCards', (data = {}, acknowledge) => {
    const reply = (ok, message) => {
      if (typeof acknowledge === 'function') acknowledge({ ok, message: message || '' });
      if (!ok && message) roomError(socket, message);
    };
    const room = roomFor(socket);
    const game = room?.game;
    const player = room && playerById(room, socket.data.playerId);
    if (!room || !game || game.phase !== 'playing' || !player || !player.alive) {
      reply(false, 'Сейчас нельзя выкладывать карты.');
      return;
    }
    if (game.currentId !== player.id) {
      reply(false, 'Сейчас ход другого игрока.');
      return;
    }
    const indexes = Array.isArray(data.indexes) ? [...new Set(data.indexes.map(Number))] : [];
    if (indexes.length < 1 || indexes.length > 3 || indexes.some(i => !Number.isInteger(i) || i < 0 || i >= player.hand.length)) {
      reply(false, 'Выбери от 1 до 3 карт.');
      return;
    }
    const cards = indexes.sort((a, b) => b - a).map(i => player.hand.splice(i, 1)[0]).reverse();
    if (io.cardFx) io.cardFx.beforePlay(room, player, cards);
    game.pileCount += cards.length;
    game.lastPlay = { playerId: player.id, cards };
    game.reveal = null;
    game.message = `${player.name} выложил ${cards.length} карт рубашкой вверх.`;
    if (io.cardFx) io.cardFx.afterPlay(room, player, cards);
    const survivors = activePlayers(room);
    if (player.hand.length === 0 && survivors.length === 2) {
      const automaticCaller = survivors.find(p => p.id !== player.id && p.hand.length > 0);
      if (automaticCaller) {
        game.currentId = automaticCaller.id;
        resolveCall(room, automaticCaller);
        reply(true);
        return;
      }
    }
    const next = nextPlayerWithCards(room, player.id);
    if (!next) {
      finishGame(room, player.id);
      reply(true);
      return;
    }
    game.currentId = next.id;
    broadcastState(room);
    reply(true);
  });

  socket.on('callBluff', () => {
    const room = roomFor(socket);
    const game = room?.game;
    const caller = room && playerById(room, socket.data.playerId);
    if (!room || !game || game.phase !== 'playing' || !caller || game.currentId !== caller.id || !game.lastPlay) return;
    resolveCall(room, caller);
  });

  socket.on('leaveRoom', () => leaveCurrentRoom(socket));
  socket.on('disconnect', () => { if (!(io.onDisconnect && io.onDisconnect(socket))) leaveCurrentRoom(socket); });
});

function leaveCurrentRoom(socket) {
  removeQuickQueue(socket);
  const code = socket.data.roomCode;
  const room = code && rooms.get(code);
  if (!room) return;
  const playerId = socket.data.playerId;
  const activeDice = !!(room.dice && room.dice.phase !== 'finished');
  const activePoker = !!(room.poker && room.poker.phase !== 'finished');
  socket.leave(code);
  const index = room.players.findIndex(p => p.id === playerId);
  if (index >= 0) {
    const [player] = room.players.splice(index, 1);
    if (room.game && player) player.alive = false;
  }
  socket.data.roomCode = null;
  socket.data.playerId = null;
  if (!room.players.length) {
    rooms.delete(code);
    return;
  }
  if (room.hostId === playerId) room.hostId = room.players[0].id;
  if (activeDice) {
    if (typeof io.dicePlayerLeft === 'function') io.dicePlayerLeft(room, playerId);
    else if (typeof io.diceSend === 'function') io.diceSend(room);
    return;
  }
  if (activePoker) {
    if (typeof io.pokerPlayerLeft === 'function') io.pokerPlayerLeft(room, playerId);
    return;
  }
  if (room.game && room.game.phase === 'finished') {
    broadcastState(room);
    return;
  }
  if (room.game) {
    const alive = activePlayers(room);
    if (alive.length <= 1) finishGame(room, alive[0]?.id || null);
    else if (room.game.currentId === playerId) {
      const next = nextPlayerWithCards(room, playerId);
      if (next) room.game.currentId = next.id;
      else finishGame(room, room.game.lastPlay?.playerId || alive[0].id);
      broadcastState(room);
    } else broadcastState(room);
  } else sendLobby(room);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`AGROBULL online running on port ${PORT}`);
});
