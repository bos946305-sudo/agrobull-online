'use strict';

const crypto = require('crypto');

const DDL = `
CREATE TABLE IF NOT EXISTS agro_friends (
  a TEXT NOT NULL, b TEXT NOT NULL, requester TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (a,b), CHECK (a < b)
);
CREATE TABLE IF NOT EXISTS agro_blocks (
  blocker TEXT NOT NULL, blocked TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker,blocked), CHECK (blocker <> blocked)
);
CREATE TABLE IF NOT EXISTS agro_reports (
  id BIGSERIAL PRIMARY KEY, reporter TEXT NOT NULL, target TEXT NOT NULL,
  reason TEXT NOT NULL, room_code TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS agro_recent (
  me TEXT NOT NULL, other TEXT NOT NULL, mode TEXT,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (me,other), CHECK (me <> other)
);
CREATE INDEX IF NOT EXISTS agro_recent_me_played_idx ON agro_recent(me,played_at DESC);
CREATE INDEX IF NOT EXISTS agro_reports_created_idx ON agro_reports(created_at DESC);
`;

const pair = (a,b) => [String(a),String(b)].sort();
const pairKey = (a,b) => pair(a,b).join('|');

function createStore(pool) {
  let ready;
  async function q(sql,args=[]) {
    if (!ready) ready = pool.query(DDL).catch(error => { ready = null; throw error; });
    await ready;
    return (await pool.query(sql,args)).rows;
  }
  return {
    findAccount: async name => (await q('SELECT id,name FROM agro_accounts WHERE name_lower=lower($1) LIMIT 1',[name]))[0] || null,
    getName: async id => ((await q('SELECT name FROM agro_accounts WHERE id=$1',[String(id)]))[0] || {}).name || null,
    listFriends: async me => q(`SELECT CASE WHEN f.a=$1 THEN f.b ELSE f.a END AS id,
      f.status,f.requester,a.name FROM agro_friends f
      JOIN agro_accounts a ON a.id=CASE WHEN f.a=$1 THEN f.b ELSE f.a END
      WHERE f.a=$1 OR f.b=$1 ORDER BY f.created_at DESC`,[String(me)]).then(rows => rows.map(r => ({
        id:r.id,name:r.name,state:r.status==='accepted'?'accepted':(r.requester===String(me)?'out':'in')
      }))),
    listBlocks: async me => q('SELECT b.blocked AS id,a.name FROM agro_blocks b JOIN agro_accounts a ON a.id=b.blocked WHERE b.blocker=$1 ORDER BY a.name',[String(me)]),
    recent: async (me,n) => q('SELECT r.other AS id,a.name,r.mode FROM agro_recent r JOIN agro_accounts a ON a.id=r.other WHERE r.me=$1 ORDER BY r.played_at DESC LIMIT $2',[String(me),n]),
    areFriends: async (a,b) => (await q("SELECT 1 FROM agro_friends WHERE a=$1 AND b=$2 AND status='accepted'",pair(a,b))).length>0,
    isBlocked: async (a,b) => (await q('SELECT 1 FROM agro_blocks WHERE (blocker=$1 AND blocked=$2) OR (blocker=$2 AND blocked=$1)',[String(a),String(b)])).length>0,
    wasOpponent: async (a,b) => (await q('SELECT 1 FROM agro_recent WHERE me=$1 AND other=$2',[String(a),String(b)])).length>0,
    addRequest: async (from,to) => {
      const [a,b]=pair(from,to);
      const rows=await q('SELECT requester,status FROM agro_friends WHERE a=$1 AND b=$2',[a,b]);
      const current=rows[0];
      if (!current) { await q("INSERT INTO agro_friends(a,b,requester,status) VALUES($1,$2,$3,'pending')",[a,b,String(from)]); return 'ok'; }
      if (current.status==='pending' && current.requester!==String(from)) {
        await q("UPDATE agro_friends SET status='accepted' WHERE a=$1 AND b=$2",[a,b]); return 'accepted';
      }
      return 'exists';
    },
    respond: async (me,other,accept) => {
      const [a,b]=pair(me,other);
      const rows=accept
        ? await q("UPDATE agro_friends SET status='accepted' WHERE a=$1 AND b=$2 AND status='pending' AND requester<>$3 RETURNING a",[a,b,String(me)])
        : await q("DELETE FROM agro_friends WHERE a=$1 AND b=$2 AND status='pending' AND requester<>$3 RETURNING a",[a,b,String(me)]);
      return rows.length>0;
    },
    remove: async (a,b) => { await q('DELETE FROM agro_friends WHERE a=$1 AND b=$2',pair(a,b)); },
    block: async (me,other) => {
      await q('INSERT INTO agro_blocks(blocker,blocked) VALUES($1,$2) ON CONFLICT DO NOTHING',[String(me),String(other)]);
      await q('DELETE FROM agro_friends WHERE a=$1 AND b=$2',pair(me,other));
    },
    unblock: async (me,other) => { await q('DELETE FROM agro_blocks WHERE blocker=$1 AND blocked=$2',[String(me),String(other)]); },
    report: async (from,to,reason,code) => { await q('INSERT INTO agro_reports(reporter,target,reason,room_code) VALUES($1,$2,$3,$4)',[String(from),String(to),reason,code||null]); },
    recordMatch: async (ids,mode) => {
      for (const me of ids) for (const other of ids) if (me!==other) {
        await q('INSERT INTO agro_recent(me,other,mode) VALUES($1,$2,$3) ON CONFLICT(me,other) DO UPDATE SET mode=EXCLUDED.mode,played_at=NOW()',[me,other,mode]);
      }
    }
  };
}

