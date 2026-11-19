/* AGROBULL FIX — safe client-side refinements */
(() => {
  'use strict';
  if (typeof THREE === 'undefined' || typeof renderer === 'undefined' || !renderer || typeof socket === 'undefined') return;

  const style = document.createElement('style');
  style.textContent = '#peekHold{position:fixed;left:50%;bottom:-300px;transform:translateX(-50%);z-index:80;display:flex;pointer-events:none;transition:bottom .5s cubic-bezier(.2,1.3,.4,1)}#peekHold.on{bottom:8px}#peekHold .pc{width:clamp(70px,9vw,104px);height:clamp(102px,13vw,150px);margin:0 -10px;border-radius:12px;border:2px solid #ead9b9;background:linear-gradient(145deg,#fff9e9,#d8c4a0);color:#38291e;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;box-shadow:0 18px 34px #000b,0 0 22px #3dd6c455;transform-origin:50% 130%}#peekHold .pc b{font-size:clamp(28px,4vw,46px)}#peekHold .pc small{font:800 9px Inter,sans-serif;letter-spacing:.5px;text-transform:uppercase}#peekTag{position:fixed;left:50%;bottom:178px;transform:translateX(-50%);z-index:81;padding:6px 14px;border-radius:999px;background:rgba(8,27,29,.92);border:1px solid #5fbea9;color:#bff7ea;font:700 11px Inter,sans-serif;opacity:0;transition:.3s;pointer-events:none}#peekTag.on{opacity:1}#quickBtn{width:100%;margin-top:10px;background:linear-gradient(180deg,#2fb7a4,#17665c);border-color:#7ff0dd}@media(max-width:900px){#statusLine{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}';
  document.head.appendChild(style);

  const hold = document.createElement('div');
  hold.id = 'peekHold';
  const tag = document.createElement('div');
  tag.id = 'peekTag';
  document.body.append(hold, tag);
  let hidePeekTimer;

  // Private cards are delivered only to the player who used Jesse's skill.
  showPhysicalPeek = function(data) {
    const cards = (data && Array.isArray(data.cards) ? data.cards : []).slice(0, 5);
    const mid = (cards.length - 1) / 2;
    hold.replaceChildren();
    cards.forEach((card, i) => {
      const el = document.createElement('div');
      el.className = 'pc';
      el.style.transform = 'rotate(' + ((i-mid)*11) + 'deg) translateY(' + (Math.abs(i-mid)*10) + 'px)';
      const icon = document.createElement('b');
      icon.textContent = card.icon || '?';
      const name = document.createElement('small');
      name.textContent = card.name || '';
      el.append(icon, name);
      hold.append(el);
    });
    tag.textContent = 'Карты: ' + ((data && data.name) || 'соперника');
    hold.classList.add('on');
    tag.classList.add('on');
    clearTimeout(hidePeekTimer);
    hidePeekTimer = setTimeout(() => {
      hold.classList.remove('on');
      tag.classList.remove('on');
    }, 6500);
  };

  // Jesse can peek during any playing turn; server-side authorization is adjusted too.
  const originalRenderGameState = renderGameState;
  renderGameState = function(state) {
    originalRenderGameState(state);
    try {
      const players = state.players || [];
      const me = players.find(p => p.id === selfId);
      const root = $('#skillControls');
      if (me && me.ability && me.ability.id === 'peek' && !me.abilityUsed && me.alive &&
          state.phase === 'playing' && state.currentId !== selfId && !root.querySelector('select')) {
        const targets = players.filter(p => p.alive && p.id !== selfId && p.handCount > 0);
        if (targets.length) {
          addSkillTarget(root, '👁 ПОДГЛЯДЕТЬ', targets,
            targetId => socket.emit('useAbility', { type: 'peek', targetId }));
          root.style.display = 'flex';
        }
      }
      const status = $('#statusLine');
      if (status && /обмен|поменял/i.test(status.textContent)) {
        const current = players.find(p => p.id === state.currentId);
        status.textContent = current ? 'Ход: ' + current.name : '';
      }
    } catch (_) {}
  };

  const syncEmoteVisibility = () => {
    const bar = document.querySelector('#emoBar');
    if (!bar) return;
    const state = typeof activeState !== 'undefined' ? activeState : null;
    bar.style.display = state && (state.phase === 'playing' || state.phase === 'rodeo') ? 'flex' : 'none';
  };
  syncEmoteVisibility();
  setInterval(syncEmoteVisibility, 400);

  const createButton = $('#createBtn');
  if (createButton && !$('#quickBtn')) {
    const quickButton = document.createElement('button');
    quickButton.className = 'primary';
    quickButton.id = 'quickBtn';
    quickButton.textContent = '⚡ Быстрая игра — случайные соперники';
    createButton.parentNode.after(quickButton);
    quickButton.addEventListener('click', () => {
      if (!socket.connected) return notify('Нет соединения с сервером');
      socket.emit('quickPlay', emitProfile());
      notify('Ищем соперника…');
    });
  }
  socket.on('quickSearching', () => notify('Ищем второго игрока…'));

  // Rodeo camera follows the rider without accumulating camera offsets.
  const previousRender = renderer.render.bind(renderer);
  const axisUp = new THREE.Vector3(0, 1, 0);
  const temp = new THREE.Vector3();
  let baseFov = null;
  const colorLights = [
    [0xff3d81, [-6, 3, -3]], [0x19c3d6, [6, 3, -3]],
    [0xffb02e, [0, 6, 4]], [0x7a5cff, [0, 2.5, -9]]
  ];
  const lights = typeof scene !== 'undefined' ? colorLights.map(([color, pos]) => {
    const light = new THREE.PointLight(color, 22, 13, 2);
    light.position.set(pos[0], pos[1], pos[2]);
    scene.add(light);
    return light;
  }) : [];
  renderer.toneMappingExposure = 1.1;

  renderer.render = function(sceneArg, cameraArg) {
    try {
      const now = performance.now();
      lights.forEach((light, i) => light.intensity = 22 + 8 * Math.sin(now / 900 + i * 1.7));
      const riding = cameraArg === camera && rodeomotion && rodeomotion.playerId === selfId && bullRig;
      if (riding) {
        if (baseFov === null) baseFov = cameraArg.fov;
        const t = (now - rodeomotion.start) / 1000;
        const wave = t * 7.5;
        const level = (typeof activeState !== 'undefined' && activeState && activeState.rodeo && activeState.rodeo.level) || 1;
        const strength = .5 + level * .18;
        bullRig.body.updateMatrixWorld(true);
        const record = actorModels.get(selfId);
        if (rodeomotion.out && t > 1.65 && record) {
          cameraArg.position.set(record.group.position.x, record.group.position.y + 1.4, record.group.position.z);
          temp.set(0, 2, -6.6);
          cameraArg.lookAt(temp);
          cameraArg.rotateZ((t - 1.65) * 2.2);
        } else {
          cameraArg.position.copy(bullRig.body.localToWorld(temp.set(-.05, 3.05, 0)));
          cameraArg.position.x += Math.sin(wave * 3.1) * .03 * strength;
          cameraArg.position.y += Math.abs(Math.sin(wave * 2)) * .07 * strength;
          const forward = bullRig.body.localToWorld(new THREE.Vector3(3, 2.55, 0));
          forward.sub(cameraArg.position).normalize().applyAxisAngle(axisUp, orbitYaw);
          forward.y += orbitPitch;
          cameraArg.lookAt(cameraArg.position.clone().add(forward.multiplyScalar(9)));
          cameraArg.rotateZ(Math.sin(wave) * .05 * strength + bullRig.body.rotation.z * .8);
        }
        const fov = baseFov + Math.abs(Math.sin(wave * .7)) * 5 * strength;
        if (Math.abs(cameraArg.fov - fov) > .1) {
          cameraArg.fov = fov;
          cameraArg.updateProjectionMatrix();
        }
      } else if (baseFov !== null && cameraArg === camera) {
        cameraArg.fov = baseFov;
        baseFov = null;
        cameraArg.updateProjectionMatrix();
      }
    } catch (_) {}
    return previousRender(sceneArg, cameraArg);
  };
})();