/* AGROBULL ABILITIES — second character abilities, target selection and visual feedback. */
(() => {
  'use strict';
  if (typeof socket === 'undefined' || !socket || typeof document === 'undefined') return;

  let state = null;
  let roster = [];
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[char]));
  const playerName = id => (roster.find(player => player.id === id) || {}).name || 'Игрок';
  const notifyAbility = message => {
    if (typeof notify === 'function') notify(message);
  };
  const icons = { fake: '🧪', jam: '⚖️', seat: '🧢', look: '🎩' };

  const style = document.createElement('style');
  style.textContent =
    '#ab2{position:fixed;left:14px;bottom:126px;z-index:35;display:none;flex-direction:column;gap:6px;align-items:flex-start;max-width:min(330px,calc(100vw - 28px))}' +
    '#ab2 .b{padding:9px 13px;border-radius:12px;border:1px solid #c79a5a;background:linear-gradient(180deg,#2d2318,#140e09);color:#ffe6ac;font:800 12px Inter,sans-serif;box-shadow:0 8px 22px #000a;text-align:left;max-width:100%}' +
    '#ab2 .b:disabled{opacity:.42}' +
    '#ab2 .b small{display:block;font-weight:600;opacity:.78;margin-top:3px;line-height:1.35}' +
    '#ab2 .lock{padding:5px 10px;border-radius:999px;background:rgba(120,30,20,.92);border:1px solid #ff8a78;color:#fff;font:800 11px Inter,sans-serif}' +
    '#ab2P{position:fixed;left:14px;bottom:198px;z-index:36;display:none;flex-direction:column;gap:6px;padding:10px;border-radius:14px;background:rgba(16,11,8,.97);border:1px solid #c79a5a;box-shadow:0 14px 40px #000c;max-width:calc(100vw - 28px);max-height:45vh;overflow:auto}' +
    '#ab2P button{padding:8px 13px;border-radius:9px;border:1px solid #a9803f;background:#2a211a;color:#f3dfb8;font:800 12px Inter,sans-serif;text-align:left}' +
    '.noabil #ab2{display:none!important}';
  document.head.appendChild(style);

  const box = document.createElement('div');
  box.id = 'ab2';
  document.body.appendChild(box);

  const popup = document.createElement('div');
  popup.id = 'ab2P';
  document.body.appendChild(popup);

  function hidePopup() {
    popup.style.display = 'none';
    popup.innerHTML = '';
  }

  function draw() {
    const players = state && Array.isArray(state.players) ? state.players : [];
    const selfIdValue = typeof selfId !== 'undefined' ? selfId : null;
    const me = players.find(player => player.id === selfIdValue);
    const ability = me && me.ability2;

    if (!ability || !ability.level || state.phase !== 'playing' || !me.alive) {
      box.style.display = 'none';
      hidePopup();
      return;
    }

    const canLook = !!(state.lastPlay && state.lastPlay.playerId !== me.id && !state.reveal);
    const disabled = ability.left <= 0 || ability.blocked ||
      (ability.id === 'seat' && state.currentId !== me.id) ||
      (ability.id === 'look' && !canLook);

    box.innerHTML =
      (ability.blocked
        ? '<div class="lock">🔒 Умения заблокированы: ' + escapeHtml(ability.blockedRounds) + ' р.</div>'
        : '') +
      '<button class="b" id="abB" ' + (disabled ? 'disabled' : '') + '>' +
      (icons[ability.id] || '✨') + ' ' + escapeHtml(ability.name) +
      '<small>ур. ' + escapeHtml(ability.level) + ' · осталось ' +
      escapeHtml(ability.left) + '/' + escapeHtml(ability.uses) + ' · ' +
      escapeHtml(ability.hint) + '</small></button>';

    box.style.display = 'flex';
    const actionButton = box.querySelector('#abB');
    actionButton.onclick = () => {
      if (ability.id === 'look') {
        socket.emit('ability2', {});
        return;
      }

      popup.innerHTML = '';
      if (ability.id === 'fake') {
        popup.innerHTML =
          '<button data-dir="1">➕ Показать больше карт</button>' +
          '<button data-dir="-1">➖ Показать меньше карт</button>';
      } else {
        const targets = players.filter(player => player.alive && player.id !== me.id);
        targets.forEach(player => {
          const button = document.createElement('button');
          button.dataset.target = player.id;
          button.textContent = player.name;
          popup.appendChild(button);
        });
        if (!targets.length) {
          const empty = document.createElement('button');
          empty.disabled = true;
          empty.textContent = 'Нет доступных соперников';
          popup.appendChild(empty);
        }
      }

      popup.style.display = 'flex';
      popup.querySelectorAll('button').forEach(button => {
        button.onclick = () => {
          if (button.dataset.dir) {
            socket.emit('ability2', { dir: Number(button.dataset.dir) });
          } else if (button.dataset.target) {
            socket.emit('ability2', { targetId: button.dataset.target });
          }
          hidePopup();
        };
      });
    };
  }

  socket.on('gameState', snapshot => {
    state = snapshot;
    roster = snapshot.players || roster;
    draw();
  });

  socket.on('lobby', lobby => {
    roster = lobby.players || roster;
  });

  socket.on('abilityFx', event => {
    const messages = {
      fake: () => '🧪 ' + playerName(event.from) + ' что-то подделал в своих картах…',
      jam: () => '⚖️ ' + playerName(event.from) + ' блокирует умения игрока ' + playerName(event.to) + '!',
      seat: () => '🧢 ' + playerName(event.from) + ' и ' + playerName(event.to) + ' поменялись местами!',
      look: () => '🎩 ' + playerName(event.from) + ' изучает последнюю выкладку'
    };
    if (messages[event.type]) notifyAbility(messages[event.type]());
  });
})();
