'use strict';

/* AGROBULL server bots, 30-second turn timer and quick chat.
 * socket.io-client is already included in package.json.
 */
const { io: ioc } = require('socket.io-client');

const PokerCore = require('./poker-core');

const BOTS = [
  { n: 'Бот Агрессор', ch: 'gus', skin: 'copper', bluff: 0.70, sus: 0.80, wild: 0 },
  { n: 'Бот Хитрец', ch: 'saul', skin: 'lawyer', bluff: 0.50, sus: 0.55, wild: 0 },
  { n: 'Бот Осторожный', ch: 'walter', skin: 'classic', bluff: 0.20, sus: 0.35, wild: 0 },
  { n: 'Бот Хаос', ch: 'jesse', skin: 'neon', bluff: 0.50, sus: 0.50, wild: 1 }
];
const NOISE = { easy: 0.70, normal: 0.30, hard: 0.12 };
const rnd = (a, b) => a + Math.random() * (b - a);

function binomialTail(n, p, k) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  k = Math.ceil(Number(k) || 0);
  p = Math.max(0, Math.min(1, Number(p) || 0));
  if (k <= 0) return 1;
  if (k > n || p === 0) return 0;
  if (p === 1) return 1;

  // Recurrence avoids recalculating combinations in a nested loop.
  let term = Math.pow(1 - p, n);
  let sum = 0;
  for (let x = 0; x <= n; x++) {
    if (x >= k) sum += term;
    if (x < n) term *= ((n - x) / (x + 1)) * (p / (1 - p));
  }
  return Math.max(0, Math.min(1, sum));
}

