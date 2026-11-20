'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const MODES = ['cards', 'dice'];
const MAX_SESSIONS = 5;
const MAX_DAILY_PAIR_MATCHES = 5;
const SESSION_TTL_DAYS = 30;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 64;
const SCRYPT_BYTES = 32;

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS agro_accounts (",
  "  id TEXT PRIMARY KEY,",
  "  name TEXT NOT NULL,",
  "  name_lower TEXT NOT NULL UNIQUE,",
  "  salt TEXT NOT NULL,",
  "  password_hash TEXT NOT NULL,",
  "  ratings JSONB NOT NULL DEFAULT '{}'::jsonb,",
  "  rated JSONB NOT NULL DEFAULT '{}'::jsonb,",
  "  games INTEGER NOT NULL DEFAULT 0 CHECK (games >= 0),",
  "  wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),",
  "  losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),",
  "  streak INTEGER NOT NULL DEFAULT 0,",
  "  best INTEGER NOT NULL DEFAULT 0,",
  "  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  ");",
  "CREATE INDEX IF NOT EXISTS agro_accounts_cards_rating_idx ON agro_accounts (((ratings ->> 'cards')::integer) DESC);",
  "CREATE INDEX IF NOT EXISTS agro_accounts_dice_rating_idx ON agro_accounts (((ratings ->> 'dice')::integer) DESC);",
  "CREATE TABLE IF NOT EXISTS agro_sessions (",
  "  token_hash TEXT PRIMARY KEY,",
  "  account_id TEXT NOT NULL REFERENCES agro_accounts(id) ON DELETE CASCADE,",
  "  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),",
  "  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),",
  "  expires_at TIMESTAMPTZ NOT NULL",
  ");",
  "CREATE INDEX IF NOT EXISTS agro_sessions_account_idx ON agro_sessions (account_id, created_at DESC);",
  "CREATE TABLE IF NOT EXISTS agro_matches (",
  "  match_id TEXT PRIMARY KEY,",
  "  mode TEXT NOT NULL CHECK (mode IN ('cards','dice')),",
  "  winner_player_id TEXT,",
  "  participants JSONB NOT NULL,",
  "  ranked BOOLEAN NOT NULL DEFAULT FALSE,",
  "  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  ");",
  "CREATE TABLE IF NOT EXISTS agro_rating_pairs (",
  "  account_low TEXT NOT NULL REFERENCES agro_accounts(id) ON DELETE CASCADE,",
  "  account_high TEXT NOT NULL REFERENCES agro_accounts(id) ON DELETE CASCADE,",
  "  played_on DATE NOT NULL,",
  "  games INTEGER NOT NULL DEFAULT 0,",
  "  PRIMARY KEY (account_low, account_high, played_on),",
  "  CHECK (account_low < account_high)",
  ");"
].join('\n');

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const cleanName = value => String(value || '').normalize('NFKC').trim();
const validName = value => /^[\p{L}\p{N}_-]{3,16}$/u.test(value);
const randomId = () => crypto.randomBytes(16).toString('hex');
const accountView = row => ({
  id: row.id,
  name: row.name,
  ratings: { cards: Number(row.ratings && row.ratings.cards) || 1000, dice: Number(row.ratings && row.ratings.dice) || 1000 },
  rated: { cards: Number(row.rated && row.rated.cards) || 0, dice: Number(row.rated && row.rated.dice) || 0 },
  games: Number(row.games) || 0,
  wins: Number(row.wins) || 0,
  losses: Number(row.losses) || 0,
  streak: Number(row.streak) || 0,
  best: Number(row.best) || 0
});

