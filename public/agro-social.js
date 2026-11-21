/* AGROBULL SOCIAL — друзья, приглашения и жалобы. Загружается после agro-ranked.js. */
(() => {
  'use strict';
  if (typeof socket === 'undefined' || !socket) return;
  const ST = { menu: '🟢 в сети', lobby: '🟡 в лобби', playing: '🎮 в матче', offline: '⚫ не в сети' };
  let data = null, tab = 'friends', msg = '', open = false;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  document.head.insertAdjacentHTML('beforeend', `<style>
#socO{z-index:67}#socO .row button{flex:1}#socO .tabs button.on{border-color:#ffe08a;box-shadow:0 0 12px #f0b24a88}
#socO .fr{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;background:rgba(255,255,255,.05);margin:4px 0;font:700 12px Inter,sans-serif}
#socO .fr span.n{flex:1;text-align:left}#socO .fr small{opacity:.75;font-weight:600}
#socO .fr button{padding:5px 9px;border-radius:8px;border:1px solid #a9803f;background:#1d1610;color:#f3dfb8;font:800 11px Inter,sans-serif}
#socO input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid #5b4630;background:#17110d;color:#f3e3c3;font:600 14px Inter,sans-serif}
#invT{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 52px);transform:translateX(-50%);z-index:90;display:none;gap:10px;align-items:center;padding:10px 14px;border-radius:14px;background:rgba(18,12,8,.96);border:1px solid #e1ac55;box-shadow:0 14px 40px #000c;font:700 13px Inter,sans-serif;color:#ffe6ac}
#invT button{padding:7px 12px;border-radius:9px;border:1px solid #a9803f;background:#2a211a;color:#f3dfb8;font:800 12px Inter,sans-serif}#invT button.go{background:linear-gradient(180deg,#f7d78c,#c28a3c);color:#2b1807}
#socB{position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;border-radius:8px;background:#ff5a4a;color:#fff;font:800 10px Inter;display:none;place-items:center}
</style>`);
  const o=document.createElement('div');o.className='overlay';o.id='socO';o.style.display='none';document.body.append(o);
  const inv=document.createElement('div');inv.id='invT';document.body.append(inv);
  const btn=document.createElement('button');btn.className='iconbtn';btn.textContent='👥';btn.style.position='relative';btn.title='Друзья';
  btn.innerHTML='👥<span id="socB"></span>';
  const tr=document.querySelector('.topright');if(tr)tr.prepend(btn);
  const refresh=()=>socket.emit('friendsList');
  btn.onclick=()=>{open=true;msg='';draw();o.style.display='flex';refresh();};
  const row=(p,actions)=>`<div class="fr"><span class="n">${esc(p.name)} ${p.status?`<small>${ST[p.status]||''}</small>`:''}</span>${actions}</div>`;
  const b=(a,id,t)=>`<button data-a="${a}" data-id="${esc(id)}">${t}</button>`;
  function draw(){
    const d=data||{friends:[],blocks:[],recent:[]};
    const acc=d.friends.filter(f=>f.state==='accepted'),inc=d.friends.filter(f=>f.state==='in'),out=d.friends.filter(f=>f.state==='out');
    let list='';
    if(tab==='friends')list=acc.length?acc.map(f=>row(f,b('invite',f.id,'Пригласить')+b('report',f.id,'⚑')+b('block',f.id,'⛔')+b('remove',f.id,'✕'))).join(''):'<div class="intro">Друзей пока нет — добавь по нику</div>';
    if(tab==='req')list=(inc.length?inc.map(f=>row(f,b('accept',f.id,'Принять')+b('decline',f.id,'Отклонить'))).join(''):'<div class="intro">Входящих запросов нет</div>')+(out.length?'<div class="sectiontitle">Отправлены</div>'+out.map(f=>row(f,b('remove',f.id,'Отменить'))).join(''):'');
    if(tab==='recent')list=d.recent.length?d.recent.map(f=>row(f,b('invite',f.id,'Пригласить')+b('add',f.name,'＋ в друзья')+b('report',f.id,'⚑')+b('block',f.id,'⛔'))).join(''):'<div class="intro">Здесь появятся соперники по последним матчам</div>';
    if(tab==='block')list=d.blocks.length?d.blocks.map(f=>row(f,b('unblock',f.id,'Разблокировать'))).join(''):'<div class="intro">Чёрный список пуст</div>';
    const T=[['friends','Друзья'],['req',`Запросы${inc.length?' ('+inc.length+')':''}`],['recent','Недавние'],['block','Чёрный список']];
    o.innerHTML=`<div class="modal"><div class="eyebrow">Общение</div><h1 style="font-size:26px">ДРУЗЬЯ</h1>
<div class="row"><input id="sN" placeholder="Ник игрока" maxlength="32"><button class="primary" id="sAdd" style="flex:none;padding:0 16px">Добавить</button></div>
<div class="intro" style="color:#9fe8b2;min-height:16px;max-width:none">${esc(msg)}</div>
<div class="row tabs" style="flex-wrap:wrap">${T.map(([k,t])=>`<button class="secondary ${tab===k?'on':''}" data-t="${k}">${t}</button>`).join('')}</div>
<div style="max-height:34vh;overflow:auto;margin-top:6px">${list}</div><button class="primary" id="sX" style="width:100%;margin-top:8px">Закрыть</button></div>`;
    bind();
  }
  function bind(){
    o.querySelectorAll('[data-t]').forEach(x=>x.onclick=()=>{tab=x.dataset.t;draw();});
    o.querySelector('#sX').onclick=()=>{o.style.display='none';open=false;};
    o.querySelector('#sAdd').onclick=()=>{const n=o.querySelector('#sN').value.trim();if(n)socket.emit('friendRequest',{name:n});};
    o.querySelectorAll('[data-a]').forEach(x=>x.onclick=()=>{
      const a=x.dataset.a,id=x.dataset.id;
      if(a==='invite')socket.emit('inviteFriend',{id});
      else if(a==='add')socket.emit('friendRequest',{name:id});
      else if(a==='accept'||a==='decline')socket.emit('friendRespond',{id,accept:a==='accept'});
      else if(a==='remove')socket.emit('friendRemove',{id});
      else if(a==='block'){if(confirm('Добавить игрока в чёрный список?'))socket.emit('blockUser',{id});}
      else if(a==='unblock')socket.emit('unblockUser',{id});
      else if(a==='report'){const r=prompt('Причина жалобы:\n1 — оскорбления\n2 — читерство\n3 — спам\n4 — другое','1');const k={'1':'abuse','2':'cheat','3':'spam','4':'other'}[String(r||'').trim()];if(k)socket.emit('reportUser',{id,reason:k});}
    });
  }
  let invTimer=null;
  socket.on('friendsData',d=>{data=d;const n=d.friends.filter(f=>f.state==='in').length,s=document.querySelector('#socB');if(s){s.textContent=n;s.style.display=n?'grid':'none';}if(open)draw();});
  socket.on('socialDirty',refresh);
  socket.on('socialInfo',e=>{msg=e.message;if(open)draw();else if(typeof notify==='function')notify(e.message);});
  socket.on('socialError',e=>{msg='';if(typeof notify==='function')notify(e.message);});
  socket.on('friendRequestIn',e=>{if(typeof notify==='function')notify('👥 '+e.fromName+' хочет добавить тебя в друзья');});
  socket.on('inviteIn',e=>{
    inv.innerHTML=`<span>🎮 ${esc(e.fromName)} зовёт в комнату</span><button class="go" id="iY">Принять</button><button id="iN">✕</button>`;inv.style.display='flex';
    inv.querySelector('#iY').onclick=()=>{socket.emit('inviteAccept',{token:e.token,...(typeof emitProfile==='function'?emitProfile():{})});inv.style.display='none';};
    inv.querySelector('#iN').onclick=()=>{socket.emit('inviteDecline',{token:e.token});inv.style.display='none';};
    clearTimeout(invTimer);invTimer=setTimeout(()=>{inv.style.display='none';},60000);
  });
  socket.on('authOk',()=>setTimeout(refresh,300));
  socket.on('connect',()=>setTimeout(refresh,800));
})();