module.exports = function attachSocial(io,ctx={}) {
  const roomFor=ctx.getRoomForSocket, rooms=ctx.rooms;
  if (typeof roomFor!=='function' || !rooms) throw new TypeError('server-social: нужны getRoomForSocket и rooms');
  const pool=ctx.pool || io.pool;
  if (!pool) {
    console.warn('[social] disabled: PostgreSQL pool is not available');
    return;
  }
  const store=createStore(pool);
  const getAccountId=ctx.getAccountId || (s=>s.data && s.data.accountId);
  const maxPlayers=Number(ctx.maxPlayers)||4;
  const rate=new Map(), invites=new Map();
  const REASONS=new Set(['abuse','cheat','spam','other']);
  const limited=(key,max,windowMs)=>{
    const now=Date.now(), hits=(rate.get(key)||[]).filter(t=>now-t<windowMs);
    if(hits.length>=max){rate.set(key,hits);return true;}
    hits.push(now);rate.set(key,hits);return false;
  };
  const socketsOf=id=>[...io.sockets.sockets.values()].filter(s=>s.connected && String(getAccountId(s)||'')===String(id));
  const active=r=>!!r && ((r.game && r.game.phase!=='finished')||(r.dice&&r.dice.phase!=='finished')||(r.poker&&r.poker.phase!=='finished'));
  const statusOf=id=>{
    const ss=socketsOf(id); if(!ss.length)return 'offline';
    const room=ss.map(roomFor).find(Boolean); return !room?'menu':active(room)?'playing':'lobby';
  };
  const dirty=id=>socketsOf(id).forEach(s=>s.emit('socialDirty'));
  const fail=(s,m)=>s.emit('socialError',{message:m});
  const info=(s,m)=>s.emit('socialInfo',{message:m});
  const account=(s)=>{const id=getAccountId(s);if(!id)fail(s,'Войди в аккаунт');return id?String(id):null;};

  io.on('connection',socket=>{
    const run=fn=>async(...args)=>{try{await fn(...args);}catch(error){console.error('[social]',error&&error.stack||error);fail(socket,'Сервис друзей временно недоступен. Попробуй позже.');}};
    socket.on('friendsList',run(async()=>{
      const me=account(socket);if(!me)return;
      const [friends,blocks,recent]=await Promise.all([store.listFriends(me),store.listBlocks(me),store.recent(me,12)]);
      socket.emit('friendsData',{
        friends:friends.map(f=>({...f,status:f.state==='accepted'?statusOf(f.id):undefined})),
        blocks,recent:recent.map(r=>({...r,status:statusOf(r.id)}))
      });
    }));
    socket.on('friendRequest',run(async(d={})=>{
      const me=account(socket);if(!me)return;
      if(limited('friend:'+me,10,3600000))return fail(socket,'Слишком много запросов. Попробуй позже.');
      const target=await store.findAccount(String(d.name||'').normalize('NFKC').trim().slice(0,32));
      if(!target)return fail(socket,'Игрок с таким ником не найден');
      if(String(target.id)===me)return fail(socket,'Это ты 🙂');
      if(await store.isBlocked(me,target.id))return fail(socket,'Нельзя отправить запрос этому игроку');
      const result=await store.addRequest(me,target.id);
      info(socket,result==='exists'?'Запрос уже отправлен или вы уже друзья':result==='accepted'?'Вы теперь друзья!':'Запрос отправлен: '+target.name);
      if(result==='ok'){
        const fromName=await store.getName(me);
        socketsOf(target.id).forEach(s=>s.emit('friendRequestIn',{fromName}));
      }
      dirty(target.id);dirty(me);
    }));
    socket.on('friendRespond',run(async(d={})=>{
      const me=account(socket);if(!me)return;
      const other=String(d.id||'');if(!other||other===me)return;
      const ok=await store.respond(me,other,!!d.accept);
      if(ok){info(socket,d.accept?'Теперь вы друзья':'Запрос отклонён');dirty(other);dirty(me);}
    }));
    socket.on('friendRemove',run(async(d={})=>{
      const me=account(socket);if(!me)return;
      const other=String(d.id||'');if(!other||other===me)return;
      await store.remove(me,other);dirty(other);dirty(me);
    }));
    socket.on('blockUser',run(async(d={})=>{
      const me=account(socket);if(!me)return;
      const other=String(d.id||'');if(!other||other===me)return;
      if(!await store.getName(other))return fail(socket,'Игрок не найден');
      await store.block(me,other);info(socket,'Игрок добавлен в чёрный список');dirty(other);dirty(me);
    }));
    socket.on('unblockUser',run(async(d={})=>{
      const me=account(socket);if(!me)return;
      const other=String(d.id||'');if(!other)return;
      await store.unblock(me,other);dirty(me);
    }));
    socket.on('reportUser',run(async(d={})=>{
      const me=account(socket);if(!me)return;
      if(limited('report:'+me,5,3600000))return fail(socket,'Лимит жалоб на час исчерпан');
      const other=String(d.id||'');if(!other||other===me)return;
      if(!await store.getName(other))return fail(socket,'Игрок не найден');
      const room=roomFor(socket);
      await store.report(me,other,REASONS.has(d.reason)?d.reason:'other',room&&room.code);
      info(socket,'Жалоба отправлена модераторам. Спасибо!');
    }));
    socket.on('inviteFriend',run(async(d={})=>{
      const me=account(socket);if(!me)return;
      const room=roomFor(socket);
      if(!room||active(room)||room.ranked)return fail(socket,'Пригласить можно только в лобби обычной комнаты');
      if(room.players.length>=maxPlayers)return fail(socket,'В комнате нет свободных мест');
      if(limited('invite:'+me,6,60000))return fail(socket,'Слишком много приглашений. Подожди минуту.');
      const to=String(d.id||'');
      if(!to||to===me||await store.isBlocked(me,to))return fail(socket,'Нельзя пригласить этого игрока');
      if(!(await store.areFriends(me,to))&&!(await store.wasOpponent(me,to)))return fail(socket,'Приглашать можно друзей и недавних соперников');
      const targets=socketsOf(to).filter(s=>!roomFor(s));
      if(!targets.length)return fail(socket,'Игрок не в сети или уже в комнате');
      const token=crypto.randomBytes(16).toString('hex');
      invites.set(token,{from:me,to,code:room.code,at:Date.now()});
      const fromName=await store.getName(me);
      targets.forEach(s=>s.emit('inviteIn',{token,fromName}));
      info(socket,'Приглашение отправлено');
    }));
    socket.on('inviteAccept',run(async(d={})=>{
      const me=account(socket);if(!me)return;
      const token=String(d.token||''),inv=invites.get(token);invites.delete(token);
      if(!inv||inv.to!==me||Date.now()-inv.at>120000)return fail(socket,'Приглашение устарело');
      const room=rooms.get(inv.code);
      if(!room||active(room)||room.ranked||room.players.length>=maxPlayers||roomFor(socket))return fail(socket,'В эту комнату уже не зайти');
      if(!room.players.some(p=>String(p.accountId||'')===inv.from))return fail(socket,'Игрок уже покинул комнату');
      if(await store.isBlocked(me,inv.from))return fail(socket,'Нельзя зайти в эту комнату');
      const handlers=socket.listeners('joinRoom');
      if(!handlers.length)return fail(socket,'Вход в комнату сейчас недоступен');
      handlers[0]({name:d.name,character:d.character,skin:d.skin,deviceId:d.deviceId,code:inv.code});
    }));
    socket.on('inviteDecline',d=>{const token=String(d&&d.token||''),inv=invites.get(token);if(inv&&inv.to===String(getAccountId(socket)||''))invites.delete(token);});
  });

  const timer=setInterval(()=>{
    for(const [token,inv] of invites)if(Date.now()-inv.at>120000)invites.delete(token);
    for(const room of rooms.values()){
      if(!active(room)){delete room._socialRecorded;continue;}
      if(room._socialRecorded)continue;
      room._socialRecorded=true;
      const ids=[...new Set(room.players.map(p=>{
        if(p.accountId)return String(p.accountId);
        const s=io.sockets.sockets.get(p.socketId)||p._sock;return String(getAccountId(s)||'');
      }).filter(Boolean))];
      if(ids.length>=2)store.recordMatch(ids,room.dice?'dice':room.poker?'poker':'cards')
        .catch(error=>console.error('[social] recent match save failed:',error&&error.message||error));
    }
  },2000);
  if(timer.unref)timer.unref();
};
