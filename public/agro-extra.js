/* AGROBULL EXTRA — settings, saloon atmosphere, stats and table gestures */
(() => {
  'use strict';
  // Use the renderer exported by the main 3D script; bare renderer is lexical, not global.
  const renderer = window.__agroRenderer;
  if (typeof THREE === 'undefined' || !renderer ||
      typeof socket === 'undefined' || !socket || typeof scene === 'undefined' || !scene ||
      typeof camera === 'undefined' || !camera) {
    console.warn('AGROBULL EXTRA: 3D core is not ready; optional extras skipped.');
    return;
  }

  const T = THREE;
  const $ = selector => document.querySelector(selector);
  const SETTINGS_KEY = 'agro_settings_v1';
  const STATS_KEY = 'agro_stats_v1';
  const cores=Number(navigator.hardwareConcurrency)||8,memory=Number(navigator.deviceMemory)||8;
  const mobileProfile=!!(window.matchMedia&&window.matchMedia('(pointer: coarse)').matches)||(cores<=4&&memory<=4)||Math.min(window.innerWidth||0,window.innerHeight||0)<720;

  let S = {
    q: mobileProfile ? 'medium' : 'high', fps: mobileProfile ? 30 : 0, fov: 72, sens: 100, ui: 100,
    tod: 'auto', rain: false, battery: false,
    hl: false, hn: false, hv: false, ht: false, hb: false
  };
  let ST = { g: 0, w: 0, l: 0, st: 0, best: 0, cr: 0, ct: 0, bc: 0, lastGameId: '', lastRevealKey: '' };

  try {
    S = Object.assign(S, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
    ST = Object.assign(ST, JSON.parse(localStorage.getItem(STATS_KEY) || '{}'));
  } catch (_) {}
  S.rain=false;
  if (mobileProfile) { S.q='medium'; S.fps=30; }

  if (!['low','medium','high','ultra'].includes(S.q)) S.q = mobileProfile ? 'medium' : 'high';
  if (!['auto','eve','night','dawn'].includes(S.tod)) S.tod = 'auto';
  S.fps = [0,30,60].includes(Number(S.fps)) ? Number(S.fps) : 0;
  S.fov = Math.max(58, Math.min(90, Number(S.fov) || 72));
  S.sens = Math.max(50, Math.min(200, Number(S.sens) || 100));
  S.ui = Math.max(70, Math.min(130, Number(S.ui) || 100));
  ['rain','battery','hl','hn','hv','ht','hb'].forEach(k => S[k] = !!S[k]);
  ['g','w','l','st','best','cr','ct','bc'].forEach(k => ST[k] = Math.max(0, Number(ST[k]) || 0));

  const save = () => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(S));
      localStorage.setItem(STATS_KEY, JSON.stringify(ST));
    } catch (_) {}
  };

  const style = document.createElement('style');
  style.textContent =
    '.overlay{background:radial-gradient(circle at 18% 18%,rgba(255,61,129,.26),transparent 46%),radial-gradient(circle at 84% 26%,rgba(25,195,214,.26),transparent 46%),radial-gradient(circle at 50% 96%,rgba(255,176,46,.24),transparent 52%),rgba(5,3,6,.76)!important}' +
    '#grade{display:none!important}' +
    
    '#bottom,#leftpanel,#centerinfo,#topbar{zoom:var(--ui,1)}' +
    '.hl #leftpanel{display:none!important}.hn #lastCards{display:none!important}.hv #vignette,.hv #filmgrain,.hv #grade{display:none!important}.ht #topbar{display:none!important}.hb #bottom{display:none!important}' +
    '#setO{z-index:60}#setO .row2{display:flex;align-items:center;gap:10px;margin:9px 0;font-size:12px;flex-wrap:wrap}#setO .row2>label:first-child{min-width:128px;color:#cdbb9e}' +
    '#setO select,#setO input[type=range]{flex:1;min-width:0;padding:7px;border-radius:8px;border:1px solid var(--line);background:#17110d;color:var(--cream)}' +
    '#setO input[type=checkbox]{accent-color:#39bda9}#setO .checkrow{display:flex;gap:14px;flex-wrap:wrap;color:#e5d5bf;font-size:11px}#setO .checkrow label{display:flex;align-items:center;gap:5px}' +
    '#emoBar .g{font-size:20px}#emoBar .g:active{transform:scale(.9)}' +
    '#agroLightning{position:fixed;inset:0;z-index:9;pointer-events:none;background:#dcecff;opacity:0}' +
    '#scene.agroTableJolt{animation:agroTableJolt .32s ease-out}@keyframes agroTableJolt{0%{transform:translate(0,0)}18%{transform:translate(-3px,2px)}38%{transform:translate(3px,-2px)}60%{transform:translate(-2px,-1px)}100%{transform:translate(0,0)}}';
  document.head.appendChild(style);

  const grade = document.createElement('div');
  grade.id = 'grade';
  document.body.appendChild(grade);
  const lightningOverlay = document.createElement('div');
  lightningOverlay.id = 'agroLightning';
  document.body.appendChild(lightningOverlay);

  /* Settings window */
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'setO';
  overlay.style.display = 'none';
  overlay.innerHTML =
    '<div class="modal"><div class="eyebrow">Параметры игры</div><h1 style="font-size:34px">НАСТРОЙКИ</h1>' +
    '<div class="row2"><label for="sQ">Качество графики</label><select id="sQ"><option value="low">Низкое</option><option value="medium">Среднее</option><option value="high">Высокое</option><option value="ultra">Ультра</option></select></div>' +
    '<div class="row2"><label for="sF">Лимит FPS</label><select id="sF"><option value="0">Без лимита</option><option value="30">30 FPS</option><option value="60">60 FPS</option></select></div>' +
    '<div class="row2"><label for="sV">Угол обзора</label><input id="sV" type="range" min="58" max="90"></div>' +
    '<div class="row2"><label for="sS">Чувствительность камеры</label><input id="sS" type="range" min="50" max="200"></div>' +
    '<div class="row2"><label for="sU">Размер интерфейса</label><input id="sU" type="range" min="70" max="130"></div>' +
    '<div class="row2"><label for="sT">Время суток</label><select id="sT"><option value="auto">Авто — сменяется</option><option value="eve">Вечер</option><option value="night">Ночь</option><option value="dawn">Рассвет</option></select></div>' +
    '<div class="row2 checkrow"><label><input type="checkbox" id="sR"> Дождь и гроза</label><label><input type="checkbox" id="sB"> Экономия батареи</label></div>' +
    '<div class="row2 checkrow"><label><input type="checkbox" id="sHL"> Скрыть игроков</label><label><input type="checkbox" id="sHN"> Скрыть уведомления</label></div>' +
    '<div class="row2 checkrow"><label><input type="checkbox" id="sHV"> Без эффектов экрана</label><label><input type="checkbox" id="sHT"> Скрыть верхнюю панель</label><label><input type="checkbox" id="sHB"> Скрыть нижнюю панель</label></div>' +
    '<div class="sectiontitle">Статистика</div><div id="stT" class="intro" style="margin:6px 0;max-width:none;text-align:left;white-space:pre-line"></div>' +
    '<button class="primary" id="sX" style="width:100%">Готово</button></div>';
  document.body.appendChild(overlay);
  const control = id => overlay.querySelector('#' + id);
  const statNumber = key => Math.max(0, Math.floor(Number(ST[key]) || 0));

  function fillSettings() {
    control('sQ').value = S.q;
    control('sF').value = String(S.fps);
    control('sV').value = String(S.fov);
    control('sS').value = String(S.sens);
    control('sU').value = String(S.ui);
    control('sT').value = S.tod;
    control('sR').checked = S.rain;
    control('sB').checked = S.battery;
    control('sHL').checked = S.hl;
    control('sHN').checked = S.hn;
    control('sHV').checked = S.hv;
    control('sHT').checked = S.ht;
    control('sHB').checked = S.hb;
    const games = statNumber('g'), wins = statNumber('w');
    const winRate = games ? Math.round(wins / games * 100) : 0;
    control('stT').textContent =
      'Матчей: ' + games + ' · побед: ' + wins + ' (' + winRate + '%) · поражений: ' + statNumber('l') +
      '\nСерия побед: ' + statNumber('st') + ' (рекорд ' + statNumber('best') + ')' +
      '\nВерных проверок блефа: ' + statNumber('cr') + '/' + statNumber('ct') +
      '\nТебя поймали на блефе: ' + statNumber('bc');
  }

  let rainLine = null;
  let rainDrops = [];
  let rainCount = 0;
  let rainPositions = null;

  function setRainCount(count) {
    if (rainLine) {
      scene.remove(rainLine);
      rainLine.geometry.dispose();
      rainLine.material.dispose();
      rainLine = null;
    }
    rainCount = count;
    rainDrops = [];
    const positions = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      rainDrops.push({
        x: (Math.random() - .5) * 18,
        y: .2 + Math.random() * 7.7,
        z: -13 + Math.random() * 19,
        speed: 5 + Math.random() * 6
      });
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    rainPositions = geometry.attributes.position;
    const material = new T.LineBasicMaterial({ color: 0xbadcf4, transparent: true, opacity: .43, depthWrite: false });
    rainLine = new T.LineSegments(geometry, material);
    rainLine.frustumCulled = false;
    rainLine.visible = S.rain;
    scene.add(rainLine);
    updateRainGeometry();
  }

  function updateRainGeometry() {
    if (!rainPositions) return;
    const a = rainPositions.array;
    for (let i = 0; i < rainCount; i++) {
      const d = rainDrops[i], j = i * 6;
      a[j] = d.x;
      a[j + 1] = d.y;
      a[j + 2] = d.z;
      a[j + 3] = d.x - .045;
      a[j + 4] = d.y - .22;
      a[j + 5] = d.z + .08;
    }
    rainPositions.needsUpdate = true;
  }

  const qualityProfiles = {
    low: { pixel: 1, shadows: false, dust: false, rain: 90 },
    medium: { pixel: 1.2, shadows: true, dust: false, rain: 170 },
    high: { pixel: 1.5, shadows: true, dust: true, rain: 280 },
    ultra: { pixel: 1.85, shadows: true, dust: true, rain: 420 }
  };
  let currentShadowSetting = renderer.shadowMap.enabled;

  function applySettings() {
    const profile = qualityProfiles[S.q] || qualityProfiles.high;
    const pixelCap = S.battery ? .82 : (mobileProfile ? 1.08 : profile.pixel);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelCap));
    const shadowsAllowed = !mobileProfile && !S.battery && profile.shadows;
    if (renderer.shadowMap.enabled !== shadowsAllowed) {
      renderer.shadowMap.enabled = shadowsAllowed;
      scene.traverse(obj => {
        if (obj.isMesh && obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach(m => { if (m) m.needsUpdate = true; });
        }
      });
    }
    currentShadowSetting = renderer.shadowMap.enabled;
    if (window.AgroPerf && typeof window.AgroPerf.setPreferences === 'function') {
      window.AgroPerf.setPreferences({ quality: S.q, battery: S.battery, fps: S.fps });
    }
    if (typeof dust !== 'undefined' && dust) dust.visible = !mobileProfile && !S.battery && profile.dust;
    camera.fov = S.fov;
    camera.updateProjectionMatrix();
    document.documentElement.style.setProperty('--ui', String(S.ui / 100));
    document.body.classList.toggle('hl', S.hl);
    document.body.classList.toggle('hn', S.hn);
    document.body.classList.toggle('hv', S.hv);
    document.body.classList.toggle('ht', S.ht);
    document.body.classList.toggle('hb', S.hb);
    if (rainLine) {
      rainLine.visible = S.rain;
      rainLine.material.opacity = S.q === 'low' || S.battery ? .28 : .43;
    }
    const wantedRain = !S.rain ? 0 : (S.battery ? 45 : (mobileProfile ? Math.min(60,profile.rain) : profile.rain));
    if (rainCount !== wantedRain) setRainCount(wantedRain);
    if (rainAudioGain && audioContext) {
      try { rainAudioGain.gain.setTargetAtTime(S.rain ? .022 : 0, audioContext.currentTime, .18); } catch (_) {}
    }
  }

  overlay.addEventListener('input', event => {
    S.q = control('sQ').value;
    S.fps = mobileProfile ? 30 : Number(control('sF').value);
    S.fov = Number(control('sV').value);
    S.sens = Number(control('sS').value);
    S.ui = Number(control('sU').value);
    S.tod = control('sT').value;
    S.rain = control('sR').checked;
    S.battery = control('sB').checked;
    S.hl = control('sHL').checked;
    S.hn = control('sHN').checked;
    S.hv = control('sHV').checked;
    S.ht = control('sHT').checked;
    S.hb = control('sHB').checked;
    if (event.target.id === 'sB' && S.battery) {
      S.q = 'low';
      S.fps = 30;
      fillSettings();
    } else if (event.target.id === 'sB' && !S.battery) {
      S.q = 'high';
      S.fps = 0;
      fillSettings();
    } else if (event.target.id === 'sQ' || event.target.id === 'sF') {
      S.battery = false;
      control('sB').checked = false;
    }
    save();
    applySettings();
    if (overlay.style.display !== 'none') fillSettings();
  });

  control('sX').addEventListener('click', () => { overlay.style.display = 'none'; });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.style.display = 'none'; });

  const topRight = $('.topright');
  if (topRight) {
    const settingsButton = document.createElement('button');
    settingsButton.className = 'iconbtn';
    settingsButton.type = 'button';
    settingsButton.textContent = '⚙';
    settingsButton.title = 'Настройки';
    settingsButton.setAttribute('aria-label', 'Настройки');
    settingsButton.addEventListener('click', () => {
      fillSettings();
      overlay.style.display = 'flex';
    });
    topRight.prepend(settingsButton);
  }

  /* Camera sensitivity multiplies the existing pointer orbit without replacing its handlers. */
  const canvas = $('#scene');
  let previousYaw = 0, previousPitch = 0;
  canvas.addEventListener('pointerdown', () => {
    previousYaw = orbitYaw;
    previousPitch = orbitPitch;
  }, true);
  canvas.addEventListener('pointermove', () => {
    const factor = S.sens / 100;
    const yawDelta = orbitYaw - previousYaw;
    const pitchDelta = orbitPitch - previousPitch;
    orbitYaw = previousYaw + yawDelta * factor;
    orbitPitch = Math.max(-.34, Math.min(.24, previousPitch + pitchDelta * factor));
    previousYaw = orbitYaw;
    previousPitch = orbitPitch;
  });

  /* Day/night lighting */
  const hemisphereLights = [];
  const directionalLights = [];
  scene.traverse(obj => {
    if (obj.isHemisphereLight) hemisphereLights.push({ light: obj, base: obj.intensity });
    if (obj.isDirectionalLight) directionalLights.push({ light: obj, base: obj.intensity });
  });
  const dayProfiles = {
    eve: { hemi: 0xbac9db, hemiI: 1.55, key: 0xffd5a0, keyI: 3.2, bg: 0x4b3528 },
    night: { hemi: 0x91a6d0, hemiI: 1.22, key: 0x9bbcff, keyI: 2.55, bg: 0x28364c },
    dawn: { hemi: 0xffb8cf, hemiI: 1.4, key: 0xffc19c, keyI: 2.9, bg: 0x4e3440 }
  };
  const colorTemp = new T.Color();
  let lightning = 0;
  let nextLightning = performance.now() + 12000 + Math.random() * 10000;
  const lightningLight = new T.PointLight(0xdceaff, 0, 40, 2);
  lightningLight.position.set(0, 7.2, 2);
  scene.add(lightningLight);

  /* Ceiling fan */
  const fan = new T.Group();
  fan.position.set(0, 7.45, -.4);
  const fanHub = new T.Mesh(
    new T.CylinderGeometry(.16, .16, .22, 16),
    new T.MeshStandardMaterial({ color: 0x292a2d, metalness: .72, roughness: .34 })
  );
  fan.add(fanHub);
  const bladeMaterial = new T.MeshStandardMaterial({ color: 0x49301d, roughness: .7, metalness: .12 });
  for (let i = 0; i < 4; i++) {
    const blade = new T.Mesh(new T.BoxGeometry(1.55, .045, .27), bladeMaterial);
    blade.position.set(Math.cos(i * Math.PI / 2) * .85, 0, Math.sin(i * Math.PI / 2) * .85);
    blade.rotation.y = -i * Math.PI / 2;
    fan.add(blade);
  }
  scene.add(fan);

  /* WebAudio ambience; audio starts only after a user gesture. */
  let audioContext = null;
  let rainAudioGain = null;
  let rainAudioSource = null;
  let rainNoiseBuffer = null;
  function getAudioContext() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    if (!audioContext) {
      audioContext = new AudioCtor();
      rainNoiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
      const data = rainNoiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  }

  function startRainAudio() {
    try {
      const ctx = getAudioContext();
      if (!ctx || rainAudioSource) return;
      rainAudioSource = ctx.createBufferSource();
      rainAudioSource.buffer = rainNoiseBuffer;
      rainAudioSource.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1500;
      rainAudioGain = ctx.createGain();
      rainAudioGain.gain.value = S.rain ? .022 : 0;
      rainAudioSource.connect(filter);
      filter.connect(rainAudioGain);
      rainAudioGain.connect(ctx.destination);
      rainAudioSource.start();
    } catch (_) {}
  }
  document.addEventListener('pointerdown', startRainAudio, { once: true });

  function playThunder() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(72, t);
      osc.frequency.exponentialRampToValueAtTime(34, t + 1.8);
      gain.gain.setValueAtTime(.001, t);
      gain.gain.linearRampToValueAtTime(.16, t + .16);
      gain.gain.exponentialRampToValueAtTime(.001, t + 2.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 2.35);
    } catch (_) {}
  }

  function playTableSound(strong) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(strong ? 105 : 145, t);
      osc.frequency.exponentialRampToValueAtTime(strong ? 42 : 62, t + .14);
      gain.gain.setValueAtTime(strong ? .28 : .18, t);
      gain.gain.exponentialRampToValueAtTime(.001, t + .2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + .22);
    } catch (_) {}
  }

  /* Table tap / slam. Uses a dedicated room event rather than the targeted emote relay. */
  let tableImpactUntil = 0;
  let tableImpactStrength = 0;
  function tableGesture(action) {
    const strong = action === 'slam';
    tableImpactStrength = strong ? 1 : .55;
    tableImpactUntil = performance.now() + (strong ? 430 : 280);
    playTableSound(strong);
    const sceneCanvas = $('#scene');
    sceneCanvas.classList.remove('agroTableJolt');
    void sceneCanvas.offsetWidth;
    sceneCanvas.classList.add('agroTableJolt');
    clearTimeout(tableGesture.timer);
    tableGesture.timer = setTimeout(() => sceneCanvas.classList.remove('agroTableJolt'), strong ? 430 : 280);
  }

  const emoteBar = $('#emoBar');
  if (emoteBar) {
    [['✊','Стук по столу','tap'],['🖐','Удар по столу','slam']].forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'g';
      button.textContent = item[0];
      button.title = item[1];
      button.setAttribute('aria-label', item[1]);
      button.addEventListener('click', () => {
        tableGesture(item[2]);
        if (socket.connected) socket.emit('tableGesture', { action: item[2] });
      });
      emoteBar.appendChild(button);
    });
  }

  socket.on('tableGesture', data => {
    if (!data || !['tap','slam'].includes(data.action) || data.from === selfId) return;
    tableGesture(data.action);
  });

  /* Match stats, derived from the authoritative gameState payload. */
  socket.on('gameState', state => {
    if (!state || !state.gameId) return;
    if (state.reveal && state.lastPlay) {
      const reveal = state.reveal;
      const revealKey = [
        state.gameId, state.round, state.pileCount, reveal.callerId || '',
        reveal.loserId || '', reveal.isLie ? 1 : 0
      ].join('|');
      if (ST.lastRevealKey !== revealKey) {
        ST.lastRevealKey = revealKey;
        if (reveal.callerId === selfId) {
          ST.ct++;
          if (reveal.isLie) ST.cr++;
        }
        if (reveal.isLie && reveal.loserId === selfId) ST.bc++;
        save();
      }
    }
    if (state.phase === 'finished' && ST.lastGameId !== state.gameId) {
      ST.lastGameId = state.gameId;
      ST.g++;
      if (state.winnerId === selfId) {
        ST.w++;
        ST.st++;
        ST.best = Math.max(ST.best, ST.st);
      } else {
        ST.l++;
        ST.st = 0;
      }
      save();
    }
    if (overlay.style.display !== 'none') fillSettings();
  });

  /* Renderer extension: graphics, storm, fan, table impact and optional FPS cap. */
  const previousRender = renderer.render.bind(renderer);
  let lastRenderedAt = 0;
  let previousFrameAt = performance.now();

  renderer.render = function(sceneArg, cameraArg) {
    const now = performance.now();
    if (S.fps > 0 && lastRenderedAt && now - lastRenderedAt < (1000 / S.fps) - 1) return;
    lastRenderedAt = now;
    const dt = Math.min(.08, Math.max(0, (now - previousFrameAt) / 1000));
    previousFrameAt = now;

    try {
      const todName = S.tod === 'auto'
        ? ['eve','night','dawn'][Math.floor(Date.now() / 90000) % 3]
        : S.tod;
      const profile = dayProfiles[todName] || dayProfiles.eve;
      hemisphereLights.forEach(entry => {
        entry.light.color.lerp(colorTemp.setHex(profile.hemi), .02);
        entry.light.intensity += (profile.hemiI - entry.light.intensity) * .02;
      });
      directionalLights.forEach(entry => {
        entry.light.color.lerp(colorTemp.setHex(profile.key), .02);
        entry.light.intensity += (profile.keyI - entry.light.intensity) * .02;
      });
      if (scene.background && scene.background.isColor) scene.background.lerp(colorTemp.setHex(profile.bg), .02);
      if (scene.fog && scene.fog.color) scene.fog.color.lerp(colorTemp.setHex(profile.bg), .02);

      fan.rotation.y += dt * 2.15;

      if (rainLine && S.rain) {
        for (let i = 0; i < rainCount; i++) {
          const drop = rainDrops[i];
          drop.y -= drop.speed * dt;
          drop.z += .45 * dt;
          if (drop.y < .1) {
            drop.x = (Math.random() - .5) * 18;
            drop.y = 7.8 + Math.random() * 1.2;
            drop.z = -13 + Math.random() * 19;
            drop.speed = 5 + Math.random() * 6;
          }
        }
        updateRainGeometry();
      }

      if (S.rain && now > nextLightning) {
        nextLightning = now + 12000 + Math.random() * 19000;
        lightning = 1;
        setTimeout(playThunder, 450 + Math.random() * 850);
      }
      lightning = Math.max(0, lightning - dt * 3.1);
      lightningLight.intensity = lightning * 135;
      lightningOverlay.style.opacity = String(lightning * .36);

      if (cardStack) {
        const remain = Math.max(0, tableImpactUntil - now);
        cardStack.rotation.z = remain > 0 ? Math.sin(now / 13) * .028 * tableImpactStrength * (remain / 430) : 0;
      }
    } catch (_) {}

    return previousRender(sceneArg, cameraArg);
  };

  fillSettings();
  applySettings();
  setRainCount(!S.rain ? 0 : (S.battery ? 45 : (mobileProfile ? Math.min(60,(qualityProfiles[S.q] || qualityProfiles.medium).rain) : (qualityProfiles[S.q] || qualityProfiles.high).rain)));
  applySettings();
})();