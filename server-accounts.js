'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const PASSWORD_BYTES = 64;
const RATING_K = 32;
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS agro_accounts (",
  "  id TEXT PRIMARY KEY,",
  "  username TEXT NOT NULL,",
  "  username_key TEXT NOT NULL UNIQUE,",
  "  password_salt TEXT NOT NULL,",
  "  password_hash TEXT NOT NULL,",
  "  rating INTEGER NOT NULL DEFAULT 1000 CHECK (rating >= 100),",
  "  matches INTEGER NOT NULL DEFAULT 0 CHECK (matches >= 0),",
  "  wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),",
  "  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  ");",
  "CREATE INDEX IF NOT EXISTS agro_accounts_leaderboard_idx ON agro_accounts (rating DESC, wins DESC, created_at ASC);",
  "CREATE TABLE IF NOT EXISTS agro_ranked_matches (",
  "  match_id TEXT PRIMARY KEY,",
  "  mode TEXT NOT NULL,",
  "  winner_id TEXT,",
  "  participants JSONB NOT NULL,",
  "  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
  ");"
].join('\n');

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function accountView(row) {
  return {
    id: row.id,
    username: row.username,
    rating: Number(row.rating) || 1000,
    matches: Number(row.matches) || 0,
    wins: Number(row.wins) || 0
  };
}

function normalizeUsername(value) {
  return String(value || '').normalize('NFKC').trim();
}

function usernameIsValid(value) {
  return /^[\p{L}\p{N}_-]{3,18}$/u.test(value);
}

function calculateElo(ratings, winnerId, ids) {
  const active = ratings.filter(item => ids.includes(item.id));
  if (active.length < 2) return [];
  return active.map(player => {
    const opponents = active.filter(item => item.id !== player.id);
    const expected = opponents.reduce((sum, opponent) => {
      return sum + 1 / (1 + Math.pow(10, (opponent.rating - player.rating) / 400));
    }, 0) / opponents.length;
    const score = winnerId ? (winnerId === player.id ? 1 : 0) : 0.5;
    return {
      id: player.id,
      previous: player.rating,
      rating: Math.max(100, Math.round(player.rating + RATING_K * (score - expected))),
      won: !!winnerId && winnerId === player.id
    };
  });
}

