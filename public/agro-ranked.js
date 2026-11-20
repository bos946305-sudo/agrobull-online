/* AGROBULL RANKED — unified rated matchmaking UI. Load after agro-account.js. */
(() => {
  'use strict';
  if (typeof socket === 'undefined' || !socket) return;
  const config = window.AGRO_RANKED || {};
  const events = {
    queue: 'rankedQueue', cancel: 'rankedCancel', info: 'rankedInfo',
    infoData: 'rankedInfoData', status: 'rankedStatus', found: 'rankedFound',
    error: 'rankedError', left: 'rankedLeft', ...(config.events || {})
  };
  const modeNames = { cards: 'Карты', dice: 'Кости' };
  let info = null, mode = 'cards', want = 2, status = null;
  let found = null, errorText = '', countdown = 0, loading = false;
  let countdownTimer = null;

  document.head.insertAdjacentHTML('beforeend', `<style>
#rkO{z-index:76}#rkO .row button{flex:1}#rkO .tabs button.on{border-color:#ffe08a;box-shadow:0 0 12px #f0b24a88}
#rkO .big{font:800 34px 'Barlow Condensed',Inter,sans-serif;color:#ffe6ac}
#rkO .spin{width:38px;height:38px;margin:8px auto;border-radius:50%;border:4px solid #4b3a26;border-top-color:#ffd36a;animation:rks 1s linear infinite}
@keyframes rks{to{transform:rotate(360deg)}}
</style>`);
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'rkO';
  overlay.style.display = 'none';
  document.body.append(overlay);

  const esc = value => String(value == null ? '' : value).replace(/[&<>"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  })[char]);

  function stopCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
  }

  function open() {
    stopCountdown();
    errorText = '';
    info = null;
    status = null;
    found = null;
    loading = true;
    draw();
    overlay.style.display = 'flex';
    socket.emit(events.info);
  }

  function search(options = {}) {
    if (options.mode) mode = options.mode;
    if (options.want) want = Number(options.want) === 4 ? 4 : 2;
    errorText = '';
    found = null;
    status = { mode, want, waited: 0, window: 100, queued: 1 };
    draw();
    socket.emit(events.queue, {
      ...(typeof emitProfile === 'function' ? emitProfile() : {}),
      mode, want
    });
  }

  function cancel() {
    socket.emit(events.cancel);
  }

  function close() {
    stopCountdown();
    overlay.style.display = 'none';
  }

  function draw() {
    let html = '<div class="modal"><div class="eyebrow">РЕЙТИНГ AGROBULL</div>';
    if (found) {
      html += '<h1 style="font-size:30px">МАТЧ НАЙДЕН!</h1>' +
        '<div class="big">Старт через ' + countdown + '</div>' +
        '<div class="intro" style="max-width:none">' +
        found.players.map(player => esc(player.name) + ' (' + esc(player.rating) + ')').join(' · ') +
        '</div>';
    } else if (status) {
      html += '<h1 style="font-size:28px">ПОИСК СОПЕРНИКА</h1><div class="spin"></div>' +
        '<div class="intro" style="max-width:none;margin:2px 0">' +
        esc(modeNames[status.mode] || status.mode) +
        (status.want === 4 ? ' · стол на 4' : ' · дуэль') + '</div>' +
        '<div class="big">' + Number(status.waited || 0) + ' с</div>' +
        '<div class="intro" style="max-width:none;font-size:12px">Допустимая разница в рейтинге: ±' +
        Number(status.window || 0) + ' · в очереди: ' + Number(status.queued || 0) + '</div>' +
        '<button class="secondary" id="rkC" style="width:100%;margin-top:10px">Отмена</button>';
    } else if (loading) {
      html += '<h1 style="font-size:24px">ЗАГРУЗКА…</h1><div class="spin"></div>';
    } else if (!info || !info.loggedIn) {
      html += '<h1 style="font-size:26px">НУЖЕН АККАУНТ</h1>' +
        '<div class="intro" style="max-width:none">Рейтинговые матчи доступны только игрокам с аккаунтом. Войди или зарегистрируйся, затем открой это окно снова.</div>' +
        '<div class="intro" style="color:#ff8a78;max-width:none">' + esc(errorText) + '</div>';
    } else {
      const modes = Object.keys(info.ratings || {}).filter(key => modeNames[key]);
      if (!modes.includes(mode)) mode = modes[0] || 'cards';
      html += '<h1 style="font-size:28px">РЕЙТИНГОВАЯ ИГРА</h1>' +
        (info.name ? '<div class="intro" style="max-width:none;margin:0">' + esc(info.name) + '</div>' : '') +
        '<div class="row tabs">' + modes.map(key =>
          '<button class="secondary ' + (mode === key ? 'on' : '') + '" data-mode="' + key + '">' +
          esc(modeNames[key]) + ' · ' + esc(info.ratings[key]) + '</button>'
        ).join('') + '</div>';
      if (config.sizes !== false) {
        html += '<div class="row tabs" style="margin-top:8px">' +
          '<button class="secondary ' + (want === 2 ? 'on' : '') + '" data-size="2">Дуэль 1×1</button>' +
          '<button class="secondary ' + (want === 4 ? 'on' : '') + '" data-size="4">Стол на 4</button></div>';
      }
      html += '<div class="intro" style="max-width:none;font-size:11px;margin:8px 0">' +
        'Подбор по рейтингу. Чем дольше ждёшь, тем шире диапазон. Стол на 4 может начаться через 30 секунд вдвоём или втроём.</div>' +
        '<div class="intro" style="color:#ff8a78;min-height:16px;max-width:none">' + esc(errorText) + '</div>' +
        '<button class="primary" id="rkG" style="width:100%">ИСКАТЬ СОПЕРНИКА</button>';
    }
    html += '</div>';
    if (!status && !found) html += '<button class="secondary" id="rkX" style="width:100%;margin-top:8px">Закрыть</button>';
    overlay.innerHTML = html;

    overlay.querySelectorAll('[data-mode]').forEach(button => {
      button.onclick = () => { mode = button.dataset.mode; draw(); };
    });
    overlay.querySelectorAll('[data-size]').forEach(button => {
      button.onclick = () => { want = Number(button.dataset.size); draw(); };
    });
    const go = overlay.querySelector('#rkG');
    if (go) go.onclick = () => search({ mode, want });
    const stop = overlay.querySelector('#rkC');
    if (stop) stop.onclick = cancel;
    const exit = overlay.querySelector('#rkX');
    if (exit) exit.onclick = close;
  }

  socket.on(events.infoData, data => {
    loading = false;
    info = data || { loggedIn: false };
    if (overlay.style.display === 'flex') draw();
  });
  socket.on(events.status, data => {
    status = data || null;
    if (overlay.style.display === 'flex') draw();
  });
  socket.on(events.left, () => {
    status = null;
    if (overlay.style.display === 'flex') draw();
  });
  socket.on(events.error, data => {
    status = null;
    loading = false;
    errorText = data && data.message || 'Не удалось начать поиск.';
    overlay.style.display = 'flex';
    draw();
  });
  socket.on(events.found, data => {
    stopCountdown();
    status = null;
    found = data;
    countdown = Number(data && data.startsIn) || 5;
    overlay.style.display = 'flex';
    draw();
    countdownTimer = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        stopCountdown();
        found = null;
        close();
      } else draw();
    }, 1000);
  });
  socket.on('disconnect', () => {
    stopCountdown();
    status = null;
    found = null;
  });

  if (config.button !== false) {
    const button = document.createElement('button');
    button.className = 'primary';
    button.textContent = '🏆 Рейтинговая игра';
    button.style.cssText = 'width:100%;margin-top:10px;background:linear-gradient(180deg,#ffd36a,#c28a3c 55%,#86571f);border-color:#fff0c0';
    const anchor = document.querySelector('#createBtn');
    if (anchor && anchor.parentNode) anchor.parentNode.after(button);
    else document.body.append(button);
    button.onclick = open;
  }

  window.AgroRanked = { open, search, cancel };
})();
