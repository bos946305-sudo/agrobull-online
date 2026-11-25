/* AGROBULL CHARACTER ANIMATION — articulated arms, hands, cards and match reactions.
   Adds a lightweight procedural rig to every seat model, including static GLB characters.
   GLB meshes remain static where they have no skeleton; the overlay limbs are independently articulated. */
(() => {
  'use strict';
  const T=window.THREE;
  if(!T)return;
  const actors=window.__agroActorModels;
  if(!actors)return;

  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
  const shared={};
  const sharedGeometry=(key,make)=>shared[key]||(shared[key]=make());
  const materials={};
  const skinMaterial=()=>materials.skin||(materials.skin=new T.MeshStandardMaterial({color:0xb98261,roughness:.78}));
  const goldMaterial=()=>materials.gold||(materials.gold=new T.MeshBasicMaterial({color:0xd8ad67,side:T.DoubleSide}));
  const cardMaterial=()=>materials.card||(materials.card=new T.MeshBasicMaterial({color:0x682328,side:T.DoubleSide}));
  const cardFaceMaterial=()=>materials.cardFace||(materials.cardFace=new T.MeshBasicMaterial({color:0xf2e5cc,side:T.DoubleSide}));
  const palettes={walter:0x513b2a,jesse:0xd7a326,gus:0x202a36,saul:0x762d49};
  const skinByCharacter={walter:0xb98261,jesse:0xc58b69,gus:0xa97860,saul:0xc58e6b};
  function clothFor(record){
    const char=record.player?.character||'walter';
    const colors={...palettes,...{}};
    const color=colors[char]||({classic:0x513b2a,hazmat:0xb59b27,lawyer:0x702d45,neon:0x087a80,copper:0x8b4a2c,midnight:0x222b39}[record.player?.skin]||0x514034);
    const key='cloth-'+color;
    return materials[key]||(materials[key]=new T.MeshStandardMaterial({color,roughness:.84}));
  }
  function limbMaterial(color){
    const key='limb-'+color;
    return materials[key]||(materials[key]=new T.MeshStandardMaterial({color,roughness:.82}));
  }
  function putSegment(parent,a,b,r1,r2,material){
    const A=new T.Vector3(a[0],a[1],a[2]),B=new T.Vector3(b[0],b[1],b[2]),d=B.clone().sub(A);
    const geo=sharedGeometry('segment-'+r1+'-'+r2,()=>new T.CylinderGeometry(r2,r1,1,10,1,false));
    const m=new T.Mesh(geo,material);
    const length=d.length();
    m.position.copy(A.add(B).multiplyScalar(.5));
    m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.clone().normalize());
    m.scale.y=length;
    m.castShadow=false;m.receiveShadow=false;parent.add(m);
    return m;
  }
  function ball(parent,pos,scale,material,detail=12){
    const geo=sharedGeometry('ball-'+detail,()=>new T.SphereGeometry(1,detail,Math.max(8,detail>>1)));
    const m=new T.Mesh(geo,material);m.position.set(pos[0],pos[1],pos[2]);m.scale.set(scale[0],scale[1],scale[2]);m.castShadow=false;m.receiveShadow=false;parent.add(m);return m;
  }
  function makeFinger(parent,x,y,z,skin,flex){
    const pivot=new T.Group();pivot.position.set(x,y,z);parent.add(pivot);
    putSegment(pivot,[0,0,0],[0,-.052,.035],.014,.011,skin);
    const joint=new T.Group();joint.position.set(0,-.052,.035);pivot.add(joint);
    putSegment(joint,[0,0,0],[0,-.035,.018],.011,.008,skin);
    return {pivot,joint};
  }
  function makeArm(root,side,cloth,skin){
    const shoulder=new T.Group();shoulder.position.set(side*.46,1.72,.1);root.add(shoulder);
    const upperEnd=[side*.115,-.34,.13];
    putSegment(shoulder,[0,0,0],upperEnd,.125,.096,cloth);
    ball(shoulder,upperEnd,[.112,.112,.112],cloth);
    const elbow=new T.Group();elbow.position.set(...upperEnd);shoulder.add(elbow);
    const foreEnd=[-side*.055,-.30,.255];
    putSegment(elbow,[0,0,0],foreEnd,.094,.073,cloth);
    ball(elbow,[0,0,0],[.087,.087,.087],cloth);
    const wrist=new T.Group();wrist.position.set(...foreEnd);elbow.add(wrist);
    // Cuff, palm, thumb and individually hinged fingers.
    const cuff=ball(wrist,[0,-.008,.035],[.083,.073,.07],cloth);
    const palm=ball(wrist,[0,-.018,.095],[.09,.055,.115],skin,14);
    const fingers=[];
    for(let i=0;i<4;i++)fingers.push(makeFinger(wrist,(i-1.5)*.038,-.035,.17,skin));
    const thumb=new T.Group();thumb.position.set(-side*.073,-.012,.09);wrist.add(thumb);
    putSegment(thumb,[0,0,0],[-side*.035,-.025,.09],.022,.016,skin);
    return {shoulder,elbow,wrist,fingers,thumb,palm,cuff,side};
  }
  function makeCardFan(root){
    const fan=new T.Group();fan.name='AGROBULL hand cards';fan.position.set(0,1.075,.59);root.add(fan);
    const cardList=[];
    for(let i=0;i<3;i++){
      const card=new T.Group();
      const border=new T.Mesh(sharedGeometry('fan-border',()=>new T.PlaneGeometry(.245,.355)),goldMaterial());
      const back=new T.Mesh(sharedGeometry('fan-card',()=>new T.PlaneGeometry(.225,.335)),cardMaterial());
      const face=new T.Mesh(sharedGeometry('fan-face',()=>new T.PlaneGeometry(.19,.29)),cardFaceMaterial());
      face.position.z=.004;
      const pip=ball(card,[0,.065,.009],[.022,.022,.006],goldMaterial(),8);
      card.add(border,back,face);
      card.position.set((i-1)*.145,Math.abs(i-1)*-.018,Math.abs(i-1)*-.012);
      card.rotation.z=(i-1)*-.17;
      card.userData.pip=pip;
      fan.add(card);cardList.push(card);
    }
    return {group:fan,cards:cardList};
  }
  function attach(record){
    if(!record||!record.group||record.group.userData.agroAnimRig)return;
    const root=record.group;
    if(root.userData.staticArms)root.userData.staticArms.visible=false;
    // Older Gus-only decorative cards are replaced with the same animated fan used by every actor.
    if(root.userData.gusCards&&root.userData.gusCards.parent){
      const old=root.userData.gusCards;
      old.parent.remove(old);
      old.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material&&!Array.isArray(o.material))o.material.dispose()});
    }
    const cloth=clothFor(record),skin=limbMaterial(skinByCharacter[record.player?.character]||0xb98261);
    const rig=new T.Group();rig.name='AGROBULL articulated character rig';
    // GLB wrappers are normalized by a model-specific scale. Counter-scale the overlay so
    // the hand rig stays in the same world units as the normalized 2.35-unit character.
    const sx=Math.abs(root.scale.x)||1,sy=Math.abs(root.scale.y)||1,sz=Math.abs(root.scale.z)||1;
    rig.scale.set(1/sx,1/sy,1/sz);
    root.add(rig);
    const arms={left:makeArm(rig,-1,cloth,skin),right:makeArm(rig,1,cloth,skin)};
    const cards=makeCardFan(rig);
    const head=root.userData.head||root.getObjectByName('Guss Head')||root.getObjectByName('Gus Head')||root.getObjectByName('Head')||root.getObjectByName('head')||null;
    root.userData.agroAnimRig={rig,arms,cards,head,headHome:head&&head.position?head.position.clone():null};
    record.animState={action:null};
  }
  const rank={idle:0,turn:1,play:2,challenge:3,plea:3,peek:3,react:4,ride:4,cheer:4};
  const duration={turn:650,play:1050,challenge:1150,plea:1450,peek:1200,react:1150,ride:2600,cheer:1800};
  function trigger(playerId,type,params={}){
    const r=actors.get(playerId);if(!r)return;
    attach(r);
    if(!r.animState)r.animState={action:null};
    const current=r.animState.action;
    if(current&&rank[current.type]>rank[type]&&performance.now()-current.start<current.duration*.72)return;
    r.animState.action={type,params,start:performance.now(),duration:duration[type]||900};
  }
  let lastState=null,lastPlayKey='',lastRevealKey='',lastBegKey='',lastRodeoKey='',lastCurrentId=null,lastPhase=null;
  function onState(state){
    if(!state||!Array.isArray(state.players))return;
    if(!lastState){lastState=state;lastCurrentId=state.currentId;lastPhase=state.phase;return;}
    if(state.gameId!==lastState.gameId){lastPlayKey='';lastRevealKey='';lastBegKey='';lastRodeoKey='';}
    const play=state.lastPlay;
    if(play){
      const key=[state.gameId,state.round,state.pileCount,play.playerId,play.count].join(':');
      if(key!==lastPlayKey){lastPlayKey=key;trigger(play.playerId,'play',{count:play.count});}
    }
    const beg=state.begging;
    if(beg&&beg.status==='pending'){
      const key=[beg.id,beg.status].join(':');
      if(key!==lastBegKey){lastBegKey=key;trigger(beg.callerId,'challenge');trigger(beg.fromId,'plea',{nervous:true});}
    }else if(beg&&beg.status==='protected'){
      const key=[beg.id,beg.status].join(':');
      if(key!==lastBegKey){lastBegKey=key;trigger(beg.fromId,'plea');}
    }else if(!beg)lastBegKey='';
    if(state.reveal){
      const rev=state.reveal;
      const key=[rev.playedById,rev.callerId,rev.loserId,rev.isLie?1:0,state.phase].join(':');
      if(key!==lastRevealKey){lastRevealKey=key;trigger(rev.playedById,'react',{kind:rev.isLie?'caught':'cleared'});trigger(rev.callerId,'react',{kind:rev.isLie?'right':'wrong'});}
    }else lastRevealKey='';
    if(state.rodeo){
      const key=[state.rodeo.playerId,state.rodeo.startedAt].join(':');
      if(key!==lastRodeoKey){lastRodeoKey=key;trigger(state.rodeo.playerId,'ride',{out:!!state.rodeo.out});}
      if(state.rodeo.saved&&!lastState.rodeo?.saved)trigger(state.rodeo.playerId,'cheer',{kind:'saved'});
    }else lastRodeoKey='';
    if(state.phase==='finished'&&lastPhase!=='finished')trigger(state.winnerId,'cheer',{kind:'winner'});
    if(state.currentId&&state.currentId!==lastCurrentId&&state.phase==='playing')trigger(state.currentId,'turn');
    lastCurrentId=state.currentId;lastPhase=state.phase;lastState=state;
  }
  function poseArm(arm,elapsed,type,p,side,active){
    const pulse=Math.sin(Math.PI*p),settle=1-smooth(p);
    let sx=-.055+Math.sin(elapsed*1.15+side)*.018, sz=side*.055, ex=-.08, ez=side*.025, wx=0,wz=0;
    if(type==='turn'){sx-=.20*pulse;sz+=side*.10*pulse;ex-=.10*pulse;}
    if(type==='play'){sx-=.55*pulse;sz+=side*.24*pulse;ex-=.44*pulse;wx+=.18*pulse;}
    if(type==='challenge'){sx-=.50*pulse;sz+=side*(side>0?-.24:.30)*pulse;ex-=.26*pulse;wz+=side*.14*pulse;}
    if(type==='plea'){sx-=.18*pulse;sz+=side*.40*pulse;ex-=.36*pulse;ez-=side*.26*pulse;wx-=.16*pulse;}
    if(type==='peek'){sx-=.52*pulse;sz+=side*.18*pulse;ex-=.30*pulse;}
    if(type==='react'){
      const caught=active?.params?.kind==='caught'||active?.params?.kind==='wrong';
      sx+=(-.25-(caught ? .18 : 0))*pulse;sz+=-side*.78*pulse;ex-=.16*pulse;wx+=.14*pulse;
    }
    if(type==='ride'){sx-=.08;sz+=-side*(.75+.16*Math.sin(elapsed*9))*pulse;ex-=.18*pulse;wz+=Math.sin(elapsed*12+side)*.24*pulse;}
    if(type==='cheer'){sx-=.02*pulse;sz+=-side*1.05*pulse;ex-=.42*pulse;wx-=.18*pulse;}
    arm.shoulder.rotation.set(sx,side*.02,sz);
    arm.elbow.rotation.set(ex,0,ez);
    arm.wrist.rotation.set(wx,0,wz);
    const fingerCurl=(type==='play'||type==='plea'||type==='turn') ? .34 : .12;
    arm.fingers.forEach((f,i)=>{f.pivot.rotation.x=fingerCurl*pulse*.55;f.joint.rotation.x=fingerCurl*pulse*.4;});
    arm.thumb.rotation.x=((type==='play'||type==='plea') ? .28 : .08)*pulse;
  }
  function update(now,dt,state){
    if(!state||!Array.isArray(state.players))return;
    // Attach late-loaded GLB models and players who joined after the match began.
    for(const r of actors.values())if(!r.group.userData.agroAnimRig)attach(r);
    for(const [id,r] of actors){
      if(!r.group.userData.agroAnimRig||!r.group.visible)continue;
      const rig=r.group.userData.agroAnimRig,active=r.animState?.action;
      let type='idle',p=1;
      if(active){
        type=active.type;p=clamp((now-active.start)/active.duration);
        if(p>=1){r.animState.action=null;type='idle';p=1;}
      }
      poseArm(rig.arms.left,now/1000,type,p,-1,active);
      poseArm(rig.arms.right,now/1000,type,p,1,active);
      const cardCount=clamp(Number(r.player?.handCount)||0,0,3);
      rig.cards.cards.forEach((card,i)=>{card.visible=i<Math.max(1,cardCount);});
      let z=.59,y=1.075,rx=-.08,rz=Math.sin(now*.0012)*.018;
      if(type==='play'){const k=Math.sin(Math.PI*p);z+=.38*k; y-=.14*k;rx-=.85*k;rz+=.08*k;}
      if(type==='plea'){const k=Math.sin(Math.PI*p);z+=.06*k;y+=.13*k;rz+=.10*k;}
      if(type==='cheer'){const k=Math.sin(Math.PI*p);y+=.15*k;z+=.05*k;}
      if(type==='ride'){const k=Math.sin(now*.009)*.08;y+=k;}
      rig.cards.group.position.set(0,y,z);rig.cards.group.rotation.set(rx,0,rz);
      if(rig.head&&rig.head.rotation){
        const home=rig.headHome||{x:0,y:0,z:0};
        const gesture=active?Math.sin(Math.PI*p):0;
        rig.head.rotation.y=(home.y||0)+Math.sin(now*.0007+id.length)*.035;
        rig.head.rotation.x=(home.x||0)+(type==='plea' ? .08 : 0)*gesture+(type==='react'?-.10*gesture:0);
      }
    }
  }
  window.AGRO_CHARACTER_ANIM={attach,onState,update};
  for(const r of actors.values())attach(r);
})();
