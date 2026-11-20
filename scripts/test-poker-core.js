'use strict';
const assert = require('assert');
const poker = require('../poker-core');

assert.strictEqual(poker.ALL.length, 173, 'все 173 заявки должны быть в каталоге');
assert.strictEqual(new Set(poker.ALL.map(c => [c.t,c.a,c.b||0,c.s||0].join(':'))).size, 173);
assert.strictEqual(poker.cardName(0), '6♣');
assert.strictEqual(poker.cardName(35), 'A♠');
assert.strictEqual(poker.cardName(36), null);
assert.strictEqual(poker.norm({ a: 0 }), null, 'нельзя принимать заявку без типа');
assert.strictEqual(poker.norm({ t: 0, a: 0 }), poker.ALL[0]);
assert.strictEqual(poker.norm({ t: 2, a: 2, b: 2 }), null);
assert.strictEqual(poker.norm({ t: 5, a: 0, s: 4 }), null);
assert.strictEqual(poker.norm({ t: 8, a: 3, s: 0 }), null);
assert.strictEqual(poker.nextHigher({ t: 0, a: 0 }).t, 0);
assert.strictEqual(poker.nextHigher({ t: 8, a: 8, s: 3 }), null);
assert.strictEqual(poker.label({ t: 1, a: 8 }), 'Пара A');

const cards = (rank, suit, count) => Array.from({length:count}, (_,i) => rank*4 + ((suit+i)%4));
assert.strictEqual(poker.holds({t:1,a:2}, cards(2,0,2)), true);
assert.strictEqual(poker.holds({t:3,a:4}, cards(4,0,3)), true);
assert.strictEqual(poker.holds({t:4,a:4}, [0,4,8,12,16]), true);
assert.strictEqual(poker.holds({t:5,a:0,s:2}, [2,6,10,14,18]), true);
assert.strictEqual(poker.holds({t:6,a:5,b:2}, [...cards(5,0,3), ...cards(2,0,2)]), true);
assert.strictEqual(poker.holds({t:7,a:7}, cards(7,0,4)), true);
assert.strictEqual(poker.holds({t:8,a:4,s:1}, [1,5,9,13,17]), true);
assert.strictEqual(poker.holds({t:7,a:7}, cards(7,0,3)), false);

const deck = poker.newDeck();
assert.strictEqual(deck.length, 36);
assert.strictEqual(new Set(deck).size, 36);
assert.deepStrictEqual([...deck].sort((a,b)=>a-b), Array.from({length:36},(_,i)=>i));
assert.throws(() => poker.prob([0,0], 1, {t:0,a:0}), /уникальные карты/);
assert.throws(() => poker.prob([0], 36, {t:0,a:0}), /u должно быть/);
assert.throws(() => poker.prob([], 1, {t:0,a:0}, 0), /samples должно быть/);
assert.throws(() => poker.prob([], 1, {t:99,a:0}), /Некорректная заявка/);
assert(Object.isFrozen(poker.ALL));
assert(Object.isFrozen(poker.ALL[0]));

console.log('POKER CORE TESTS OK: 173 claims, validation, combinations, deck and probability guards.');
