/* AGROBULL BOTS — practice mode and lobby controls */
(() => {
  'use strict';
  if (typeof socket === 'undefined' || !socket) return;

  const $ = selector => document.querySelector(selector);
  const createButton = $('#createBtn');
  const playersRoot = $('#roomPlayers');
  if (!createButton || !playersRoot) return;

  let practicePending = false;
  let practiceStarting = false;
  let practiceTimeout = null;

  const practiceButton = document.createElement('button');
  practiceButton.type = 'button';
  practiceButton.className = 'primary';
  practiceButton.id = 'botBtn';
  practiceButton.textContent = '🤖 Играть против ботов';
  practiceButton.style.cssText = 'width:100%;margin-top:10px;background:linear-gradient(180deg,#8a5be0,#4b2d9a);border-color:#c5a6ff';
  createButton.parentNode.insertAdjacentElement('afterend', practiceButton);

  const botControls = document.createElement('div');
  botControls.className = 'row';
  botControls.id = 'botLobbyControls';
  botControls.style.cssText = 'margin-top:10px;display:none;flex-wrap:wrap;gap:8px';
  botControls.innerHTML =
    '<select id="botCount" class="secondary" aria-label="Количество ботов">' +
    '<option value="1">1 бот</option><option value="2">2 бота</option><option value="3" selected>3 бота</option></select>' +
    '<select id="botDifficulty" class="secondary" aria-label="Сложность ботов">' +
    '<option value="easy">Лёгкие</option><option value="normal" selected>Обычные</option><option value="hard">Сильные</option></select>' +
    '<button type="button" class="primary" id="addBotsButton">+ Добавить ботов</button>';
  playersRoot.insertAdjacentElement('afterend', botControls);

  practiceButton.addEventListener('click', () => {
    if (!socket.connected) return notify('Нет соединения с сервером');
    practicePending = true;
    practiceStarting = false;
    clearTimeout(practiceTimeout);
    practiceButton.disabled = true;
    practiceButton.textContent = 'Подготавливаем матч…';
    socket.emit('createRoom', emitProfile());
  });

  socket.on('joined', data => {
    if (!practicePending || !data || !data.roomCode) return;
    setTimeout(() => {
      if (practicePending) socket.emit('addBots', { count: 3, diff: 'normal' });
    }, 180);
  });

  socket.on('botsQueued', data => {
    if (practicePending) {
      const count = Number(data && data.count) || 0;
      notify(count ? 'Подключаем ' + count + ' ботов…' : 'Подготавливаем ботов…');
      practiceTimeout = setTimeout(() => {
        if (!practicePending || practiceStarting) return;
        practicePending = false;
        practiceButton.disabled = false;
        practiceButton.textContent = '🤖 Играть против ботов';
        notify('Не все боты подключились. Добавь их из лобби или попробуй ещё раз.');
      }, 18000);
    } else {
      notify('Боты подключаются…');
    }
  });

  socket.on('botsError', data => {
    practicePending = false;
    practiceStarting = false;
    clearTimeout(practiceTimeout);
    practiceButton.disabled = false;
    practiceButton.textContent = '🤖 Играть против ботов';
    notify((data && data.message) || 'Не удалось добавить ботов');
  });

  socket.on('lobby', data => {
    if (!data) return;
    const me = (data.players || []).find(player => player.id === selfId);
    const isHost = !!(me && me.isHost);
    const hasSeats = (data.players || []).length < (data.maxPlayers || 4);
    botControls.style.display = isHost && hasSeats ? 'flex' : 'none';
    const countSelect = $('#botCount');
    if (countSelect) {
      const free = (data.maxPlayers || 4) - (data.players || []).length;
      Array.from(countSelect.options).forEach(option => {
        option.disabled = Number(option.value) > free;
      });
      if (Number(countSelect.value) > free) countSelect.value = String(Math.max(1, free));
    }

    if (practicePending && !practiceStarting && data.canStart && (data.players || []).length === (data.maxPlayers || 4)) {
      practiceStarting = true;
      practicePending = false;
      clearTimeout(practiceTimeout);
      practiceButton.textContent = 'Запускаем матч…';
      setTimeout(() => socket.emit('startGame'), 550);
    }
  });

  socket.on('gameState', state => {
    if (state && state.phase === 'playing') {
      practiceStarting = false;
      practiceButton.disabled = false;
      practiceButton.textContent = '🤖 Играть против ботов';
    }
  });

  socket.on('roomError', () => {
    if (!practicePending && !practiceStarting) return;
    practicePending = false;
    practiceStarting = false;
    clearTimeout(practiceTimeout);
    practiceButton.disabled = false;
    practiceButton.textContent = '🤖 Играть против ботов';
  });

  $('#addBotsButton').addEventListener('click', () => {
    if (!socket.connected) return notify('Нет соединения с сервером');
    const count = Number($('#botCount').value);
    const diff = $('#botDifficulty').value;
    socket.emit('addBots', { count, diff });
  });

  $('#leaveBtn')?.addEventListener('click', () => {
    practicePending = false;
    practiceStarting = false;
    clearTimeout(practiceTimeout);
    practiceButton.disabled = false;
    practiceButton.textContent = '🤖 Играть против ботов';
    botControls.style.display = 'none';
  });

  // Small in-game quick chat and a visible 30-second turn clock.
  const chatStyle = document.createElement('style');
  chatStyle.textContent =
    '#agroQuickDock{position:fixed;right:12px;bottom:142px;z-index:24;display:none;flex-direction:column;gap:5px;max-width:164px;pointer-events:auto}' +
    '#agroQuickDock button{border:1px solid rgba(220,176,111,.42);border-radius:8px;padding:7px 9px;background:rgba(15,12,10,.88);color:#f1e5d0;font:700 10px Inter,sans-serif;text-align:left;backdrop-filter:blur(8px)}' +
    '#agroChatLog{position:fixed;right:12px;top:42%;z-index:23;width:min(220px,28vw);display:flex;flex-direction:column;gap:5px;pointer-events:none}' +
    '.agroChatLine{padding:7px 9px;border:1px solid rgba(95,190,169,.28);border-radius:8px;background:rgba(8,20,20,.82);color:#e7fff8;font:600 10px/1.35 Inter,sans-serif;overflow-wrap:anywhere;animation:agroChatIn .2s ease-out}' +
    '.agroChatLine b{color:#9fe7d5;margin-right:4px}' +
    '#agroTurnClock{position:fixed;z-index:8;top:136px;left:50%;transform:translateX(-50%);padding:5px 10px;border:1px solid rgba(220,176,111,.34);border-radius:999px;background:rgba(10,9,8,.72);color:#f0cb8a;font:800 10px Inter,sans-serif;display:none;pointer-events:none}' +
    '#agroTurnClock.urgent{border-color:#d85b48;color:#ff9b82}' +
    '@keyframes agroChatIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}' +
    '@media(max-width:700px){#agroQuickDock{right:7px;bottom:106px;max-width:128px}#agroQuickDock button{padding:5px 7px;font-size:9px}#agroChatLog{right:7px;width:145px;top:39%}#agroChatLog .agroChatLine{font-size:9px;padding:5px 7px}#agroTurnClock{top:122px;font-size:9px}}';
  document.head.appendChild(chatStyle);

  const quickDock = document.createElement('div');
  quickDock.id = 'agroQuickDock';
  [
    ['👀 Вижу блеф', 'Вижу блеф!'],
    ['🤥 Я не вру', 'Я не блефую!'],
    ['😂', '😂'],
    ['👏 Хороший ход', 'Хороший ход!']
  ].forEach(([label, message]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      if (socket.connected) socket.emit('chat', { t: message });
    });
    quickDock.appendChild(button);
  });
  const chatLog = document.createElement('div');
  chatLog.id = 'agroChatLog';
  const turnClock = document.createElement('div');
  turnClock.id = 'agroTurnClock';
  document.body.append(quickDock, chatLog, turnClock);

  let turnDeadline = 0;
  let turnPlayerId = '';
  let clockInterval = null;
  function updateTurnClock() {
    if (!turnDeadline) return;
    const seconds = Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000));
    turnClock.textContent = (turnPlayerId === selfId ? 'ТВОЙ ХОД · ' : 'ХОД СОПЕРНИКА · ') + seconds + 'с';
    turnClock.classList.toggle('urgent', seconds <= 5);
    if (seconds <= 0) turnDeadline = 0;
  }
  socket.on('turnTimer', data => {
    if (!data || !Number.isFinite(Number(data.deadline))) return;
    turnPlayerId = data.id || '';
    turnDeadline = Number(data.deadline);
    turnClock.style.display = 'block';
    updateTurnClock();
    if (!clockInterval) clockInterval = setInterval(updateTurnClock, 250);
  });
  socket.on('chat', data => {
    if (!data) return;
    const line = document.createElement('div');
    line.className = 'agroChatLine';
    const name = document.createElement('b');
    name.textContent = String(data.name || 'Игрок').slice(0, 20);
    const message = document.createElement('span');
    message.textContent = String(data.t || '').slice(0, 80);
    line.append(name, message);
    chatLog.appendChild(line);
    while (chatLog.children.length > 4) chatLog.firstElementChild.remove();
    setTimeout(() => line.remove(), 6000);
  });
  socket.on('gameState', state => {
    const active = !!(state && (state.phase === 'playing' || state.phase === 'rodeo'));
    quickDock.style.display = active ? 'flex' : 'none';
    turnClock.style.display = active && turnDeadline ? 'block' : 'none';
    if (!active) {
      turnDeadline = 0;
      chatLog.replaceChildren();
    }
  });

})();