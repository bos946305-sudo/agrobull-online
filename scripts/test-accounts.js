'use strict';

const assert = require('assert');
const { calculateElo, validName } = require('../server-accounts');

assert.strictEqual(validName('Walter_1'), true);
assert.strictEqual(validName('Ёжик-77'), true);
assert.strictEqual(validName('ab'), false);
assert.strictEqual(validName('name with spaces'), false);
assert.strictEqual(validName('this_name_is_too_long'), false);

const twoPlayers = calculateElo([
  { playerId: 'p1', accountId: 'a1', rating: 1000, ratedGames: 0, won: true },
  { playerId: 'p2', accountId: 'a2', rating: 1000, ratedGames: 0, won: false }
]);
assert.strictEqual(twoPlayers.length, 2);
assert.strictEqual(twoPlayers[0].delta, 16);
assert.strictEqual(twoPlayers[1].delta, -16);
assert.strictEqual(twoPlayers[0].ratingAfter, 1016);
assert.strictEqual(twoPlayers[1].ratingAfter, 984);

const experienced = calculateElo([
  { playerId: 'p1', accountId: 'a1', rating: 1000, ratedGames: 30, won: true },
  { playerId: 'p2', accountId: 'a2', rating: 1000, ratedGames: 30, won: false }
]);
assert.strictEqual(experienced[0].delta, 10);
assert.strictEqual(experienced[1].delta, -10);

const threePlayers = calculateElo([
  { playerId: 'p1', accountId: 'a1', rating: 1000, ratedGames: 0, won: true },
  { playerId: 'p2', accountId: 'a2', rating: 1000, ratedGames: 0, won: false },
  { playerId: 'p3', accountId: 'a3', rating: 1000, ratedGames: 0, won: false }
]);
assert.strictEqual(threePlayers[0].delta, 16);
assert.strictEqual(threePlayers[1].delta, -8);
assert.strictEqual(threePlayers[2].delta, -8);
assert.strictEqual(threePlayers.reduce((sum, player) => sum + player.delta, 0), 0);

const noWinner = calculateElo([
  { playerId: 'p1', accountId: 'a1', rating: 1000, ratedGames: 0, won: false },
  { playerId: 'p2', accountId: 'a2', rating: 1000, ratedGames: 0, won: false }
]);
assert.deepStrictEqual(noWinner, []);

console.log('ACCOUNT TESTS OK: names, initial ELO, K=20 after 30 rated games, multiplayer balance.');
