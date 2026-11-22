/* server-specials.js — special cards and round events for AGROBULL. */
'use strict';

const CROPS = [
  { id: 'w', name: 'Пшеница', icon: '🌾' },
  { id: 'c', name: 'Кукуруза', icon: '🌽' },
  { id: 'k', name: 'Морковь', icon: '🥕' }
];

const SPECIAL = {
  curse: { id: 'curse', icon: '💀', name: 'Проклятие', special: true },
  reverse: { id: 'reverse', icon: '🔄', name: 'Переворот', special: true },
  shield: { id: 'shield', icon: '🛡️', name: 'Защита', special: true },
  revenge: { id: 'revenge', icon: '⚔️', name: 'Реванш', special: true },
  blind: { id: 'blind', icon: '🎲', name: 'Слепая ставка', special: true }
};

const EVENTS = [
  { id: 'wild2', name: 'Двойной урожай', desc: 'в этом раунде подходят две культуры' },
  { id: 'noBull', name: 'Быки не в цене', desc: '🐂 в этом раунде не джокеры' },
  { id: 'doubleRide', name: 'Двойной удар', desc: 'проигравший получает +1 уровень' }
];

const REVENGE_WINDOW = 2500;

module.exports = function attachSpecials(io, ctx = {}) {
  const {
    getRoomForSocket: roomFor,
    rooms,
    broadcastState,
    nextPlayerWithCards,
    playerById
  } = ctx;

  if (typeof roomFor !== 'function' || !rooms || typeof broadcastState !== 'function' ||
      typeof nextPlayerWithCards !== 'function' || typeof playerById !== 'function') {
    throw new Error('server-specials: передай getRoomForSocket, rooms, broadcastState, nextPlayerWithCards, playerById');
  }

  const modeOf = room => {
    if (room.ranked) return 'classic';
    const settings = typeof io.settingsOf === 'function' ? io.settingsOf(room.code) : null;
    return settings && ['classic', 'double', 'chaos'].includes(settings.mode) ? settings.mode : 'classic';
  };

  const emitFx = (room, type, data = {}) => {
    io.to(room.code).emit('cardFx', { type, ...data });
  };

  const take = (hand, cardId) => {
    const index = hand.findIndex(card => card.id === cardId);
    return index >= 0 ? hand.splice(index, 1)[0] : null;
  };

  const pick = values => values[Math.floor(Math.random() * values.length)];

  io.cardFx = {
    extendDeck(room, deck) {
      const mode = modeOf(room);
      if (mode === 'classic') return;
      const copies = mode === 'chaos' ? 2 : 1;
      for (const card of Object.values(SPECIAL)) {
        for (let i = 0; i < copies; i++) deck.push({ ...card });
      }
    },

    roundInit(room, table) {
      const result = { dir: 1, table2: null, event: null };
      if (modeOf(room) === 'chaos' && Math.random() < 2 / 3) {
        const event = pick(EVENTS);
        result.event = { ...event };
        if (event.id === 'wild2') {
          result.table2 = pick(CROPS.filter(crop => crop.id !== table.id));
        }
        const round = ((room.game && room.game.round) || 0) + 1;
        result.message =
          'Раунд ' + round + '. На столе ' + table.name +
          (result.table2 ? ' и ' + result.table2.name : '') +
          '. ⚡ ' + event.name + ': ' + event.desc + '.';
      }
      return result;
    },

    beforePlay(room, player, cards) {
      if (!cards.some(card => card.id === 'blind')) return;
      const maxExtra = Math.min(3 - cards.length, 1 + Math.floor(Math.random() * 2), player.hand.length);
      for (let i = 0; i < maxExtra; i++) {
        const index = Math.floor(Math.random() * player.hand.length);
        cards.push(player.hand.splice(index, 1)[0]);
      }
      cards.blindAdded = Math.max(0, maxExtra);
    },

    afterPlay(room, player, cards) {
      const game = room.game;
      if (!game) return;
      let note = '';

      if (cards.blindAdded) {
        note += ' 🎲 «Слепая ставка»: добавлено ещё ' + cards.blindAdded + ' карт.';
        emitFx(room, 'blind', { from: player.id });
      }

      if (cards.some(card => card.id === 'reverse')) {
        game.dir = game.dir === -1 ? 1 : -1;
        note += ' 🔄 Направление хода изменилось!';
        emitFx(room, 'reverse', { from: player.id, dir: game.dir });
      }

      if (cards.some(card => card.id === 'curse')) {
        const target = nextPlayerWithCards(room, player.id);
        if (target && target.id !== player.id) {
          target.cursed = true;
          note += ' 💀 ' + target.name + ' проклят!';
          emitFx(room, 'curse', { from: player.id, to: target.id });
        }
      }

      if (note) game.message += note;
    },

    beforeRide(room, loser) {
      const game = room.game;
      const result = { add: 1, shielded: false, cursed: false, doubled: false };

      if (take(loser.hand, 'shield')) {
        result.add = 0;
        result.shielded = true;
        return result;
      }

      if (loser.cursed) {
        result.add += 1;
        result.cursed = true;
        loser.cursed = false;
      }

      if (game && game.event && game.event.id === 'doubleRide') {
        result.add += 1;
        result.doubled = true;
      }
      return result;
    },

    afterCall(room, { loser, fxr }) {
      const game = room.game;
      if (!game || !fxr) return;

      let note = '';
      if (fxr.shielded) {
        note += ' 🛡 «Защита» спасла ' + loser.name + ': уровень быка не вырос.';
        emitFx(room, 'shield', { to: loser.id });
      }
      if (fxr.cursed) {
        note += ' 💀 Проклятие сработало: ' + loser.name + ' получает ещё +1 уровень.';
        emitFx(room, 'curseHit', { to: loser.id });
      }
      if (fxr.doubled) {
        note += ' ⚡ «Двойной удар»: +1 уровень.';
        emitFx(room, 'doubleRide', { to: loser.id });
      }
      if (game.rodeo) game.rodeo.added = fxr.add;
      if (note) game.message += note;
    }
  };

  io.on('connection', socket => {
    const error = message => socket.emit('roomError', { message });

    socket.on('useCard', (data = {}) => {
      const room = roomFor(socket);
      const game = room && room.game;
      const player = room && playerById(room, socket.data.playerId);

      if (!room || !game || !player || data.type !== 'revenge') return;

      const rodeo = game.rodeo;
      const reveal = game.reveal;

      if (game.phase !== 'rodeo' || !rodeo || !reveal || reveal.isLie ||
          rodeo.callerId !== player.id || rodeo.playerId !== player.id || rodeo.revenged) {
        return error('Реванш доступен, только если твоя проверка оказалась ошибочной.');
      }
      if (Date.now() - rodeo.startedAt > REVENGE_WINDOW) {
        return error('Время для реванша вышло (2,5 секунды).');
      }
      if (!(rodeo.added > 0)) return error('Штрафа нет — реванш не нужен.');

      const accused = playerById(room, reveal.playedById);
      if (!accused || !accused.alive || accused.id === player.id) return;
      if (!take(player.hand, 'revenge')) return error('У тебя нет карты «Реванш».');

      player.rides = Math.max(0, player.rides - rodeo.added);

      const fxr = io.cardFx.beforeRide(room, accused);
      accused.rides += fxr.add;
      const out = accused.rides >= accused.fallAt;

      game.reveal = { ...reveal, loserId: accused.id, loserName: accused.name };
      game.rodeo = {
        ...rodeo,
        playerId: accused.id,
        level: accused.rides,
        threshold: out ? accused.rides : 6,
        out,
        saved: false,
        revenged: true,
        added: fxr.add,
        startedAt: Date.now()
      };
      game.message = '⚔ РЕВАНШ! ' + player.name + ' отправляет штраф обратно — на быка идёт ' + accused.name + '!';

      io.cardFx.afterCall(room, { loser: accused, fxr });
      emitFx(room, 'revenge', { from: player.id, to: accused.id });
      broadcastState(room);
    });
  });
};
