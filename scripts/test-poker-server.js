'use strict';
const assert = require('assert');
const attachPoker = require('../server-poker');
const P = require('../poker-core');

function setup() {
  const listeners = {}, rooms = new Map(), sent = [];
  const io = {
    on(event, fn) { listeners[event] = fn; },
    to(id) { return { emit(event, data) { sent.push({ id, event, data }); } }; },
    prepareRankedRoom(room, mode) { room.ranked = true; room.rankedMode = mode; return true; },
    settleRankedRoom() { return Promise.resolve(); }
  };
  attachPoker(io, { getRoomForSocket: s => rooms.get(s.data.roomCode), rooms });
  const room = {
    code: 'POK1', hostId: 'p1', game: null, dice: null,
    players: [
      { id: 'p1', socketId: 's1', name: 'One', ready: true, connected: true },
      { id: 'p2', socketId: 's2', name: 'Two', ready: true, connected: true }
    ]
  };
  rooms.set(room.code, room);
  const sockets = {};
  for (const [id, playerId] of [['s1','p1'],['s2','p2']]) {
    const handlers = {};
    const socket = { id, data: { roomCode: room.code, playerId }, handlers,
      on(event, fn) { handlers[event] = fn; }, emit(event, data) { sent.push({id,event,data}); } };
    listeners.connection(socket); sockets[playerId] = socket;
  }
  return { io, room, sockets, sent };
}

{
  const env = setup();
  env.sockets.p1.handlers.pokerStart();
  assert(env.room.poker && env.room.poker.phase === 'playing');
  assert.strictEqual(env.room.rankedMode, 'poker');
  assert(env.room.players.every(p => p.pokerHand.length === 5 && p.pokerLives === 3));
  const pool = env.room.players.flatMap(p => p.pokerHand);
  const trueClaim = P.ALL.find(c => P.holds(c, pool));
  assert(trueClaim, 'a real claim must exist in the dealt cards');
  env.sockets.p1.handlers.pokerClaim({ claim: trueClaim });
  assert.strictEqual(env.room.poker.turnId, 'p2');
  env.sockets.p2.handlers.pokerCall();
  assert.strictEqual(env.room.poker.phase, 'reveal');
  assert.strictEqual(env.room.players[1].pokerLives, 2, 'caller loses a life when claim is true');
  assert.strictEqual(env.room.poker.reveal.trueClaim, true);
  assert(env.sent.some(item => item.event === 'pokerState'));
}
{
  const env = setup();
  env.sockets.p1.handlers.pokerStart();
  const invalid = env.room.poker.claim;
  env.sockets.p1.handlers.pokerClaim({ claim: { t: 99, a: 0 } });
  assert(env.sent.some(item => item.event === 'roomError' && /Некорректная заявка/.test(item.data.message)));
}
console.log('POKER SERVER TESTS OK: deal, private hands, claims, bluff check and life loss.');
