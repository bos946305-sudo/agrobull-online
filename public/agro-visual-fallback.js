/* AGROBULL visual safety net: keep the table, players and bull visible if WebGL never produces a frame. */
(() => {
  'use strict';
  const scene = document.getElementById('scene');
  if (!scene) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'agroVisualFallback';
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%',
    zIndex: '0', pointerEvents: 'none', display: 'none'
  });
  document.body.insertBefore(canvas, scene.nextSibling);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let active = false, raf = 0, start = performance.now();

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.floor(innerWidth * dpr));
    canvas.height = Math.max(1, Math.floor(innerHeight * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function person(x, y, scale, coat, hat, facing) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale * (facing || 1), scale);
    ctx.fillStyle = '#17120f'; ctx.beginPath(); ctx.ellipse(0, 3, 34, 13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = coat; ctx.beginPath(); ctx.moveTo(-23, -3); ctx.lineTo(-31, 65); ctx.quadraticCurveTo(0, 78, 31, 65); ctx.lineTo(23, -3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d7a77c'; ctx.beginPath(); ctx.arc(0, -24, 21, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#34251b'; ctx.fillRect(-5, -26, 4, 3); ctx.fillRect(7, -26, 4, 3);
    ctx.fillStyle = hat; ctx.fillRect(-29, -49, 58, 7); ctx.fillRect(-17, -69, 34, 22);
    ctx.restore();
  }
  function draw(now) {
    if (!active) return;
    const w = innerWidth, h = innerHeight, t = (now - start) / 1000;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#61432e'); bg.addColorStop(.58, '#38271d'); bg.addColorStop(1, '#17110d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // Saloon wall and warm lamps
    ctx.fillStyle = '#281b15'; ctx.fillRect(0, h * .08, w, h * .38);
    for (let i = 0; i < 5; i++) {
      const x = w * (.12 + i * .19);
      const glow = ctx.createRadialGradient(x, h * .2, 2, x, h * .2, 85);
      glow.addColorStop(0, 'rgba(255,190,105,.38)'); glow.addColorStop(1, 'rgba(255,150,70,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - 90, h * .1, 180, 180);
      ctx.fillStyle = '#d99b50'; ctx.beginPath(); ctx.arc(x, h * .2, 5, 0, Math.PI * 2); ctx.fill();
    }
    // Table top
    ctx.fillStyle = '#4a2b19'; ctx.beginPath(); ctx.ellipse(w * .5, h * .68, Math.min(w * .34, 430), h * .19, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#28734e'; ctx.beginPath(); ctx.ellipse(w * .5, h * .665, Math.min(w * .315, 400), h * .16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c18a4b'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(w * .5, h * .665, Math.min(w * .315, 400), h * .16, 0, 0, Math.PI * 2); ctx.stroke();
    // Four visible opponents
    person(w * .5, h * .29, .78, '#75422d', '#302018', 1);
    person(w * .22, h * .49, .63, '#354b55', '#211a16', 1);
    person(w * .78, h * .49, .63, '#7b6a3b', '#211a16', -1);
    // Bull on the rodeo platform
    const bx = w * .5, by = h * .49 + Math.sin(t * 3) * 4;
    ctx.fillStyle = '#24201d'; ctx.beginPath(); ctx.ellipse(bx, by + 18, 83, 42, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a9683c'; ctx.beginPath(); ctx.ellipse(bx + 7, by + 5, 73, 37, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(bx + 65, by - 8, 32, 27, -.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8d4ae';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(bx + 77, by - 22 + side * 9); ctx.quadraticCurveTo(bx + 119, by - 57 + side * 20, bx + 111, by - 2 + side * 4); ctx.quadraticCurveTo(bx + 99, by - 25 + side * 4, bx + 77, by - 22 + side * 9); ctx.fill(); }
    ctx.fillStyle = '#2a211b'; for (const lx of [-42, 36]) { ctx.fillRect(bx + lx, by + 28, 13, 45); }
    ctx.fillStyle = 'rgba(240,198,132,.8)'; ctx.font = '700 12px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('AGROBULL · РЕЗЕРВНЫЙ РЕЖИМ ОТОБРАЖЕНИЯ', w / 2, h - 22);
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
  // If the normal renderer hasn't completed even one frame, avoid leaving a blank screen.
  setTimeout(() => {
    if (!(window.__agroLastGoodRender > 0)) enable();
  }, 2600);
  // If WebGL begins rendering later, hand the screen back to the real 3D scene.
  const monitor = () => {
    if (active && window.__agroLastGoodRender > 0) disable();
    setTimeout(monitor, 700);
  };
  setTimeout(monitor, 3300);
})();