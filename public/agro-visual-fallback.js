/* AGROBULL — polished high-resolution 2.5D fallback while WebGL is unavailable. */
(() => {
  'use strict';
  const webglCanvas = document.getElementById('scene');
  if (!webglCanvas) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'agroVisualFallback';
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    zIndex: '0', pointerEvents: 'none', display: 'none'
  });
  document.body.insertBefore(canvas, webglCanvas.nextSibling);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  let active = false, raf = 0, start = performance.now();
  let width = innerWidth, height = innerHeight, pixelRatio = 1;

  const gradient = (x0, y0, x1, y1, stops) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  };
  function oval(x, y, rx, ry, fill, rotation = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill(); ctx.restore();
  }
  function rounded(x, y, w, h, r, fill, stroke = null, line = 1) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.lineWidth = line; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function fit() {
    width = innerWidth; height = innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2.25);
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function drawBackground(w, h) {
    ctx.fillStyle = gradient(0, 0, 0, h, [[0, '#38271e'], [.48, '#68442b'], [1, '#17100c']]);
    ctx.fillRect(0, 0, w, h);
    // Timber walls and raised saloon panels.
    ctx.fillStyle = '#2a1b14'; ctx.fillRect(0, h * .08, w, h * .43);
    for (let i = 0; i < 13; i++) {
      const x = i * w / 12;
      ctx.fillStyle = i % 2 ? '#382319' : '#42291a';
      ctx.fillRect(x, h * .1, w / 12 - 2, h * .39);
      ctx.fillStyle = 'rgba(221,164,99,.12)'; ctx.fillRect(x + 5, h * .1, 2, h * .39);
      ctx.fillStyle = 'rgba(0,0,0,.23)'; ctx.fillRect(x + w / 12 - 5, h * .1, 3, h * .39);
    }
    // Back-bar shelves, bottles and warm practical lamps.
    for (let row = 0; row < 2; row++) {
      const sy = h * (.24 + row * .15);
      rounded(w * .19, sy + 18, w * .62, 8, 3, '#21150f', '#9a683a', 1);
      for (let i = 0; i < 17; i++) {
        const x = w * .205 + i * w * .0355, bh = 19 + (i % 4) * 7;
        const colors = ['#46634b', '#7b3c2b', '#344b61', '#a07835', '#426e68'];
        rounded(x, sy - bh, 10, bh, 3, colors[i % colors.length], 'rgba(232,198,145,.35)', .8);
        rounded(x + 3, sy - bh - 5, 4, 7, 2, '#b08a53');
        ctx.fillStyle = 'rgba(246,205,139,.25)'; ctx.fillRect(x + 2, sy - bh + 5, 2, bh - 9);
      }
    }
    for (let i = 0; i < 5; i++) {
      const x = w * (.12 + i * .19), y = h * .13;
      const glow = ctx.createRadialGradient(x, y, 1, x, y, Math.max(55, w * .075));
      glow.addColorStop(0, 'rgba(255,190,112,.28)'); glow.addColorStop(1, 'rgba(255,150,70,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - 100, y - 100, 200, 200);
      rounded(x - 12, y - 4, 24, 8, 4, '#302017', '#bb874b', 1);
      oval(x, y + 10, 5, 10, '#ffd58c');
    }
    // Warm floorboards.
    ctx.fillStyle = '#20140f'; ctx.fillRect(0, h * .51, w, h * .49);
    for (let i = 0; i < 9; i++) {
      const y = h * (.54 + i * .055);
      ctx.strokeStyle = 'rgba(190,130,78,.17)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  function drawPerson(x, y, scale, variant, facing = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale * facing, scale);
    const coatColors = ['#554c42', '#354d58', '#6a3929', '#544b36'];
    const coat = coatColors[variant % coatColors.length];
    // Ground shadow and shoulders/body.
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
    oval(0, 76, 54, 13, 'rgba(0,0,0,.42)');
    ctx.fillStyle = gradient(-35, -5, 38, 80, [[0, '#8c6547'], [.32, coat], [1, '#171b1b']]);
    ctx.beginPath(); ctx.moveTo(-31, 4); ctx.quadraticCurveTo(-48, 18, -50, 76);
    ctx.quadraticCurveTo(0, 91, 50, 76); ctx.quadraticCurveTo(48, 18, 31, 4);
    ctx.quadraticCurveTo(0, -5, -31, 4); ctx.closePath(); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    // Shirt, vest lapels, seam detail.
    ctx.fillStyle = '#d7c4a4'; ctx.beginPath(); ctx.moveTo(-13, 4); ctx.lineTo(0, 24); ctx.lineTo(13, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#26211d'; ctx.beginPath(); ctx.moveTo(-15, 7); ctx.lineTo(-3, 34); ctx.lineTo(-20, 64); ctx.lineTo(-29, 12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(15, 7); ctx.lineTo(3, 34); ctx.lineTo(20, 64); ctx.lineTo(29, 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(237,205,157,.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-35, 22); ctx.quadraticCurveTo(-22, 16, -20, 58); ctx.moveTo(35, 22); ctx.quadraticCurveTo(22, 16, 20, 58); ctx.stroke();
    // Neck and ears.
    rounded(-9, -12, 18, 24, 6, '#b87e5a');
    oval(-24, -39, 7, 11, '#b77d5d'); oval(24, -39, 7, 11, '#b77d5d');
    // Face with soft light and jaw shape.
    ctx.fillStyle = gradient(-19, -64, 18, -12, [[0, '#f0c69c'], [.48, '#c98e68'], [1, '#815039']]);
    ctx.beginPath(); ctx.moveTo(-20, -57); ctx.quadraticCurveTo(-18, -76, 0, -76);
    ctx.quadraticCurveTo(20, -76, 21, -54); ctx.lineTo(17, -25);
    ctx.quadraticCurveTo(0, -8, -17, -25); ctx.closePath(); ctx.fill();
    // Nose, eyes, brows and expression.
    ctx.fillStyle = 'rgba(88,48,35,.45)'; oval(0, -43, 3, 7, 'rgba(111,65,46,.42)');
    for (const ex of [-8, 8]) {
      rounded(ex - 3, -54, 6, 3, 1.5, '#35251e');
      oval(ex, -51, 1.3, 1.3, '#11100f');
    }
    ctx.strokeStyle = '#513327'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-14, -59); ctx.lineTo(-5, -61); ctx.moveTo(5, -61); ctx.lineTo(14, -59); ctx.stroke();
    ctx.strokeStyle = 'rgba(90,44,35,.7)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-5, -27); ctx.quadraticCurveTo(0, -24, 5, -27); ctx.stroke();
    // Character-specific hair / hat / beard silhouettes.
    if (variant === 0) {
      oval(0, -70, 20, 10, '#332820'); rounded(-18, -77, 36, 8, 4, '#30251d');
      rounded(-12, -53, 9, 7, 3, 'rgba(20,30,34,.8)', '#a8b9b5', 1);
      rounded(3, -53, 9, 7, 3, 'rgba(20,30,34,.8)', '#a8b9b5', 1);
      ctx.strokeStyle = '#a8b9b5'; ctx.beginPath(); ctx.moveTo(-3, -50); ctx.lineTo(3, -50); ctx.stroke();
    } else if (variant === 1) {
      ctx.fillStyle = '#171513'; ctx.beginPath(); ctx.moveTo(-22, -62); ctx.quadraticCurveTo(-27, -84, 0, -84); ctx.quadraticCurveTo(27, -84, 22, -62); ctx.lineTo(17, -70); ctx.lineTo(-17, -70); ctx.closePath(); ctx.fill();
      rounded(-29, -67, 58, 7, 3, '#171513');
      ctx.fillStyle = '#3b2921'; ctx.beginPath(); ctx.moveTo(-15, -25); ctx.quadraticCurveTo(0, -14, 15, -25); ctx.lineTo(9, -9); ctx.lineTo(-9, -9); ctx.closePath(); ctx.fill();
    } else if (variant === 2) {
      ctx.fillStyle = '#3b261d'; ctx.beginPath(); ctx.moveTo(-21, -62); ctx.quadraticCurveTo(-25, -85, 0, -83); ctx.quadraticCurveTo(23, -82, 22, -61); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#241b17'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-19, -64); ctx.quadraticCurveTo(0, -87, 19, -64); ctx.stroke();
    } else {
      ctx.fillStyle = '#28221e'; ctx.beginPath(); ctx.moveTo(-22, -62); ctx.quadraticCurveTo(-25, -89, 0, -83); ctx.quadraticCurveTo(25, -89, 22, -62); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#392a21'; ctx.beginPath(); ctx.moveTo(-16, -25); ctx.quadraticCurveTo(0, -14, 16, -25); ctx.lineTo(12, -13); ctx.quadraticCurveTo(0, -5, -12, -13); ctx.closePath(); ctx.fill();
    }
    // Arms resting near the table edge and cuffs.
    ctx.strokeStyle = coat; ctx.lineCap = 'round'; ctx.lineWidth = 15;
    ctx.beginPath(); ctx.moveTo(-31, 18); ctx.quadraticCurveTo(-49, 43, -35, 62);
    ctx.moveTo(31, 18); ctx.quadraticCurveTo(49, 43, 35, 62); ctx.stroke();
    ctx.strokeStyle = '#c3a17e'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.moveTo(-35, 59); ctx.lineTo(-29, 72); ctx.moveTo(35, 59); ctx.lineTo(29, 72); ctx.stroke();
    oval(-28, 75, 8, 5, '#c78f6b'); oval(28, 75, 8, 5, '#c78f6b');
    // Brass buttons.
    for (let i = 0; i < 3; i++) oval(0, 36 + i * 10, 1.8, 1.8, '#c69a58');
    ctx.restore();
  }

  function drawBull(x, y, t, scale = 1) {
    ctx.save(); ctx.translate(x, y + Math.sin(t * 2.6) * 3); ctx.scale(scale, scale);
    oval(0, 51, 111, 22, 'rgba(0,0,0,.48)');
    // Hind legs and front legs, with joints and hooves.
    for (const lx of [-63, -25, 39, 70]) {
      const kick = Math.sin(t * 7 + lx) * 5;
      ctx.strokeStyle = '#3a2920'; ctx.lineWidth = 15; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(lx, 22); ctx.lineTo(lx + kick, 48); ctx.stroke();
      oval(lx + kick, 50, 10, 6, '#211b17');
      oval(lx, 22, 9, 9, '#75452d');
    }
    // Muscular body.
    ctx.fillStyle = gradient(-80, -47, 77, 55, [[0, '#df9a5c'], [.3, '#a96136'], [.7, '#704027'], [1, '#36251c']]);
    ctx.beginPath(); ctx.moveTo(-88, -20); ctx.quadraticCurveTo(-80, -69, -16, -63);
    ctx.quadraticCurveTo(39, -70, 65, -37); ctx.quadraticCurveTo(87, -12, 72, 26);
    ctx.quadraticCurveTo(34, 56, -57, 35); ctx.quadraticCurveTo(-101, 19, -88, -20); ctx.closePath(); ctx.fill();
    // Shoulder hump and neck.
    oval(-46, -42, 38, 31, '#99552f', -.25);
    ctx.fillStyle = gradient(34, -47, 99, 28, [[0, '#c47a45'], [1, '#4b2c20']]);
    ctx.beginPath(); ctx.moveTo(35, -41); ctx.quadraticCurveTo(80, -61, 101, -24);
    ctx.lineTo(92, 22); ctx.quadraticCurveTo(54, 35, 34, 5); ctx.closePath(); ctx.fill();
    // Head, muzzle, nose and nostrils.
    oval(91, -26, 30, 27, '#995b39', -.2);
    oval(113, -13, 22, 15, '#d18a64', -.12);
    oval(118, -15, 3.6, 2.5, '#39231b'); oval(104, -12, 3.6, 2.5, '#39231b');
    oval(102, -39, 3.6, 3.6, '#120e0c');
    oval(103, -40, 1.3, 1.3, '#fff1d1');
    // Ears and horns.
    ctx.fillStyle = '#87492f'; ctx.beginPath(); ctx.moveTo(72, -42); ctx.quadraticCurveTo(45, -66, 30, -54); ctx.quadraticCurveTo(49, -34, 75, -31); ctx.fill();
    ctx.fillStyle = '#ead7b5';
    ctx.beginPath(); ctx.moveTo(79, -47); ctx.quadraticCurveTo(91, -91, 119, -84); ctx.quadraticCurveTo(104, -76, 99, -54); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(76, -47); ctx.quadraticCurveTo(65, -89, 41, -81); ctx.quadraticCurveTo(57, -70, 59, -50); ctx.closePath(); ctx.fill();
    // Leather rodeo harness, saddle and metal fittings.
    ctx.strokeStyle = '#2b1b14'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-47, -46); ctx.quadraticCurveTo(-16, -20, 22, -48); ctx.stroke();
    ctx.strokeStyle = '#d3a35e'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-47, -46); ctx.quadraticCurveTo(-16, -20, 22, -48); ctx.stroke();
    rounded(-21, -43, 22, 14, 4, '#3b2920', '#d2a45f', 2);
    // Warm highlights on the flank.
    ctx.strokeStyle = 'rgba(255,205,139,.26)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(-17, -15, 45, 29, -.2, 3.7, 5.7); ctx.stroke();
    ctx.restore();
  }

  function drawTable(w, h) {
    const cx = w * .5, cy = h * .70, rx = Math.min(w * .36, 475), ry = h * .19;
    oval(cx, cy + 18, rx + 17, ry + 11, '#140e0a');
    const wood = ctx.createRadialGradient(cx, cy - 30, 8, cx, cy, rx + 30);
    wood.addColorStop(0, '#98613a'); wood.addColorStop(.78, '#54301d'); wood.addColorStop(1, '#20140f');
    oval(cx, cy, rx + 13, ry + 9, wood);
    const felt = ctx.createRadialGradient(cx, cy - 25, 5, cx, cy, rx);
    felt.addColorStop(0, '#39835c'); felt.addColorStop(.72, '#246343'); felt.addColorStop(1, '#123b2b');
    oval(cx, cy - 5, rx - 9, ry - 9, felt);
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy - 5, rx - 9, ry - 9, 0, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = 'rgba(230,201,146,.12)'; ctx.lineWidth = 1;
    for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(cx - rx, cy + i * 12); ctx.lineTo(cx + rx, cy + i * 12); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = '#c49355'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(cx, cy - 5, rx - 9, ry - 9, 0, 0, Math.PI * 2); ctx.stroke();
    // Face-up cards and a few poker chips.
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.translate(cx + (i - 1) * 32, cy - 26 + (i % 2) * 6); ctx.rotate((i - 1) * .12);
      rounded(-13, -20, 26, 40, 4, '#eee1c8', '#a88a61', 1);
      ctx.fillStyle = i === 1 ? '#a34d36' : '#355f4a'; ctx.font = 'bold 16px Georgia'; ctx.textAlign = 'center'; ctx.fillText(i === 1 ? '♣' : '♦', 0, 6);
      ctx.restore();
    }
    for (let i = 0; i < 4; i++) {
      oval(cx - rx * .56 + i * 16, cy + 35, 9, 4, i % 2 ? '#b94c3e' : '#dfc18b');
    }
  }

  function draw(now) {
    if (!active) return;
    const w = width, h = height, t = (now - start) / 1000;
    drawBackground(w, h);
    // Opponents, staged at different depths.
    drawPerson(w * .5, h * .315, Math.min(1.02, w / 1250), 0, 1);
    drawPerson(w * .205, h * .49, Math.min(.78, w / 1550), 1, 1);
    drawPerson(w * .795, h * .49, Math.min(.78, w / 1550), 2, -1);
    drawBull(w * .5, h * .505, t, Math.min(1.05, w / 1250));
    drawTable(w, h);
    // Gentle light bloom and crisp lower caption.
    const bloom = ctx.createRadialGradient(w * .5, h * .42, 5, w * .5, h * .42, Math.max(w, h) * .48);
    bloom.addColorStop(0, 'rgba(255,201,132,.045)'); bloom.addColorStop(1, 'rgba(0,0,0,.24)');
    ctx.fillStyle = bloom; ctx.fillRect(0, 0, w, h);
    ctx.font = '700 11px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(240,211,166,.68)'; ctx.fillText('AGROBULL · РЕЗЕРВНЫЙ РЕЖИМ ОТОБРАЖЕНИЯ', w / 2, h - 18);
    raf = requestAnimationFrame(draw);
  }

  function enable() {
    if (active) return;
    active = true; canvas.style.display = 'block'; fit(); draw(performance.now());
  }
  function disable() {
    if (!active) return;
    active = false; canvas.style.display = 'none'; cancelAnimationFrame(raf);
  }
  addEventListener('resize', fit);
  // If the normal renderer has not produced a frame, show a detailed fallback rather than black.
  setTimeout(() => { if (!(window.__agroLastGoodRender > 0)) enable(); }, 2600);
  // Switch cleanly back to the real scene as soon as WebGL starts drawing.
  const monitor = () => {
    if (active && window.__agroLastGoodRender > 0) disable();
    setTimeout(monitor, 700);
  };
  setTimeout(monitor, 3300);
})();