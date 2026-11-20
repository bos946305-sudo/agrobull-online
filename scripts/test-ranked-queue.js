'use strict';
const assert = require('assert');
const attachRanked = require('../server-ranked');

function setup(pairCount = 0) {
  const listeners = {};
  const rooms = new Map();
  const io = {
    on(event, handler) { listeners[event] = handler; },
    to() { return { emit() {} }; },
    sockets: { sockets: new Map() }
  };
  const started = [];
  attachRanked(io, {
    getRoomForSocket: socket => socket.data.roomCode ? rooms.get(socket.data.roomCode) : null,
    rooms,
    sendLobby() {},
    provider: {
      async getRating(id) { return id === 'a' ? 1000 : 1010; },
      async getPairCount() { return pairCount; },
      async getName(id) { return id; }
    },
    startMatch(room, mode) { started.push({ room, mode }); },
    window: { startIn: 5, cacheMs: 10 }
  });
  function socket(id, accountId) {
    const handlers = {};
    const outbound = [];
    const s = {
      id, connected: true, data: { accountId }, handlers, outbound,
      on(event, handler) { handlers[event] = handler; },
      use(handler) { (s.middleware ||= []).push(handler); },
      emit(event, data) { outbound.push({ event, data }); },
      join() {}, leave() {}
    };
    listeners.connection(s);
    return s;
  }
  return { io, rooms, started, socket };
}

(async () => {
  {
    const env = setup(0);
    const a = env.socket('socket-a', 'a');
    const b = env.socket('socket-b', 'b');
    await a.handlers.rankedQueue({ mode: 'cards', want: 2 });
    await b.handlers.rankedQueue({ mode: 'cards', want: 2 });
    assert.strictEqual(env.io.ranked.size(), 2);
    await env.io.ranked.tick();
    assert.strictEqual(env.io.ranked.size(), 0);
    assert.strictEqual(env.rooms.size, 1);
    const room = [...env.rooms.values()][0];
    assert.strictEqual(room.players.length, 2);
    assert.strictEqual(room.players[0].accountId, 'a');
    assert.strictEqual(room.players[1].accountId, 'b');
    assert.deepStrictEqual(room.players.map(player => player.rating), [1000, 1010]);
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.strictEqual(env.started.length, 1);
    assert.strictEqual(env.started[0].mode, 'cards');
    env.io.ranked.close();
  }
  {
    const env = setup(5);
    const a = env.socket('socket-a', 'a');
    const b = env.socket('socket-b', 'b');
    await a.handlers.rankedQueue({ mode: 'cards', want: 2 });
    await b.handlers.rankedQueue({ mode: 'cards', want: 2 });
    await env.io.ranked.tick();
    assert.strictEqual(env.io.ranked.size(), 2, 'пара с дневным лимитом не должна матчиться');
    assert.strictEqual(env.rooms.size, 0);
    a.handlers.rankedCancel();
    assert.strictEqual(env.io.ranked.size(), 1);
    env.io.ranked.close();
  }
  {
    const env = setup(0);
    const a = env.socket('socket-a', 'a');
    const b = env.socket('socket-b', 'b');
    await a.handlers.rankedQueue({ mode: 'cards', want: 2 });
    await b.handlers.rankedQueue({ mode: 'cards', want: 2 });
    a.data.roomCode = 'OTHER';
    await env.io.ranked.tick();
    assert.strictEqual(env.io.ranked.size(), 1, 'сокет, вошедший в другую комнату, должен удалиться из очереди');
    assert.strictEqual(env.rooms.size, 0);
    env.io.ranked.close();
  }
  {
    const env = setup(0);
    const a = env.socket('socket-a', 'a');
    const b = env.socket('socket-b', 'b');
    await a.handlers.rankedQueue({ mode: 'poker', want: 2 });
    await b.handlers.rankedQueue({ mode: 'poker', want: 2 });
    await env.io.ranked.tick();
    assert.strictEqual(env.rooms.size, 1, 'poker must use the same ranked queue');
    assert.strictEqual(env.started[0].mode, 'poker');
    env.io.ranked.close();
  }
  console.log('RANKED QUEUE TESTS OK: async ratings, pair cap, room creation, cancellation and stale sockets.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