module.exports = function attachBots(io, ctx = {}) {
  const roomFor = ctx.getRoomForSocket;
  const maxPlayers = Number(ctx.maxPlayers) || 4;
  if (typeof roomFor !== 'function') throw new TypeError('server-bots: pass getRoomForSocket(socket).');

  const pendingByRoom = new Map();
  const turnTimers = new Map();
  let botSerial = 0;

  function finishPending(code) {
    const next = Math.max(0, (pendingByRoom.get(code) || 0) - 1);
    if (next) pendingByRoom.set(code, next);
    else pendingByRoom.delete(code);
  }

  function serverUrl() {
    const httpServer = io.engine && io.engine.httpServer;
    const address = httpServer && typeof httpServer.address === 'function' ? httpServer.address() : null;
    const port = address && typeof address === 'object' && address.port
      ? address.port : Number(process.env.PORT) || 3000;
    const host = process.env.AGROBULL_BOT_HOST || '127.0.0.1';
    return process.env.AGROBULL_BOT_URL || ('http://' + host + ':' + port);
  }

  function spawnBot(code, profile, difficulty) {
    const client = ioc(serverUrl(), {
      transports: ['websocket'], reconnection: false, timeout: 8000, forceNew: true,
      auth: { botSecret: global.__botSecret }
    });
    let playerId = null;
    let latestState = null;
    let turnKey = '';
    let rememberedKey = '';
    let actionTimer = null;
    let diceActionTimer = null;
    let pokerActionTimer = null;
    let latestPokerState = null;
    let pokerTurnKey = '';
    let latestDiceState = null;
    let diceTurnKey = '';
    let finishTimer = null;
    let maxLifetime = null;
    let pendingReleased = false;
    let closed = false;
    let abilitiesEnabled = true;
    let beggingDecisionKey = '';
    let revengeKey = '';
    let secondaryAbilityKey = '';
    let peekInfo = null;
    const memory = new Map();
    const noise = NOISE[difficulty] ?? NOISE.normal;

    function releasePending() {
      if (pendingReleased) return;
      pendingReleased = true;
      finishPending(code);
    }
    function stop() {
      if (closed) return;
      closed = true;
      clearTimeout(actionTimer);
      clearTimeout(diceActionTimer);
      clearTimeout(pokerActionTimer);
      clearTimeout(finishTimer);
      clearTimeout(maxLifetime);
      releasePending();
      client.disconnect();
    }

    function validCard(state, card) {
      if (!card || !state || !state.table) return false;
      if (card.id === state.table.id) return true;
      if (state.table2 && card.id === state.table2.id) return true;
      return card.id === 'b' && (!state.event || state.event.id !== 'noBull');
    }

    function peekKey(state) {
      return state ? [state.gameId, state.round, state.pileCount,
        state.lastPlay && state.lastPlay.playerId].join('|') : '';
    }

    function remember(state) {
      const last = state.lastPlay;
      if (!last || !last.revealed || !Array.isArray(last.cards)) return;
      const key = [state.gameId, state.round, state.pileCount, last.playerId].join('|');
      if (key === rememberedKey) return;
      rememberedKey = key;
      const rec = memory.get(last.playerId) || { lies: 0, seen: 0 };
      rec.seen++;
      if (last.cards.some(card => !validCard(state, card))) rec.lies++;
      memory.set(last.playerId, rec);
    }

    function scheduleCardAction(delay) {
      clearTimeout(actionTimer);
      actionTimer = setTimeout(() => act(latestState), delay == null ? rnd(850, 1250) : delay);
    }

    function actDice(state) {
      if (closed || !state || state.phase !== 'bidding' || state.turnId !== playerId) return;
      const mine = Array.isArray(state.myDice) ? state.myDice : [];
      const total = Math.max(mine.length, Number(state.total) || mine.length);
      const unknown = Math.max(0, total - mine.length);
      const have = face => mine.filter(value => value === face || (face !== 1 && value === 1)).length;
      const probability = (quantity, face) =>
        binomialTail(unknown, face === 1 ? 1 / 6 : 2 / 6, quantity - have(face));
      const bid = state.bid;

      if (bid) {
        const chance = probability(bid.q, bid.f);
        const suspicion = (Number(profile.sus) - 0.5) * 0.3;
        const uncertainty = (Math.random() - 0.5) * noise;
        if (chance + suspicion + uncertainty < 0.35) {
          client.emit('diceCall');
          return;
        }
      }

      const candidates = [];
      const firstQuantity = bid ? bid.q : 1;
      const lastQuantity = Math.min(total, firstQuantity + 3);
      for (let quantity = firstQuantity; quantity <= lastQuantity; quantity++) {
        for (let face = 1; face <= 6; face++) {
          if (bid && !(quantity > bid.q || (quantity === bid.q && face > bid.f))) continue;
          candidates.push({ q: quantity, f: face, chance: probability(quantity, face) });
        }
      }
      if (!candidates.length) {
        if (bid) client.emit('diceCall');
        return;
      }
      candidates.sort((a, b) => b.chance - a.chance);
      const alternate = Math.min(candidates.length - 1, 1 + Math.floor(Math.random() * 3));
      const pick = Math.random() < (Number(profile.bluff) || 0) * 0.45
        ? candidates[alternate] : candidates[0];
      client.emit('diceBid', { q: pick.q, f: pick.f });
    }

    function chooseUnique(items, count) {
      const copy = items.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy.slice(0, count);
    }

    function act(state) {
      if (closed || !state || state.phase !== 'playing' ||
          state.currentId !== playerId || !state.table) return;

      const players = Array.isArray(state.players) ? state.players : [];
      const me = players.find(player => player.id === playerId);
      if (!me || !Array.isArray(me.hand) || !me.hand.length) return;

      const hand = me.hand;
      const last = state.lastPlay;
      const eventId = state.event && state.event.id;
      const tableId = state.table.id;
      const secondTableId = state.table2 && state.table2.id;
      const opponents = players.filter(player => player.alive && player.id !== playerId && player.handCount > 0);
      const isValid = card => validCard(state, card);

      // Use new abilities sparingly, then continue the same turn with the refreshed hand/state.
      const secondary = me.ability2;
      const abilityTurnKey = [state.gameId, state.round, state.pileCount,
        last ? last.playerId + ':' + last.count : 'none'].join('|');
      if (abilitiesEnabled && secondary && secondary.left > 0 &&
          !secondary.blocked && !(me.ability2 && me.ability2.blocked) &&
          secondaryAbilityKey !== abilityTurnKey) {
        const targets = opponents.slice();
        let payload = null;

        if (secondary.id === 'look' && last && last.playerId !== playerId &&
            !last.revealed && Math.random() < 0.62) {
          payload = {};
        } else if (secondary.id === 'jam' && targets.length && Math.random() < 0.34) {
          targets.sort((a, b) => {
            const aValue = ((a.ability2 && !a.ability2.blocked && a.ability2.id) ? 2 : 0) +
              ((a.ability && a.ability.id === 'revive') ? 2 : 0) + (Number(a.rides) || 0) * 0.15;
            const bValue = ((b.ability2 && !b.ability2.blocked && b.ability2.id) ? 2 : 0) +
              ((b.ability && b.ability.id === 'revive') ? 2 : 0) + (Number(b.rides) || 0) * 0.15;
            return bValue - aValue;
          });
          if (targets[0]) payload = { targetId: targets[0].id };
        } else if (secondary.id === 'fake' && hand.length >= 2 &&
                   opponents.length && Math.random() < 0.22) {
          payload = { dir: Math.random() < 0.5 ? 1 : -1 };
        } else if (secondary.id === 'seat' && targets.length && Math.random() < 0.10) {
          payload = { targetId: targets[Math.floor(Math.random() * targets.length)].id };
        }

        if (payload) {
          secondaryAbilityKey = abilityTurnKey;
          client.emit('ability2', payload);
          scheduleCardAction(rnd(850, 1250));
          return;
        }
      }

      // Original character abilities remain available alongside the second ability.
      if (abilitiesEnabled && !(me.ability2 && me.ability2.blocked) &&
          me.ability && !me.abilityUsed) {
        if (me.ability.id === 'peek' && last && last.playerId !== playerId &&
            !last.revealed && Math.random() < 0.68) {
          client.emit('useAbility', { type: 'peek', targetId: last.playerId });
          scheduleCardAction(rnd(850, 1200));
          return;
        }

        if (me.ability.id === 'swap' && opponents.length && Math.random() < 0.28) {
          const invalidIndex = hand.findIndex(card => !isValid(card) &&
            card.id !== 'shield' && card.id !== 'revenge');
          const index = invalidIndex >= 0 ? invalidIndex : Math.floor(Math.random() * hand.length);
          const target = opponents.slice().sort((a, b) =>
            (Number(b.handCount) || 0) - (Number(a.handCount) || 0))[0];
          if (target) {
            client.emit('useAbility', { type: 'swap', index, targetId: target.id });
            scheduleCardAction(rnd(850, 1200));
            return;
          }
        }
      }

      if (last && last.playerId !== playerId && opponents.length &&
          !(state.begging && state.begging.fromId === last.playerId && Number(state.begging.expiresAt) > Date.now())) {
        const deckSize = ({ classic: 20, double: 25, chaos: 30 })[state.mode] || 20;
        const totalValid = 6 + (eventId === 'noBull' ? 0 : 2) + (secondTableId ? 6 : 0);
        const knownValid = hand.filter(isValid).length;
        const unknownCards = Math.max(1, deckSize - hand.length -
          Math.max(0, (Number(state.pileCount) || 0) - (Number(last.count) || 0)));
        const unseenValid = Math.max(0, Math.min(unknownCards,
          totalValid - knownValid - Math.max(0, (Number(state.pileCount) || 0) -
            (Number(last.count) || 0)) * 0.45));
        const playedCount = Math.max(1, Number(last.count) || 1);

        let honestChance = 1;
        for (let i = 0; i < playedCount; i++) {
          honestChance *= Math.max(0, unseenValid - i) / Math.max(1, unknownCards - i);
        }

        const info = peekInfo && peekInfo.key === peekKey(state) ? peekInfo : null;
        if (info) {
          const peekHasLie = info.cards.some(card => {
            const idByName = {
              'Пшеница': 'w', 'Кукуруза': 'c', 'Морковь': 'k', 'Бык': 'b',
              'Проклятие': 'curse', 'Переворот': 'reverse', 'Защита': 'shield',
              'Реванш': 'revenge', 'Слепая ставка': 'blind'
            }[card.name] || 'unknown';
            return !isValid({ id: idByName });
          });
          if (peekHasLie) {
            client.emit('callBluff');
            return;
          }
          honestChance = info.partial ? Math.min(1, honestChance + 0.15) : 1;
        }

        const history = memory.get(last.playerId);
        const historyBias = history && history.seen > 1
          ? ((history.lies / history.seen) - 0.4) * 0.3 : 0;
        const chaosBias = profile.wild ? (Math.random() - 0.5) * 0.45 : 0;
        const eventRisk = eventId === 'doubleRide' ? 0.06 : 0;
        const curseRisk = me.cursed ? 0.10 : 0;
        const suspicion = (Number(profile.sus) - 0.5) * 0.4;
        const score = (1 - honestChance) + suspicion + historyBias + chaosBias -
          eventRisk - curseRisk + (Math.random() - 0.5) * noise;
        if (score > 0.62) {
          client.emit('callBluff');
          return;
        }
      }

      const valid = [];
      const bluff = [];
      const protectedCards = [];
      hand.forEach((card, index) => {
        if (isValid(card)) valid.push(index);
        else if (card.id === 'shield' || card.id === 'revenge') protectedCards.push(index);
        else bluff.push(index);
      });

      const count = Math.min(3, hand.length,
        1 + (Math.random() < 0.35 ? 1 : 0) + (Math.random() < 0.12 ? 1 : 0));
      const useBluff = bluff.length > 0 &&
        (valid.length === 0 || Math.random() < Number(profile.bluff));
      let pool = useBluff ? bluff : valid;

      // Keep automatic Shield and quick Revenge unless there is no other card to play.
      if (!pool.length) pool = bluff.length ? bluff : protectedCards;
      const indexes = chooseUnique(pool.length ? pool : hand.map((_, index) => index), count)
        .sort((a, b) => a - b);
      if (indexes.length) client.emit('playCards', { indexes });
    }
    client.on('connect', () => client.emit('joinRoom', {
      name: profile.n, character: profile.ch, skin: profile.skin, code
    }));
    client.on('joined', data => {
      playerId = data && data.playerId;
      releasePending();
      client.emit('getSettings');
      client.emit('setReady', true);
    });
    client.on('settings', settings => {
      abilitiesEnabled = !settings || settings.abilities !== false;
    });
    client.on('privatePeek', data => {
      if (latestState && latestState.lastPlay) {
        peekInfo = { key: peekKey(latestState), cards: Array.isArray(data.cards) ? data.cards : [],
          partial: !!data.partial };
      }
    });
    client.on('connect_error', () => { if (!playerId) stop(); });
    client.on('roomError', () => stop());
    client.on('gameState', state => {
      if (closed || !state) return;
      latestState = state;
      remember(state);
      const me = (state.players || []).find(player => player.id === playerId);

      if (state.phase === 'lobby') {
        clearTimeout(actionTimer);
        clearTimeout(diceActionTimer);
        clearTimeout(finishTimer);
        turnKey = '';
        diceTurnKey = '';
        beggingDecisionKey = '';
        secondaryAbilityKey = '';
        peekInfo = null;
        client.emit('getSettings');
        client.emit('setReady', true);
        return;
      }

      if (state.phase === 'finished') {
        clearTimeout(actionTimer);
        clearTimeout(diceActionTimer);
        if (!finishTimer) finishTimer = setTimeout(() => {
          client.emit('leaveRoom');
          stop();
        }, 45_000);
        return;
      }

      if (state.phase === 'rodeo') {
        clearTimeout(actionTimer);
        if (me && abilitiesEnabled && state.rodeo &&
            state.rodeo.playerId === playerId && state.rodeo.out && !state.rodeo.saved &&
            !(me.ability2 && me.ability2.blocked) &&
            me.ability && me.ability.id === 'revive' && !me.abilityUsed) {
          client.emit('useAbility', { type: 'revive' });
        }

        const rodeo = state.rodeo;
        if (me && rodeo && state.reveal && !state.reveal.isLie &&
            rodeo.callerId === playerId && rodeo.playerId === playerId &&
            !rodeo.revenged && Number(rodeo.added) > 0 &&
            Array.isArray(me.hand) && me.hand.some(card => card.id === 'revenge')) {
          const key = [state.gameId, state.round, 'revenge', rodeo.startedAt].join('|');
          if (key !== revengeKey) {
            revengeKey = key;
            setTimeout(() => {
              const latest = latestState;
              const current = latest && latest.players &&
                latest.players.find(player => player.id === playerId);
              if (!closed && latest && latest.phase === 'rodeo' && latest.rodeo &&
                  latest.rodeo.callerId === playerId && latest.rodeo.playerId === playerId &&
                  !latest.rodeo.revenged && current && (current.hand || []).some(card => card.id === 'revenge')) {
                client.emit('useCard', { type: 'revenge' });
              }
            }, rnd(250, 650));
          }
        }
        return;
      }

      if (state.phase !== 'playing' || !playerId) return;

      // Saul's shield blocks only challenges; bots still take their normal turn.

      // Saul's original "beg" ability is used after the bot has played.
      if (me && abilitiesEnabled && !(me.ability2 && me.ability2.blocked) &&
          me.ability && me.ability.id === 'beg' && !me.abilityUsed &&
          !state.begging && state.lastPlay &&
          state.lastPlay.playerId === playerId && state.currentId !== playerId) {
        const key = [state.gameId, state.round, state.pileCount, 'beg'].join('|');
        if (key !== beggingDecisionKey && Math.random() < 0.62) {
          beggingDecisionKey = key;
          client.emit('useAbility', { type: 'beg' });
        }
      }

      if (state.currentId !== playerId) {
        clearTimeout(actionTimer);
        return;
      }

      const key = [state.gameId, state.round, state.pileCount, state.currentId,
        state.lastPlay && state.lastPlay.playerId || 'none',
        state.lastPlay && state.lastPlay.count || 0].join('|');
      if (key === turnKey) return;
      turnKey = key;
      clearTimeout(actionTimer);
      actionTimer = setTimeout(() => act(latestState), rnd(1000, 2300));
    });
    client.on('diceState', state => {
      if (closed || !state) return;
      latestDiceState = state;
      if (state.phase !== 'bidding' || state.turnId !== playerId) {
        clearTimeout(diceActionTimer);
        return;
      }
      const key = [state.round, state.bid ? state.bid.q + 'x' + state.bid.f : '-', state.turnId].join('|');
      if (key === diceTurnKey) return;
      diceTurnKey = key;
      clearTimeout(diceActionTimer);
      diceActionTimer = setTimeout(() => actDice(latestDiceState), rnd(1100, 2500));
    });

    function cardCode(name) {
      const value = String(name || '');
      const suit = PokerCore.SUITS.indexOf(value.slice(-1));
      const rank = PokerCore.RANKS.indexOf(value.slice(0, -1));
      return rank < 0 || suit < 0 ? -1 : rank * 4 + suit;
    }
    function actPoker(state) {
      if (closed || !state || state.phase !== 'playing' || state.turnId !== playerId) return;
      const me = (state.players || []).find(p => p.id === playerId);
      const mine = (me && Array.isArray(me.hand) ? me.hand : []).map(cardCode);
      if (!mine.length || mine.some(card => card < 0)) return;
      const unknown = Math.max(0, (state.players || []).filter(p => p.alive).length * 5 - mine.length);
      const current = state.claim;
      const candidates = (state.claims || []).filter(claim => !current ||
        PokerCore.cmp(claim, current) > 0).slice(0, 28);
      if (current) {
        let chance = 0.5;
        try { chance = PokerCore.prob(mine, unknown, current, 55); } catch (_) {}
        const suspicion = (Number(profile.sus) - 0.5) * 0.24;
        if (chance + suspicion + (Math.random() - 0.5) * noise < 0.29) {
          client.emit('pokerCall');
          return;
        }
      }
      if (!candidates.length) {
        if (current) client.emit('pokerCall');
        return;
      }
      const ranked = candidates.map(claim => {
        let chance = 0;
        try { chance = PokerCore.prob(mine, unknown, claim, 35); } catch (_) {}
        return { claim, chance };
      }).sort((a,b) => b.chance - a.chance);
      const pick = ranked[Math.floor(Math.random() * Math.min(4, ranked.length))] || ranked[0];
      client.emit('pokerClaim', { claim: pick.claim });
    }

    client.on('pokerState', state => {
      if (closed || !state) return;
      latestPokerState = state;
      if (state.phase === 'finished') {
        clearTimeout(pokerActionTimer);
        if (!finishTimer) finishTimer = setTimeout(() => {
          client.emit('leaveRoom');
          stop();
        }, 45000);
        return;
      }
      if (state.phase !== 'playing' || state.turnId !== playerId) {
        clearTimeout(pokerActionTimer);
        return;
      }
      const key = [state.round, state.turnId, state.claim ? PokerCore.ALL.findIndex(c => PokerCore.cmp(c,state.claim)===0) : -1].join('|');
      if (key === pokerTurnKey) return;
      pokerTurnKey = key;
      clearTimeout(pokerActionTimer);
      pokerActionTimer = setTimeout(() => actPoker(latestPokerState), rnd(1000, 2200));
    });

    maxLifetime = setTimeout(() => {
      if (closed) return;
      if (playerId) client.emit('leaveRoom');
      stop();
    }, 30 * 60 * 1000);
    if (typeof maxLifetime.unref === 'function') maxLifetime.unref();
    client.on('disconnect', () => {
      clearTimeout(maxLifetime);
      clearTimeout(actionTimer);
      clearTimeout(diceActionTimer);
      clearTimeout(pokerActionTimer);
      clearTimeout(finishTimer);
      releasePending();
      closed = true;
    });
  }

  io.on('connection', socket => {
    socket.on('addBots', (data = {}) => {
      const room = roomFor(socket);
      const requesterId = socket.data && socket.data.playerId;
      if (!room || !requesterId || room.hostId !== requesterId) {
        socket.emit('botsError', { message: 'Добавлять ботов может только создатель комнаты.' });
        return;
      }
      if (room.game || (room.dice && room.dice.phase !== 'finished')) {
        socket.emit('botsError', { message: 'Ботов можно добавлять только до начала матча.' });
        return;
      }
      const difficulty = ['easy', 'normal', 'hard'].includes(data.diff) ? data.diff : 'normal';
      const requested = Math.max(1, Math.min(3, Number(data.count) || 1));
      const pending = pendingByRoom.get(room.code) || 0;
      const roomLimit = typeof io.settingsOf === 'function' ? Number(io.settingsOf(room.code).maxPlayers) || maxPlayers : maxPlayers;
      const free = Math.max(0, Math.min(maxPlayers, roomLimit) - room.players.length - pending);
      const count = Math.min(requested, free);
      if (!count) {
        socket.emit('botsError', { message: 'В комнате больше нет свободных мест.' });
        return;
      }
      pendingByRoom.set(room.code, pending + count);
      socket.emit('botsQueued', { count });

      for (let i = 0; i < count; i++) {
        const template = BOTS[botSerial++ % BOTS.length];
        const serial = botSerial;
        const profile = { ...template, n: template.n + (serial > BOTS.length ? ' ' + serial : '') };
        setTimeout(() => {
          const live = roomFor(socket);
          if (!live || live.code !== room.code || live.game || live.players.length >= maxPlayers) {
            finishPending(room.code);
            return;
          }
          spawnBot(room.code, profile, difficulty);
        }, i * 350);
      }
    });

    socket.on('chat', (data = {}) => {
      const room = roomFor(socket);
      const player = room && room.players.find(p => p.id === socket.data.playerId);
      if (!room || !player) return;
      const now = Date.now();
      if (socket.data.lastChatAt && now - socket.data.lastChatAt < 800) return;
      socket.data.lastChatAt = now;
      const message = String(data.t || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 80);
      if (!message) return;
      io.to(room.code).emit('chat', { from: player.id, name: player.name, t: message });
    });
  });

  const tick = setInterval(() => {
    const liveRooms = new Set();
    for (const connected of io.sockets.sockets.values()) {
      const room = roomFor(connected);
      if (room) liveRooms.add(room);
    }
    for (const room of liveRooms) {
      const settings = typeof io.settingsOf === 'function' ? io.settingsOf(room.code) : null;
      const turnMs = Math.max(5, Number(settings && settings.turnSec) || 30) * 1000;
      const game = room.game;
      if (!game || game.phase !== 'playing' || !game.currentId) {
        turnTimers.delete(room.code);
        continue;
      }
      const key = [game.gameId, game.round, game.pileCount, game.currentId,
        game.lastPlay ? game.lastPlay.cards.length : 0].join('|');
      let timer = turnTimers.get(room.code);
      if (!timer || timer.key !== key) {
        timer = { key, deadline: Date.now() + turnMs };
        turnTimers.set(room.code, timer);
        io.to(room.code).emit('turnTimer', { id: game.currentId, deadline: timer.deadline, ms: turnMs });
        continue;
      }
      if (Date.now() < timer.deadline) continue;

      const player = room.players.find(p => p.id === game.currentId);
      const playerSocket = player && io.sockets.sockets.get(player.socketId);
      if (!player || !playerSocket || !player.hand.length) {
        timer.deadline = Date.now() + turnMs;
        io.to(room.code).emit('turnTimer', { id: game.currentId, deadline: timer.deadline, ms: turnMs });
        continue;
      }
      timer.deadline = Date.now() + turnMs;
      io.to(room.code).emit('turnTimer', { id: game.currentId, deadline: timer.deadline, ms: turnMs });
      const noOtherHands = !room.players.some(p => p.alive && p.id !== player.id && p.hand.length > 0);
      io.to(room.code).emit('chat', { from: 'timer', name: '⏱', t: player.name + ': время вышло' });

      try {
        const protectedPlay = !!(game.begging && game.lastPlay && game.begging.fromId === game.lastPlay.playerId && Number(game.begging.expiresAt) > Date.now());
        if (game.lastPlay && game.lastPlay.playerId !== player.id && noOtherHands && !protectedPlay) {
          const handler = playerSocket.listeners('callBluff')[0];
          if (handler) handler();
        } else {
          const handler = playerSocket.listeners('playCards')[0];
          if (handler) handler({ indexes: [Math.floor(Math.random() * player.hand.length)] });
        }
      } catch (error) {
        console.error('[server-bots] timeout action failed:', error);
      }
    }
    const liveCodes = new Set([...liveRooms].map(room => room.code));
    for (const code of turnTimers.keys()) if (!liveCodes.has(code)) turnTimers.delete(code);
  }, 1000);
  if (typeof tick.unref === 'function') tick.unref();
};
