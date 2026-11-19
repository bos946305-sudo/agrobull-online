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
})();