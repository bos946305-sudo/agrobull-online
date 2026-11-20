'use strict';

const BASE_RATING_GAP = 150;
const RATING_GAP_STEP = 100;
const EXPANSION_INTERVAL_MS = 15000;
const MAX_RATING_GAP = 1200;

function queueRatingRange(entry, now = Date.now()) {
  if (!entry || !entry.accountId) return 0;
  const queuedAt = Number(entry.queuedAt) || now;
  const waited = Math.max(0, now - queuedAt);
  const expansions = Math.floor(waited / EXPANSION_INTERVAL_MS);
  return Math.min(MAX_RATING_GAP, BASE_RATING_GAP + expansions * RATING_GAP_STEP);
}

function findBestQueueMatch(queue, currentEntry, now = Date.now()) {
  if (!Array.isArray(queue) || !currentEntry) return null;

  let best = null;
  let bestDistance = Infinity;

  for (let index = queue.length - 1; index >= 0; index--) {
    const candidate = queue[index];
    if (!candidate || !candidate.socket || !candidate.socket.connected ||
        candidate.socket.data?.roomCode) continue;
    if (candidate.mode !== currentEntry.mode) continue;
    if (!!candidate.accountId !== !!currentEntry.accountId) continue;
    if (currentEntry.accountId && candidate.accountId === currentEntry.accountId) continue;

    const distance = currentEntry.accountId
      ? Math.abs((Number(candidate.rating) || 1000) - (Number(currentEntry.rating) || 1000))
      : 0;
    // The older player's widening window is allowed to accept a newer opponent.
    const allowedDistance = Math.max(
      queueRatingRange(candidate, now),
      queueRatingRange(currentEntry, now)
    );
    if (distance > allowedDistance) continue;

    if (distance < bestDistance ||
        (distance === bestDistance && best && candidate.queuedAt < best.entry.queuedAt)) {
      best = { entry: candidate, index, distance, allowedDistance };
      bestDistance = distance;
    }
  }
  return best;
}

function queueStatus(entry, now = Date.now()) {
  const waitedMs = Math.max(0, now - (Number(entry && entry.queuedAt) || now));
  return {
    mode: entry && entry.mode === 'dice' ? 'dice' : 'cards',
    ranked: !!(entry && entry.accountId),
    rating: entry && entry.accountId ? Number(entry.rating) || 1000 : null,
    waitedSeconds: Math.floor(waitedMs / 1000),
    allowedDistance: queueRatingRange(entry, now)
  };
}

module.exports = {
  BASE_RATING_GAP,
  RATING_GAP_STEP,
  EXPANSION_INTERVAL_MS,
  MAX_RATING_GAP,
  queueRatingRange,
  findBestQueueMatch,
  queueStatus
};
