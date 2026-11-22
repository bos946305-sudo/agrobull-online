/* AGROBULL ABILITIES — second character abilities and account progression. */
'use strict';

const fs = require('fs');
const path = require('path');

const AB2 = {
  walter: { id: 'fake', name: 'Подделка данных', hint: 'Соперники видят неверное число твоих карт' },
  saul: { id: 'jam', name: 'Глушилка', hint: 'Заблокировать умения соперника' },
  jesse: { id: 'seat', name: 'Смена мест', hint: 'Поменяться местами с соперником (только в свой ход)' },
  gus: { id: 'look', name: 'Взгляд назад', hint: 'Увидеть карты из последней выкладки' }
};

const levelOf = xp => (xp >= 30 ? 3 : xp >= 10 ? 2 : 1);
const usesFor = (id, level) => id === 'seat' ? level : 1;

function makeStore(io, ctx) {
  const pool = ctx.pool || io.pool;

  if (pool) {
    let schemaPromise = null;
    const query = async (sql, params) => {
      if (!schemaPromise) {
        schemaPromise = pool.query(
          'CREATE TABLE IF NOT EXISTS agro_char_xp (' +
          'account_id TEXT NOT NULL, character TEXT NOT NULL, xp INT NOT NULL DEFAULT 0, ' +
          'PRIMARY KEY (account_id, character))'
        ).catch(error => {
          schemaPromise = null;
          throw error;
        });
      }
      await schemaPromise;
      const result = await pool.query(sql, params);
      return result.rows;
    };

    return {
      getXp: async (accountId, character) => {
        const rows = await query(
          'SELECT xp FROM agro_char_xp WHERE account_id = $1 AND character = $2',
          [String(accountId), character]
        );
        return Number((rows[0] || {}).xp) || 0;
      },
      addXp: async (accountId, character, amount) => {
        await query(
          'INSERT INTO agro_char_xp (account_id, character, xp) VALUES ($1, $2, $3) ' +
          'ON CONFLICT (account_id, character) DO UPDATE SET xp = agro_char_xp.xp + EXCLUDED.xp',
          [String(accountId), character, amount]
        );
      }
    };
  }

  const directory = process.env.AGRO_DATA_DIR || path.join(process.cwd(), 'data');
  const file = path.join(directory, 'char_xp.json');
  let data = {};
  let saveTimer = null;

  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  } catch (_) {
    data = {};
  }

  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(file + '.tmp', JSON.stringify(data));
        fs.renameSync(file + '.tmp', file);
      } catch (error) {
        console.error('[abilities] Не удалось сохранить опыт:', error.message);
      }
    }, 400);
    if (saveTimer && typeof saveTimer.unref === 'function') saveTimer.unref();
  };

  return {
    getXp: async (accountId, character) => Number(data[String(accountId) + '|' + character]) || 0,
    addXp: async (accountId, character, amount) => {
      const key = String(accountId) + '|' + character;
      data[key] = (Number(data[key]) || 0) + amount;
      save();
    }
  };
}