module.exports = function attachAccounts(io, ctx = {}) {
  const app = ctx.app;
  if (!app) throw new TypeError('server-accounts: pass { app }');

  let Pool;
  try {
    ({ Pool } = require('pg'));
  } catch (error) {
    throw new Error('server-accounts: install the pg dependency before loading this module.');
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
  const secret = process.env.AUTH_SECRET || process.env.JWT_SECRET || '';
  let schemaPromise = null;

  async function ensureDatabase() {
    if (!pool) throw new Error('database-not-configured');
    if (!schemaPromise) {
      schemaPromise = pool.query(SCHEMA).catch(error => {
        schemaPromise = null;
        throw error;
      });
    }
    await schemaPromise;
  }

  function signToken(account) {
    if (!secret) throw new Error('auth-secret-not-configured');
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({
      sub: account.id,
      username: account.username,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
    }));
    const unsigned = header + '.' + payload;
    const signature = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
    return unsigned + '.' + signature;
  }

  function verifyToken(token) {
    if (!secret || typeof token !== 'string' || token.length > 4096) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const unsigned = parts[0] + '.' + parts[1];
    const expected = crypto.createHmac('sha256', secret).update(unsigned).digest();
    let received;
    try { received = Buffer.from(parts[2], 'base64url'); } catch (_) { return null; }
    if (received.length !== expected.length || !crypto.timingSafeEqual(expected, received)) return null;
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (!payload.sub || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000) return null;
      return payload;
    } catch (_) {
      return null;
    }
  }

  async function hashPassword(password, saltHex) {
    const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
    const hash = await scrypt(password, salt, PASSWORD_BYTES);
    return { salt: salt.toString('hex'), hash: Buffer.from(hash).toString('hex') };
  }

  async function verifyPassword(password, saltHex, hashHex) {
    const computed = await hashPassword(password, saltHex);
    const expected = Buffer.from(hashHex, 'hex');
    const actual = Buffer.from(computed.hash, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  function sendServiceUnavailable(res) {
    res.status(503).json({
      error: 'accounts-not-configured',
      message: 'Аккаунты ещё не подключены. Нужны PostgreSQL и секрет AUTH_SECRET на сервере.'
    });
  }

  function clientIp(req) {
    return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
      .split(',')[0].trim();
  }
  const attempts = new Map();
  function authThrottle(req, res, next) {
    const now = Date.now();
    const key = clientIp(req);
    const entry = attempts.get(key) || { start: now, count: 0 };
    if (now - entry.start > 60000) { entry.start = now; entry.count = 0; }
    entry.count++;
    attempts.set(key, entry);
    if (entry.count > 10) return res.status(429).json({ error: 'too-many-attempts', message: 'Слишком много попыток. Подожди минуту.' });
    next();
  }

  app.get('/api/account/status', (_req, res) => {
    const enabled = !!(pool && secret);
    res.json({ enabled, databaseConfigured: !!pool, secretConfigured: !!secret });
  });

  app.post('/api/account/register', authThrottle, async (req, res) => {
    if (!pool || !secret) return sendServiceUnavailable(res);
    const username = normalizeUsername(req.body && req.body.username);
    const usernameKey = username.toLocaleLowerCase('und');
    const password = String(req.body && req.body.password || '');
    if (!usernameIsValid(username)) {
      return res.status(400).json({ error: 'invalid-username', message: 'Ник должен содержать 3–18 букв, цифр, «_» или «-».' });
    }
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'invalid-password', message: 'Пароль должен быть не короче 8 символов.' });
    }
    try {
      await ensureDatabase();
      const passwordData = await hashPassword(password);
      const result = await pool.query(
        "INSERT INTO agro_accounts (id, username, username_key, password_salt, password_hash) " +
        "VALUES ($1, $2, $3, $4, $5) RETURNING id, username, rating, matches, wins",
        [crypto.randomUUID(), username, usernameKey, passwordData.salt, passwordData.hash]
      );
      const user = accountView(result.rows[0]);
      return res.status(201).json({ token: signToken(user), user });
    } catch (error) {
      if (error && error.code === '23505') {
        return res.status(409).json({ error: 'username-taken', message: 'Этот ник уже занят.' });
      }
      console.error('[accounts] registration failed:', error && error.message || error);
      return res.status(503).json({ error: 'account-storage-unavailable', message: 'Не удалось сохранить аккаунт. Проверь подключение базы данных.' });
    }
  });

  app.post('/api/account/login', authThrottle, async (req, res) => {
    if (!pool || !secret) return sendServiceUnavailable(res);
    const usernameKey = normalizeUsername(req.body && req.body.username).toLocaleLowerCase('und');
    const password = String(req.body && req.body.password || '');
    if (!usernameKey || !password) return res.status(400).json({ error: 'missing-credentials', message: 'Введи ник и пароль.' });
    try {
      await ensureDatabase();
      const result = await pool.query(
        'SELECT id, username, rating, matches, wins, password_salt, password_hash FROM agro_accounts WHERE username_key = $1',
        [usernameKey]
      );
      const row = result.rows[0];
      const valid = row && await verifyPassword(password, row.password_salt, row.password_hash);
      if (!valid) return res.status(401).json({ error: 'invalid-credentials', message: 'Неверный ник или пароль.' });
      const user = accountView(row);
      return res.json({ token: signToken(user), user });
    } catch (error) {
      console.error('[accounts] login failed:', error && error.message || error);
      return res.status(503).json({ error: 'account-storage-unavailable', message: 'Сервис аккаунтов временно недоступен.' });
    }
  });

  function bearerToken(req) {
    const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
    return match ? match[1] : '';
  }

  app.get('/api/account/me', async (req, res) => {
    if (!pool || !secret) return sendServiceUnavailable(res);
    const payload = verifyToken(bearerToken(req));
    if (!payload) return res.status(401).json({ error: 'invalid-token', message: 'Сессия истекла. Войди снова.' });
    try {
      await ensureDatabase();
      const result = await pool.query(
        'SELECT id, username, rating, matches, wins FROM agro_accounts WHERE id = $1',
        [payload.sub]
      );
      if (!result.rows[0]) return res.status(401).json({ error: 'account-not-found', message: 'Аккаунт не найден.' });
      return res.json({ user: accountView(result.rows[0]) });
    } catch (error) {
      console.error('[accounts] profile lookup failed:', error && error.message || error);
      return res.status(503).json({ error: 'account-storage-unavailable', message: 'Сервис аккаунтов временно недоступен.' });
    }
  });

  app.get('/api/leaderboard', async (req, res) => {
    if (!pool) return sendServiceUnavailable(res);
    const limit = Math.max(1, Math.min(100, Math.floor(Number(req.query.limit) || 50)));
    try {
      await ensureDatabase();
      const result = await pool.query(
        'SELECT username, rating, matches, wins FROM agro_accounts WHERE matches > 0 ' +
        'ORDER BY rating DESC, wins DESC, created_at ASC LIMIT $1',
        [limit]
      );
      return res.json({ players: result.rows.map((row, index) => ({
        rank: index + 1,
        username: row.username,
        rating: Number(row.rating) || 1000,
        matches: Number(row.matches) || 0,
        wins: Number(row.wins) || 0
      })) });
    } catch (error) {
      console.error('[accounts] leaderboard failed:', error && error.message || error);
      return res.status(503).json({ error: 'account-storage-unavailable', message: 'Таблица лидеров временно недоступна.' });
    }
  });

  io.use(async (socket, next) => {
    const token = socket.handshake && socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next();
    const payload = verifyToken(token);
    if (!payload || !pool) return next(new Error('account-auth-invalid'));
    try {
      await ensureDatabase();
      const result = await pool.query(
        'SELECT id, username, rating, matches, wins FROM agro_accounts WHERE id = $1',
        [payload.sub]
      );
      if (!result.rows[0]) return next(new Error('account-auth-invalid'));
      socket.data.account = accountView(result.rows[0]);
      return next();
    } catch (error) {
      console.error('[accounts] socket authentication failed:', error && error.message || error);
      return next(new Error('account-auth-unavailable'));
    }
  });

  io.recordRankedResult = async (room, winnerId, mode, matchId) => {
    if (!room || !room.ranked || room.rankedResultRecorded || !pool) return;
    const participants = Array.isArray(room.rankedAccounts) ? room.rankedAccounts : [];
    const unique = [...new Map(participants.filter(item => item && item.accountId)
      .map(item => [item.accountId, item])).values()];
    if (unique.length < 2) return;
    room.rankedResultRecorded = true;

    const idList = unique.map(item => item.accountId);
    const resultId = String(matchId || crypto.randomUUID());
    const client = await pool.connect();
    try {
      await ensureDatabase();
      await client.query('BEGIN');
      const inserted = await client.query(
        "INSERT INTO agro_ranked_matches (match_id, mode, winner_id, participants) " +
        "VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (match_id) DO NOTHING RETURNING match_id",
        [resultId, String(mode || 'cards'), winnerId || null, JSON.stringify(idList)]
      );
      if (!inserted.rowCount) {
        await client.query('ROLLBACK');
        return;
      }
      const accounts = await client.query(
        'SELECT id, username, rating, matches, wins FROM agro_accounts WHERE id = ANY($1::text[]) FOR UPDATE',
        [idList]
      );
      if (accounts.rows.length < 2) {
        await client.query('COMMIT');
        return;
      }
      const changes = calculateElo(
        accounts.rows.map(row => ({ id: row.id, rating: Number(row.rating) || 1000 })),
        winnerId || null,
        idList
      );
      const updated = new Map();
      for (const change of changes) {
        const row = await client.query(
          'UPDATE agro_accounts SET rating = $2, matches = matches + 1, wins = wins + $3 ' +
          'WHERE id = $1 RETURNING id, username, rating, matches, wins',
          [change.id, change.rating, change.won ? 1 : 0]
        );
        if (row.rows[0]) updated.set(change.id, accountView(row.rows[0]));
      }
      await client.query('COMMIT');

      room.rankedAccounts = room.rankedAccounts.map(item => {
        const current = updated.get(item.accountId);
        return current ? { ...item, rating: current.rating } : item;
      });
      for (const player of room.players) {
        const current = player.accountId && updated.get(player.accountId);
        if (!current) continue;
        player.rating = current.rating;
        if (player.socketId) io.to(player.socketId).emit('ratingUpdate', current);
      }
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      room.rankedResultRecorded = false;
      console.error('[accounts] rating update failed:', error && error.message || error);
    } finally {
      client.release();
    }
  };

  io.accountDatabaseReady = !!pool;
};

module.exports.calculateElo = calculateElo;
module.exports.usernameIsValid = usernameIsValid;
