/* AGROBULL VOICE — room voice chat over peer-to-peer WebRTC. */
(() => {
  'use strict';
  if (typeof socket === 'undefined' || !socket || !window.RTCPeerConnection || !navigator.mediaDevices) return;

  const STORAGE_KEY = 'agro_voice_vol_v1';
  let enabled = false, muted = false, stream = null, config = null;
  let roster = [], panelOpen = false, audioContext = null;
  const connections = new Map(), pendingIce = new Map(), audioElements = new Map();
  const speaking = new Map(), peerMuted = new Map(), meters = new Map();
  let volumes = {};
  try { volumes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (_) {}

  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  })[char]);

  document.head.insertAdjacentHTML('beforeend',
    '<style>' +
    '#agroVoicePanel{position:fixed;right:12px;top:calc(env(safe-area-inset-top,0px) + 54px);z-index:88;display:none;width:min(310px,88vw);max-height:70vh;overflow:auto;padding:12px;border-radius:16px;background:rgba(16,11,8,.97);border:1px solid #c79a5a88;box-shadow:0 16px 44px #000c;color:#f3e3c3;font:700 12px Inter,sans-serif}' +
    '#agroVoicePanel .voiceRow{display:flex;align-items:center;gap:8px;margin:7px 0;min-height:28px}' +
    '#agroVoicePanel .voiceName{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#agroVoicePanel input[type=range]{width:88px;min-width:60px}' +
    '#agroVoicePanel button{padding:7px 10px;border-radius:9px;border:1px solid #a9803f;background:#2a211a;color:#f3dfb8;font:800 12px Inter,sans-serif}' +
    '#agroVoicePanel button.voiceGo{background:linear-gradient(180deg,#f7d78c,#c28a3c);color:#2b1807}' +
    '#agroVoicePanel .voiceDot{width:9px;height:9px;flex:none;border-radius:50%;background:#4a3a2a}' +
    '#agroVoicePanel .voiceDot.active{background:#4dff9a;box-shadow:0 0 8px #4dff9a}' +
    '</style>'
  );

  const panel = document.createElement('div');
  panel.id = 'agroVoicePanel';
  document.body.append(panel);

  const button = document.createElement('button');
  button.className = 'iconbtn';
  button.title = 'Голосовой чат';
  button.setAttribute('aria-label', 'Голосовой чат');
  button.textContent = '🎙';
  const topRight = document.querySelector('.topright');
  if (topRight) topRight.prepend(button);

  button.onclick = () => {
    panelOpen = !panelOpen;
    panel.style.display = panelOpen ? 'block' : 'none';
    render();
  };

  function selfId() {
    return config && config.self != null ? String(config.self) :
      (typeof window.selfId !== 'undefined' ? String(window.selfId) : '');
  }

  function playerName(id) {
    const player = roster.find(item => String(item.id) === String(id));
    return player && player.name || 'Игрок';
  }

  function render() {
    if (!panelOpen) return;
    const others = roster.filter(player => String(player.id) !== selfId());
    let html = '<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">' +
      '<b style="flex:1;font-size:13px">Голосовой чат</b>' +
      (enabled ? '<button id="agroVoiceMute">' + (muted ? '🔇 Включить' : '🎙 Выключить') + '</button>' : '') +
      '</div>';

    html += enabled
      ? '<button id="agroVoiceLeave" style="width:100%">Выйти из голоса</button>'
      : '<button class="voiceGo" id="agroVoiceJoin" style="width:100%">Войти в голосовой чат</button>' +
        '<div style="opacity:.72;margin-top:7px;font-weight:600">Микрофон запрашивается только после нажатия.</div>';

    if (!others.length) {
      html += '<div style="opacity:.7;margin-top:9px">В комнате пока нет других игроков.</div>';
    }

    html += others.map(player => {
      const id = String(player.id);
      const connected = connections.has(id) && audioElements.has(id);
      const value = volumes[player.name] == null ? 100 : Number(volumes[player.name]);
      return '<div class="voiceRow"><span class="voiceDot ' + (speaking.get(id) ? 'active' : '') + '"></span>' +
        '<span class="voiceName">' + escapeHtml(player.name) + ' ' + (peerMuted.get(id) ? '🔇' : '') + '</span>' +
        (connected
          ? '<input type="range" min="0" max="100" value="' + Math.max(0, Math.min(100, value)) + '" data-peer="' + escapeHtml(id) + '" aria-label="Громкость игрока">'
          : '<small style="opacity:.6">не в голосе</small>') +
        '</div>';
    }).join('');

    panel.innerHTML = html;
    const joinButton = panel.querySelector('#agroVoiceJoin');
    const leaveButton = panel.querySelector('#agroVoiceLeave');
    const muteButton = panel.querySelector('#agroVoiceMute');
    if (joinButton) joinButton.onclick = joinVoice;
    if (leaveButton) leaveButton.onclick = leaveVoice;
    if (muteButton) muteButton.onclick = toggleMute;

    panel.querySelectorAll('input[data-peer]').forEach(input => {
      input.oninput = () => {
        const id = input.dataset.peer, value = Number(input.value);
        volumes[playerName(id)] = value;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(volumes)); } catch (_) {}
        const audio = audioElements.get(id);
        if (audio) audio.volume = value / 100;
      };
    });
    button.textContent = enabled ? (muted ? '🔇' : '🎙') : '🎙';
  }

  async function joinVoice() {
    if (enabled) return;
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      if (typeof notify === 'function') notify('Для микрофона нужен HTTPS.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (error) {
      if (typeof notify === 'function') notify('Нет доступа к микрофону — разреши его в настройках браузера.');
      return;
    }
    enabled = true;
    muted = false;
    if (audioContext && audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    socket.emit('voiceJoin');
    startMeter(stream, '__self');
    render();
  }

  function leaveVoice() {
    if (!enabled && !stream) return;
    enabled = false;
    try { socket.emit('voiceLeave'); } catch (_) {}
    closeAllConnections();
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    muted = false;
    render();
  }

  function toggleMute() {
    if (!stream) return;
    muted = !muted;
    stream.getAudioTracks().forEach(track => { track.enabled = !muted; });
    socket.emit('voiceMute', { muted });
    render();
  }

  function closeAllConnections() {
    Array.from(connections.keys()).forEach(dropPeer);
    meters.forEach(timer => clearInterval(timer));
    meters.clear();
    speaking.clear();
  }

  function connectPeer(id) {
    id = String(id);
    if (connections.has(id) || !stream || !config) return;
    const pc = new RTCPeerConnection({ iceServers: config.iceServers || [] });
    connections.set(id, pc);
    pendingIce.set(id, []);
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.onicecandidate = event => {
      if (event.candidate) socket.emit('voiceSignal', { to: id, data: { candidate: event.candidate } });
    };
    pc.ontrack = event => {
      const remoteStream = event.streams && event.streams[0];
      if (remoteStream) attachAudio(id, remoteStream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') dropPeer(id);
      else render();
    };

    if (String(config.self) < id) createOffer(id, pc);
    render();
  }

  async function createOffer(id, pc) {
    try {
      await pc.setLocalDescription(await pc.createOffer());
      socket.emit('voiceSignal', { to: id, data: { description: pc.localDescription } });
    } catch (error) {
      console.warn('[voice] offer failed:', error);
      dropPeer(id);
    }
  }

  function dropPeer(id) {
    id = String(id);
    const pc = connections.get(id);
    if (pc) {
      pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = null;
      try { pc.close(); } catch (_) {}
    }
    connections.delete(id);
    pendingIce.delete(id);
    speaking.delete(id);
    peerMuted.delete(id);
    const audio = audioElements.get(id);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
    }
    audioElements.delete(id);
    const timer = meters.get(id);
    if (timer) clearInterval(timer);
    meters.delete(id);
    render();
  }

  function attachAudio(id, mediaStream) {
    id = String(id);
    let audio = audioElements.get(id);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.setAttribute('data-agro-voice-peer', id);
      document.body.append(audio);
      audioElements.set(id, audio);
    }
    audio.srcObject = mediaStream;
    const volume = volumes[playerName(id)] == null ? 100 : Number(volumes[playerName(id)]);
    audio.volume = Math.max(0, Math.min(1, volume / 100));
    audio.play().catch(() => {});
    startMeter(mediaStream, id);
    render();
  }

  function startMeter(mediaStream, id) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      audioContext = audioContext || new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      audioContext.createMediaStreamSource(mediaStream).connect(analyser);
      const buffer = new Uint8Array(analyser.fftSize);
      const old = meters.get(id);
      if (old) clearInterval(old);
      meters.set(id, setInterval(() => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (const sample of buffer) sum += (sample - 128) * (sample - 128);
        const active = Math.sqrt(sum / buffer.length) > 6 && !(id === '__self' && muted);
        if (speaking.get(id) !== active) {
          speaking.set(id, active);
          render();
        }
      }, 150));
    } catch (error) {
      console.warn('[voice] audio meter unavailable:', error);
    }
  }

  async function handleSignal(event) {
    if (!enabled || !event || !event.from || !event.data) return;
    const id = String(event.from);
    if (!connections.has(id)) connectPeer(id);
    const pc = connections.get(id);
    if (!pc) return;

    try {
      const description = event.data.description;
      const candidate = event.data.candidate;
      if (description) {
        await pc.setRemoteDescription(description);
        const queued = pendingIce.get(id) || [];
        for (const item of queued) {
          try { await pc.addIceCandidate(item); } catch (_) {}
        }
        pendingIce.set(id, []);
        if (description.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          socket.emit('voiceSignal', { to: id, data: { description: pc.localDescription } });
        }
      } else if (candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(candidate);
        else {
          const queued = pendingIce.get(id) || [];
          if (queued.length < 64) queued.push(candidate);
          pendingIce.set(id, queued);
        }
      }
    } catch (error) {
      console.warn('[voice] signalling error:', error);
    }
  }

  socket.on('voiceConfig', data => {
    config = data;
    (data.peers || []).forEach(connectPeer);
    render();
  });
  socket.on('voicePeerJoined', event => {
    if (enabled && event && event.id != null) connectPeer(event.id);
  });
  socket.on('voicePeerLeft', event => { if (event && event.id != null) dropPeer(event.id); });
  socket.on('voiceMuted', event => {
    if (event && event.id != null) {
      peerMuted.set(String(event.id), !!event.muted);
      render();
    }
  });
  socket.on('voiceSignal', handleSignal);

  function updateRoster(data) {
    if (data && Array.isArray(data.players)) {
      roster = data.players;
      render();
    }
  }
  socket.on('lobby', updateRoster);
  socket.on('gameState', updateRoster);
  socket.on('diceState', updateRoster);
  socket.on('pokerState', updateRoster);

  socket.on('joined', () => {
    if (enabled) {
      closeAllConnections();
      config = null;
      socket.emit('voiceJoin');
    }
  });
  socket.on('disconnect', () => {
    config = null;
    closeAllConnections();
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    enabled = false;
    muted = false;
    render();
  });
  socket.on('connect', () => {
    if (enabled && stream) socket.emit('voiceJoin');
  });

  document.addEventListener('pointerdown', () => {
    audioElements.forEach(audio => audio.play().catch(() => {}));
  }, { passive: true });

  window.AgroVoice = { join: joinVoice, leave: leaveVoice, mute: toggleMute };
})();
