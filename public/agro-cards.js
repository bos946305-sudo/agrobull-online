/* AGROBULL CARDS — special-card UI, round events and Revenge action. */
(() => {
  'use strict';
  if (typeof socket === 'undefined' || !socket || typeof document === 'undefined') return;

  let state = null, receivedAt = 0, roster = [];
  const esc = value => String(value == null ? '' : value).replace(/[&<>"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  })[char]);
  const nameOf = id => (roster.find(player => player.id === id) || {}).name || 'Игрок';
  const notifyUser = message => { if (typeof notify === 'function') notify(message); };

  document.head.insertAdjacentHTML('beforeend',
    '<style>' +
    '#agroSpecialBar{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 88px);transform:translateX(-50%);z-index:30;display:none;flex-direction:column;align-items:center;gap:5px;pointer-events:none;max-width:92vw}' +
    '#agroSpecialBar .pill{padding:5px 14px;border-radius:999px;background:rgba(18,12,8,.92);border:1px solid #e1ac55;color:#ffe6ac;font:800 11px Inter,sans-serif;text-align:center;box-shadow:0 8px 22px #000a}' +
    '#agroSpecialBar .pill.event{border-color:#ff8a5a;color:#ffd0b8;animation:agroSpecialPulse 1.6s ease-in-out infinite alternate}' +
    '@keyframes agroSpecialPulse{to{box-shadow:0 0 18px #ff8a5a88}}' +
    '#agroRevengeButton{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 120px);transform:translateX(-50%);z-index:80;display:none;padding:14px 26px;border-radius:14px;border:1px solid #ffd0a0;background:linear-gradient(180deg,#ffb36a,#c4601e 55%,#7a3410);color:#fff;font:900 16px Inter,sans-serif;box-shadow:0 12px 34px #000c,0 0 26px #ff8a3a88;animation:agroRevengePulse .7s ease-in-out infinite alternate}' +
    '@keyframes agroRevengePulse{to{transform:translateX(-50%) scale(1.07)}}' +
    '#agroCardsHelp{z-index:68}#agroCardsHelp .specialCardHelp{display:flex;gap:10px;align-items:flex-start;text-align:left;margin:7px 0;font:600 12px Inter,sans-serif}#agroCardsHelp .specialCardHelp .symbol{font-size:22px;line-height:1}' +
    '</style>'
  );

  const bar = document.createElement('div');
  bar.id = 'agroSpecialBar';
  document.body.append(bar);

  const revengeButton = document.createElement('button');
  revengeButton.id = 'agroRevengeButton';
  revengeButton.textContent = '⚔ РЕВАНШ!';
  document.body.append(revengeButton);
  revengeButton.onclick = () => {
    socket.emit('useCard', { type: 'revenge' });
    revengeButton.style.display = 'none';
  };

  const help = document.createElement('div');
  help.className = 'overlay';
  help.id = 'agroCardsHelp';
  help.style.display = 'none';
  help.innerHTML =
    '<div class="modal">' +
    '<div class="eyebrow">Режимы «Двойной бык» и «Хаос»</div><h1 style="font-size:26px">ОСОБЫЕ КАРТЫ</h1>' +
    '<div class="specialCardHelp"><b class="symbol">💀</b><span><b>Проклятие</b><br>Выложил — следующий игрок проклят: его ближайший проигрыш на быке считается за два.</span></div>' +
    '<div class="specialCardHelp"><b class="symbol">🔄</b><span><b>Переворот</b><br>Выложил — направление хода меняется.</span></div>' +
    '<div class="specialCardHelp"><b class="symbol">🛡️</b><span><b>Защита</b><br>Остаётся в руке и автоматически отменяет один штраф за проигранную проверку.</span></div>' +
    '<div class="specialCardHelp"><b class="symbol">⚔️</b><span><b>Реванш</b><br>Если твоя проверка оказалась ошибочной, в первые 2,5 секунды нажми «Реванш» — штраф перейдёт обвинённому игроку.</span></div>' +
    '<div class="specialCardHelp"><b class="symbol">🎲</b><span><b>Слепая ставка</b><br>Выложил — к ставке случайно добавляются ещё 1–2 карты из твоей руки.</span></div>' +
    '<div class="intro" style="max-width:none;font-size:11px">Особые карты не подходят под культуру на столе. В режиме «Хаос» случайно включаются события: «Двойной урожай», «Быки не в цене» и «Двойной удар».</div>' +
    '<button class="primary" id="agroCardsHelpClose" style="width:100%">Понятно</button></div>';
  document.body.append(help);
  help.querySelector('#agroCardsHelpClose').onclick = () => { help.style.display = 'none'; };

  const helpButton = document.createElement('button');
  helpButton.className = 'iconbtn';
  helpButton.textContent = '🃏';
  helpButton.title = 'Особые карты и события';
  helpButton.setAttribute('aria-label', 'Особые карты и события');
  helpButton.onclick = () => { help.style.display = 'flex'; };
  const topRight = document.querySelector('.topright');
  if (topRight) topRight.prepend(helpButton);

  function render() {
    if (!state || !Array.isArray(state.players)) {
      bar.style.display = 'none';
      revengeButton.style.display = 'none';
      return;
    }

    const myId = typeof selfId !== 'undefined' ? selfId : null;
    const me = state.players.find(player => player.id === myId);
    const pills = [];

    if (state.event) {
      pills.push('<div class="pill event">⚡ ' + esc(state.event.name) + ' — ' + esc(state.event.desc) + '</div>');
    }
    if (state.table2) {
      pills.push('<div class="pill">Подходят две культуры: ' +
        esc(state.table && state.table.icon || '') + ' ' + esc(state.table && state.table.name || '') +
        ' и ' + esc(state.table2.icon || '') + ' ' + esc(state.table2.name || '') + '</div>');
    }
    if (state.dir === -1) pills.push('<div class="pill">🔄 Ход идёт в обратную сторону</div>');

    const cursed = state.players.filter(player => player.cursed && player.alive);
    if (cursed.length) {
      pills.push('<div class="pill">💀 Прокляты: ' +
        cursed.map(player => esc(player.name)).join(', ') + '</div>');
    }

    bar.innerHTML = pills.join('');
    bar.style.display = pills.length && state.phase !== 'finished' ? 'flex' : 'none';

    const rodeo = state.rodeo;
    const canRevenge = !!(
      me && state.phase === 'rodeo' && rodeo && state.reveal &&
      !state.reveal.isLie && rodeo.callerId === me.id && rodeo.playerId === me.id &&
      !rodeo.revenged && Number(rodeo.added || 0) > 0 &&
      Array.isArray(me.hand) && me.hand.some(card => card.id === 'revenge') &&
      Date.now() - receivedAt < 2300
    );

    revengeButton.style.display = canRevenge ? 'block' : 'none';
    if (canRevenge) setTimeout(render, Math.max(50, 2400 - (Date.now() - receivedAt)));
  }

  socket.on('gameState', snapshot => {
    state = snapshot;
    receivedAt = Date.now();
    roster = snapshot.players || roster;
    render();
  });
  socket.on('lobby', lobby => { roster = lobby.players || roster; });

  socket.on('cardFx', event => {
    if (!event) return;
    const messages = {
      curse: () => '💀 ' + nameOf(event.from) + ' накладывает проклятие на ' + nameOf(event.to) + '!',
      curseHit: () => '💀 Проклятие сработало на ' + nameOf(event.to) + ': +1 уровень быка',
      reverse: () => '🔄 Переворот! Ход идёт в другую сторону',
      shield: () => '🛡️ «Защита» спасла ' + nameOf(event.to) + ' — уровень быка не вырос',
      revenge: () => '⚔️ РЕВАНШ! Штраф переходит игроку ' + nameOf(event.to),
      blind: () => '🎲 «Слепая ставка»: ' + nameOf(event.from) + ' добавил карты вслепую',
      doubleRide: () => '⚡ «Двойной удар»: ' + nameOf(event.to) + ' получает ещё +1 уровень'
    };
    if (messages[event.type]) notifyUser(messages[event.type]());
  });

  window.AgroSpecialCards = {
    openHelp: () => { help.style.display = 'flex'; },
    closeHelp: () => { help.style.display = 'none'; }
  };
})();
