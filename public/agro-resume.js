/* AGROBULL RESUME — reconnect and network status */
(() => {
  'use strict';
  if (typeof socket === 'undefined' || !socket) return;
  const SESSION='agro_session_v1', DEVICE='agro_device_v1';
  let deviceId;
  try {
    deviceId=localStorage.getItem(DEVICE);
    if(!deviceId){deviceId=crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(36).slice(2);localStorage.setItem(DEVICE,deviceId);}
  } catch (_) { deviceId='temporary-'+Date.now(); }
  const originalProfile=emitProfile;
  emitProfile=function(){return {...originalProfile(),deviceId};};
  const read=()=>{try{const v=JSON.parse(localStorage.getItem(SESSION)||'null');return v&&Date.now()-v.savedAt<15*60*1000?v:null;}catch(_){return null;}};
  const clear=()=>{try{localStorage.removeItem(SESSION);}catch(_){}};
  const rawEmit=socket.emit.bind(socket);
  socket.emit=function(event,...args){if(event==='leaveRoom')clear();return rawEmit(event,...args);};
  socket.on('joined',()=>rawEmit('getSession',{deviceId}));
  socket.on('session',s=>{if(s&&s.code&&s.playerId&&s.token){try{localStorage.setItem(SESSION,JSON.stringify({...s,savedAt:Date.now()}));}catch(_){}}});
  socket.on('rejoinFailed',()=>{clear();if(typeof room!=='undefined')room=null;if(typeof selfId!=='undefined')selfId=null;if(typeof gameState!=='undefined')gameState=null;if(typeof showView==='function')showView('homeView');if(typeof notify==='function')notify('Не удалось вернуть матч: время восстановления истекло');});
  socket.on('replaced',()=>{clear();notify('Сессия открыта на другом устройстве');});
  const style=document.createElement('style');
  style.textContent='#netB{position:fixed;z-index:80;top:calc(env(safe-area-inset-top,0px) + 8px);left:50%;transform:translateX(-50%);display:none;padding:8px 16px;border:1px solid #ff8a78;border-radius:999px;background:#641f1beF;color:#fff;font:800 12px Inter,sans-serif}#netP{position:fixed;z-index:8;right:9px;bottom:8px;padding:4px 8px;border:1px solid #705638;border-radius:999px;background:#100d0bd9;color:#8affc1;font:700 10px Inter,sans-serif;pointer-events:none}';
  document.head.appendChild(style);
  const banner=document.createElement('div');banner.id='netB';banner.textContent='📡 Нет связи — возвращаем тебя в матч';document.body.append(banner);
  const pill=document.createElement('div');pill.id='netP';pill.textContent='📶 проверка связи…';document.body.append(pill);
  let needsResume=false;
  socket.on('disconnect',()=>{needsResume=true;banner.style.display='block';});
  const onConnect=()=>{
    banner.style.display='none';
    const saved=read();
    if(saved&&(!(typeof room!=='undefined'&&room)||needsResume)){needsResume=false;rawEmit('rejoin',{code:saved.code,playerId:saved.playerId,token:saved.token,deviceId});}
  };
  socket.on('connect',onConnect);
  if(socket.connected)onConnect();
  let latency=0,seq=0;const samples=[];
  setInterval(()=>{
    if(!socket.connected){samples.push(0);}
    else{
      const started=performance.now(),id=++seq;let done=false;
      rawEmit('ping2',started,()=>{done=true;latency=Math.round(performance.now()-started);samples.push(1);});
      setTimeout(()=>{if(!done)samples.push(0);},2300);
    }
    while(samples.length>10)samples.shift();
    const loss=samples.length?Math.round(100*(1-samples.reduce((a,b)=>a+b,0)/samples.length)):0;
    pill.textContent='📶 '+latency+' мс · потери '+loss+'%';
    pill.style.color=latency>200||loss>20?'#ff8a78':latency>80?'#ffd36a':'#8affc1';
  },3000);
})();