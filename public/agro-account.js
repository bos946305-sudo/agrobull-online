/* AGROBULL ACCOUNT — account sign-in, persistent ELO and leaderboards. */
(() => {
  'use strict';
  if (typeof socket === 'undefined' || !socket || typeof document === 'undefined') return;

  const TOKEN_KEY = 'agro_auth_v1';
  const PROMPT_KEY = 'agro_account_prompted_v1';
  const MODES = { cards: 'Карты', dice: 'Кости' };
  let token = '';
  let account = null;
  let tab = 'login';
  let mode = 'cards';
  let leaderboard = null;
  let message = '';
  let busy = false;
  let connectionReady = false;

  try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch (_) {}

  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const style = document.createElement('style');
  style.textContent = [
    '#agroAccountOverlay{z-index:90;padding:14px;overflow:auto}',
    '#agroAccountOverlay .account-modal{width:min(520px,100%);max-height:calc(100dvh - 28px);overflow:auto}',
    '#agroAccountOverlay .account-input{width:100%;display:block;margin:8px 0;padding:12px 13px;border:1px solid var(--line);border-radius:10px;background:#17110d;color:var(--cream);font:600 14px Inter,sans-serif}',
    '#agroAccountOverlay .account-tabs{display:flex;gap:8px;margin:10px 0}',
    '#agroAccountOverlay .account-tabs button{flex:1}',
    '#agroAccountOverlay .account-tabs button.active{border-color:#ffe08a;box-shadow:0 0 12px #f0b24a66}',
    '#agroAccountOverlay .account-error{min-height:18px;margin:6px 0;color:#ff9b82;font:700 12px Inter,sans-serif}',
    '#agroAccountOverlay .account-note{margin:8px 0;color:var(--muted);font-size:11px;line-height:1.45}',
    '#agroAccountOverlay .account-ratings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}',
    '#agroAccountOverlay .account-rating{padding:12px 8px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.035);text-align:center}',
    '#agroAccountOverlay .account-rating b{display:block;margin:4px 0;font:800 28px "Barlow Condensed",Inter,sans-serif;color:#ffe6ac}',
    '#agroAccountOverlay .account-stats{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--muted)}',
    '#agroAccountOverlay .account-leader{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;margin:4px 0;border:1px solid transparent;border-radius:8px;background:rgba(255,255,255,.035);font-size:12px;font-weight:700}',
    '#agroAccountOverlay .account-leader.me{border-color:#d5a45e;background:rgba(213,164,94,.14)}',
    '#agroAccountOverlay .account-leader small{color:var(--muted);font-size:10px}',
    '#agroAccountOverlay .account-scroll{max-height:32vh;overflow:auto;margin:8px 0}',
    '#agroAccountButton{white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis}',
    '#agroQueuePanel{position:fixed;z-index:50;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);display:none;align-items:center;gap:12px;width:min(520px,calc(100vw - 24px));padding:12px 14px;border:1px solid #c79a5a;border-radius:14px;background:linear-gradient(135deg,rgba(29,21,15,.97),rgba(8,7,6,.97));box-shadow:0 14px 40px #000c;color:#f3dfb8;font:600 12px/1.45 Inter,sans-serif;pointer-events:auto}',
    '#agroQueuePanel .queue-copy{min-width:0;flex:1}',
    '#agroQueuePanel strong{display:block;color:#ffe6ac;font-size:13px}',
    '#agroQueuePanel small{display:block;margin-top:3px;color:#c9b99f;font-size:10px}',
    '#agroQueueCancel{flex:none;padding:8px 11px;border:1px solid #9d6145;border-radius:9px;background:#3a2019;color:#ffe1ce;font:800 10px Inter,sans-serif;cursor:pointer;touch-action:manipulation}',
    '@media(max-width:520px){#agroQueuePanel{bottom:calc(8px + env(safe-area-inset-bottom));gap:8px;padding:10px}#agroQueuePanel strong{font-size:11px}#agroQueuePanel small{font-size:9px}#agroQueueCancel{padding:8px}}',
    '@media(max-width:520px){#agroAccountOverlay{padding:8px}#agroAccountOverlay .account-modal{max-height:calc(100dvh - 16px)}#agroAccountOverlay .account-scroll{max-height:28vh}}'
  ].join('');
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'agroAccountOverlay';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'iconbtn';
  button.id = 'agroAccountButton';
  button.title = 'Аккаунт и рейтинг';
  button.textContent = '👤 Аккаунт';
  const topRight = document.querySelector('.topright');
  if (topRight) topRight.appendChild(button);

  const queuePanel = document.createElement('div');
  queuePanel.id = 'agroQueuePanel';
  queuePanel.setAttribute('role', 'status');
  queuePanel.setAttribute('aria-live', 'polite');
  queuePanel.innerHTML = '<div class="queue-copy"><strong id="agroQueueTitle"></strong><small id="agroQueueDetails"></small></div>' +
    '<button type="button" id="agroQueueCancel">ОТМЕНИТЬ</button>';
  document.body.appendChild(queuePanel);
  let queueState = null;

  function renderQueuePanel() {
    if (!queueState) {
      queuePanel.style.display = 'none';
      return;
    }
    const title = queuePanel.querySelector('#agroQueueTitle');
    const details = queuePanel.querySelector('#agroQueueDetails');
    const cancel = queuePanel.querySelector('#agroQueueCancel');
    const modeName = queueState.mode === 'dice' ? 'КОСТИ' : 'КАРТЫ';
    if (queueState.phase === 'matched') {
      title.textContent = 'СОПЕРНИК НАЙДЕН · ' + modeName;
      details.textContent = 'Партия начнётся автоматически через ' + Math.max(0, Number(queueState.seconds) || 0) + ' сек.';
      cancel.style.display = 'none';
    } else {
      title.textContent = 'ПОИСК СОПЕРНИКА · ' + modeName;
      const wait = Math.max(0, Number(queueState.waitedSeconds) || 0);
      const ratingText = queueState.ranked
        ? 'ELO ' + (Number(queueState.rating) || 1000) + ' · диапазон ±' + (Number(queueState.allowedDistance) || 150)
        : 'Гостевой матч · без изменения рейтинга';
      details.textContent = ratingText + ' · ожидание ' + wait + ' сек.';
      cancel.style.display = 'inline-block';
    }
    queuePanel.style.display = 'flex';
  }

  queuePanel.addEventListener('click', event => {
    if (!event.target.closest('#agroQueueCancel')) return;
    socket.emit('quickSearchCancel');
    queueState = null;
    renderQueuePanel();
  });

  ['#quickBtn', '#quickDiceButton'].forEach(selector => {
    const quickButton = document.querySelector(selector);
    if (!quickButton) return;
    const originalQuickPlay = quickButton.onclick;
    quickButton.onclick = function (event) {
      if (token && !account) {
        if (typeof notify === 'function') notify('Восстанавливаем аккаунт — подожди секунду.');
        return;
      }
      if (account && window.AgroRanked) return window.AgroRanked.open();
      if (typeof originalQuickPlay === 'function') return originalQuickPlay.call(this, event);
    };
  });

  function updateButton() {
    button.textContent = account ? '👤 ' + account.name : '👤 Аккаунт';
    button.title = account ? account.name + ' · Аккаунт и рейтинг' : 'Вход и регистрация';
  }

  function requestLeaderboard() {
    leaderboard = null;
    socket.emit('leaderboard', { mode });
  }

  function markAccountPrompted() {
    try { localStorage.setItem(PROMPT_KEY, '1'); } catch (_) {}
  }

  function openAccount(firstVisit = false) {
    if (!account && firstVisit) tab = 'register';
    message = '';
    draw();
    overlay.style.display = 'flex';
    if (account) requestLeaderboard();
  }

  button.addEventListener('click', () => openAccount(false));

  function draw() {
    let html = '<div class="modal account-modal"><div class="eyebrow">AGROBULL · ПРОФИЛЬ И РЕЙТИНГ</div>';
    if (!account) {
      html += '<h1 style="font-size:29px">' + (tab === 'login' ? 'ВХОД' : 'РЕГИСТРАЦИЯ') + '</h1>';
      html += '<div class="account-tabs">' +
        '<button type="button" class="secondary ' + (tab === 'login' ? 'active' : '') + '" data-tab="login">Вход</button>' +
        '<button type="button" class="secondary ' + (tab === 'register' ? 'active' : '') + '" data-tab="register">Регистрация</button>' +
        '</div>';
      html += '<input class="account-input" id="accountName" maxlength="16" autocomplete="username" placeholder="Ник · 3–16 символов">';
      html += '<input class="account-input" id="accountPassword" type="password" maxlength="64" autocomplete="' +
        (tab === 'login' ? 'current-password' : 'new-password') + '" placeholder="Пароль · от 8 символов">';
      html += '<div class="account-error">' + escapeHtml(message) + '</div>';
      html += '<button type="button" class="primary" id="accountSubmit" style="width:100%" ' +
        (busy || !connectionReady ? 'disabled' : '') + '>' +
        (busy ? 'ПОДОЖДИ…' : tab === 'login' ? 'ВОЙТИ' : 'СОЗДАТЬ АККАУНТ') + '</button>';
      html += '<p class="account-note">Без аккаунта можно играть как гость. Рейтинг, сохранённая статистика и таблица лидеров доступны после регистрации. Пароль хранится в виде защищённого хэша. Восстановления пароля пока нет: для этого нужна почта.</p>';
    } else {
      html += '<h1 style="font-size:29px">' + escapeHtml(account.name) + '</h1>';
      html += '<div class="account-stats"><span>Матчей: <b>' + account.games + '</b></span>' +
        '<span>Побед: <b>' + account.wins + '</b></span>' +
        '<span>Поражений: <b>' + account.losses + '</b></span>' +
        '<span>Серия: <b>' + account.streak + '</b> · рекорд ' + account.best + '</span></div>';
      html += '<div class="account-ratings">';
      for (const key of Object.keys(MODES)) {
        html += '<div class="account-rating"><span>' + MODES[key] + '</span><b>' +
          Number(account.ratings && account.ratings[key] || 1000) + '</b><small>рейтинговых игр: ' +
          Number(account.rated && account.rated[key] || 0) + '</small></div>';
      }
      html += '</div>';
      html += '<div class="sectiontitle">ТАБЛИЦА ЛИДЕРОВ</div><div class="account-tabs">';
      for (const key of Object.keys(MODES)) {
        html += '<button type="button" class="secondary ' + (mode === key ? 'active' : '') +
          '" data-mode="' + key + '">' + MODES[key] + '</button>';
      }
      html += '</div><div class="account-scroll">';
      if (leaderboard && leaderboard.mode === mode) {
        if (leaderboard.top && leaderboard.top.length) {
          html += leaderboard.top.map(row =>
            '<div class="account-leader ' + (row.me ? 'me' : '') + '">' +
            '<span>' + row.rank + '. ' + escapeHtml(row.name) + '<br><small>' + row.games + ' рейтинговых игр</small></span>' +
            '<b>' + row.rating + '</b></div>'
          ).join('');
        } else html += '<p class="account-note">Пока нет игроков с рейтинговыми матчами в этом режиме.</p>';
        if (leaderboard.me && !leaderboard.top.some(row => row.me)) {
          html += '<div class="account-leader me"><span>' + leaderboard.me.rank + '. ' +
            escapeHtml(leaderboard.me.name) + '<br><small>Твоё место</small></span><b>' +
            leaderboard.me.rating + '</b></div>';
        }
        if (leaderboard.unavailable || leaderboard.error) html += '<p class="account-note">Таблица лидеров временно недоступна.</p>';
      } else html += '<p class="account-note">Загружаем таблицу лидеров…</p>';
      html += '</div>';
      html += '<p class="account-note">Рейтинговый матч засчитывается, только если все участники — люди с аккаунтами. Игры с гостями и ботами не меняют ELO. С одной и той же парой игроков — не больше 5 рейтинговых игр за сутки.</p>';
      html += '<button type="button" class="secondary" id="accountLogout" style="width:100%">ВЫЙТИ ИЗ АККАУНТА</button>';
    }
    html += '<button type="button" class="primary" id="accountClose" style="width:100%;margin-top:8px">' +
      (account ? 'ЗАКРЫТЬ' : 'ПРОДОЛЖИТЬ КАК ГОСТЬ') + '</button></div>';
    overlay.innerHTML = html;
    bind();
  }

  function bind() {
    const query = selector => overlay.querySelector(selector);
    overlay.querySelectorAll('[data-tab]').forEach(item => item.addEventListener('click', () => {
      tab = item.dataset.tab;
      message = '';
      draw();
    }));
    overlay.querySelectorAll('[data-mode]').forEach(item => item.addEventListener('click', () => {
      mode = item.dataset.mode;
      draw();
      requestLeaderboard();
    }));
    const submit = query('#accountSubmit');
    if (submit) submit.addEventListener('click', () => {
      if (busy || !socket.connected) {
        message = 'Нет соединения с сервером.';
        return draw();
      }
      const username = query('#accountName').value.trim();
      const password = query('#accountPassword').value;
      if (!username || !password) {
        message = 'Введи ник и пароль.';
        return draw();
      }
      busy = true;
      message = '';
      draw();
      socket.emit(tab === 'login' ? 'authLogin' : 'authRegister', { username, password });
    });
    const logout = query('#accountLogout');
    if (logout) logout.addEventListener('click', () => {
      socket.emit('authLogout', { token });
    });
    const close = query('#accountClose');
    if (close) close.addEventListener('click', () => { markAccountPrompted(); overlay.style.display = 'none'; });
  }

  function resumeSession() {
    connectionReady = true;
    if (token) {
      socket.emit('authResume', { token });
    } else {
      let alreadyPrompted = false;
      try { alreadyPrompted = localStorage.getItem(PROMPT_KEY) === '1'; } catch (_) {}
      if (!alreadyPrompted) {
        markAccountPrompted();
        openAccount(true);
      }
    }
    if (overlay.style.display === 'flex') draw();
  }

  socket.on('connect', resumeSession);
  socket.on('disconnect', () => {
    connectionReady = false;
    queueState = null;
    renderQueuePanel();
    if (overlay.style.display === 'flex') draw();
  });
  if (socket.connected) resumeSession();

  socket.on('authOk', data => {
    busy = false;
    token = String(data && data.token || '');
    account = data && data.profile || null;
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
    message = '';
    updateButton();
    if (overlay.style.display === 'flex') {
      draw();
      requestLeaderboard();
    }
  });

  socket.on('authError', data => {
    busy = false;
    message = data && data.message || 'Не удалось выполнить вход.';
    if (data && data.resume) {
      token = '';
      try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
      tab = 'login';
    }
    if (overlay.style.display === 'flex') draw();
    else if (data && data.resume) openAccount(false);
  });

  socket.on('authOut', () => {
    token = '';
    account = null;
    leaderboard = null;
    busy = false;
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    updateButton();
    draw();
  });

  socket.on('profile', data => {
    if (!data) return;
    account = data;
    updateButton();
    if (overlay.style.display === 'flex') draw();
  });

  socket.on('leaderboardData', data => {
    leaderboard = data || null;
    if (overlay.style.display === 'flex' && account) draw();
  });

  socket.on('ratingChange', data => {
    if (!data) return;
    const modeName = MODES[data.mode] || 'Рейтинг';
    if (data.ranked) {
      const delta = Number(data.delta) || 0;
      const suffix = delta > 0 ? '+' + delta : String(delta);
      if (typeof notify === 'function') notify(modeName + ': ' + data.rating + ' (' + suffix + ')');
    } else if (data.note && typeof notify === 'function') {
      notify(data.note);
    }
    if (account && overlay.style.display === 'flex') requestLeaderboard();
  });

  socket.on('quickSearching', data => {
    queueState = { ...(data || {}), phase: 'searching' };
    renderQueuePanel();
    if (typeof notify === 'function') {
      const modeName = data && data.mode === 'dice' ? 'в кости' : 'в картах';
      notify(data && data.ranked
        ? 'Ищем соперника близкого рейтинга ' + modeName + '…'
        : 'Ищем соперника ' + modeName + '…');
    }
  });

  socket.on('quickQueueStatus', data => {
    if (!queueState || queueState.phase !== 'searching') return;
    queueState = { ...queueState, ...(data || {}), phase: 'searching' };
    renderQueuePanel();
  });

  socket.on('quickSearchCancelled', () => {
    queueState = null;
    renderQueuePanel();
    if (typeof notify === 'function') notify('Поиск соперника отменён.');
  });

  socket.on('quickMatchFound', data => {
    queueState = { ...(data || {}), phase: 'matched', seconds: data && data.countdown || 8 };
    renderQueuePanel();
  });

  socket.on('quickMatchCountdown', data => {
    if (!queueState || queueState.phase !== 'matched') return;
    queueState = { ...queueState, seconds: data && data.seconds || 0 };
    renderQueuePanel();
  });

  socket.on('gameState', state => {
    if (state && state.phase && state.phase !== 'lobby') {
      queueState = null;
      renderQueuePanel();
    }
  });

  socket.on('diceState', () => {
    queueState = null;
    renderQueuePanel();
  });

  socket.on('roomError', () => {
    if (queueState && queueState.phase === 'searching') {
      queueState = null;
      renderQueuePanel();
    }
  });

  updateButton();
})();