function expectedScore(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

function calculateElo(players) {
  if (!Array.isArray(players) || players.length < 2) return [];
  const winner = players.find(player => player.won);
  if (!winner) return [];
  return players.map(player => {
    const opponents = players.filter(other => other.accountId !== player.accountId);
    const k = player.ratedGames < 30 ? 32 : 20;
    let rawDelta;
    if (player.won) {
      rawDelta = opponents.reduce((sum, opponent) => {
        return sum + k * (1 - expectedScore(player.rating, opponent.rating));
      }, 0) / opponents.length;
    } else {
      rawDelta = -k * expectedScore(player.rating, winner.rating) / opponents.length;
    }
    const delta = Math.round(rawDelta);
    return { ...player, delta, ratingAfter: Math.max(100, player.rating + delta) };
  });
}

module.exports = function attachAccounts(io, ctx = {}) {
  const { rooms, sendLobby } = ctx;
  if (!rooms) throw new TypeError('server-accounts: pass { rooms }');

  let Pool;
  try {
    ({ Pool } = require('pg'));
  } catch (error) {
    throw new Error('server-accounts: pg package is missing. Run npm install.');
  }

  const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 8000
      })
    : null;

  // Internal bot marker: bots receive this secret only from server-bots.js.
  global.__botSecret = global.__botSecret || crypto.randomBytes(32).toString('hex');
  let schemaPromise = null;
  const limits = new Map();

  async function ensureSchema() {
    if (!pool) throw new Error('database-not-configured');
    if (!schemaPromise) {
      schemaPromise = pool.query(SCHEMA).catch(error => {
        schemaPromise = null;
        throw error;
      });
    }
    await schemaPromise;
  }

  function rateLimit(key, max, duration) {
    const now = Date.now();
    const recent = (limits.get(key) || []).filter(time => now - time < duration);
    const blocked = recent.length >= max;
    if (!blocked) recent.push(now);
    limits.set(key, recent);
    return blocked;
  }

  function requestIp(socket) {
    return String(socket.handshake.headers['x-forwarded-for'] ||
      socket.handshake.address || 'unknown').split(',')[0].trim();
  }

  async function derivePassword(password, salt) {
    return scrypt(password, salt, SCRYPT_BYTES);
  }

  async function attachSession(socket, accountId, token, tokenHash) {
    await ensureSchema();
    const result = await pool.query(
      'SELECT id, name, ratings, rated, games, wins, losses, streak, best FROM agro_accounts WHERE id = $1',
      [accountId]
    );
    if (!result.rows[0]) return null;
    const account = accountView(result.rows[0]);
    socket.data.accountId = account.id;
    socket.data.account = account;
    socket.data.accountTokenHash = tokenHash || hashToken(token);
    playerAccountCache.set(account.id, account);
    const room = socket.data.roomCode && rooms.get(socket.data.roomCode);
    const seated = room && room.players.find(player => player.id === socket.data.playerId);
    const roomActive = room && ((room.game && room.game.phase !== 'finished') ||
      (room.dice && room.dice.phase !== 'finished'));
    if (seated && !roomActive && !room.players.some(player => player.id !== seated.id && player.accountId === account.id)) {
      seated.accountId = account.id;
      seated.ratings = account.ratings;
      seated.rating = account.ratings.cards;
      seated.name = account.name;
      if (sendLobby) sendLobby(room);
    }
    socket.emit('authOk', { token, profile: account });
    return account;
  }

  io.use((socket, next) => {
    const auth = socket.handshake && socket.handshake.auth || {};
    if (auth.botSecret && auth.botSecret === global.__botSecret) socket.data.isBot = true;
    next();
  });

  io.prepareRankedRoom = (room, mode) => {
    if (!room || !MODES.includes(mode)) return false;
    const participants = room.players.map(player => {
      const playerSocket = player.socketId && io.sockets.sockets.get(player.socketId);
      const account = player.accountId && playerAccountCache.get(player.accountId);
      const socketAccount = playerSocket && playerSocket.data && playerSocket.data.account;
      return {
        playerId: player.id,
        accountId: player.accountId || (socketAccount && socketAccount.id) || null,
        bot: !!(player.isBot || (playerSocket && playerSocket.data && playerSocket.data.isBot)),
        rating: account ? account.ratings[mode] : (socketAccount && socketAccount.ratings && socketAccount.ratings[mode]) || 1000
      };
    });
    for (const player of room.players) {
      const participant = participants.find(item => item.playerId === player.id);
      if (participant) player.rating = participant.rating;
    }
    const ids = participants.map(item => item.accountId).filter(Boolean);
    const eligible = participants.length >= 2 &&
      participants.every(item => item.accountId && !item.bot) &&
      new Set(ids).size === participants.length;
    room.ranked = eligible;
    room.rankedMode = mode;
    room.rankedResultRecorded = false;
    room.rankedParticipants = participants;
    return eligible;
  };

  const playerAccountCache = new Map();
  io.accountProfile = accountId => playerAccountCache.get(accountId) || null;

  async function authenticate(socket, event, data = {}) {
    const ip = requestIp(socket);
    const fail = message => socket.emit('authError', { message });
    if (!pool) return fail('Аккаунты пока не подключены: на сервере не настроена PostgreSQL DATABASE_URL.');
    const username = cleanName(data.username);
    const nameLower = username.toLocaleLowerCase('und');
    const password = String(data.password || '');

    try {
      await ensureSchema();
      if (event === 'authRegister') {
        if (rateLimit('register:' + ip, 5, 60 * 60 * 1000)) {
          return fail('Слишком много регистраций с этого адреса. Попробуй позже.');
        }
        if (!validName(username)) return fail('Ник: 3–16 символов — буквы, цифры, _ или -.');
        if (password.length < PASSWORD_MIN || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX) {
          return fail('Пароль должен содержать от 8 до 64 символов.');
        }
        const salt = crypto.randomBytes(16);
        const passwordHash = await derivePassword(password, salt);
        let inserted;
        try {
          inserted = await pool.query(
            'INSERT INTO agro_accounts (id, name, name_lower, salt, password_hash) VALUES ($1,$2,$3,$4,$5) ' +
            'RETURNING id, name, ratings, rated, games, wins, losses, streak, best',
            [randomId(), username, nameLower, salt.toString('hex'), Buffer.from(passwordHash).toString('hex')]
          );
        } catch (error) {
          if (error.code === '23505') return fail('Этот ник уже занят.');
          throw error;
        }
        const account = accountView(inserted.rows[0]);
        const token = await createSession(account.id);
        await attachSession(socket, account.id, token, hashToken(token));
        playerAccountCache.set(account.id, account);
        return;
      }

      if (event === 'authLogin') {
        if (rateLimit('login-ip:' + ip, 10, 10 * 60 * 1000) ||
            rateLimit('login-name:' + nameLower, 5, 5 * 60 * 1000)) {
          return fail('Слишком много попыток входа. Подожди несколько минут.');
        }
        const result = await pool.query(
          'SELECT id, salt, password_hash FROM agro_accounts WHERE name_lower = $1',
          [nameLower]
        );
        const row = result.rows[0];
        if (!row || !password) return fail('Неверный ник или пароль.');
        const candidate = await derivePassword(password, Buffer.from(row.salt, 'hex'));
        const expected = Buffer.from(row.password_hash, 'hex');
        const actual = Buffer.from(candidate);
        if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
          return fail('Неверный ник или пароль.');
        }
        const token = await createSession(row.id);
        await attachSession(socket, row.id, token, hashToken(token));
        const fresh = await pool.query(
          'SELECT id, name, ratings, rated, games, wins, losses, streak, best FROM agro_accounts WHERE id=$1',
          [row.id]
        );
        if (fresh.rows[0]) playerAccountCache.set(row.id, accountView(fresh.rows[0]));
        return;
      }
    } catch (error) {
      console.error('[accounts] authentication failed:', error && error.message || error);
      fail('Сервис аккаунтов временно недоступен. Попробуй ещё раз.');
    }
  }

  async function createSession(accountId) {
    const token = crypto.randomBytes(32).toString('hex');
    const digest = hashToken(token);
    await pool.query(
      'INSERT INTO agro_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, NOW() + ($3 * INTERVAL \'1 day\'))',
      [digest, accountId, SESSION_TTL_DAYS]
    );
    await pool.query(
      'DELETE FROM agro_sessions WHERE token_hash IN (' +
      'SELECT token_hash FROM agro_sessions WHERE account_id=$1 ORDER BY created_at DESC OFFSET $2)',
      [accountId, MAX_SESSIONS]
    );
    return token;
  }

  io.on('connection', socket => {
    const ip = requestIp(socket);
    socket.on('authRegister', data => authenticate(socket, 'authRegister', data || {}));
    socket.on('authLogin', data => authenticate(socket, 'authLogin', data || {}));

    socket.on('authResume', async data => {
      if (!pool) return socket.emit('authError', { message: 'Аккаунты пока не подключены: DATABASE_URL не настроен.', resume: true });
      if (rateLimit('resume:' + ip, 30, 10 * 60 * 1000)) return;
      const token = String(data && data.token || '');
      if (!/^[a-f0-9]{64}$/i.test(token)) return socket.emit('authError', { message: 'Сессия истекла. Войди снова.', resume: true });
      try {
        await ensureSchema();
        const digest = hashToken(token);
        const result = await pool.query(
          'SELECT account_id FROM agro_sessions WHERE token_hash=$1 AND expires_at > NOW()',
          [digest]
        );
        if (!result.rows[0]) return socket.emit('authError', { message: 'Сессия истекла. Войди снова.', resume: true });
        await pool.query('UPDATE agro_sessions SET last_seen=NOW() WHERE token_hash=$1', [digest]);
        const account = await attachSession(socket, result.rows[0].account_id, token, digest);
        if (account) playerAccountCache.set(account.id, account);
      } catch (error) {
        console.error('[accounts] resume failed:', error && error.message || error);
        socket.emit('authError', { message: 'Не удалось восстановить сессию.', resume: true });
      }
    });

    socket.on('authLogout', async data => {
      const token = String(data && data.token || '');
      const digest = token ? hashToken(token) : socket.data.accountTokenHash;
      if (pool && digest) {
        try {
          await ensureSchema();
          await pool.query('DELETE FROM agro_sessions WHERE token_hash=$1', [digest]);
        } catch (error) {
          console.error('[accounts] logout failed:', error && error.message || error);
        }
      }
      const activeRoom = socket.data.roomCode && rooms.get(socket.data.roomCode);
      const seated = activeRoom && activeRoom.players.find(player => player.id === socket.data.playerId);
      if (seated) {
        seated.accountId = null;
        seated.ratings = null;
        seated.rating = null;
        if (!(activeRoom.game && activeRoom.game.phase !== 'finished') &&
            !(activeRoom.dice && activeRoom.dice.phase !== 'finished') && sendLobby) sendLobby(activeRoom);
      }
      socket.data.accountId = null;
      socket.data.account = null;
      socket.data.accountTokenHash = null;
      socket.emit('authOut');
    });

    socket.on('leaderboard', async data => {
      if (!pool) return socket.emit('leaderboardData', { mode: 'cards', top: [], me: null, unavailable: true });
      const mode = data && MODES.includes(data.mode) ? data.mode : 'cards';
      try {
        await ensureSchema();
        const rows = await pool.query(
          "SELECT id, name, ratings, rated FROM agro_accounts " +
          "WHERE (rated ->> $1)::integer > 0 ORDER BY (ratings ->> $1)::integer DESC, (rated ->> $1)::integer DESC, created_at ASC LIMIT 20",
          [mode]
        );
        const top = rows.rows.map((row, index) => ({
          rank: index + 1,
          name: row.name,
          rating: Number(row.ratings[mode]) || 1000,
          games: Number(row.rated[mode]) || 0,
          me: row.id === socket.data.accountId
        }));
        let me = top.find(row => row.me) || null;
        if (!me && socket.data.accountId) {
          const position = await pool.query(
            "SELECT COUNT(*)::integer + 1 AS rank FROM agro_accounts a " +
            "JOIN agro_accounts me ON me.id=$2 " +
            "WHERE (a.rated ->> $1)::integer > 0 AND (" +
            "(a.ratings ->> $1)::integer > (me.ratings ->> $1)::integer OR " +
            "((a.ratings ->> $1)::integer = (me.ratings ->> $1)::integer AND (a.rated ->> $1)::integer > (me.rated ->> $1)::integer) OR " +
            "((a.ratings ->> $1)::integer = (me.ratings ->> $1)::integer AND (a.rated ->> $1)::integer = (me.rated ->> $1)::integer AND a.created_at < me.created_at))",
            [mode, socket.data.accountId]
          );
          const profile = await pool.query(
            'SELECT id,name,ratings,rated FROM agro_accounts WHERE id=$1',
            [socket.data.accountId]
          );
          if (profile.rows[0] && Number(profile.rows[0].rated[mode]) > 0) {
            const row = profile.rows[0];
            me = {
              rank: Number(position.rows[0].rank),
              name: row.name,
              rating: Number(row.ratings[mode]) || 1000,
              games: Number(row.rated[mode]) || 0,
              me: true
            };
          }
        }
        socket.emit('leaderboardData', { mode, top, me });
      } catch (error) {
        console.error('[accounts] leaderboard failed:', error && error.message || error);
        socket.emit('leaderboardData', { mode, top: [], me: null, error: true });
      }
    });

    socket.on('disconnect', () => {
      // Keep the persistent token valid across network interruptions.
    });
  });

  async function settleRankedRoom(room, winnerId, mode, matchId) {
    if (!pool || !room || room.rankedResultRecorded) return;
    const participants = Array.isArray(room.rankedParticipants) ? room.rankedParticipants : [];
    if (participants.length < 2) return;
    room.rankedResultRecorded = true;
    let client;
    try {
      client = await pool.connect();
      await ensureSchema();
      await client.query('BEGIN');
      const inserted = await client.query(
        'INSERT INTO agro_matches (match_id, mode, winner_player_id, participants, ranked) ' +
        'VALUES ($1,$2,$3,$4::jsonb,$5) ON CONFLICT (match_id) DO NOTHING RETURNING match_id',
        [String(matchId), mode, winnerId || null, JSON.stringify(participants), !!room.ranked]
      );
      if (!inserted.rowCount) {
        await client.query('ROLLBACK');
        return;
      }

      const accountIds = [...new Set(participants.map(item => item.accountId).filter(Boolean))].sort();
      if (accountIds.length) {
        const rows = await client.query(
          'SELECT id,name,ratings,rated,games,wins,losses,streak,best FROM agro_accounts WHERE id=ANY($1::text[]) FOR UPDATE',
          [accountIds]
        );
        const accounts = new Map(rows.rows.map(row => [row.id, row]));
        for (const item of participants) {
          const row = item.accountId && accounts.get(item.accountId);
          if (!row || item.bot) continue;
          const won = item.playerId === winnerId;
          const games = Number(row.games) + 1;
          const wins = Number(row.wins) + (won ? 1 : 0);
          const losses = Number(row.losses) + (won ? 0 : 1);
          const streak = won ? Number(row.streak) + 1 : 0;
          const best = Math.max(Number(row.best), streak);
          await client.query(
            'UPDATE agro_accounts SET games=$2,wins=$3,losses=$4,streak=$5,best=$6 WHERE id=$1',
            [row.id, games, wins, losses, streak, best]
          );
          row.games = games; row.wins = wins; row.losses = losses; row.streak = streak; row.best = best;
        }

        const uniqueHumanParticipants = participants.filter(item =>
          item.accountId && !item.bot && accounts.has(item.accountId))
          .sort((a, b) => a.accountId.localeCompare(b.accountId));
        const allRated = room.ranked && participants.length >= 2 &&
          uniqueHumanParticipants.length === participants.length &&
          new Set(uniqueHumanParticipants.map(item => item.accountId)).size === participants.length;
        const winnerParticipant = participants.find(item => item.playerId === winnerId);
        const winnerAccount = winnerParticipant && winnerParticipant.accountId &&
          uniqueHumanParticipants.find(item => item.playerId === winnerId);

        let rated = false;
        let note = allRated ? '' : 'Матч без рейтинга: нужны аккаунты у всех игроков и не должно быть ботов.';
        if (allRated && winnerAccount && MODES.includes(mode)) {
          const d0 = new Date().toISOString().slice(0, 10);
          let capped = false;
          const pairs = [];
          for (let i = 0; i < uniqueHumanParticipants.length; i++) {
            for (let j = i + 1; j < uniqueHumanParticipants.length; j++) {
              const ids = [uniqueHumanParticipants[i].accountId, uniqueHumanParticipants[j].accountId].sort();
              const lockKey = ids[0] + ':' + ids[1] + ':' + d0;
              await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [lockKey]);
              const pair = await client.query(
                'SELECT games FROM agro_rating_pairs WHERE account_low=$1 AND account_high=$2 AND played_on=$3 FOR UPDATE',
                [ids[0], ids[1], d0]
              );
              if (Number(pair.rows[0] && pair.rows[0].games || 0) >= MAX_DAILY_PAIR_MATCHES) capped = true;
              pairs.push(ids);
            }
          }

          if (capped) {
            note = 'Дневной лимит рейтинговых игр с этой парой исчерпан (5 в сутки).';
          } else {
            const current = uniqueHumanParticipants.map(item => {
              const row = accounts.get(item.accountId);
              return {
                playerId: item.playerId,
                accountId: item.accountId,
                rating: Number(row.ratings[mode]) || 1000,
                ratedGames: Number(row.rated[mode]) || 0,
                won: item.playerId === winnerId
              };
            });
            const changes = calculateElo(current);
            for (const change of changes) {
              const row = accounts.get(change.accountId);
              const ratings = { ...row.ratings, [mode]: change.ratingAfter };
              const ratedCounts = { ...row.rated, [mode]: Number(row.rated[mode]) + 1 };
              await client.query(
                'UPDATE agro_accounts SET ratings=$2::jsonb,rated=$3::jsonb WHERE id=$1',
                [change.accountId, JSON.stringify(ratings), JSON.stringify(ratedCounts)]
              );
              row.ratings = ratings;
              row.rated = ratedCounts;
              row._ratingDelta = change.delta;
            }
            for (const ids of pairs) {
              await client.query(
                'INSERT INTO agro_rating_pairs (account_low,account_high,played_on,games) ' +
                'VALUES ($1,$2,$3,1) ON CONFLICT (account_low,account_high,played_on) ' +
                'DO UPDATE SET games=agro_rating_pairs.games+1',
                [ids[0], ids[1], d0]
              );
            }
            rated = true;
            note = 'Рейтинг обновлён.';
          }
        }

        await client.query(
          'UPDATE agro_matches SET ranked=$2 WHERE match_id=$1',
          [String(matchId), rated]
        );
        await client.query('COMMIT');

        for (const item of participants) {
          const row = item.accountId && accounts.get(item.accountId);
          if (!row || item.bot) continue;
          const profile = accountView(row);
          playerAccountCache.set(row.id, profile);
          for (const connectedSocket of io.sockets.sockets.values()) {
            if (connectedSocket.data.accountId === row.id) {
              connectedSocket.data.account = profile;
              connectedSocket.emit('profile', profile);
            }
          }
          const player = room.players.find(value => value.id === item.playerId);
          const playerSocket = player && (io.sockets.sockets.get(player.socketId) || player._sock);
          if (playerSocket) {
            if (rated) playerSocket.emit('ratingChange', {
              mode,
              delta: Number(row._ratingDelta) || 0,
              rating: profile.ratings[mode],
              ranked: true,
              note,
              won: item.playerId === winnerId
            });
            else playerSocket.emit('ratingChange', {
              mode,
              delta: 0,
              rating: profile.ratings[mode],
              ranked: false,
              note,
              won: item.playerId === winnerId
            });
          }
        }
      } else {
        await client.query('COMMIT');
      }
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      room.rankedResultRecorded = false;
      console.error('[accounts] result settlement failed:', error && error.message || error);
    } finally {
      if (client) client.release();
    }
  }

  io.settleRankedRoom = (room, winnerId, mode, matchId) =>
    settleRankedRoom(room, winnerId, mode, matchId);

  io.on('error', error => {
    console.error('[accounts] Socket.IO error:', error && error.message || error);
  });

  if (pool) {
    pool.on('error', error => console.error('[accounts] PostgreSQL pool error:', error && error.message || error));
  }

  io.accountDatabaseReady = !!pool;
};

module.exports.calculateElo = calculateElo;
module.exports.validName = validName;
