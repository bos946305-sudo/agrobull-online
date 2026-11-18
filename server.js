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
const app = express();
const server = http.createServer(app);
const io = new Server(server, { serveClient: true, cors: { origin: true, credentials: false } });

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'AGROBULL online', rooms: rooms.size }));
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
function roomFor(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}
function publicLobby(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map(p => ({
      id: p.id, name: p.name, character: p.character, skin: p.skin,
      ready: p.ready, isHost: p.id === room.hostId, connected: p.connected
    })),
    maxPlayers: MAX_PLAYERS,
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
    round: game.round,
    table: game.table,
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
    winnerId: game.winnerId,
    players: room.players.map(p => ({
      id: p.id, name: p.name, character: p.character, skin: p.skin,
      alive: p.alive, rides: p.rides, fallAt: p.fallAt,
      handCount: p.hand.length,
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
    const p = room.players[(start + step) % n];
    if (p && p.alive && p.hand.length > 0) return p;
  }
  return null;
}
function finishGame(room, winnerId) {
  if (!room.game) return;
  room.game.phase = 'finished';
  room.game.currentId = null;
  room.game.winnerId = winnerId || null;
  room.game.message = winnerId ? `${playerById(room, winnerId)?.name || 'Игрок'} победил!` : 'Игра завершена';
  broadcastState(room);
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
  shuffle(deck);
  for (const p of room.players) p.hand = [];
  for (let i = 0; i < 5; i++) for (const p of alive) p.hand.push(deck.pop());
  const table = CROPS[Math.floor(Math.random() * CROPS.length)];
  let first = afterId ? nextPlayerWithCards(room, afterId) : alive[0];
  if (!first) first = alive[0];
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
    winnerId: null,
    message: `Раунд ${((room.game?.round || 0) + 1)}. На столе ${table.name}.`
  };
  broadcastState(room);
}
function resolveCall(room, caller) {
  const game = room.game;
  const last = game.lastPlay;
  if (!last || game.phase !== 'playing') return;
  const isLie = last.cards.some(card => card.id !== game.table.id && card.id !== 'b');
  const loser = playerById(room, isLie ? last.playerId : caller.id);
  const liar = playerById(room, last.playerId);
  if (!loser || !loser.alive) return;
  loser.rides += 1;
  const out = loser.rides >= loser.fallAt;
  game.phase = 'rodeo';
  game.currentId = null;
  game.reveal = { cards: last.cards, isLie, callerId: caller.id, loserId: loser.id };
  game.rodeo = {
    playerId: loser.id,
    callerId: caller.id,
    level: loser.rides,
    threshold: loser.fallAt,
    out,
    startedAt: Date.now()
  };
  game.message = isLie
    ? `Блеф раскрыт! ${liar?.name || 'Игрок'} соврал — на быка!`
    : `Карты честные. ${caller.name} ошибся — на быка!`;
  broadcastState(room);

  const code = room.code;
  const gameId = game.gameId;
  setTimeout(() => {
    const currentRoom = rooms.get(code);
    if (!currentRoom || !currentRoom.game || currentRoom.game.gameId !== gameId || currentRoom.game.phase !== 'rodeo') return;
    const target = playerById(currentRoom, loser.id);
    if (target && out) target.alive = false;
    if (activePlayers(currentRoom).length <= 1) {
      finishGame(currentRoom, activePlayers(currentRoom)[0]?.id || null);
      return;
    }
    dealRound(currentRoom, loser.id);
  }, 5200);
}
function roomError(socket, message) { socket.emit('roomError', { message }); }

io.on('connection', socket => {
  socket.on('createRoom', (data = {}) => {
    if (socket.data.roomCode) return roomError(socket, 'Сначала выйди из текущей комнаты.');
    const profile = profileFrom(data);
    const code = roomCode();
    const player = {
      id: id(), socketId: socket.id, ...profile,
      ready: true, connected: true, alive: true, rides: 0,
      fallAt: 2 + Math.floor(Math.random() * 4), hand: []
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
    if (socket.data.roomCode) return roomError(socket, 'Сначала выйди из текущей комнаты.');
    const code = String(data.code || '').trim().toUpperCase().slice(0, 4);
    const room = rooms.get(code);
    if (!room) return roomError(socket, 'Комната не найдена. Проверь код.');
    if (room.game) return roomError(socket, 'Игра уже началась. Создай новую комнату.');
    if (room.players.length >= MAX_PLAYERS) return roomError(socket, 'В комнате уже 4 игрока.');
    const profile = profileFrom(data);
    const player = {
      id: id(), socketId: socket.id, ...profile,
      ready: false, connected: true, alive: true, rides: 0,
      fallAt: 2 + Math.floor(Math.random() * 4), hand: []
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
    if (!room || room.game || !player) return;
    player.ready = !!ready;
    sendLobby(room);
  });

  socket.on('startGame', () => {
    const room = roomFor(socket);
    if (!room || socket.data.playerId !== room.hostId) return roomError(socket, 'Начать игру может только хост.');
    if (room.players.length < MIN_PLAYERS) return roomError(socket, 'Нужно минимум 2 игрока.');
    if (!room.players.every(p => p.ready && p.connected)) return roomError(socket, 'Дождись готовности всех игроков.');
    for (const p of room.players) { p.alive = true; p.rides = 0; p.fallAt = 2 + Math.floor(Math.random() * 4); }
    room.game = { gameId: id(), round: 0 };
    dealRound(room);
  });

  socket.on('playCards', (data = {}) => {
    const room = roomFor(socket);
    const game = room?.game;
    const player = room && playerById(room, socket.data.playerId);
    if (!room || !game || game.phase !== 'playing' || !player || !player.alive) return;
    if (game.currentId !== player.id) return roomError(socket, 'Сейчас ход другого игрока.');
    const indexes = Array.isArray(data.indexes) ? [...new Set(data.indexes.map(Number))] : [];
    if (indexes.length < 1 || indexes.length > 3 || indexes.some(i => !Number.isInteger(i) || i < 0 || i >= player.hand.length)) return roomError(socket, 'Выбери от 1 до 3 карт.');
    const cards = indexes.sort((a, b) => b - a).map(i => player.hand.splice(i, 1)[0]).reverse();
    game.pileCount += cards.length;
    game.lastPlay = { playerId: player.id, cards };
    game.reveal = null;
    game.message = `${player.name} выложил ${cards.length} карт рубашкой вверх.`;
    const next = nextPlayerWithCards(room, player.id);
    if (!next) {
      finishGame(room, player.id);
      return;
    }
    game.currentId = next.id;
    broadcastState(room);
  });

  socket.on('callBluff', () => {
    const room = roomFor(socket);
    const game = room?.game;
    const caller = room && playerById(room, socket.data.playerId);
    if (!room || !game || game.phase !== 'playing' || !caller || game.currentId !== caller.id || !game.lastPlay) return;
    resolveCall(room, caller);
  });

  socket.on('leaveRoom', () => leaveCurrentRoom(socket));
  socket.on('disconnect', () => leaveCurrentRoom(socket));
});

function leaveCurrentRoom(socket) {
  const code = socket.data.roomCode;
  const room = code && rooms.get(code);
  if (!room) return;
  const playerId = socket.data.playerId;
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
