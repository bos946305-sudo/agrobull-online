/* AGROBULL FX — public/agro-fx.js
   Load after the main game script and agro-ui.js. */
(() => {
  'use strict';
  // renderer lives in the main client's lexical scope; auxiliary scripts use its exported handle.
  const renderer = window.__agroRenderer;
  if (typeof THREE === 'undefined' || !renderer ||
      typeof socket === 'undefined' || !socket || typeof actorModels === 'undefined') {
    console.warn('AGROBULL FX: 3D core is not ready; optional effects skipped.');
    return;
  }

  const T=THREE, rnd=Math.random, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const reducedEffects=!!window.__agroLowPowerDevice;
  const ease=k=>k*k*(3-2*k), wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const TABLE_Y=1.485, effects=[], up=new T.Vector3();
  const va=new T.Vector3(), vb=new T.Vector3(), vc=new T.Vector3(), vd=new T.Vector3();
  const shot=new T.Object3D();

  /* Letterbox */
  const style=document.createElement('style');
  style.textContent='#agroCineBars{position:fixed;inset:0;z-index:3;pointer-events:none}'+
    '#agroCineBars:before,#agroCineBars:after{content:"";position:absolute;left:0;right:0;height:0;background:#000;transition:height .35s}'+
    '#agroCineBars:before{top:0}#agroCineBars:after{bottom:0}'+
    '#agroCineBars.on:before,#agroCineBars.on:after{height:9vh}'+
    '#agroSoundToggle{width:38px;height:38px;border:1px solid #a9803f88;border-radius:50%;background:linear-gradient(#2a211a,#100c09);color:#f3dfb8;font-size:17px;box-shadow:0 8px 20px #0008}'+
    '@media(max-width:700px){#agroCineBars.on:before,#agroCineBars.on:after{height:6vh}}';
  document.head.appendChild(style);
  const bars=document.createElement('div'); bars.id='agroCineBars'; document.body.appendChild(bars);

  /* Synthesized saloon sound */
  let AC=null, master=null, noiseBuffer=null, soundOn=true, soundStarted=false, beat=0;
  function audioContext(){
    if(!AC){
      const C=window.AudioContext||window.webkitAudioContext; if(!C)return null;
      AC=new C(); master=AC.createGain(); master.gain.value=soundOn?.52:0; master.connect(AC.destination);
      noiseBuffer=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate);
      const d=noiseBuffer.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=rnd()*2-1;
    }
    if(AC.state==='suspended')AC.resume().catch(()=>{});
    return AC;
  }
  function noise(f,q,type,dur,g,delay){
    const c=audioContext(); if(!c||!soundOn)return;
    const s=c.createBufferSource(),filt=c.createBiquadFilter(),gain=c.createGain(),t=c.currentTime+(delay||0);
    s.buffer=noiseBuffer; filt.type=type; filt.frequency.value=f; filt.Q.value=q;
    gain.gain.setValueAtTime(.0001,t); gain.gain.linearRampToValueAtTime(g,t+Math.min(.03,dur/4));
    gain.gain.exponentialRampToValueAtTime(.0001,t+dur);
    s.connect(filt);filt.connect(gain);gain.connect(master);s.start(t);s.stop(t+dur+.04);
  }
  function tone(f,type,dur,g,f2,delay){
    const c=audioContext();if(!c||!soundOn)return;
    const o=c.createOscillator(),v=c.createGain(),t=c.currentTime+(delay||0);
    o.type=type;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+dur);
    v.gain.setValueAtTime(Math.max(.0001,g),t);v.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(v);v.connect(master);o.start(t);o.stop(t+dur+.04);
  }
  const S={
    card:()=>noise(2100,.8,'bandpass',.075,.15),step:()=>{noise(180,1,'lowpass',.12,.13);tone(65,'sine',.09,.1,42)},
    creak:()=>{tone(145,'sawtooth',.55,.035,92);noise(680,8,'bandpass',.55,.025)},
    glass:()=>{tone(2350,'sine',.35,.045);tone(3120,'sine',.28,.03,0,.035)},
    laugh:()=>[0,.17,.34].forEach(d=>noise(850+rnd()*350,2,'bandpass',.13,.06,d)),
    gasp:()=>noise(1150,.7,'bandpass',.42,.08),impact:()=>tone(88,'sine',.75,.24,34),
    snort:()=>noise(430,1.2,'bandpass',.32,.18),hiss:()=>noise(2800,.5,'highpass',.55,.07),
    motor:()=>tone(55,'sawtooth',.85,.08,75),thud:d=>tone(72,'sine',.18,.15,39,d||0)
  };
  const bass=[98,98,130.8,98,110,110,146.8,98];
  const chords=[[196,246.9,293.7],[196,246.9,293.7],[174.6,220,261.6],[196,246.9,293.7]];
  let musicTimer=null, ambienceTimer=null;
  function startSound(){const c=audioContext();if(!c||soundStarted)return;soundStarted=true;}
  document.addEventListener('pointerdown',startSound,{passive:true});
  const soundBtn=document.createElement('button');soundBtn.id='agroSoundToggle';soundBtn.type='button';soundBtn.textContent='🔊';soundBtn.title='Звук';
  soundBtn.onclick=()=>{soundOn=!soundOn;soundBtn.textContent=soundOn?'🔊':'🔇';if(master)master.gain.setTargetAtTime(soundOn?.52:0,AC.currentTime,.04);if(soundOn)startSound()};
  const topRight=document.querySelector('.topright');if(topRight)topRight.prepend(soundBtn);

  /* Physical cards */
  function cardBack(){return typeof cardBackMaterial!=='undefined'&&cardBackMaterial?cardBackMaterial.clone():new T.MeshStandardMaterial({color:0x76251a,roughness:.62})}
  function throwCards(playerId,count){
    if(reducedEffects){S.card();return;}
    if(typeof scene==='undefined'||!scene||typeof camera==='undefined'||!camera)return;
    const actor=actorModels.get(playerId);
    const stack=(typeof cardStack!=='undefined'&&cardStack)?cardStack.children.slice(-count):[];
    stack.forEach(c=>c.visible=false);
    const start=actor&&actor.group.visible?actor.group.localToWorld(new T.Vector3(.34,1.12,.55)):camera.localToWorld(new T.Vector3(.18,-.48,-.78));
    for(let i=0;i<count;i++){
      const m=new T.Mesh(new T.BoxGeometry(.52,.025,.72),cardBack());m.castShadow=true;m.visible=false;m.position.copy(start);
      m.rotation.set(rnd()*5,rnd()*5,rnd()*5);scene.add(m);
      const target=new T.Vector3((rnd()-.5)*.36,TABLE_Y,-.4+(rnd()-.5)*.36),flight=.48+rnd()*.16,v=target.clone().sub(start).divideScalar(flight);
      v.y=(target.y-start.y+4.9*flight*flight)/flight;
      effects.push({kind:'throw',mesh:m,v,spin:new T.Vector3((rnd()-.5)*22,(rnd()-.5)*12,(rnd()-.5)*22),delay:i*.12,source:stack[i]||null,landed:false,age:0});
    }
    S.card();
  }
  function flipCards(cards){
    if(!Array.isArray(cards)||!cards.length||typeof scene==='undefined'||!scene)return;
    cards.forEach((data,i)=>{
      const c=document.createElement('canvas');c.width=256;c.height=360;const x=c.getContext('2d');
      const g=x.createLinearGradient(0,0,256,360);g.addColorStop(0,'#fff9e9');g.addColorStop(1,'#d7c3a0');
      x.fillStyle=g;x.fillRect(0,0,256,360);x.strokeStyle='#a87942';x.lineWidth=9;x.strokeRect(9,9,238,342);
      x.textAlign='center';x.fillStyle='#30231b';x.font='bold 104px Arial';x.fillText(data.icon||'?',128,166);
      x.font='bold 25px Arial';x.fillText(String(data.name||'').slice(0,16),128,254);
      const face=new T.MeshStandardMaterial({map:new T.CanvasTexture(c),roughness:.48}),edge=new T.MeshStandardMaterial({color:0xe7d8bd});
      const m=new T.Mesh(new T.BoxGeometry(.52,.025,.72),[edge,edge,face,cardBack(),edge,edge]);
      m.castShadow=true;m.position.set((i-(cards.length-1)/2)*.62,TABLE_Y+.02,-.42);m.rotation.set(Math.PI,(rnd()-.5)*.12,0);scene.add(m);
      effects.push({kind:'flip',mesh:m,age:-i*.12,x:m.position.x,baseY:TABLE_Y+.02,hit:false});
    });
  }
  function stepCards(dt){
    for(let i=effects.length-1;i>=0;i--){
      const e=effects[i],m=e.mesh;
      if(e.kind==='throw'){
        if(e.delay>0){e.delay-=dt;continue}
        e.age+=dt;m.visible=true;e.v.y-=9.8*dt;m.position.addScaledVector(e.v,dt);
        m.rotation.x+=e.spin.x*dt;m.rotation.y+=e.spin.y*dt;m.rotation.z+=e.spin.z*dt;
        if(!e.landed&&m.position.y<=TABLE_Y&&e.v.y<0){
          m.position.y=TABLE_Y;
          if(e.v.y<-1.15){e.v.y*= -.26;e.v.x*=.58;e.v.z*=.58;e.spin.multiplyScalar(.42);S.card()}
          else{e.landed=true;e.spin.set(0,0,0)}
        }
        if(e.landed){
          const q=Math.min(1,dt*9);m.rotation.x+=(0-m.rotation.x)*q;m.rotation.z+=(0-m.rotation.z)*q;m.position.y=TABLE_Y;
          if(Math.abs(m.rotation.x)+Math.abs(m.rotation.z)<.025||e.age>2.3){
            if(e.source)e.source.visible=true;scene.remove(m);m.geometry.dispose();m.material.dispose();effects.splice(i,1);
          }
        }
      }else{
        e.age+=dt;if(e.age<0)continue;const k=clamp(e.age/.82,0,1);
        m.rotation.x=Math.PI*(1-ease(k));m.position.x=e.x*ease(k);m.position.y=e.baseY+(k<1?Math.sin(Math.PI*k)*.72:0);
        if(!e.hit&&k>.42){e.hit=true;S.card()}
        if(e.age>3.4){scene.remove(m);m.geometry.dispose();m.material.forEach(mat=>{if(mat.map)mat.map.dispose();mat.dispose()});effects.splice(i,1)}
      }
    }
  }

  /* Expressions and procedural arm gestures */
  const poses={
    laugh:t=>({bx:-.04,bz:.025,hx:-.28+Math.sin(t*18)*.08,hz:0,arms:[.34,1.12+.06*Math.sin(t*10),.42]}),
    anger:t=>({bx:.08,bz:0,hx:.22+Math.sin(t*28)*.025,hz:0,arms:[.52,1.55+Math.sin(t*24)*.035,.5]}),
    fear:t=>({bx:-.08,bz:Math.sin(t*22)*.07,hx:-.12,hz:Math.sin(t*20)*.1,arms:[.18,2.02,.38]}),
    surprise:t=>({bx:-.06,bz:0,hx:-.2,hz:0,arms:[.62,1.98+.04*Math.sin(t*12),.22]}),
    sad:()=>({bx:.12,bz:0,hx:.42,hz:0,arms:[.28,2.22,.12]})
  };
  function segment(m,a,b){vd.copy(b).sub(a);const len=vd.length();if(len<.001)return;m.position.copy(a).addScaledVector(vd,.5);m.quaternion.setFromUnitVectors(up.set(0,1,0),vd.divideScalar(len));m.scale.y=len}
  function gestureRig(r){
    const g=r.group;if(g.userData.fxGestureRig!==undefined)return g.userData.fxGestureRig;
    if(g.userData.glb)return g.userData.fxGestureRig=null;
    const arms=g.children.filter(o=>o.isMesh&&Math.abs(o.position.x)>.45&&o.position.y>.85&&o.position.y<1.8);
    if(!arms.length)return g.userData.fxGestureRig=null;
    const sleeve=arms[0].material,hand=arms.reduce((a,b)=>b.position.y<a.position.y?b:a).material,root=new T.Group();
    const make=()=>{const m=new T.Mesh(new T.CylinderGeometry(.09,.075,1,10),sleeve);root.add(m);return m};
    const limbs=[-1,1].map(side=>({side,upper:make(),lower:make(),hand:new T.Mesh(new T.SphereGeometry(.105,12,10),hand)}));
    limbs.forEach(a=>root.add(a.hand));root.visible=false;g.add(root);
    return g.userData.fxGestureRig={arms,visibility:arms.map(a=>a.visible),limbs,root};
  }
  function emote(id,type,duration,delay){
    if(reducedEffects)return;
    setTimeout(()=>{
      const r=actorModels.get(id);if(!r||!r.group.visible||!poses[type])return;
      const h=r.group.userData.head;
      r.fxEmotion={type,start:performance.now(),duration:duration||1.8,baseY:r.group.position.y,bx:r.group.rotation.x,bz:r.group.rotation.z,
        head:h,headX:h?h.rotation.x:0,headZ:h?h.rotation.z:0};
    },delay||0);
  }
  function stepEmotions(now){
    for(const [,r] of actorModels){
      const e=r.fxEmotion;if(!e)continue;
      if(typeof rodeomotion!=='undefined'&&rodeomotion&&rodeomotion.playerId===r.player.id)continue;
      const t=(now-e.start)/1000,fade=Math.min(1,t/.18,(e.duration-t)/.32);
      if(fade<=0){
        r.group.position.y=e.baseY;r.group.rotation.x=e.bx;r.group.rotation.z=e.bz;
        if(e.head){e.head.rotation.x=e.headX;e.head.rotation.z=e.headZ}
        const rig=gestureRig(r);if(rig){rig.arms.forEach((a,i)=>a.visible=rig.visibility[i]);rig.root.visible=false}
        r.fxEmotion=null;continue;
      }
      const p=poses[e.type](t);
      r.group.position.y=e.baseY+(e.type==='laugh'?Math.abs(Math.sin(t*10))*.035:0);
      r.group.rotation.x=e.bx+p.bx*fade;r.group.rotation.z=e.bz+p.bz*fade;
      if(e.head&&!r.group.userData.glb){e.head.rotation.x=e.headX+p.hx*fade;e.head.rotation.z=e.headZ+p.hz*fade}
      const rig=gestureRig(r);
      if(rig){
        rig.arms.forEach(a=>a.visible=false);rig.root.visible=true;
        rig.limbs.forEach(a=>{
          const shoulder=va.set(a.side*.49,1.72,0),palm=vb.set(a.side*p.arms[0],p.arms[1],p.arms[2]);
          const elbow=vc.copy(shoulder).add(palm).multiplyScalar(.5).add(vd.set(a.side*.17,-.12,-.04));
          segment(a.upper,shoulder,elbow);segment(a.lower,elbow,palm);a.hand.position.copy(palm);
        });
      }
    }
  }

  /* Camera is overridden only for the current render, then restored.
     The main game recalculates its first-person camera every frame. */
  let cine=null,currentGameId=null;
  function startCine(){ /* Deliberately disabled: keep gameplay camera stable and remove cinematic overhead. */ }
  function stepCine(now,basePos,baseQuat){
    if(!cine)return;
    const k=clamp((now-cine.start)/cine.duration,0,1);
    if(k>=1||(typeof rodeomotion!=='undefined'&&rodeomotion)){cine=null;bars.classList.remove('on');return}
    if(cine.type==='intro'){
      const p=cine.startPos,angle0=Math.atan2(p.x,p.z+.4),radius0=Math.hypot(p.x,p.z+.4),angle=angle0+k*Math.PI*2;
      const radius=8+(radius0-8)*ease(k);
      shot.position.set(Math.sin(angle)*radius,4.5+(p.y-4.5)*ease(k),-.4+Math.cos(angle)*radius);
      shot.lookAt(0,1.45,-.4);
      const blend=ease(clamp((k-.82)/.18,0,1));
      camera.position.lerpVectors(shot.position,basePos,blend);camera.quaternion.slerpQuaternions(shot.quaternion,baseQuat,blend);
    }else if(cine.type==='close'){
      const r=actorModels.get(cine.id);if(!r||!r.group.visible){cine=null;bars.classList.remove('on');return}
      r.group.updateMatrixWorld(true);
      const head=r.group.localToWorld(new T.Vector3(0,2.08,0)),pos=r.group.localToWorld(new T.Vector3(.48,2.22,1.85-.9*ease(k)));
      shot.position.copy(pos);shot.lookAt(head);shot.rotateZ(.045*Math.sin(k*Math.PI*2));
      const blend=1-ease(clamp(Math.min(k/.16,(1-k)/.16),0,1));
      camera.position.lerpVectors(shot.position,basePos,blend);camera.quaternion.slerpQuaternions(shot.quaternion,baseQuat,blend);
      camera.fov=cine.baseFov+(46-cine.baseFov)*Math.sin(Math.PI*k);camera.updateProjectionMatrix();
    }else if(cine.type==='shake'){
      const f=1-k;camera.position.copy(basePos).add(va.set(Math.sin(now/19)*.075*f,Math.sin(now/27)*.045*f,0));
      const q=new T.Quaternion().setFromEuler(new T.Euler(Math.sin(now/23)*.018*f,0,Math.sin(now/17)*.022*f));
      camera.quaternion.copy(baseQuat).multiply(q);
    }
  }

  const originalRender=renderer.render.bind(renderer);
  let lastFrame=performance.now();
  renderer.render=function(s,c){
    if(c!==camera||typeof worldReady==='undefined'||!worldReady)return originalRender(s,c);
    const now=performance.now(),dt=Math.min(.05,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
    stepCards(dt);stepEmotions(now);
    const basePos=camera.position.clone(),baseQuat=camera.quaternion.clone(),baseFov=camera.fov;
    try{stepCine(now,basePos,baseQuat);return originalRender(s,c)}
    finally{camera.position.copy(basePos);camera.quaternion.copy(baseQuat);if(camera.fov!==baseFov){camera.fov=baseFov;camera.updateProjectionMatrix()}}
  };

  /* Network snapshots */
  let seen=false,lastPlayKey='',revealed=false,lastPhase='';
  const others=(state,id)=>(state.players||[]).filter(p=>p.alive&&p.id!==id);
  socket.on('gameState',state=>{
    if(!state)return;
    const lp=state.lastPlay,key=lp?[state.round,state.pileCount,lp.playerId,lp.count].join('|'):'';
    if(state.phase==='playing'&&state.gameId&&state.gameId!==currentGameId){
      currentGameId=state.gameId;
    }
    if(seen&&lp&&!lp.revealed&&key&&key!==lastPlayKey)throwCards(lp.playerId,lp.count);
    if(lp&&lp.revealed&&!revealed){
      S.impact();S.gasp();flipCards(lp.cards||[]);
      emote(lp.playerId,'fear',2.3);others(state,lp.playerId).forEach(p=>emote(p.id,'surprise',1.5));
    }
    if(state.phase==='rodeo'&&lastPhase!=='rodeo'&&state.rodeo){
      const loser=state.rodeo.playerId,out=!!state.rodeo.out;
      S.motor();S.hiss();setTimeout(S.snort,480);for(let i=0;i<7;i++)S.thud(i*.42);setTimeout(S.hiss,1450);
      emote(loser,'fear',2.5);
      if(out){setTimeout(()=>{S.impact();S.laugh()},1650);emote(loser,'sad',2.8,2550);others(state,loser).forEach(p=>emote(p.id,'laugh',2.4,1750))}
      else{setTimeout(S.gasp,1650);emote(loser,'surprise',1.8,2500);others(state,loser).forEach(p=>emote(p.id,'surprise',1.5,1750))}
    }
    revealed=!!(lp&&lp.revealed);lastPlayKey=key;lastPhase=state.phase;seen=true;
  });
})();