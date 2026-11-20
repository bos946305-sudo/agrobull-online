'use strict';

const assert = require('assert');
const attachDice = require('../server-dice');

const listeners = {};
const rooms = new Map();
const room = {
  code: 'TST1',
  hostId: 'host',
  players: [
    { id: 'host', name: 'Host', socketId: 's1', ready: true, connected: true },
    { id: 'guest', name: 'Guest', socketId: 's2', ready: true, connected: true }
  ],
  game: null,
  dice: {
    phase: 'bidding',
    round: 1,
    order: ['host', 'guest'],
    n: { host: 5, guest: 5 },
    dice: { host: [1, 2, 3, 4, 5], guest: [2, 3, 4, 5, 6] },
    bid: null,
    reveal: null,
    winnerId: null,
    deadline: Date.now() + 30000
  }
};
rooms.set(room.code, room);

const fakeIo = {
  on(event, handler) { listeners[event] = handler; },
  to() { return { emit() {} }; },
  settingsOf() { return { turnSec: 30 }; }
};

attachDice(fakeIo, {
  getRoomForSocket(socket) { return rooms.get(socket.data.roomCode) || null; },
  rooms,
  sendLobby() {},
  publicLobby() { return {}; }
});

function makeSocket(id, playerId) {
  const socket = {
    id,
    data: { roomCode: room.code, playerId },
    middleware: [],
    handlers: {},
    emitted: [],
    use(fn) { this.middleware.push(fn); },
    on(event, fn) { this.handlers[event] = fn; },
    emit(event, payload) { this.emitted.push({ event, payload }); }
  };
  listeners.connection(socket);
  return socket;
}

function dispatch(socket, event, data) {
  return new Promise(resolve => {
    let index = 0;
    let rejected = null;
    const next = error => {
      if (error) {
        rejected = error;
        return resolve({ rejected, emitted: socket.emitted.slice() });
      }
      const middleware = socket.middleware[index++];
      if (middleware) return middleware([event, data], next);
      if (socket.handlers[event]) socket.handlers[event](data);
      resolve({ rejected, emitted: socket.emitted.slice() });
    };
    next();
  });
}

(async () => {
  const guest = makeSocket('s2', 'guest');

  const join = await dispatch(guest, 'joinRoom', { code: room.code });
  assert(join.rejected, 'joinRoom must be rejected while dice are running');
  assert(join.emitted.some(item => item.event === 'roomError' &&
    /кости уже идёт/i.test(item.payload.message)), 'joinRoom must return a clear dice-mode error');
  assert.strictEqual(room.players.length, 2, 'a blocked join must not change the room');

  guest.emitted.length = 0;
  const startCards = await dispatch(guest, 'startGame', {});
  assert(startCards.rejected, 'startGame must be rejected while dice are running');
  assert(startCards.emitted.some(item => item.event === 'roomError' &&
    /игра в кости/i.test(item.payload.message)), 'card-game start must return a clear dice-mode error');

  // A stale dice rematch event must never reset a live card match.
  room.dice.phase = 'finished';
  const activeCardGame = { phase: 'playing', gameId: 'card-match-live' };
  room.game = activeCardGame;
  const host = makeSocket('s1', 'host');
  host.handlers.diceRematch();
  assert.strictEqual(room.game, activeCardGame, 'dice rematch must not clear an active card game');
  assert(room.dice, 'dice rematch must not change dice state during a live card game');

  // Starting cards after a finished dice match explicitly clears the old mode.
  const serverSource = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
  assert(/room\.dice\s*=\s*null;\s*room\.game\s*=\s*\{\s*gameId:\s*id\(\)/.test(serverSource),
    'starting a card game must clear the finished dice mode');
  assert(/if\s*\(room\.dice\s*&&\s*room\.dice\.phase\s*!==\s*'finished'\)\s*return\s*roomError\(socket,\s*'Игра в кости уже идёт\./.test(serverSource),
    'server.js must independently reject a join during active dice');

  console.log('DICE ROOM TESTS OK: join lock, card-start lock, rematch isolation and mode switch.');
})().catch(error => {
  console.error('DICE ROOM TESTS FAILED');
  console.error(error);
  process.exitCode = 1;
});