module.exports = function attachAbilities(io, ctx = {}) {
  const roomFor = ctx.getRoomForSocket;
  const rooms = ctx.rooms;
  const broadcastState = ctx.broadcastState;
  const playerById = ctx.playerById;

  if (typeof roomFor !== 'function' || !rooms || typeof broadcastState !== 'function' ||
      typeof playerById !== 'function') {
    throw new Error('server-abilities: передай getRoomForSocket, rooms, broadcastState, playerById');
  }

  const getAccountId = ctx.getAccountId || (socket => socket.data && socket.data.accountId);
  let store = null;
  const xpStore = () => store || (store = ctx.store || makeStore(io, ctx));
  const levels = new Map();

  function accountOf(player) {
    if (player.accountId) return String(player.accountId);
    const socket = (player.socketId && io.sockets && io.sockets.sockets.get(player.socketId)) || player._sock;
    const accountId = socket ? getAccountId(socket) : null;
    return accountId ? String(accountId) : null;
  }

  function levelFor(player) {
    const accountId = accountOf(player);
    if (!accountId) return 1;
    return levels.get(accountId + '|' + player.character) || 1;
  }

  function jammed(room, player) {
    return !!(player.jam && room.game && room.game.round <= player.jam.untilRound);
  }

  function abilityState(room, player) {
    const game = room.game;
    const definition = AB2[player.character];
    if (!definition || !game) return null;

    if (!player.ab2 || player.ab2.gameId !== game.gameId) {
      player.ab2 = { gameId: game.gameId, used: 0 };
    }

    const level = levelFor(player);
    return {
      definition,
      level,
      uses: usesFor(definition.id, level),
      used: player.ab2.used
    };
  }

  const emitFx = (room, type, data = {}) => {
    io.to(room.code).emit('abilityFx', Object.assign({ type }, data));
  };

  io.abilities = {
    shownCount(room, player, viewerId) {
      const realCount = player.hand.length;
      if (player.id === viewerId) return realCount;
      const fake = player.fake;
      if (fake && room.game && room.game.round <= fake.untilRound) {
        return Math.max(0, Math.min(9, realCount + fake.delta));
      }
      return realCount;
    },

    info(room, player, viewerId) {
      const state = abilityState(room, player);
      if (!state) return null;

      const blocked = jammed(room, player);
      const result = {
        id: state.definition.id,
        name: state.definition.name,
        blocked
      };

      if (player.id === viewerId) {
        Object.assign(result, {
          hint: state.definition.hint,
          level: state.level,
          uses: state.uses,
          left: Math.max(0, state.uses - state.used),
          blockedRounds: blocked ? player.jam.untilRound - room.game.round + 1 : 0
        });
      }
      return result;
    }
  };

  io.on('connection', socket => {
    const sendError = message => socket.emit('roomError', { message });
    const current = () => {
      const room = roomFor(socket);
      const player = room && playerById(room, socket.data.playerId);
      return room && room.game && player ? { room, game: room.game, player } : null;
    };

    // A jam blocks both the original ability and the new second ability.
    socket.use(([eventName], next) => {
      if (eventName === 'useAbility' || eventName === 'ability2') {
        const state = current();
        if (state && jammed(state.room, state.player)) {
          sendError('Твои умения заблокированы ещё на ' +
            (state.player.jam.untilRound - state.game.round + 1) + ' раунд(а).');
          return next(new Error('jammed'));
        }
      }
      next();
    });

    socket.on('ability2', (data = {}) => {
      const state = current();
      if (!state) return;
      const room = state.room;
      const game = state.game;
      const player = state.player;

      if (game.phase !== 'playing' || !player.alive) {
        return sendError('Сейчас умение недоступно.');
      }

      const ability = abilityState(room, player);
      if (!ability) return;
      if (ability.used >= ability.uses) return sendError('Это умение уже использовано.');

      const target = data.targetId ? playerById(room, String(data.targetId)) : null;
      const validTarget = () => {
        if (!target || !target.alive || target.id === player.id) {
          sendError('Выбери живого соперника.');
          return null;
        }
        return target;
      };

      if (ability.definition.id === 'fake') {
        const magnitude = ability.level + 1;
        const delta = Number(data.dir) < 0 ? -magnitude : magnitude;
        player.fake = {
          delta,
          untilRound: game.round + ability.level - 1
        };
        game.message = '🧪 ' + player.name + ' что-то подделал в своих картах…';
        emitFx(room, 'fake', { from: player.id });
      } else if (ability.definition.id === 'jam') {
        const opponent = validTarget();
        if (!opponent) return;
        opponent.jam = { untilRound: game.round + ability.level };
        game.message = '⚖️ ' + player.name + ' глушит умения игрока ' + opponent.name + '!';
        emitFx(room, 'jam', { from: player.id, to: opponent.id });
      } else if (ability.definition.id === 'seat') {
        if (game.currentId !== player.id) {
          return sendError('Менять места можно только в свой ход.');
        }
        const opponent = validTarget();
        if (!opponent) return;
        const ownIndex = room.players.indexOf(player);
        const targetIndex = room.players.indexOf(opponent);
        if (ownIndex < 0 || targetIndex < 0) return;
        [room.players[ownIndex], room.players[targetIndex]] =
          [room.players[targetIndex], room.players[ownIndex]];
        game.message = '🧢 ' + player.name + ' и ' + opponent.name + ' поменялись местами!';
        emitFx(room, 'seat', { from: player.id, to: opponent.id });
      } else if (ability.definition.id === 'look') {
        const lastPlay = game.lastPlay;
        if (!lastPlay || lastPlay.playerId === player.id || game.reveal) {
          return sendError('Сначала кто-то другой должен выложить карты.');
        }

        const cards = Array.isArray(lastPlay.cards) ? lastPlay.cards.slice() : [];
        for (let i = cards.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [cards[i], cards[j]] = [cards[j], cards[i]];
        }
        const shown = cards.slice(0, ability.level >= 3 ? cards.length : ability.level);
        const owner = playerById(room, lastPlay.playerId);
        socket.emit('privatePeek', {
          targetId: lastPlay.playerId,
          name: owner ? owner.name : 'Игрок',
          partial: shown.length < cards.length,
          cards: shown.map(card => ({ icon: card.icon, name: card.name }))
        });
        game.message = '🎩 ' + player.name + ' бросил взгляд на последнюю выкладку.';
        emitFx(room, 'look', { from: player.id });
      } else {
        return;
      }

      player.ab2.used++;
      broadcastState(room);
    });
  });

  // Load each character's account XP and award XP once when a match finishes.
  const progressTimer = setInterval(async () => {
    for (const room of rooms.values()) {
      const game = room.game;
      if (!game || !game.gameId) continue;

      if (!room._ab || room._ab.gameId !== game.gameId) {
        room._ab = { gameId: game.gameId, loaded: false, done: false };
      }

      if (!room._ab.loaded) {
        room._ab.loaded = true;
        for (const player of room.players) {
          const accountId = accountOf(player);
          if (!accountId) continue;
          try {
            const xp = await xpStore().getXp(accountId, player.character);
            levels.set(accountId + '|' + player.character, levelOf(xp));
          } catch (error) {
            console.error('[abilities] Не удалось загрузить опыт:', error.message);
          }
        }
        // Refresh the ability buttons after account levels are loaded.
        broadcastState(room);
      }

      if (game.phase === 'finished' && !room._ab.done) {
        room._ab.done = true;
        for (const player of room.players) {
          const accountId = accountOf(player);
          if (!accountId) continue;
          try {
            const amount = player.id === game.winnerId ? 3 : 1;
            await xpStore().addXp(accountId, player.character, amount);
            const xp = await xpStore().getXp(accountId, player.character);
            levels.set(accountId + '|' + player.character, levelOf(xp));
          } catch (error) {
            console.error('[abilities] Не удалось начислить опыт:', error.message);
          }
        }
      }
    }
  }, 3000);

  if (typeof progressTimer.unref === 'function') progressTimer.unref();
};
