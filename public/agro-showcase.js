/* AGROBULL SHOWCASE — deck introduction + clear bluff explanation */
(() => {
  'use strict';
  if (typeof socket === 'undefined' || !socket || typeof THREE === 'undefined') return;

  const style = document.createElement('style');
  style.textContent = "#agroDeckIntro,#agroBluffReveal{position:fixed;inset:0;z-index:45;display:flex;align-items:center;justify-content:center;padding:18px;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .35s ease,visibility .35s}#agroDeckIntro.show,#agroBluffReveal.show{opacity:1;visibility:visible}#agroDeckIntro{background:radial-gradient(ellipse at 50% 48%,rgba(5,10,12,.18),rgba(3,5,7,.52) 70%,rgba(0,0,0,.25))}.agro-show-panel{width:min(760px,96vw);padding:clamp(14px,2.5vw,26px);border-radius:22px;border:1px solid rgba(231,190,120,.38);background:linear-gradient(145deg,rgba(18,25,25,.88),rgba(9,12,15,.88));box-shadow:0 28px 90px rgba(0,0,0,.62),inset 0 1px rgba(255,255,255,.09);backdrop-filter:blur(14px);text-align:center}.agro-show-eyebrow{font:800 9px Inter,sans-serif;letter-spacing:3px;text-transform:uppercase;color:#9ce5d5}.agro-show-title{margin:6px 0 4px;font:800 clamp(25px,4.2vw,39px)/1 'Barlow Condensed',sans-serif;letter-spacing:2px;color:#f3d49e;text-shadow:0 4px 24px #d29b4e44}.agro-show-sub{font:500 11px Inter,sans-serif;color:#d5c8b4;margin:0 0 17px}.agro-deck-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:clamp(7px,1.5vw,14px);align-items:stretch}.agro-deck-card{position:relative;min-width:0;min-height:clamp(126px,18vw,190px);padding:11px 7px 10px;border-radius:14px;border:2px solid #d9c39e;background:linear-gradient(145deg,#fff9e9,#e8d8bb 55%,#bda887);color:#35271d;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;box-shadow:0 16px 34px #0008,inset 0 0 0 3px rgba(255,255,255,.38);transform:translateY(28px) rotate(var(--tilt));opacity:0;animation:agroDeckIn .55s cubic-bezier(.2,1.3,.4,1) forwards;animation-delay:var(--delay)}.agro-deck-card:before{content:'';position:absolute;inset:6px;border:1px solid rgba(105,73,43,.35);border-radius:9px;pointer-events:none}.agro-deck-card .agro-count{position:absolute;top:9px;right:10px;padding:4px 7px;border-radius:999px;background:#33251c;color:#ffe5b5;font:800 10px Inter,sans-serif}.agro-deck-card .agro-symbol{font-size:clamp(34px,6vw,61px);filter:drop-shadow(0 5px 4px #0002)}.agro-deck-card .agro-name{font:800 clamp(9px,1.5vw,13px) Inter,sans-serif;text-transform:uppercase;letter-spacing:.6px}.agro-deck-card .agro-stack{font:700 9px Inter,sans-serif;color:#756047}.agro-deck-card.bull{background:linear-gradient(145deg,#f8dc9a,#c38b42);border-color:#f6d48c}.agro-deck-total{margin-top:14px;font:800 10px Inter,sans-serif;letter-spacing:1.6px;color:#c7e8de;text-transform:uppercase}@keyframes agroDeckIn{to{opacity:1;transform:translateY(0) rotate(var(--tilt))}}#agroDeckIntro .agro-show-panel{animation:agroPanelIn .55s ease-out both}@keyframes agroPanelIn{from{transform:scale(.94);opacity:0}to{transform:scale(1);opacity:1}}#agroBluffReveal{align-items:flex-start;padding-top:clamp(92px,15vh,150px);background:linear-gradient(180deg,rgba(2,5,7,.68),rgba(2,5,7,.15) 65%,transparent)}#agroBluffReveal .agro-show-panel{width:min(720px,96vw);border-color:rgba(227,178,108,.48);padding:clamp(13px,2vw,21px)}#agroBluffReveal.bad .agro-show-panel{border-color:rgba(245,89,77,.7);box-shadow:0 20px 70px #500a0a66,inset 0 1px #ffffff10}#agroBluffReveal.good .agro-show-panel{border-color:rgba(75,202,158,.66)}.agro-verdict-title{font:900 clamp(24px,4vw,36px)/1 'Barlow Condensed',sans-serif;letter-spacing:2px;margin:5px 0;color:#ffe0a6}#agroBluffReveal.bad .agro-verdict-title{color:#ff9c8b}#agroBluffReveal.good .agro-verdict-title{color:#8ce5c4}.agro-verdict-copy{font:600 12px/1.5 Inter,sans-serif;color:#f3e8d7;margin:4px auto 12px;max-width:640px}.agro-reveal-cards{display:flex;justify-content:center;flex-wrap:wrap;gap:9px;margin:9px 0 13px}.agro-reveal-card{position:relative;width:clamp(76px,10vw,108px);min-height:116px;padding:10px 6px 8px;border:2px solid #a7d9b8;border-radius:11px;background:linear-gradient(145deg,#fff9e9,#d7c6a6);color:#35271d;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;box-shadow:0 8px 18px #0007}.agro-reveal-card.bad{border-color:#ee685b;box-shadow:0 0 0 2px #ee685b55,0 8px 18px #0007}.agro-reveal-card .sym{font-size:31px}.agro-reveal-card .name{font:800 9px Inter,sans-serif;text-transform:uppercase;text-align:center}.agro-reveal-card .mark{font:900 8px Inter,sans-serif;letter-spacing:.5px;color:#237d54}.agro-reveal-card.bad .mark{color:#a51e19}.agro-reveal-footer{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:8px}.agro-chip{padding:7px 11px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);font:700 10px Inter,sans-serif;color:#f4e8d7}.agro-chip.danger{background:rgba(182,49,40,.23);border-color:#d9675a;color:#ffc0b5}.agro-chip.success{background:rgba(33,138,98,.2);border-color:#5bc69a;color:#b4f0d4}@media(max-width:560px){#agroDeckIntro{padding:8px}.agro-show-panel{padding:13px 8px;border-radius:16px}.agro-deck-row{gap:5px}.agro-deck-card{min-height:118px;padding:8px 3px}.agro-deck-card .agro-name{font-size:8px;letter-spacing:0}.agro-deck-card .agro-count{top:6px;right:5px;padding:3px 5px;font-size:9px}.agro-deck-card .agro-stack{font-size:8px}.agro-show-sub{font-size:9px;margin-bottom:10px}.agro-deck-total{font-size:8px}#agroBluffReveal{padding:72px 7px 7px}.agro-verdict-copy{font-size:10px}.agro-reveal-card{width:72px;min-height:104px}.agro-reveal-card .sym{font-size:27px}}@media(prefers-reduced-motion:reduce){.agro-deck-card,#agroDeckIntro .agro-show-panel{animation:none;opacity:1;transform:none}}";
  document.head.appendChild(style);

  const deckIntro = document.createElement('div');
  deckIntro.id = 'agroDeckIntro';
  deckIntro.setAttribute('aria-hidden','true');
  deckIntro.innerHTML =
    '<div class="agro-show-panel">' +
      '<div class="agro-show-eyebrow">AGROBULL · СТАРТ МАТЧА</div>' +
      '<div class="agro-show-title">СОСТАВ КОЛОДЫ</div>' +
      '<div class="agro-show-sub">Перед раздачей в колоде находятся:</div>' +
      '<div class="agro-deck-row">' +
        '<div class="agro-deck-card" style="--tilt:-5deg;--delay:.12s"><span class="agro-count">×6</span><span class="agro-symbol">🌾</span><span class="agro-name">Пшеница</span><span class="agro-stack">6 одинаковых карт</span></div>' +
        '<div class="agro-deck-card" style="--tilt:-2deg;--delay:.28s"><span class="agro-count">×6</span><span class="agro-symbol">🌽</span><span class="agro-name">Кукуруза</span><span class="agro-stack">6 одинаковых карт</span></div>' +
        '<div class="agro-deck-card" style="--tilt:2deg;--delay:.44s"><span class="agro-count">×6</span><span class="agro-symbol">🥕</span><span class="agro-name">Морковь</span><span class="agro-stack">6 одинаковых карт</span></div>' +
        '<div class="agro-deck-card bull" style="--tilt:5deg;--delay:.60s"><span class="agro-count">×2</span><span class="agro-symbol">🐂</span><span class="agro-name">Бык</span><span class="agro-stack">карта-джокер</span></div>' +
      '</div>' +
      '<div class="agro-deck-total">20 КАРТ · БЫК ЗАМЕНЯЕТ ЛЮБУЮ КУЛЬТУРУ</div>' +
    '</div>';
  document.body.appendChild(deckIntro);

  const verdict = document.createElement('div');
  verdict.id = 'agroBluffReveal';
  verdict.innerHTML = '<div class="agro-show-panel"><div class="agro-show-eyebrow">ПРОВЕРКА КАРТ</div><div class="agro-verdict-title"></div><div class="agro-verdict-copy"></div><div class="agro-reveal-cards"></div><div class="agro-verdict-copy agro-reason"></div><div class="agro-reveal-footer"></div></div>';
  document.body.appendChild(verdict);

  let deckTimer = null;
  let verdictTimer = null;
  let currentGameId = null;
  let lastRevealKey = '';

  function showDeckIntro() {
    clearTimeout(deckTimer);
    deckIntro.classList.add('show');
    deckIntro.setAttribute('aria-hidden','false');
    deckTimer = setTimeout(() => {
      deckIntro.classList.remove('show');
      deckIntro.setAttribute('aria-hidden','true');
    }, 5250);
  }

  function makeChip(text, className) {
    const chip = document.createElement('span');
    chip.className = 'agro-chip' + (className ? ' ' + className : '');
    chip.textContent = text;
    return chip;
  }

  function showVerdict(state) {
    const reveal = state.reveal || {};
    const last = state.lastPlay || {};
    const players = state.players || [];
    const playedId = reveal.playedById || last.playerId;
    const playedBy = players.find(p => p.id === playedId);
    const caller = players.find(p => p.id === reveal.callerId);
    const loser = players.find(p => p.id === reveal.loserId);
    const table = reveal.table || state.table || {};
    const cards = Array.isArray(reveal.cards) ? reveal.cards :
      (Array.isArray(last.cards) ? last.cards : []);
    if (!cards.length) return;

    const falseCards = Array.isArray(reveal.falseCards) ? reveal.falseCards :
      cards.filter(card => card.id !== table.id && card.id !== 'b');
    const isLie = typeof reveal.isLie === 'boolean' ? reveal.isLie : falseCards.length > 0;
    const title = verdict.querySelector('.agro-verdict-title');
    const copy = verdict.querySelector('.agro-verdict-copy');
    const reason = verdict.querySelector('.agro-reason');
    const cardRoot = verdict.querySelector('.agro-reveal-cards');
    const footer = verdict.querySelector('.agro-reveal-footer');

    verdict.classList.toggle('bad', isLie);
    verdict.classList.toggle('good', !isLie);
    title.textContent = isLie ? 'БЛЕФ РАСКРЫТ!' : 'ОБВИНЕНИЕ ОШИБОЧНО';
    copy.textContent = isLie
      ? (playedBy?.name || reveal.playedByName || 'Игрок') + ' положил карты, которые не совпадают со столом.'
      : (playedBy?.name || reveal.playedByName || 'Игрок') + ' сыграл честно: все карты подходят к столу или являются быками.';
    cardRoot.replaceChildren();

    cards.forEach(card => {
      const isWild = card.id === 'b';
      const matches = card.id === table.id || isWild;
      const bad = !matches;
      const item = document.createElement('div');
      item.className = 'agro-reveal-card' + (bad ? ' bad' : '');
      const symbol = document.createElement('div');
      symbol.className = 'sym';
      symbol.textContent = card.icon || (isWild ? '🐂' : '🃏');
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = card.name || 'Карта';
      const mark = document.createElement('div');
      mark.className = 'mark';
      mark.textContent = bad ? '✕ НЕ СОВПАДАЕТ' : (isWild ? '✓ ДЖОКЕР' : '✓ ПОДХОДИТ');
      item.append(symbol,name,mark);
      cardRoot.append(item);
    });

    const falseNames = falseCards.map(c => c.name || 'чужая культура').filter(Boolean);
    reason.textContent = isLie
      ? 'На столе: ' + (table.icon || '') + ' ' + (table.name || 'неизвестная культура') +
        '. Не подошли: ' + (falseNames.join(', ') || 'карты другой культуры') +
        '. Бык — джокер и всегда подходит.'
      : 'На столе: ' + (table.icon || '') + ' ' + (table.name || 'неизвестная культура') +
        '. Все карты совпали с заявленной культурой или были быками.';
    footer.replaceChildren();
    footer.append(makeChip('Положил: ' + (playedBy?.name || reveal.playedByName || 'Игрок')));
    footer.append(makeChip('Проверил: ' + (caller?.name || reveal.callerName || 'Игрок')));
    footer.append(makeChip('Стол: ' + (table.name || '—')));
    const rides = loser ? loser.rides + '/' + loser.fallAt + ' выездов' : '';
    footer.append(makeChip('🐂 На быка: ' + (loser?.name || reveal.loserName || 'Игрок') + (rides ? ' · ' + rides : ''), isLie ? 'danger' : 'success'));

    clearTimeout(verdictTimer);
    verdict.classList.add('show');
    verdictTimer = setTimeout(() => verdict.classList.remove('show'), 4850);
  }

  socket.on('gameState', state => {
    if (!state || !state.gameId) return;

    if (state.phase === 'playing' && state.gameId !== currentGameId) {
      currentGameId = state.gameId;
      if (Number(state.round) === 1 && !state.lastPlay) showDeckIntro();
    }

    const reveal = state.reveal;
    if (state.phase === 'rodeo' && reveal) {
      const key = [
        state.gameId, state.round, state.pileCount,
        reveal.callerId || '', reveal.loserId || ''
      ].join('|');
      if (key && key !== lastRevealKey) {
        lastRevealKey = key;
        showVerdict(state);
      }
    } else if (state.phase === 'playing' && !state.lastPlay) {
      verdict.classList.remove('show');
    }
  });
})();