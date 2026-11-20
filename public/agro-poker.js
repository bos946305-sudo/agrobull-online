/* AGROBULL POKER — client UI for the server-authoritative bluff poker mode. */
(() => {
  'use strict';
  if (typeof socket === 'undefined' || !socket || typeof document === 'undefined') return;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  const style = document.createElement('style');
  style.textContent = `
#pokerO{position:fixed;inset:0;z-index:48;display:none;flex-direction:column;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 58px) 12px calc(env(safe-area-inset-bottom,0px) + 12px);overflow:auto;background:radial-gradient(circle at 50% 0,rgba(184,125,53,.2),transparent 55%),rgba(5,4,4,.9);backdrop-filter:blur(9px);color:#f3e3c3;font-family:Inter,sans-serif;text-align:center}
#pokerO .pkpanel{width:min(760px,100%);padding:15px;border:1px solid #70512e;border-radius:17px;background:linear-gradient(145deg,#21170fef,#0c0908f5);box-shadow:0 20px 60px #000b}
#pokerO h2{margin:0 0 8px;color:#ffe0a0;font:800 25px 'Barlow Condensed',Inter,sans-serif;letter-spacing:2px}
#pokerO .pkrow{display:flex;gap:7px;justify-content:center;flex-wrap:wrap;align-items:center}
#pokerO .pkplayer{min-width:105px;padding:9px;border:1px solid #59432d;border-radius:10px;background:#100c09}
#pokerO .pkplayer.me{border-color:#e8bc68;box-shadow:0 0 12px #d89d4055}
#pokerO .pkcard{display:inline-grid;place-items:center;min-width:38px;height:54px;margin:3px;padding:4px 6px;border-radius:7px;background:linear-gradient(145deg,#fff9e9,#d8c7a5);color:#21170f;font:800 14px Georgia;box-shadow:0 4px 9px #0008}
#pokerO button,#pokerO select{border:1px solid #9a713e;border-radius:9px;padding:10px 12px;background:#17100b;color:#f5e4c5;font-weight:700}
#pokerO button.go{background:linear-gradient(#f3d18a,#9a642a);color:#261706}
#pokerO button:disabled{opacity:.35}
#pokerO .pkclaim{margin:10px auto;padding:12px;border:1px solid #8d6939;border-radius:10px;background:#0d0907;color:#ffe1a7;font-size:18px;font-weight:800}
#pokerO .pkmuted{font-size:12px;color:#bba98d}
#pokerStartButton{display:none;width:100%;margin-top:8px}
@media(max-width:600px){#pokerO .pkpanel{padding:11px}#pokerO .pkcard{min-width:32px;height:46px;font-size:12px}}
`;
  document.head.appendChild(style);
  const overlay = document.createElement('div');
  overlay.id = 'pokerO';
  document.body.appendChild(overlay);
  const startButton = document.createElement('button');
  startButton.id = 'pokerStartButton'; startButton.className = 'primary';
  startButton.textContent = '🃏 Играть в покер';
  const anchor = document.querySelector('#roomPlayers');
  if (anchor) anchor.insertAdjacentElement('afterend', startButton);
  else document.body.appendChild(startButton);
  let state = null, selfId = null, host = false, busy = false;
  const hide = () => { overlay.style.display = 'none'; };
  startButton.addEventListener('click', () => {
    if (!socket.connected) return typeof notify === 'function' && notify('Нет соединения с сервером');
    busy = true; startButton.disabled = true; startButton.textContent = 'Запускаем покер…';
    socket.emit('pokerStart');
    setTimeout(() => { if (busy) { busy = false; startButton.disabled = false; startButton.textContent = '🃏 Играть в покер'; } }, 3500);
  });
  socket.on('lobby', lobby => {
    busy = false; selfId = typeof getSelfId === 'function' ? getSelfId() : selfId;
    const me = lobby && (lobby.players || []).find(p => p.id === selfId);
    host = !!(me && me.isHost);
    startButton.style.display = host && !(lobby && (lobby.pokerActive || lobby.ranked)) ? 'block' : 'none';
    startButton.disabled = false; startButton.textContent = '🃏 Играть в покер';
    if (lobby && !lobby.pokerActive) hide();
  });
  socket.on('joined', data => { if (data && data.playerId) selfId = data.playerId; });
  socket.on('gameState', snapshot => { if (snapshot && snapshot.phase !== 'lobby') hide(); });
  socket.on('diceState', hide);
  socket.on('pokerState', snapshot => {
    state = snapshot; busy = false; startButton.style.display = 'none';
    overlay.style.display = 'flex'; draw();
  });
  socket.on('roomError', data => {
    if (!busy) return;
    busy = false; startButton.disabled = false; startButton.textContent = '🃏 Играть в покер';
    if (data && data.message && typeof notify === 'function') notify(data.message);
  });
  socket.on('disconnect', () => { hide(); state = null; });

  function draw() {
    if (!state) return;
    const me = state.players.find(p => p.id === selfId);
    const myTurn = state.phase === 'playing' && state.turnId === selfId;
    const hand = Array.isArray(me && me.hand) ? me.hand : [];
    let html = '<div class="pkpanel"><h2>🃏 ПОКЕРНЫЙ БЛЕФ · РАУНД ' + Number(state.round || 0) + '</h2>';
    html += '<div class="pkrow">' + state.players.map(p =>
      '<div class="pkplayer ' + (p.id === selfId ? 'me' : '') + '"><b>' + esc(p.id === selfId ? 'Ты' : p.name) +
      '</b><div>❤️ ' + Number(p.lives || 0) + ' · ' + (p.alive ? 'в игре' : 'выбыл') +
      '</div><small class="pkmuted">' + Number(p.handCount || 0) + ' карт</small></div>'
    ).join('') + '</div>';
    html += '<div class="pkmuted" style="margin:10px 0">' + esc(state.message || '') + '</div>';
    if (state.claim) html += '<div class="pkclaim">Заявка: ' + esc(state.claim.label) +
      '<div class="pkmuted">Заявил: ' + esc((state.players.find(p => p.id === state.claim.by) || {}).name || 'Игрок') + '</div></div>';
    else html += '<div class="pkclaim">Первый ход — сделай любую заявку</div>';
    html += '<div class="pkmuted">Твои карты</div><div class="pkrow">' +
      (hand.map(card => '<span class="pkcard">' + esc(card) + '</span>').join('') || 'Карты скрыты') + '</div>';
    if (state.phase === 'playing' && myTurn) {
      html += '<div style="margin-top:12px"><div class="pkmuted">Выбери заявку выше предыдущей</div>' +
        '<select id="pkClaim" style="width:min(100%,420px);margin:7px 0">' +
        state.claims.filter(c => !state.claim || compareClaim(c,state.claim) > 0).map(c =>
          '<option value="' + [c.t,c.a,c.b == null ? '' : c.b,c.s == null ? '' : c.s].join(',') + '">' + esc(c.label) + '</option>'
        ).join('') + '</select><div class="pkrow">' +
        '<button class="go" id="pkBid">Сделать заявку</button>' +
        (state.claim ? '<button id="pkCall">🐂 Проверить блеф</button>' : '') + '</div></div>';
    } else if (state.phase === 'playing') {
      html += '<div class="pkmuted" style="margin:12px">Ход другого игрока · ' +
        Math.max(0, Math.ceil((Number(state.ms || 0))/1000)) + ' сек.</div>';
    }
    if (state.phase === 'reveal' && state.reveal) {
      html += '<div class="pkclaim">' + (state.reveal.trueClaim ? 'Заявка ПРАВДА' : 'ЗАЯВКА — БЛЕФ') +
        '<div class="pkmuted">Проверка открыла все карты стола</div><div class="pkrow">' +
        state.reveal.cards.map(card => '<span class="pkcard">' + esc(card) + '</span>').join('') + '</div></div>';
    }
    if (state.phase === 'finished') {
      html += '<div class="pkclaim">🏆 ' + esc((state.players.find(p => p.id === state.winnerId) || {}).name || 'Победитель') + ' победил!</div>' +
        (host && !state.ranked ? '<button class="go" id="pkAgain">Реванш</button>' : '') +
        '<button id="pkLeave">Выйти в меню</button>';
    }
    html += '</div>';
    overlay.innerHTML = html;
    const bid = overlay.querySelector('#pkBid');
    if (bid) bid.onclick = () => {
      const raw = overlay.querySelector('#pkClaim').value.split(',');
      const claim = {t:Number(raw[0]),a:Number(raw[1])};
      if (raw[2] !== '') claim.b = Number(raw[2]);
      if (raw[3] !== '') claim.s = Number(raw[3]);
      socket.emit('pokerClaim',{claim});
    };
    const call = overlay.querySelector('#pkCall');
    if (call) call.onclick = () => socket.emit('pokerCall');
    const again = overlay.querySelector('#pkAgain');
    if (again) again.onclick = () => socket.emit('pokerRematch');
    const leave = overlay.querySelector('#pkLeave');
    if (leave) leave.onclick = () => { socket.emit('leaveRoom'); hide(); };
  }
  function compareClaim(a,b) {
    return (a.t-b.t)||(a.a-b.a)||((a.b||0)-(b.b||0))||((a.s||0)-(b.s||0));
  }
})();
