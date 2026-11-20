/* poker-core.js — общие правила «Покерного блефа» для сервера и ботов.
 * Колода: 36 карт (6…A × 4 масти). Карта = ранг * 4 + масть.
 * Заявка: { t: тип, a, b, s }. Комбинация собирается из общего пула карт.
 * Сила: (тип, a, b, s); порядок типов описан в TYPE_NAMES.
 */
'use strict';

const RANKS = Object.freeze(['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']);
const SUITS = Object.freeze(['♣', '♦', '♥', '♠']);
const TYPE_NAMES = Object.freeze([
  'Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит',
  'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш'
]);
const rk = c => c >> 2;
const st = c => c & 3;
const cardName = c => Number.isInteger(c) && c >= 0 && c < 36
  ? RANKS[rk(c)] + SUITS[st(c)]
  : null;
const cmp = (x, y) =>
  (x.t - y.t) || (x.a - y.a) ||
  ((x.b || 0) - (y.b || 0)) ||
  ((x.s || 0) - (y.s || 0));

const all = [];
for (let a = 0; a < 9; a++) all.push({ t: 0, a });
for (let a = 0; a < 9; a++) all.push({ t: 1, a });
for (let a = 1; a < 9; a++) for (let b = 0; b < a; b++) all.push({ t: 2, a, b });
for (let a = 0; a < 9; a++) all.push({ t: 3, a });
for (let a = 4; a < 9; a++) all.push({ t: 4, a });
for (let s = 0; s < 4; s++) all.push({ t: 5, a: 0, s });
for (let a = 0; a < 9; a++) for (let b = 0; b < 9; b++) {
  if (a !== b) all.push({ t: 6, a, b });
}
for (let a = 0; a < 9; a++) all.push({ t: 7, a });
for (let a = 4; a < 9; a++) for (let s = 0; s < 4; s++) all.push({ t: 8, a, s });
all.sort(cmp);
const ALL = Object.freeze(all.map(claim => Object.freeze(claim)));

function norm(c) {
  if (!c || typeof c !== 'object' ||
      !Number.isInteger(c.t) || !Number.isInteger(c.a)) return null;
  if (c.t < 0 || c.t > 8 || c.a < 0 || c.a > 8) return null;
  if ((c.t === 2 || c.t === 6) && !Number.isInteger(c.b)) return null;
  if ((c.t === 5 || c.t === 8) && !Number.isInteger(c.s)) return null;
  if (c.t === 2 && (c.b < 0 || c.b >= c.a)) return null;
  if (c.t === 6 && (c.b < 0 || c.b > 8 || c.b === c.a)) return null;
  if ((c.t === 5 || c.t === 8) && (c.s < 0 || c.s > 3)) return null;
  return ALL.find(x =>
    x.t === c.t && x.a === c.a &&
    (x.b || 0) === (c.b || 0) &&
    (x.s || 0) === (c.s || 0)
  ) || null;
}

const nextHigher = c => {
  const normalized = c ? norm(c) : null;
  if (c && !normalized) return null;
  return ALL.find(x => !normalized || cmp(x, normalized) > 0) || null;
};

function label(c) {
  c = norm(c);
  if (!c) return '';
  return [
    'Старшая карта ' + RANKS[c.a],
    'Пара ' + RANKS[c.a],
    'Две пары: ' + RANKS[c.a] + ' и ' + RANKS[c.b],
    'Тройка ' + RANKS[c.a],
    'Стрит до ' + RANKS[c.a],
    'Флеш ' + SUITS[c.s],
    'Фулл-хаус: ' + RANKS[c.a] + ' на ' + RANKS[c.b],
    'Каре ' + RANKS[c.a],
    'Стрит-флеш до ' + RANKS[c.a] + ' ' + SUITS[c.s]
  ][c.t];
}

function used(claim, pool) {
  const c = norm(claim);
  if (!c || !Array.isArray(pool)) return null;
  const n = (rank, count) => {
    const cards = pool.filter(x => Number.isInteger(x) && x >= 0 && x < 36 && rk(x) === rank);
    return cards.length >= count ? cards.slice(0, count) : null;
  };
  switch (c.t) {
    case 0: return n(c.a, 1);
    case 1: return n(c.a, 2);
    case 2: {
      const x = n(c.a, 2), y = n(c.b, 2);
      return x && y ? [...x, ...y] : null;
    }
    case 3: return n(c.a, 3);
    case 4: {
      const cards = [];
      for (let rank = c.a - 4; rank <= c.a; rank++) {
        const one = n(rank, 1);
        if (!one) return null;
        cards.push(one[0]);
      }
      return cards;
    }
    case 5: {
      const cards = pool.filter(x => Number.isInteger(x) && x >= 0 && x < 36 && st(x) === c.s);
      return cards.length >= 5 ? cards.slice(0, 5) : null;
    }
    case 6: {
      const x = n(c.a, 3), y = n(c.b, 2);
      return x && y ? [...x, ...y] : null;
    }
    case 7: return n(c.a, 4);
    case 8: {
      const cards = [];
      for (let rank = c.a - 4; rank <= c.a; rank++) {
        const card = pool.find(x => Number.isInteger(x) && x >= 0 && x < 36 &&
          rk(x) === rank && st(x) === c.s);
        if (card === undefined) return null;
        cards.push(card);
      }
      return cards;
    }
    default: return null;
  }
}

const holds = (claim, pool) => used(claim, pool) !== null;

function newDeck() {
  const deck = Array.from({ length: 36 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Монте-Карло: вероятность заявки при известных своих картах и u неизвестных.
function prob(mine, u, claim, samples = 200) {
  if (!Array.isArray(mine) ||
      mine.some(c => !Number.isInteger(c) || c < 0 || c >= 36) ||
      new Set(mine).size !== mine.length) {
    throw new TypeError('mine должен содержать уникальные карты колоды 0…35');
  }
  if (!Number.isInteger(u) || u < 0 || u > 36 - mine.length) {
    throw new RangeError('u должно быть целым числом от 0 до числа оставшихся карт');
  }
  if (!Number.isInteger(samples) || samples < 1 || samples > 100000) {
    throw new RangeError('samples должно быть целым числом от 1 до 100000');
  }
  const normalized = norm(claim);
  if (!normalized) throw new TypeError('Некорректная заявка');
  const rest = Array.from({ length: 36 }, (_, i) => i).filter(i => !mine.includes(i));
  let hit = 0;
  for (let k = 0; k < samples; k++) {
    const deck = rest.slice();
    for (let i = 0; i < u; i++) {
      const j = i + Math.floor(Math.random() * (deck.length - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    if (holds(normalized, mine.concat(deck.slice(0, u)))) hit++;
  }
  return hit / samples;
}

module.exports = {
  RANKS, SUITS, TYPE_NAMES, rk, st, cardName, cmp, ALL, norm,
  nextHigher, label, used, holds, newDeck, prob
};
