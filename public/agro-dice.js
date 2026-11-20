/* AGROBULL DICE — client UI for the server-authoritative dice mode. */
(() => {
  'use strict';
  if (typeof socket === 'undefined' || !socket || typeof document === 'undefined') return;

  const FACES = ['', '🐂', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const face = value => FACES[Number(value)] || '';
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const css = [
    "#diceO{position:fixed;inset:0;z-index:45;display:none;flex-direction:column;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 62px) 14px calc(env(safe-area-inset-bottom,0px) + 14px);overflow:auto;background:radial-gradient(circle at 50% 0,rgba(255,176,46,.18),transparent 55%),rgba(6,4,6,.78);backdrop-filter:blur(8px);color:#f3e3c3;font-family:Inter,sans-serif;text-align:center}",
    "#diceO .row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center}",
    "#diceO h2{margin:0;font:800 22px 'Barlow Condensed',Inter,sans-serif;letter-spacing:2px;background:linear-gradient(180deg,#fff3cf,#e1ac55);-webkit-background-clip:text;background-clip:text;color:transparent}",
    ".dp{padding:6px 12px;border-radius:12px;border:1px solid #5b4630;background:rgba(20,14,10,.8);font-size:12px;font-weight:700}.dp.on{border-color:#ffe6ac;box-shadow:0 0 20px rgba(232,168,74,.5)}.dp.out{opacity:.35}",
    ".dt{width:54px;height:54px;border-radius:12px;background:linear-gradient(145deg,#fffaf0,#e0cfa8);color:#2d2018;display:grid;place-items:center;font-size:38px;box-shadow:0 10px 22px #000a,inset 0 -6px 12px #8a5e2a33;animation:dr .9s cubic-bezier(.2,.9,.3,1.2) both}",
    ".dt.hit{box-shadow:0 0 0 3px #4dff9a,0 0 22px #4dff9a99}.dt.sm{width:34px;height:34px;font-size:24px;border-radius:8px}",
    "@keyframes dr{from{transform:perspective(300px) rotateX(540deg) rotateY(360deg) scale(.3);opacity:0}}",
    ".bidbig{font:800 30px 'Barlow Condensed',Inter,sans-serif;color:#ffe6ac}",
    "#diceO button{padding:10px 16px;border-radius:12px;border:1px solid #a9803f;background:linear-gradient(180deg,#2a211a,#120d09);color:#f3dfb8;font:800 14px Inter,sans-serif}",
    "#diceO button.go{background:linear-gradient(180deg,#f7d78c,#c28a3c 55%,#86571f);color:#2b1807;border-color:#ffe6ac}",
    "#diceO button.no{background:linear-gradient(180deg,#ff7d66,#c63b2c 55%,#7b1d16);color:#fff;border-color:#ffb3a3}",
    "#diceO button.sel{border-color:#ffe08a;box-shadow:0 0 14px #f0b24a99}#diceO button:disabled{opacity:.35}",
    "#diceStartButton{width:100%;margin-top:10px;display:none;background:linear-gradient(180deg,#e8b84a,#a8741f);border-color:#ffe6ac}",
    "@media(max-width:600px){#diceO{gap:8px;padding-left:9px;padding-right:9px}#diceO h2{font-size:20px}.bidbig{font-size:25px}.dt{width:46px;height:46px;font-size:32px}}"
  ].join("");
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'diceO';
  document.body.appendChild(overlay);

  const quickDiceButton = document.createElement('button');
  quickDiceButton.type = 'button';
  quickDiceButton.id = 'quickDiceButton';
  quickDiceButton.className = 'primary';
  quickDiceButton.textContent = '🎲 НАЙТИ СОПЕРНИКА В КОСТИ';
  quickDiceButton.style.cssText = 'width:100%;margin-top:8px;background:linear-gradient(180deg,#e8b84a,#a8741f);border-color:#ffe6ac';
  const quickCardButton = document.querySelector('#quickBtn');
  if (quickCardButton) quickCardButton.insertAdjacentElement('afterend', quickDiceButton);

  quickDiceButton.onclick = () => {
    if (!socket.connected) return typeof notify === 'function' && notify('Нет соединения с сервером');
    if (typeof emitProfile !== 'function') return;
    socket.emit('quickPlay', { ...emitProfile(), mode: 'dice' });
    if (typeof notify === 'function') notify('Ищем соперника в режиме «Кости»…');
  };

  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.id = 'diceStartButton';
  startButton.className = 'primary';
  startButton.textContent = '🎲 Играть в кости';
  const roomPlayers = document.querySelector('#roomPlayers');
  if (roomPlayers) roomPlayers.insertAdjacentElement('afterend', startButton);
  else document.body.appendChild(startButton);

  let state = null;
  let startPending = false;
  let hostId = null;
  let lastRound = -1;
  let quantity = 1;
  let selectedFace = 2;
  let receivedAt = 0;
  let audioContext = null;

  const isHost = () => !!hostId && hostId === selfId;
  const hide = () => {
    overlay.style.display = 'none';
    state = null;
  };

  function playRattle() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audioContext = audioContext || new Audio();
      const context = audioContext;
      for (let i = 0; i < 5; i++) {
        const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.045), context.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let k = 0; k < samples.length; k++) {
          samples[k] = (Math.random() * 2 - 1) * (1 - k / samples.length);
        }
        const source = context.createBufferSource();
        const gain = context.createGain();
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1600 + Math.random() * 1300;
        gain.gain.value = 0.22;
        source.buffer = buffer;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(context.destination);
        source.start(context.currentTime + i * 0.065);
      }
    } catch (_) {}
  }

  startButton.addEventListener('click', () => {
    if (!socket.connected) return typeof notify === 'function' && notify('Нет соединения с сервером');
    startPending = true;
    startButton.disabled = true;
    startButton.textContent = 'Запускаем кости…';
    socket.emit('diceStart');
    setTimeout(() => {
      if (startPending) {
        startPending = false;
        startButton.disabled = false;
        startButton.textContent = '🎲 Играть в кости';
      }
    }, 2500);
  });

  socket.on('lobby', lobby => {
    startPending = false;
    hostId = lobby && lobby.hostId || null;
    const me = lobby && (lobby.players || []).find(player => player.id === selfId);
    startButton.style.display = me && me.isHost ? 'block' : 'none';
    startButton.disabled = false;
    startButton.textContent = '🎲 Играть в кости';
    if (overlay.style.display === 'flex' && state && state.phase === 'finished') hide();
  });

  socket.on('gameState', snapshot => {
    // A card game may start after a dice match ends in the same room.
    // Never leave the old dice overlay above the card-game interface.
    if (snapshot && snapshot.phase !== 'lobby') hide();
    else if (snapshot && snapshot.phase === 'lobby') hide();
  });

  socket.on('roomError', data => {
    if (!startPending) return;
    startPending = false;
    startButton.disabled = false;
    startButton.textContent = '🎲 Играть в кости';
    if (data && data.message && typeof notify === 'function') notify(data.message);
  });

  socket.on('diceState', snapshot => {
    if (!snapshot) return;
    state = snapshot;
    startPending = false;
    receivedAt = Date.now();
    startButton.style.display = 'none';

    if (snapshot.round !== lastRound && snapshot.phase === 'bidding') {
      lastRound = snapshot.round;
      playRattle();
      quantity = snapshot.bid ? snapshot.bid.q : 1;
      selectedFace = snapshot.bid ? Math.min(6, snapshot.bid.f + 1) : 2;
    }
    if (snapshot.bid && snapshot.turnId === selfId &&
        !(quantity > snapshot.bid.q || (quantity === snapshot.bid.q && selectedFace > snapshot.bid.f))) {
      quantity = snapshot.bid.q;
      selectedFace = Math.min(6, snapshot.bid.f + 1);
      if (selectedFace <= snapshot.bid.f) {
        quantity++;
        selectedFace = 1;
      }
    }
    draw();
  });

  function isHit(value, bidFace) {
    return value === bidFace || (bidFace !== 1 && value === 1);
  }

  function draw() {
    if (!state) return;
    const snapshot = state;
    const myTurn = snapshot.turnId === selfId;
    const players = snapshot.players || [];
    let html = '<h2>🎲 КОСТИ · раунд ' + snapshot.round + '</h2><div class="row">' +
      players.map(player => '<div class="dp' +
        (player.id === snapshot.turnId ? ' on' : '') +
        (player.alive ? '' : ' out') + '">' +
        (player.id === selfId ? 'Ты' : escapeHtml(player.name)) +
        ' · 🎲×' + player.n + '</div>').join('') + '</div>';

    html += '<div class="bidbig">' +
      (snapshot.bid ? 'Ставка: ' + snapshot.bid.q + ' × ' + face(snapshot.bid.f) : 'Ставок ещё нет') +
      '</div><div style="font-size:13px;opacity:.9;max-width:420px">' +
      escapeHtml(snapshot.message || '') + '</div>';

    if (snapshot.phase === 'bidding') {
      const myDice = Array.isArray(snapshot.myDice) ? snapshot.myDice : [];
      html += '<div class="row" id="myd">' +
        (myDice.map(value => '<div class="dt">' + face(value) + '</div>').join('') ||
          '<div style="opacity:.6">Ты выбыл — наблюдаешь</div>') +
        '</div>';
      html += '<div style="font-size:12px;opacity:.8">Всего костей на столе: ' +
        snapshot.total + ' · 🐂 — джокер</div><div id="tmr" style="font:800 13px Inter;color:#ffd36a"></div>';

      if (myTurn) {
        html += '<div class="row"><button id="qm" type="button">−</button><div class="bidbig" style="min-width:48px">' +
          quantity + '</div><button id="qp" type="button">+</button></div>';
        html += '<div class="row">' + [1, 2, 3, 4, 5, 6].map(value =>
          '<button type="button" class="fb' + (value === selectedFace ? ' sel' : '') +
          '" data-f="' + value + '">' + face(value) + '</button>').join('') + '</div>';
        const validBid = !snapshot.bid || quantity > snapshot.bid.q ||
          (quantity === snapshot.bid.q && selectedFace > snapshot.bid.f);
        html += '<div class="row"><button class="go" id="bid" type="button" ' +
          (validBid ? '' : 'disabled') + '>Поставить ' + quantity + ' × ' + face(selectedFace) +
          '</button>' + (snapshot.bid ? '<button class="no" id="call" type="button">Не верю!</button>' : '') +
          '</div>';
      } else {
        const current = players.find(player => player.id === snapshot.turnId);
        html += '<div style="opacity:.8;font-size:13px">Ход: ' +
          escapeHtml(current && current.name || '—') + '</div>';
      }
    } else if (snapshot.phase === 'reveal' && snapshot.reveal) {
      const reveal = snapshot.reveal;
      html += players.map(player => {
        const rolled = reveal.dice && reveal.dice[player.id] || [];
        return '<div><div class="dp">' +
          (player.id === selfId ? 'Ты' : escapeHtml(player.name)) +
          '</div><div class="row" style="margin-top:6px">' +
          (rolled.map(value => '<div class="dt sm' +
            (isHit(value, reveal.bid.f) ? ' hit' : '') + '">' + face(value) + '</div>').join('') || '—') +
          '</div></div>';
      }).join('');
      html += '<div class="bidbig">Нашлось: ' + reveal.actual + ' × ' + face(reveal.bid.f) + '</div>';
    } else if (snapshot.phase === 'finished') {
      const winner = players.find(player => player.id === snapshot.winnerId);
      html += '<div class="bidbig">' +
        (snapshot.winnerId === selfId ? '🏆 ТЫ ПОБЕДИЛ' :
          '🏆 ' + escapeHtml(winner && winner.name || '—')) + '</div>';
      html += '<div class="row">' +
        (isHost() ? '<button class="go" id="again" type="button">Сыграть снова</button>' :
          '<div style="opacity:.8;font-size:13px">Ждём хоста…</div>') +
        '<button id="leave" type="button">Выйти</button></div>';
    }

    overlay.innerHTML = html;
    overlay.style.display = 'flex';
    bindControls();
  }

  function bindControls() {
    const query = selector => overlay.querySelector(selector);
    const minus = query('#qm');
    const plus = query('#qp');
    if (minus) minus.addEventListener('click', () => {
      quantity = Math.max(1, quantity - 1);
      draw();
    });
    if (plus) plus.addEventListener('click', () => {
      quantity = Math.min(state.total, quantity + 1);
      draw();
    });
    overlay.querySelectorAll('.fb').forEach(button => {
      button.addEventListener('click', () => {
        selectedFace = Number(button.dataset.f);
        draw();
      });
    });
    const placeBid = query('#bid');
    if (placeBid) placeBid.addEventListener('click', () => {
      if (state && state.turnId === selfId) socket.emit('diceBid', { q: quantity, f: selectedFace });
    });
    const challenge = query('#call');
    if (challenge) challenge.addEventListener('click', () => {
      if (state && state.turnId === selfId) socket.emit('diceCall');
    });
    const rematch = query('#again');
    if (rematch) rematch.addEventListener('click', () => socket.emit('diceRematch'));
    const leave = query('#leave');
    if (leave) leave.addEventListener('click', () => {
      socket.emit('leaveRoom');
      setTimeout(() => location.reload(), 150);
    });
  }

  setInterval(() => {
    const timer = overlay.querySelector('#tmr');
    if (timer && state && state.phase === 'bidding') {
      const seconds = Math.max(0, Math.ceil((state.ms - (Date.now() - receivedAt)) / 1000));
      timer.textContent = '⏱ ' + seconds;
    }
  }, 300);
})();
