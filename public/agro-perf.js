/* AGROBULL PERF — adaptive GPU load controller.
 * Works with the existing quality/battery/FPS settings from agro-extra.js.
 * Loaded last so it wraps the final renderer chain instead of replacing it.
 */
(() => {
  'use strict';

  const renderer = window.__agroRenderer;
  if (!renderer || typeof renderer.render !== 'function' ||
      typeof renderer.setPixelRatio !== 'function' || typeof THREE === 'undefined') return;

  const PIXEL_CAP = { low: .82, medium: 1.08, high: 1.38, ultra: 1.6 };
  const STORAGE_KEY = 'agro_settings_v1';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const readSettings = () => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch (_) {
      return {};
    }
  };

  const saved = readSettings();
  if (document.head) {
    const perfStyle = document.createElement('style');
    perfStyle.textContent =
      'html.agro-perf-lite #grade,html.agro-perf-lite #filmgrain,html.agro-perf-lite #vignette{display:none!important}' +
      'html.agro-perf-lite .overlay{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' +
      'html.agro-perf-lite .glow{filter:none!important;box-shadow:none!important}';
    document.head.appendChild(perfStyle);
  }
  const cores = Number(navigator.hardwareConcurrency) || 8;
  const memory = Number(navigator.deviceMemory) || 8;
  const coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const smallScreen = Math.min(window.innerWidth || 0, window.innerHeight || 0) < 720;
  const weakDevice = (cores <= 4 && memory <= 4) || smallScreen || coarsePointer;
  window.__agroLowPowerDevice = !!window.__agroLowPowerDevice || weakDevice;
  document.documentElement.classList.toggle('agro-mobile-lite',weakDevice);
  const baseDpr = Math.min(2, Number(window.devicePixelRatio) || 1);

  let preferences = {
    quality: Object.prototype.hasOwnProperty.call(PIXEL_CAP, saved.q) ? saved.q : (weakDevice ? 'medium' : 'high'),
    battery: !!saved.battery,
    fps: Object.prototype.hasOwnProperty.call(saved,'fps') && [0,30,60].includes(Number(saved.fps)) ? Number(saved.fps) : (weakDevice ? 30 : 0)
  };
  let pixelCap = preferences.battery ? 1 : PIXEL_CAP[preferences.quality];
  let scale = weakDevice ? 0.98 : 1;
  let tier = 0;
  let lastPixelRatio = 0;
  let lastFrameAt = 0;
  let frameAverage = 16.67;
  let cpuAverage = 0;
  let samples = 0;
  let lastEvaluation = 0;
  let lastQualityChange = 0;
  let shadowCounter = 0;
  let hudFrames = 0;
  let hudAt = performance.now();
  let lastHudAt = hudAt;
  let collected = false;
  const additiveObjects = [];

  const nativeSetPixelRatio = renderer.setPixelRatio.bind(renderer);
  const previousRender = renderer.render.bind(renderer);

  function targetFrameMs() {
    return preferences.fps > 0 ? 1000 / preferences.fps : 1000 / 60;
  }

  function effectivePixelRatio() {
    const deviceCap = weakDevice ? 1.1 : baseDpr;
    const requested = Math.min(baseDpr, pixelCap, deviceCap);
    return Math.round(clamp(requested * scale, 0.72, deviceCap) * 20) / 20;
  }

  function applyPixelRatio(force = false) {
    const next = effectivePixelRatio();
    if (!force && Math.abs(next - lastPixelRatio) < 0.049) return;
    lastPixelRatio = next;
    nativeSetPixelRatio(next);
  }

  // Any later resize/settings call is clamped by the adaptive quality controller.
  renderer.setPixelRatio = function setAdaptivePixelRatio() {
    applyPixelRatio(true);
    return renderer;
  };

  function collectSceneEffects() {
    if (collected || typeof scene === 'undefined' || !scene || typeof scene.traverse !== 'function') return;
    collected = true;
    scene.traverse(object => {
      if (!object || !object.material) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const additive = materials.some(material => material && material.blending === THREE.AdditiveBlending);
      if (additive) {
        object.userData = object.userData || {};
        object.userData.agroPerfVisible = object.visible;
        additiveObjects.push(object);
      }
    });
  }

  function tierFor(value) {
    if (value >= 0.9) return 3;
    if (value >= 0.72) return 2;
    return 1;
  }

  function applyTier(force = false) {
    const nextTier = tierFor(scale);
    if (!force && nextTier === tier) return;
    tier = nextTier;
    // Shadows still follow the player's own graphics setting; only refresh frequency changes.
    if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
    const lite = tier === 1;
    additiveObjects.forEach(object => {
      object.visible = object.userData.agroPerfVisible !== false && !lite;
    });
    document.documentElement.classList.toggle('agro-perf-lite', lite);
  }

  function evaluate(now) {
    const target = targetFrameMs();
    if (samples < 45 || now - lastEvaluation < 1000) return;
    lastEvaluation = now;

    const slow = frameAverage > target * 1.16;
    const verySlow = frameAverage > target * 1.48;
    const fast = frameAverage < target * 1.035 && cpuAverage < target * 0.72;

    if (slow && scale > 0.72) {
      scale = Math.max(0.72, scale - (verySlow ? 0.09 : 0.055));
      lastQualityChange = now;
      samples = 0;
      frameAverage = target;
      applyPixelRatio();
      applyTier();
      return;
    }

    if (fast && scale < 1 && now - lastQualityChange > 7000) {
      scale = Math.min(1, scale + 0.035);
      lastQualityChange = now;
      samples = 0;
      frameAverage = target;
      applyPixelRatio();
      applyTier();
    }
  }

  function recordRenderedFrame(startedAt, cpuMs) {
    const now = startedAt;
    if (!lastFrameAt || now - lastFrameAt > 250) {
      lastFrameAt = now;
      frameAverage = targetFrameMs();
      cpuAverage = cpuMs;
      samples = 0;
      return;
    }

    const delta = now - lastFrameAt;
    lastFrameAt = now;
    frameAverage += (delta - frameAverage) * 0.08;
    cpuAverage += (cpuMs - cpuAverage) * 0.08;
    samples++;
    hudFrames++;
    evaluate(now);

    if (hud && now - lastHudAt >= 1000) {
      const info = renderer.info && renderer.info.render ? renderer.info.render : {};
      const fps = Math.round(hudFrames * 1000 / Math.max(1, now - lastHudAt));
      hud.textContent = fps + ' FPS · качество ' + scale.toFixed(2) +
        ' · DPR ×' + lastPixelRatio.toFixed(2) +
        '\nвызовов ' + (info.calls || 0) + ' · треугольников ' +
        (Math.round((info.triangles || 0) / 1000)) + 'k';
      hudFrames = 0;
      lastHudAt = now;
    }
  }

  // The main app and agro-extra.js have already wrapped render. We measure only real draws,
  // not calls skipped by the user's 30/60 FPS limiter.
  renderer.render = function adaptiveRender(sceneArg, cameraArg) {
    const shadowMap = renderer.shadowMap;
    if (shadowMap && shadowMap.enabled && shadowMap.autoUpdate === false) {
      const interval = tier === 3 ? 1 : tier === 2 ? 2 : 3;
      if (++shadowCounter >= interval) {
        shadowCounter = 0;
        shadowMap.needsUpdate = true;
      }
    }

    const before = renderer.info && renderer.info.render ? renderer.info.render.frame : null;
    const startedAt = performance.now();
    const result = previousRender(sceneArg, cameraArg);
    const cpuMs = performance.now() - startedAt;
    const after = renderer.info && renderer.info.render ? renderer.info.render.frame : null;

    if (before == null || after !== before) recordRenderedFrame(startedAt, cpuMs);
    return result;
  };

  const hud = /[?&]perf=1(?:&|$)/.test(window.location.search)
    ? document.createElement('div') : null;
  if (hud) {
    hud.id = 'agroPerfHud';
    hud.style.cssText = 'position:fixed;right:8px;bottom:28px;z-index:120;padding:5px 8px;border:1px solid #5f9d78;border-radius:8px;background:#06130ddd;color:#baf3ca;font:700 10px/1.4 monospace;white-space:pre;pointer-events:none';
    document.body.appendChild(hud);
  }

  function setPreferences(next = {}) {
    if (Object.prototype.hasOwnProperty.call(next, 'quality') &&
        Object.prototype.hasOwnProperty.call(PIXEL_CAP, next.quality)) {
      preferences.quality = next.quality;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'battery')) preferences.battery = !!next.battery;
    if (Object.prototype.hasOwnProperty.call(next, 'fps') && [0, 30, 60].includes(Number(next.fps))) {
      preferences.fps = Number(next.fps);
    }
    pixelCap = preferences.battery ? 1 : PIXEL_CAP[preferences.quality];
    applyPixelRatio();
  }

  function setQuality(name) {
    setPreferences({ quality: name });
  }

  function resetAdaptiveQuality() {
    scale = weakDevice ? 0.94 : 1;
    samples = 0;
    frameAverage = targetFrameMs();
    lastQualityChange = performance.now();
    applyPixelRatio(true);
    applyTier(true);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      lastFrameAt = 0;
      samples = 0;
      frameAverage = targetFrameMs();
    }
  });

  collectSceneEffects();
  applyPixelRatio(true);
  applyTier(true);

  window.AgroPerf = {
    setPreferences,
    setQuality,
    resetAdaptiveQuality,
    getStats: () => ({
      quality: preferences.quality,
      battery: preferences.battery,
      fpsLimit: preferences.fps,
      adaptiveScale: Number(scale.toFixed(3)),
      pixelRatio: lastPixelRatio,
      tier
    })
  };
})();
