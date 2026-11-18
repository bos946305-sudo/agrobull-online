/* AGROBULL UI+Live — premium HUD, animated actors and 3D emoji throws.
   Loaded after the main inline game script so its shared game variables already exist. */
(() => {
  'use strict';
  if (typeof THREE === 'undefined' || typeof actorModels === 'undefined') return;

  const css = ":root{--ag-gold:#e8bd6c;--ag-gold2:#ffe6ac}.modal{background:linear-gradient(#1b1511,#0c0907) padding-box,linear-gradient(135deg,#ffe2a0,#8a5a22 35%,#f4cf86 65%,#5a3a18) border-box;border:1.5px solid transparent;box-shadow:0 30px 110px #000,inset 0 1px #ffffff22}.modal h1,.brand{background:linear-gradient(180deg,#fff3cf,#e1ac55 55%,#8d5a21);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none;filter:drop-shadow(0 3px 14px #b9732f77)}.primary,.action{position:relative;overflow:hidden;color:#2b1807;font-weight:800;border:1px solid #ffe6ac;background:linear-gradient(180deg,#f7d78c,#c28a3c 55%,#86571f);box-shadow:0 4px 0 #4a2f12,0 12px 26px #0008,inset 0 1px #fff9;text-shadow:0 1px #fff6}.primary:after,.action:not(.subtle):after{content:'';position:absolute;top:0;left:-70%;width:40%;height:100%;background:linear-gradient(100deg,transparent,#fff8,transparent);transform:skewX(-20deg);animation:agsh 3.6s infinite}@keyframes agsh{55%,100%{left:140%}}.action.danger{color:#fff;border-color:#ffb3a3;background:linear-gradient(180deg,#ff7d66,#c63b2c 55%,#7b1d16);text-shadow:0 1px #0008}.action.subtle,.secondary{color:#f3dfb8;background:linear-gradient(180deg,#2a211a,#15100c);border-color:#7a5a2e;text-shadow:none}.pill,.iconbtn{background:linear-gradient(180deg,#241b14e6,#0f0b08e6);border-color:#a9803f88;box-shadow:0 8px 24px #0007,inset 0 1px #ffffff18}.playerTag{pointer-events:auto;cursor:pointer;width:208px;padding:10px 12px;border-radius:14px;background:linear-gradient(135deg,#1d1610ee,#0b0907cc);border:1px solid #c79a5a55;box-shadow:0 10px 28px #000a,inset 0 1px #fff1}.playerTag .face{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:50%;font-size:22px;background:radial-gradient(#3a2a1c,#120d09);border:2px solid #d9a95d;box-shadow:0 0 12px #d9a95d44}.playerTag.active{border-color:#ffe6ac;box-shadow:0 0 0 1px #ffe6ac88,0 0 30px #e8a84a55,0 10px 28px #000a;transform:translateX(6px)}.playerTag.active .rides{animation:agp 1s infinite alternate}@keyframes agp{to{opacity:.3}}.cropname{font-size:27px;background:linear-gradient(180deg,#fff3cf,#e1ac55);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 8px #000)}.glass{border-radius:18px;border:1px solid #c79a5a66;background:linear-gradient(135deg,#1a130eb8,#0a0806a0);box-shadow:0 14px 40px #000a,inset 0 1px #fff1}.playingcard{background:linear-gradient(150deg,#fffaf0,#f0e0c0 55%,#d2bb92);border:1.5px solid #f6e7c6;color:#2d2018;box-shadow:0 16px 30px #000b,inset 0 0 0 1px #fff9,inset 0 -10px 18px #8a5e2a22}.playingcard .sym{filter:drop-shadow(0 3px 3px #0004)}.playingcard.bull{background:linear-gradient(135deg,#fff0b8,#e8b24f 35%,#a86a22 60%,#f4d27c);border-color:#fff2c4;animation:agf 3s infinite alternate}@keyframes agf{to{filter:brightness(1.18) saturate(1.15)}}.playingcard.selected{border-color:#ffe08a;box-shadow:0 0 0 2px #ffe08a88,0 0 34px #f0b24a77,0 22px 34px #000b}#toast{border-radius:14px;background:linear-gradient(135deg,#1d150f,#0b0806);border:1px solid #e1ac55;box-shadow:0 14px 40px #000c,0 0 24px #e1ac5533}#emoBar{position:fixed;left:14px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:30;display:flex;gap:6px;align-items:center;pointer-events:auto}#emoBar button{width:46px;height:46px;border-radius:50%;font-size:22px;border:1.5px solid #a9803f;background:linear-gradient(180deg,#2a211a,#120d09);box-shadow:0 8px 20px #000a;transition:transform .15s;touch-action:manipulation}#emoBar button.on{border-color:#ffe08a;transform:scale(1.12);box-shadow:0 0 22px #f0b24a88}#emoRow{display:none;gap:6px;flex-wrap:wrap;max-width:min(330px,75vw)}#emoBar.open #emoRow{display:flex}#emoBar #emoT{font-size:20px}#emoBar #emoRow button{width:40px;height:40px;font-size:20px}#emoHint{position:absolute;left:0;bottom:54px;white-space:nowrap;padding:7px 10px;border:1px solid #b88a4b88;border-radius:9px;background:#100b08ed;color:#ffe6ac;font:700 10px Inter,sans-serif;box-shadow:0 8px 22px #0009;opacity:0;transform:translateY(5px);transition:.18s;pointer-events:none}#emoBar.hint #emoHint{opacity:1;transform:translateY(0)}@media(max-width:700px){#emoBar{left:8px;bottom:calc(8px + env(safe-area-inset-bottom));gap:4px}#emoBar button{width:42px;height:42px}#emoBar #emoRow button{width:36px;height:36px}#emoHint{font-size:9px;bottom:49px}}@media(prefers-reduced-motion:reduce){#emoBar button,.playerTag,#toast{transition:none}.primary:after,.action:after,.playerTag.active .rides{animation:none!important}}";
  document.head.insertAdjacentHTML('beforeend', '<style id="agro-ui-live-style">' + css + '</style>');

  const EMOTES = ['😂','🤡','💀','🍅','🥚','🔥','😡','👍'];
  const effects = [];
  const lerpPoint = new THREE.Vector3();
  let selectedEmote = '🍅';
  let lastSendAt = 0;
  let audioContext = null;
  let lastFrame = 0;

  function playThud(volume) {
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audioContext = audioContext || new AudioCtor();
      if (audioContext.state === 'suspended') audioContext.resume();
      const length = Math.floor(audioContext.sampleRate * 0.12);
      const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      gain.gain.value = Math.max(0, Math.min(0.5, volume || 0.25));
      source.buffer = buffer;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);
      source.start();
    } catch (_) {}
  }

  function actorWorldPoint(record, y) {
    const point = record.group.position.clone();
    point.y += y;
    return point;
  }

  function throwEmote(fromId, toId, emoji) {
    if (typeof scene === 'undefined' || !scene || typeof camera === 'undefined' || !camera) return;
    const target = actorModels.get(toId);
    if (!target || !target.group || !target.group.visible) return;
    const source = actorModels.get(fromId);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = '96px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 70);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
    sprite.scale.set(0.72, 0.72, 1);
    sprite.renderOrder = 20;
    scene.add(sprite);
    const start = source && source.group.visible
      ? actorWorldPoint(source, 2)
      : camera.localToWorld(new THREE.Vector3(0, -0.42, -0.72));
    const end = actorWorldPoint(target, 2.25);
    effects.push({ sprite, start, end, progress: 0, targetId: toId, impacted: false });
    if (effects.length > 28) {
      const old = effects.shift();
      scene.remove(old.sprite);
      old.sprite.material.map.dispose();
      old.sprite.material.dispose();
    }
    playThud(0.08);
  }

  const bar = document.createElement('div');
  bar.id = 'emoBar';
  const toggle = document.createElement('button');
  toggle.id = 'emoT';
  toggle.type = 'button';
  toggle.textContent = '🎭';
  toggle.title = 'Эмоции';
  toggle.setAttribute('aria-label', 'Открыть эмоции');
  const row = document.createElement('div');
  row.id = 'emoRow';
  EMOTES.forEach(emoji => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = emoji;
    button.dataset.emoji = emoji;
    button.title = 'Выбрать ' + emoji;
    if (emoji === selectedEmote) button.classList.add('on');
    row.append(button);
  });
  const hint = document.createElement('div');
  hint.id = 'emoHint';
  hint.setAttribute('role', 'status');
  hint.textContent = 'Выбери эмоцию и тапни по сопернику';
  bar.append(toggle, row, hint);
  document.body.append(bar);

  function showEmoteHint(message) {
    hint.textContent = message;
    bar.classList.add('hint');
    clearTimeout(showEmoteHint.timer);
    showEmoteHint.timer = setTimeout(() => bar.classList.remove('hint'), 2200);
  }

  function sendEmote(targetId) {
    if (!gameState || !selfId || !targetId || targetId === selfId) return;
    const now = performance.now();
    if (now - lastSendAt < 700) return;
    if (!actorModels.has(targetId)) {
      showEmoteHint('Соперник пока не в сцене');
      return;
    }
    lastSendAt = now;
    throwEmote(selfId, targetId, selectedEmote);
    if (typeof socket !== 'undefined' && socket && socket.connected) {
      socket.emit('emote', { to: targetId, e: selectedEmote });
    }
    bar.classList.remove('open');
  }

  bar.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'emoT') {
      bar.classList.toggle('open');
      if (bar.classList.contains('open')) showEmoteHint('Выбери эмоцию, затем тапни по сопернику');
      return;
    }
    const emoji = button.dataset.emoji;
    if (!EMOTES.includes(emoji)) return;
    selectedEmote = emoji;
    row.querySelectorAll('button').forEach(item => item.classList.toggle('on', item === button));
    showEmoteHint('Теперь тапни по сопернику');
  });

  const leftPanel = document.querySelector('#leftpanel');
  if (leftPanel) {
    leftPanel.addEventListener('click', event => {
      const tag = event.target.closest('.playerTag');
      if (!tag || !gameState) return;
      const tags = Array.from(leftPanel.querySelectorAll('.playerTag'));
      const player = gameState.players && gameState.players[tags.indexOf(tag)];
      if (player) sendEmote(player.id);
    });
  }

  const canvas = document.querySelector('#scene');
  let pointerDown = null;
  if (canvas) {
    canvas.addEventListener('pointerdown', event => {
      pointerDown = { x: event.clientX, y: event.clientY, id: event.pointerId };
    }, { passive: true });
    canvas.addEventListener('pointerup', event => {
      const start = pointerDown;
      pointerDown = null;
      if (!start || start.id !== event.pointerId ||
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7 ||
          !gameState || typeof camera === 'undefined' || !camera) return;
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2(event.clientX / window.innerWidth * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
      raycaster.setFromCamera(mouse, camera);
      const groups = Array.from(actorModels.values())
        .filter(record => record && record.group && record.group.visible)
        .map(record => record.group);
      const hit = raycaster.intersectObjects(groups, true)[0];
      if (!hit) return;
      for (const [id, record] of actorModels) {
        let object = hit.object;
        while (object) {
          if (object === record.group) {
            sendEmote(id);
            return;
          }
          object = object.parent;
        }
      }
    }, { passive: true });
    canvas.addEventListener('pointercancel', () => { pointerDown = null; }, { passive: true });
  }

  function bindSocketEmotes() {
    if (typeof socket === 'undefined' || !socket || socket.__agroEmotesBound) return;
    socket.__agroEmotesBound = true;
    socket.on('emote', data => {
      if (!data || !EMOTES.includes(data.e) || !data.from || !data.to) return;
      throwEmote(data.from, data.to, data.e);
    });
  }
  bindSocketEmotes();

  function animateLive(now) {
    requestAnimationFrame(animateLive);
    const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    if (typeof worldReady === 'undefined' || !worldReady) return;

    let index = 0;
    for (const [id, record] of actorModels) {
      index++;
      const group = record.group;
      const head = group && group.userData.head;
      if (!group || !group.visible || group.userData.glb) continue;
      if (Math.abs(group.scale.x - 1) < 0.01) group.scale.y = 1 + Math.sin(now / 950 + index * 2) * 0.007;
      if (!head || (typeof rodeomotion !== 'undefined' && rodeomotion && rodeomotion.playerId === id)) continue;

      if (!record.gn || now > record.gn) {
        const ids = Array.from(actorModels.keys()).filter(key => key !== id);
        record.gt = ids.length ? ids[Math.floor(Math.random() * ids.length)] : null;
        record.look = Math.random() < 0.28;
        record.gn = now + 2100 + Math.random() * 3500;
      }
      const currentId = typeof gameState !== 'undefined' && gameState && gameState.currentId;
      const target = actorModels.get(record.look || !currentId ? record.gt : currentId);
      if (target && target !== record) {
        const dx = target.group.position.x - group.position.x;
        const dz = target.group.position.z - group.position.z;
        let angle = Math.atan2(dx, dz) - group.rotation.y;
        angle = Math.atan2(Math.sin(angle), Math.cos(angle));
        angle = Math.max(-0.8, Math.min(0.8, angle));
        head.rotation.y += (angle - head.rotation.y) * Math.min(1, dt * 3);
      }
      if (record.fl) {
        const impact = (performance.now() - record.fl) / 650;
        if (impact < 1) head.rotation.z = Math.sin(impact * 28) * 0.3 * (1 - impact);
        else { record.fl = 0; head.rotation.z = 0; }
      }
    }

    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      if (effect.progress < 1) {
        effect.progress = Math.min(1, effect.progress + dt / 0.7);
        lerpPoint.lerpVectors(effect.start, effect.end, effect.progress);
        effect.sprite.position.copy(lerpPoint);
        effect.sprite.position.y += Math.sin(Math.PI * effect.progress) * 1.05;
        effect.sprite.material.rotation += dt * 10;
      } else {
        if (!effect.impacted) {
          effect.impacted = true;
          const target = actorModels.get(effect.targetId);
          if (target) target.fl = performance.now();
          playThud(0.35);
        }
        effect.sprite.material.opacity -= dt * 4;
        effect.sprite.scale.multiplyScalar(1 + dt * 4);
        if (effect.sprite.material.opacity <= 0) {
          scene.remove(effect.sprite);
          effect.sprite.material.map.dispose();
          effect.sprite.material.dispose();
          effects.splice(i, 1);
        }
      }
    }
  }
  requestAnimationFrame(animateLive);
})();
