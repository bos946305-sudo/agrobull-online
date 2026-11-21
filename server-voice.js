/* server-voice.js — WebRTC signalling relay for AGROBULL voice chat. */
'use strict';

const crypto = require('crypto');

module.exports = function attachVoice(io, ctx = {}) {
  const roomFor = ctx.getRoomForSocket;
  if (typeof roomFor !== 'function') throw new Error('server-voice: передай getRoomForSocket');

  const getAccountId = ctx.getAccountId || (socket => socket.data && socket.data.accountId);
  const list = value => String(value || '').split(',').map(value => value.trim()).filter(Boolean);
  const stun = list(process.env.STUN_URLS);
  const turn = list(process.env.TURN_URLS);
  const turnSecret = process.env.TURN_SECRET || '';
  const defaultStun = stun.length ? stun : [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302'
  ];

  function iceServers(playerId) {
    const result = [{ urls: defaultStun }];
    if (turn.length && turnSecret) {
      const username = String(Math.floor(Date.now() / 1000) + 3600) + ':' + String(playerId);
      const credential = crypto.createHmac('sha1', turnSecret).update(username).digest('base64');
      result.push({ urls: turn, username, credential });
    }
    return result;
  }

  io.voiceIceServers = iceServers;

  function socketFor(player) {
    return player && player.socketId ? io.sockets.sockets.get(player.socketId) || null : null;
  }

  io.on('connection', socket => {
    let signalTimes = [];

    function current() {
      const room = roomFor(socket);
      if (!room || !Array.isArray(room.players)) return null;
      const player = room.players.find(item => String(item.id) === String(socket.data.playerId));
      return player ? { room, player } : null;
    }

    function peers(context) {
      return context.room.players
        .filter(player => String(player.id) !== String(context.player.id))
        .map(player => ({ player, socket: socketFor(player) }))
        .filter(item => item.socket && item.socket.data.voice === true);
    }

    function leave() {
      if (socket.data.voice !== true) return;
      socket.data.voice = false;
      const context = current();
      if (context) {
        peers(context).forEach(item => item.socket.emit('voicePeerLeft', { id: context.player.id }));
      }
    }

    // A room exit must also remove this socket from voice before room membership changes.
    socket.use((packet, next) => {
      if (packet && packet[0] === 'leaveRoom') leave();
      next();
    });

    socket.on('voiceJoin', () => {
      const context = current();
      if (!context) return;
      socket.data.voice = true;
      const activePeers = peers(context);
      socket.emit('voiceConfig', {
        self: context.player.id,
        iceServers: iceServers(context.player.id),
        peers: activePeers.map(item => item.player.id)
      });
      activePeers.forEach(item => item.socket.emit('voicePeerJoined', { id: context.player.id }));
    });

    socket.on('voiceLeave', leave);
    socket.on('disconnect', leave);

    socket.on('voiceMute', data => {
      const context = current();
      if (!context || socket.data.voice !== true) return;
      peers(context).forEach(item => item.socket.emit('voiceMuted', {
        id: context.player.id,
        muted: !!(data && data.muted)
      }));
    });

    socket.on('voiceSignal', async data => {
      const context = current();
      if (!context || socket.data.voice !== true || !data || typeof data !== 'object') return;

      const now = Date.now();
      signalTimes = signalTimes.filter(time => now - time < 10000);
      if (signalTimes.length >= 200) return;
      signalTimes.push(now);

      let encodedSize = 0;
      try {
        encodedSize = JSON.stringify(data.data || '').length;
      } catch (_) {
        return;
      }
      if (!encodedSize || encodedSize > 8000) return;

      const targetId = String(data.to || '');
      if (!targetId || targetId === String(context.player.id)) return;
      const targetPlayer = context.room.players.find(player => String(player.id) === targetId);
      const targetSocket = socketFor(targetPlayer);
      if (!targetSocket || targetSocket.data.voice !== true || targetSocket === socket) return;

      if (typeof io.isBlocked === 'function') {
        const fromAccount = getAccountId(socket);
        const toAccount = getAccountId(targetSocket);
        if (fromAccount && toAccount) {
          try {
            if (await io.isBlocked(String(fromAccount), String(toAccount))) return;
          } catch (error) {
            console.error('[voice] block check failed:', error && error.message || error);
            return;
          }
        }
      }

      // Re-check room membership after the asynchronous block lookup.
      const latest = current();
      if (!latest || latest.room !== context.room || targetSocket.data.voice !== true) return;
      const stillTarget = latest.room.players.find(player => String(player.id) === targetId);
      if (!stillTarget || socketFor(stillTarget) !== targetSocket) return;

      targetSocket.emit('voiceSignal', { from: context.player.id, data: data.data });
    });
  });
};
