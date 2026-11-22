/* AGROBULL META — profile, daily quests, achievements, room options, rematch and spectator */
(() => {
  'use strict';
  if(typeof socket==='undefined'||!socket||typeof document==='undefined')return;
  const $=s=>document.querySelector(s), KEY='agro_meta_v1';
  const today=()=>new Date().toISOString().slice(0,10);
  let M={xp:0,coins:0,owned:['b0'],selected:'b0',ach:[],day:today(),quests:{},checks:0,survived:0,matches:0,wins:0};
  try{M={...M,...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch(_){}
  if(M.day!==today()){M.day=today();M.quests={};}
  M.owned=Array.isArray(M.owned)?M.owned:['b0'];M.ach=Array.isArray(M.ach)?M.ach:[];
  if(typeof profile!=='undefined'&&profile&&Number.isFinite(Number(profile.coins)))M.coins=Number(profile.coins);
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(M));}catch(_){};if(typeof profile!=='undefined'&&profile){profile.coins=M.coins;if(typeof saveProfile==='function')saveProfile();if(typeof updateCoins==='function')updateCoins();}};
  const toast=t=>{if(typeof notify==='function')notify(t);};
  const quests=[{id:'play',title:'Сыграй 2 матча',goal:2,reward:40},{id:'win',title:'Выиграй матч',goal:1,reward:80},{id:'catch',title:'Поймай 3 блефа',goal:3,reward:60}];
  const achievements=[{id:'first',title:'Первая победа',test:()=>M.wins>=1},{id:'sniper',title:'Снайпер: 5 верных проверок',test:()=>M.checks>=5},{id:'lucky',title:'Везунчик: 3 раза удержался на быке',test:()=>M.survived>=3},{id:'vet',title:'Ветеран: 10 матчей',test:()=>M.matches>=10}];
  const backs=[{id:'b0',name:'Классика',color:0xffffff,cost:0},{id:'b1',name:'Золото',color:0xffd36a,cost:150},{id:'b2',name:'Неон',color:0x66fff0,cost:200},{id:'b3',name:'Кровь',color:0xff6a6a,cost:250}];
  const level=()=>1+Math.floor(Math.sqrt(Math.max(0,M.xp)/100));
  function progress(id){const q=quests.find(x=>x.id===id),n=M.quests[id]||0;if(!q||n>=q.goal)return;M.quests[id]=n+1;if(n+1>=q.goal){M.coins+=q.reward;toast('Задание выполнено: '+q.title+' · +'+q.reward+' 🪙');}}
  function checkAchievements(){achievements.forEach(a=>{if(!M.ach.includes(a.id)&&a.test()){M.ach.push(a.id);M.coins+=50;toast('🏆 '+a.title+' · +50 🪙');}});}
  let lastGame='',lastReveal='',lastRodeo='',lastCallAt=0,hostId=null,settingsRequested=false;
  const call=$('#callBtn');if(call)call.addEventListener('click',()=>{lastCallAt=Date.now();},true);
  socket.on('joined',()=>{settingsRequested=false;});
  socket.on('lobby',l=>{
    hostId=l.hostId;
    const me=(l.players||[]).find(p=>p.id===selfId);
    const host=!!(me&&me.isHost);
    const lobbyPhase=!gameState||gameState.phase==='lobby';
    settingsBox.style.display=host&&lobbyPhase?'flex':'none';
    kickPlayers(l,host&&lobbyPhase);
    if(!settingsRequested){settingsRequested=true;socket.emit('getSettings');}
  });
  socket.on('settings',s=>{
    if(!s)return;
    setting('#metaPlayers',s.maxPlayers);setting('#metaTurn',s.turnSec);setting('#metaAbilities',s.abilities?'1':'0');setting('#metaFall',s.fallMin+'-'+s.fallMax);setting('#metaMode',s.mode||'classic');
    document.body.classList.toggle('noabil',!s.abilities);
  });
  function setting(sel,v){const el=settingsBox.querySelector(sel);if(el)el.value=String(v);}
  socket.on('gameState',st=>{
    if(!st)return;
    if(st.phase==='finished'&&st.gameId&&st.gameId!==lastGame){
      lastGame=st.gameId;if(typeof profile!=='undefined'&&profile)M.coins=Number(profile.coins)||M.coins;const won=st.winnerId===selfId;M.matches++;M.xp+=won?120:50;M.coins+=won?60:20;progress('play');
      if(won){M.wins++;progress('win');}toast(won?'Победа! +120 опыта':'Матч окончен · +50 опыта');checkAchievements();save();
    }
    const lp=st.lastPlay;
    if(lp&&lp.revealed){
      const key=[st.gameId,st.round,lp.playerId,lp.count].join('|');
      if(key!==lastReveal){lastReveal=key;if(lp.playerId!==selfId&&Date.now()-lastCallAt<6000&&Array.isArray(lp.cards)&&lp.cards.some(c=>c.id!==st.table?.id&&c.id!=='b')){M.checks++;M.xp+=15;M.coins+=5;progress('catch');checkAchievements();save();}}
    }else lastReveal='';
    const rodeo=st.rodeo, rk=rodeo?[st.gameId,st.round,rodeo.playerId].join('|'):'';
    if(rk&&rk!==lastRodeo){lastRodeo=rk;if(rodeo.playerId===selfId&&!rodeo.out){M.survived++;M.xp+=20;M.coins+=10;checkAchievements();save();}}
  });

  const overlay=document.createElement('div');overlay.className='overlay';overlay.id='metaProfile';overlay.style.display='none';document.body.append(overlay);
  function drawProfile(){
    const L=level(),floor=(L-1)*(L-1)*100,next=L*L*100,pct=Math.max(0,Math.min(100,Math.round((M.xp-floor)/Math.max(1,next-floor)*100)));
    overlay.innerHTML='<div class="modal"><div class="eyebrow">Профиль игрока</div><h1 style="font-size:34px">УРОВЕНЬ '+L+'</h1><div style="height:10px;border-radius:9px;background:#2a1f16;overflow:hidden;margin:8px 0"><i style="display:block;height:100%;width:'+pct+'%;background:linear-gradient(90deg,#ffd36a,#ff6a9a)"></i></div><p class="intro">Опыт '+M.xp+' / '+next+' · монеты 🪙 '+M.coins+'</p><div class="sectiontitle">Задания дня</div>'+quests.map(q=>'<p class="intro" style="text-align:left;margin:4px 0">'+((M.quests[q.id]||0)>=q.goal?'✅':'⬜')+' '+q.title+' ('+Math.min(q.goal,M.quests[q.id]||0)+'/'+q.goal+') · +'+q.reward+' 🪙</p>').join('')+'<div class="sectiontitle">Достижения</div>'+achievements.map(a=>'<p class="intro" style="text-align:left;margin:4px 0">'+(M.ach.includes(a.id)?'🏆':'🔒')+' '+a.title+'</p>').join('')+'<div class="sectiontitle">Рубашки карт</div><div class="row" id="metaBacks">'+backs.map(b=>'<button class="secondary" data-back="'+b.id+'">'+b.name+'<br><small>'+(M.owned.includes(b.id)?(M.selected===b.id?'✓ надето':'надеть'):b.cost+' 🪙')+'</small></button>').join('')+'</div><button class="primary" id="metaClose" style="width:100%;margin-top:12px">Закрыть</button></div>';
  }
  overlay.addEventListener('click',e=>{
    if(e.target.id==='metaClose'||e.target===overlay){overlay.style.display='none';return;}
    const b=e.target.closest('[data-back]');if(!b)return;const item=backs.find(x=>x.id===b.dataset.back);if(!item)return;
    if(!M.owned.includes(item.id)){if(M.coins<item.cost)return toast('Не хватает монет');M.coins-=item.cost;M.owned.push(item.id);}
    M.selected=item.id;save();drawProfile();
  });
  const profileBtn=document.createElement('button');profileBtn.className='iconbtn';profileBtn.textContent='🏆';profileBtn.title='Профиль и задания';
  profileBtn.onclick=()=>{drawProfile();overlay.style.display='flex';};
  const top=$('.topright');if(top)top.prepend(profileBtn);

  const settingsBox=document.createElement('div');settingsBox.className='row';settingsBox.style.cssText='display:none;flex-wrap:wrap;margin-top:10px';
  settingsBox.innerHTML='<select id="metaPlayers" class="secondary"><option value="4">4 игрока</option><option value="3">3 игрока</option><option value="2">2 игрока</option></select><select id="metaTurn" class="secondary"><option value="15">Ход 15 с</option><option value="30">Ход 30 с</option><option value="60">Ход 60 с</option></select><select id="metaAbilities" class="secondary"><option value="1">Умения: вкл</option><option value="0">Умения: выкл</option></select><select id="metaFall" class="secondary"><option value="2-5">Бык: 2–5</option><option value="1-3">Бык: 1–3</option><option value="4-6">Бык: 4–6</option></select><select id="metaMode" class="secondary" title="Режим карточной партии"><option value="classic">Классика</option><option value="double">Двойной бык</option><option value="chaos">Хаос</option></select>';
  const roomPlayers=$('#roomPlayers');if(roomPlayers)roomPlayers.after(settingsBox);
  settingsBox.addEventListener('change',()=>{
    const [min,max]=settingsBox.querySelector('#metaFall').value.split('-').map(Number);
    socket.emit('setSettings',{maxPlayers:+settingValue('#metaPlayers'),turnSec:+settingValue('#metaTurn'),abilities:settingValue('#metaAbilities')==='1',fallMin:min,fallMax:max,mode:settingValue('#metaMode')});
  });
  function settingValue(sel){return settingsBox.querySelector(sel)?.value||'';}
  function kickPlayers(l,host){
    if(!roomPlayers)return;
    [...roomPlayers.children].forEach((row,i)=>{
      row.querySelector('[data-kick]')?.remove();
      const p=l.players[i];if(!host||!p||p.id===selfId)return;
      const btn=document.createElement('button');btn.className='secondary';btn.dataset.kick=p.id;btn.textContent='✕';btn.title='Удалить из комнаты';btn.style.cssText='flex:0 0 34px;padding:5px;margin-left:5px';
      row.append(btn);
    });
  }
  if(roomPlayers)roomPlayers.addEventListener('click',e=>{const b=e.target.closest('[data-kick]');if(b&&confirm('Убрать игрока из комнаты?'))socket.emit('kick',{id:b.dataset.kick});});
  socket.on('kicked',()=>{settingsBox.style.display='none';toast('Хост убрал тебя из комнаты');});
  const rematch=document.createElement('button');rematch.className='primary';rematch.textContent='🔁 Сыграть снова';rematch.style.cssText='position:fixed;z-index:45;left:50%;bottom:82px;transform:translateX(-50%);display:none;width:auto;white-space:nowrap';
  rematch.onclick=()=>socket.emit('rematch');document.body.append(rematch);

  let spectatorIndex=0;
  const spec=document.createElement('div');spec.style.cssText='position:fixed;z-index:45;left:50%;bottom:16px;transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:6px 10px;border:1px solid #d5a45e;border-radius:999px;background:#100d0beF;color:#ffe6ac;font:800 12px Inter,sans-serif';
  spec.innerHTML='<button class="iconbtn" id="specPrev">◀</button><span id="specName">👁 Наблюдатель</span><button class="iconbtn" id="specNext">▶</button>';document.body.append(spec);
  const spectators=()=>((gameState&&gameState.players)||[]).filter(p=>p.alive&&p.id!==selfId);
  const observing=()=>{const me=(gameState?.players||[]).find(p=>p.id===selfId);return !!(me&&me.alive===false&&['playing','rodeo'].includes(gameState.phase));};
  spec.querySelector('#specPrev').onclick=()=>{const n=spectators().length;spectatorIndex=(spectatorIndex+n-1)%Math.max(1,n);};
  spec.querySelector('#specNext').onclick=()=>{const n=spectators().length;spectatorIndex=(spectatorIndex+1)%Math.max(1,n);};
  const activeRenderer=window.__agroRenderer;
  if(activeRenderer&&typeof activeRenderer.render==='function'){
    const previousRender=activeRenderer.render.bind(activeRenderer);
    activeRenderer.render=function(sc,cam){
      try{
        if(observing()&&cam===camera){
          const list=spectators(),target=list[spectatorIndex%Math.max(1,list.length)],rec=target&&actorModels.get(target.id);
          if(rec){const g=rec.group,dir=new THREE.Vector3(Math.sin(g.rotation.y),0,Math.cos(g.rotation.y));cam.position.set(g.position.x+dir.x*.35,1.68,g.position.z+dir.z*.35);cam.lookAt(g.position.x+dir.x*8,1.55,g.position.z+dir.z*8);cam.updateProjectionMatrix();}
        }
      }catch(_){}
      return previousRender(sc,cam);
    };
  }
  setInterval(()=>{
    const st=typeof gameState!=='undefined'?gameState:null;
    rematch.style.display=st&&st.phase==='finished'&&hostId===selfId?'block':'none';
    spec.style.display=observing()?'flex':'none';
    if(observing()){const list=spectators(),target=list[spectatorIndex%Math.max(1,list.length)];spec.querySelector('#specName').textContent=target?'👁 '+target.name:'👁 Нет игроков';}
    const mat=window.__agroCardBackMaterial||null;
    if(mat&&mat.color){const selected=backs.find(x=>x.id===M.selected)||backs[0];mat.color.setHex(selected.color);}
  },300);
  save();
})();