'use strict';

const assert = require('node:assert/strict');
const {
  queueRatingRange,
  findBestQueueMatch,
  queueStatus,
  MAX_RATING_GAP
} = require('../quick-matchmaking');

const socket = () => ({ connected: true, data: {} });
const now = 200000;

assert.equal(queueRatingRange({ accountId: 'a', queuedAt: now }, now), 150);
assert.equal(queueRatingRange({ accountId: 'a', queuedAt: now - 15000 }, now), 250);
assert.equal(queueRatingRange({ accountId: 'a', queuedAt: now - 360000 }, now), MAX_RATING_GAP);
assert.equal(queueRatingRange({ accountId: null, queuedAt: now }, now), 0);

const current = {
  socket: socket(), accountId: 'new', rating: 1000, mode: 'cards', queuedAt: now
};
const candidates = [
  { socket: socket(), accountId: 'far', rating: 1400, mode: 'cards', queuedAt: now - 15000 },
  { socket: socket(), accountId: 'close', rating: 1080, mode: 'cards', queuedAt: now - 1000 },
  { socket: socket(), accountId: 'dice', rating: 1005, mode: 'dice', queuedAt: now },
  { socket: socket(), accountId: null, rating: 1000, mode: 'cards', queuedAt: now },
  { socket: socket(), accountId: 'new', rating: 1000, mode: 'cards', queuedAt: now }
];
const match = findBestQueueMatch(candidates, current, now);
assert.equal(match.entry.accountId, 'close', 'choose the closest compatible ELO opponent');

const olderCandidate = {
  socket: socket(), accountId: 'old', rating: 1240, mode: 'cards', queuedAt: now - 15000
};
const expandedMatch = findBestQueueMatch([olderCandidate], current, now);
assert.equal(expandedMatch.entry.accountId, 'old', 'the older entry gets a wider search window');
assert.equal(expandedMatch.allowedDistance, 250);

const waitingStatus = queueStatus({
  accountId: 'rated', rating: 1015, mode: 'dice', queuedAt: now - 31000
}, now);
assert.equal(waitingStatus.mode, 'dice');
assert.equal(waitingStatus.ranked, true);
assert.equal(waitingStatus.rating, 1015);
assert.equal(waitingStatus.waitedSeconds, 31);
assert.equal(waitingStatus.allowedDistance, 350);

console.log('QUICK MATCH TESTS OK: ELO windows expand, closest opponents are selected, modes and account identities stay isolated.');
