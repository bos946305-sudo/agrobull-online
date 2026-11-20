/* server-dice.js — server-authoritative Liar's Dice mode for AGROBULL. */
'use strict';

module.exports = function attachDice(io, ctx = {}) {
  const { getRoomForSocket: roomFor, rooms, sendLobby, publicLobby } = ctx;
  if (typeof roomFor !== 'function' || !rooms) {
    throw new TypeError('server-dice: pass getRoomForSocket and rooms');
  }

  const DICE_PER_PLAYER = 5;
  const REVEAL_MS = 6500;
  const rnd6 = () => 1 + Math.floor(Math.random() * 6);
  const face = value => value === 1 ? '🐂' : String(value);
  const alive = room => room.dice.order.filter(id => (room.dice.n[id] || 0) > 0);
  const total = room => alive(room).reduce((sum, id) => sum + room.dice.n[id], 0);
  const nameOf = (room, id) => (room.players.find(player => player.id === id) || { name: 'Игрок' }).name;

  function nextAlive(room, afterId) {
    const order = room.dice.order;
    const start = order.indexOf(afterId);
    for (let step = 1; step <= order.length; step++) {
      const candidate = order[(Math.max(-1, start) + step) % order.length];
      if ((room.dice.n[candidate] || 0) > 0) return candidate;
    }
    return null;
  }

  function view(room, viewerId) {
    const dice = room.dice;
    return {
      roomCode: room.code,
      phase: dice.phase,
      round: dice.round,
      turnId: dice.turnId,
      bid: dice.bid ? { ...dice.bid } : null,
      message: dice.message,
      total: total(room),
      winnerId: dice.winnerId,
      ms: dice.phase === 'bidding' ? Math.max(0, (dice.deadline || 0) - Date.now()) : 0,
      players: room.players.map(player => ({
        id: player.id,
        name: player.name,
        character: player.character,
        skin: player.skin,
        n: dice.n[player.id] || 0,
        alive: (dice.n[player.id] || 0) > 0
      })),
      myDice: (dice.dice[viewerId] || []).slice(),
      reveal: dice.reveal
    };
  }

  function send(room) {
    if (!room || !room.dice) return;
    for (const player of room.players) {
      if (player.socketId) io.to(player.socketId).emit('diceState', view(room, player.id));
    }
  }
  io.diceSend = send;

  function turnDuration(room) {
    const settings = typeof io.settingsOf === 'function' ? io.settingsOf(room.code) : null;
    return Math.max(5, Number(settings && settings.turnSec) || 30) * 1000;
  }

  function arm(room) {
    const dice = room.dice;
    const player = room.players.find(item => item.id === dice.turnId);
    dice.deadline = Date.now() + (player && player.connected === false ? 8000 : turnDuration(room));
  }

  function finish(room) {
    const dice = room.dice;
    if (!dice || dice.phase === 'finished') return;
    const remaining = alive(room);
    dice.phase = 'finished';
    dice.turnId = null;
    dice.deadline = 0;
    dice.winnerId = remaining[0] || null;
    dice.message = remaining[0] ? nameOf(room, remaining[0]) + ' побеждает!' : 'Игра окончена';
    send(room);
  }

  function roll(room, starterId) {
    const dice = room.dice;
    const remaining = alive(room);
    if (remaining.length <= 1) return finish(room);

    dice.round++;
    dice.bid = null;
    dice.reveal = null;
    dice.phase = 'bidding';
    dice.dice = {};
    for (const id of remaining) {
      dice.dice[id] = Array.from({ length: dice.n[id] }, rnd6);
    }
    dice.turnId = starterId && dice.n[starterId] > 0 ? starterId : remaining[0];
    dice.message = 'Раунд ' + dice.round + '. Кости брошены — ходит ' + nameOf(room, dice.turnId) + '.';
    arm(room);
    send(room);
  }

  function makeBid(room, playerId, quantity, value) {
    const dice = room.dice;
    if (dice.phase !== 'bidding' || dice.turnId !== playerId) return 'Сейчас не твой ход';

    const q = Number(quantity), f = Number(value);
    if (!Number.isInteger(q) || !Number.isInteger(f) || f < 1 || f > 6 || q < 1 || q > total(room)) {
      return 'Неверная ставка';
    }
    if (dice.bid && !(q > dice.bid.q || (q === dice.bid.q && f > dice.bid.f))) {
      return 'Ставка должна быть выше предыдущей';
    }

    dice.bid = { q, f, by: playerId };
    if (alive(room).length <= 1) return finish(room), null;
    dice.turnId = nextAlive(room, playerId);
    dice.message = nameOf(room, playerId) + ' ставит ' + q + ' × ' + face(f);
    arm(room);
    send(room);
    return null;
  }

  function call(room, playerId) {
    const dice = room.dice;
    if (dice.phase !== 'bidding' || dice.turnId !== playerId || !dice.bid) {
      return 'Проверять пока нечего';
    }

    const { q, f } = dice.bid;
    let actual = 0;
    for (const id of alive(room)) {
      for (const value of dice.dice[id] || []) {
        if (value === f || (f !== 1 && value === 1)) actual++;
      }
    }

    const holds = actual >= q;
    const loserId = holds ? playerId : dice.bid.by;
    dice.n[loserId] = Math.max(0, (dice.n[loserId] || 0) - 1);
    dice.phase = 'reveal';
    dice.turnId = null;
    dice.deadline = 0;
    dice.reveal = {
      dice: JSON.parse(JSON.stringify(dice.dice)),
      bid: { ...dice.bid },
      actual,
      callerId: playerId,
      loserId
    };
    dice.message = 'Вскрытие: на столе ' + actual + ' × ' + face(f) + '. ' +
      (holds ? 'Ставка верна' : 'Это был блеф') + ' — ' + nameOf(room, loserId) + ' теряет кость.';
    send(room);

    const code = room.code;
    const thisRound = dice.round;
    setTimeout(() => {
      const currentRoom = rooms.get(code);
      if (!currentRoom || currentRoom.dice !== dice || dice.round !== thisRound || dice.phase !== 'reveal') return;
      const remaining = alive(currentRoom);
      if (remaining.length <= 1) finish(currentRoom);
      else roll(currentRoom, dice.n[loserId] > 0 ? loserId : nextAlive(currentRoom, loserId));
    }, REVEAL_MS);
    return null;
  }

  // Called by server.js when a player leaves or their reconnect grace period expires.
  io.dicePlayerLeft = (room, playerId) => {
    const dice = room && room.dice;
    if (!dice || dice.phase === 'finished') return;
    dice.n[playerId] = 0;
    if (dice.phase === 'bidding') {
      const remaining = alive(room);
      if (remaining.length <= 1) return finish(room);
      if (dice.turnId === playerId) {
        dice.turnId = nextAlive(room, playerId);
        arm(room);
      }
    }
    send(room);
  };

  io.on('connection', socket => {
    const error = message => socket.emit('roomError', { message });

    socket.use(([event, data], next) => {
      if (event === 'joinRoom') {
        const code = String((data && data.code) || '').trim().toUpperCase().slice(0, 4);
        const room = rooms.get(code);
        if (room && room.dice && room.dice.phase !== 'finished') {
          error('Игра в кости уже идёт.');
          return next(new Error('dice-running'));
        }
      }
      if (event === 'startGame') {
        const room = roomFor(socket);
        if (room && room.dice && room.dice.phase !== 'finished') {
          error('Сейчас идёт игра в кости.');
          return next(new Error('dice-running'));
        }
      }
      next();
    });

    socket.on('diceStart', () => {
      const room = roomFor(socket);
      if (!room || socket.data.playerId !== room.hostId) return error('Начать может только хост.');
      if (room.game && room.game.phase !== 'finished') return error('Сначала заверши текущую игру.');
      if (room.dice && room.dice.phase !== 'finished') return;
      if (room.players.length < 2) return error('Нужно минимум 2 игрока.');
      if (!room.players.every(player => player.ready && player.connected !== false)) {
        return error('Дождись готовности всех игроков.');
      }

      // A room can host either game mode, never both at once.
      room.game = null;
      room.dice = {
        phase: 'bidding',
        round: 0,
        order: room.players.map(player => player.id),
        n: {},
        dice: {},
        bid: null,
        reveal: null,
        winnerId: null,
        deadline: 0
      };
      room.players.forEach(player => {
        room.dice.n[player.id] = DICE_PER_PLAYER;
        player.alive = true;
      });
      roll(room, room.players[0].id);
    });

    socket.on('diceBid', (data = {}) => {
      const room = roomFor(socket);
      if (!room || !room.dice) return;
      const message = makeBid(room, socket.data.playerId, data.q, data.f);
      if (message) error(message);
    });

    socket.on('diceCall', () => {
      const room = roomFor(socket);
      if (!room || !room.dice) return;
      const message = call(room, socket.data.playerId);
      if (message) error(message);
    });

    socket.on('diceRematch', () => {
      const room = roomFor(socket);
      if (!room || !room.dice || room.dice.phase !== 'finished' ||
          (room.game && room.game.phase !== 'finished') ||
          socket.data.playerId !== room.hostId) return;

      room.dice = null;
      room.game = null;
      room.players.forEach(player => {
        player.alive = true;
        player.rides = 0;
        player.hand = [];
        player.abilityUsed = false;
        player.ready = player.id === room.hostId;
      });

      if (sendLobby) sendLobby(room);
      if (publicLobby) {
        const lobby = publicLobby(room);
        room.players.forEach(player => {
          if (player.socketId) {
            io.to(player.socketId).emit('gameState', {
              roomCode: room.code,
              phase: 'lobby',
              lobby
            });
          }
        });
      }
    });
  });

  const timer = setInterval(() => {
    for (const room of rooms.values()) {
      const dice = room.dice;
      if (!dice || dice.phase !== 'bidding') continue;

      for (const id of dice.order) {
        if (!room.players.some(player => player.id === id)) dice.n[id] = 0;
      }

      const remaining = alive(room);
      if (remaining.length <= 1) {
        finish(room);
        continue;
      }
      if (!dice.turnId || dice.n[dice.turnId] <= 0) {
        dice.turnId = nextAlive(room, dice.turnId);
        arm(room);
        send(room);
        continue;
      }

      const current = room.players.find(player => player.id === dice.turnId);
      if (current && current.connected === false && dice.deadline - Date.now() > 8000) {
        dice.deadline = Date.now() + 8000;
      }
      if (Date.now() < dice.deadline) continue;

      const playerId = dice.turnId;
      const count = total(room);
      if (!dice.bid) {
        makeBid(room, playerId, 1, rnd6());
      } else {
        const canRaise = dice.bid.f < 6 || dice.bid.q < count;
        if (!canRaise || Math.random() < 0.35) {
          call(room, playerId);
        } else if (dice.bid.f < 6) {
          makeBid(room, playerId, dice.bid.q, dice.bid.f + 1);
        } else {
          makeBid(room, playerId, dice.bid.q + 1, 1);
        }
      }
    }
  }, 1000);
  if (typeof timer.unref === 'function') timer.unref();
};
