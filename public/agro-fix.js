/* AGROBULL FIX — safe client-side refinements */
(() => {
  'use strict';
  if (typeof THREE === 'undefined' || typeof renderer === 'undefined' || !renderer || typeof socket === 'undefined') return;

  // Restore the saloon colour grade and the lightning overlay used by the render loop.
  const style = document.createElement('style');
  style.textContent =
    '.overlay{background:radial-gradient(circle at 18% 18%,rgba(255,61,129,.22),transparent 46%),radial-gradient(circle at 84% 26%,rgba(25,195,214,.22),transparent 46%),radial-gradient(circle at 50% 96%,rgba(255,176,46,.2),transparent 52%),rgba(5,3,6,.76)!important}' +
    '#grade{position:fixed;inset:0;z-index:2;pointer-events:none;mix-blend-mode:soft-light;background:linear-gradient(135deg,rgba(255,64,129,.2),rgba(0,190,210,.17) 55%,rgba(255,170,40,.19));animation:agroHue 45s linear infinite}' +
    '@keyframes agroHue{to{filter:hue-rotate(360deg)}}' +
    '#agroLightning{position:fixed;inset:0;z-index:9;pointer-events:none;background:#dceaff;opacity:0}' +
    '#quickBtn{width:100%;margin-top:10px;background:linear-gradient(180deg,#2fb7a4,#17665c);border-color:#7ff0dd}';
  document.head.appendChild(style);
  const grade = document.createElement('div');
  grade.id = 'grade';
  document.body.appendChild(grade);
  const lightningOverlay = document.createElement('div');
  lightningOverlay.id = 'agroLightning';
  document.body.appendChild(lightningOverlay);
  if (scene && scene.fog) scene.fog.density = Math.min(scene.fog.density || .024, .017);

  // Peek presentation and target selection are handled by the main 3D client.
  // Do not create the old 2D card fan or the duplicate dropdown here.

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