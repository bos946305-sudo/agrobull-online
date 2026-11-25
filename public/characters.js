/* AGROBULL character replacements: custom Three.js models for Walter White and Jesse Pinkman. */
(function(){
  'use strict';
  const M=(color,roughness=.72,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const add=(p,g,m,pos=[0,0,0],scale=null)=>{const o=new THREE.Mesh(g,m);o.position.set(pos[0],pos[1],pos[2]);if(scale)o.scale.set(scale[0],scale[1],scale[2]);o.castShadow=true;o.receiveShadow=true;p.add(o);return o};
  const ball=(p,m,pos,sc,detail=24)=>add(p,new THREE.SphereGeometry(1,detail,Math.max(12,detail>>1)),m,pos,sc);
  const box=(p,m,pos,sz,rot=0)=>{const o=add(p,new THREE.BoxGeometry(sz[0],sz[1],sz[2]),m,pos);o.rotation.z=rot;return o};
  const rod=(p,a,b,r1,m,r2=r1)=>{const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A);const o=add(p,new THREE.CylinderGeometry(r2,r1,d.length(),14),m);o.position.copy(A.clone().add(B).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return o};
  const tapered=(p,m,x,y,z,rt,rb,h,seg=20)=>add(p,new THREE.CylinderGeometry(rt,rb,h,seg),m,[x,y,z]);
  const colors={classic:{walt:0x513b2a,jesse:0xd7a326},hazmat:{walt:0xb59b27,jesse:0xb99c24},lawyer:{walt:0x702d45,jesse:0x7b394a},neon:{walt:0x087a80,jesse:0x087a80},copper:{walt:0x8b4a2c,jesse:0x8b4a2c},midnight:{walt:0x222b39,jesse:0x222b39}};
  function faceHead(root,opts){
    const h=new THREE.Group();h.position.set(0,1.99,.015);root.add(h);
    const skin=M(opts.skin||0xb98261,.82),skinLight=M(opts.skinLight||0xc58d6d,.78),shadow=M(0x704a3b,.95),hair=M(opts.hair||0x272321,.9),dark=M(0x171719,.5),white=M(0xe9e1d4,.42),iris=M(opts.iris||0x4b3327,.45),lip=M(0x77453e,.86);
    ball(h,skin,[0,0,0],opts.headScale||[.295,.365,.26],36);
    ball(h,skin,[0,-.205,.055],[.22,.155,.205],24);
    for(const s of [-1,1]){
      ball(h,skin,[s*.296,-.015,.015],[.063,.105,.065],18);
      ball(h,shadow,[s*.305,-.014,.052],[.022,.052,.018],12);
      ball(h,shadow,[s*.118,.045,.226],[.091,.061,.026],18);
      ball(h,white,[s*.118,.047,.245],[.067,.035,.015],18);
      ball(h,iris,[s*.118,.045,.259],[.024,.025,.009],14);
      ball(h,dark,[s*.118,.045,.266],[.011,.014,.005],10);
      rod(h,[s*.2,.122,.228],[s*.035,.122,.228],.014,hair,.011);
    }
    ball(h,skinLight,[0,-.042,.265],[.045,.105,.054],18);
    ball(h,skin,[0,-.108,.304],[.061,.042,.045],16);
    ball(h,shadow,[-.033,-.129,.331],[.014,.009,.009],10);ball(h,shadow,[.033,-.129,.331],[.014,.009,.009],10);
    rod(h,[-.064,-.205,.25],[0,-.216,.265],.006,lip,.005);rod(h,[0,-.216,.265],[.064,-.205,.25],.006,lip,.005);
    return {group:h,skin,hair,dark};
  }
  function buildWalter(skinId){
    const root=new THREE.Group(),pal=colors[skinId]||colors.classic;
    const jacket=M(pal.walt,.83),jacketHi=M(0x6a4b34,.82),shirt=M(0x65704a,.88),shirtHi=M(0x838765,.8),pants=M(0x35322b,.9),pantsHi=M(0x51493d,.86),skin=M(0xb98261,.82),shoe=M(0x1c1714,.55),sole=M(0x090909,.85),metal=M(0x9b7742,.4,.55),hat=M(0x111316,.52,.08),beard=M(0x292421,.96);
    for(const s of [-1,1]){
      ball(root,sole,[s*.115,.055,.035],[.105,.038,.17],20);
      ball(root,shoe,[s*.115,.105,.025],[.105,.075,.17],24);
      ball(root,jacketHi,[s*.115,.125,-.075],[.068,.055,.055],16);
      tapered(root,pants,s*.115,.52,-.005,.074,.095,.78,22);
      ball(root,pantsHi,[s*.115,.59,.055],[.075,.026,.025],16);
      rod(root,[s*.115,.25,.07],[s*.115,.82,.075],.002,pantsHi,.002);
    }
    tapered(root,pants,0,.91,0,.18,.19,.23,24);
    tapered(root,jacket,0,1.39,0,.225,.18,.79,28);
    box(root,shirt,[0,1.39,.183],[.255,.64,.035]);
    box(root,shirtHi,[0,1.7,.213],[.23,.065,.025]);
    box(root,shirtHi,[-.073,1.7,.227],[.105,.17,.025],-.45);box(root,shirtHi,[.073,1.7,.227],[.105,.17,.025],.45);
    box(root,jacketHi,[-.152,1.39,.205],[.115,.72,.045],-.035);box(root,jacketHi,[.152,1.39,.205],[.115,.72,.045],.035);
    box(root,metal,[0,1.39,.232],[.009,.59,.008]);
    for(const s of [-1,1]){box(root,jacket,[s*.145,1.48,.235],[.11,.12,.018]);box(root,jacketHi,[s*.145,1.545,.24],[.125,.025,.022]);}
    box(root,jacketHi,[0,1.035,.02],[.37,.07,.26]);
    const staticArms=new THREE.Group();staticArms.name='legacy-static-arms';root.add(staticArms);
    for(const s of [-1,1]){
      const shoulder=[s*.22,1.68,0],elbow=[s*.285,1.32,.035],wrist=[s*.265,1.04,.105];
      rod(staticArms,shoulder,elbow,.105,jacket,.083);ball(staticArms,jacketHi,elbow,[.085,.085,.085],18);
      rod(staticArms,elbow,wrist,.082,jacket,.057);tapered(staticArms,jacketHi,s*.265,1.055,.105,.062,.062,.075,18);
      ball(staticArms,skin,[s*.265,.955,.125],[.065,.085,.075],18);
      for(let i=0;i<4;i++)rod(staticArms,[s*.265+(i-1.5)*.025,.93,.16],[s*.265+(i-1.5)*.028,.875,.17],.012,skin,.009);
      ball(staticArms,skin,[s*.215,.95,.16],[.035,.06,.04],14);
    }
    root.userData.staticArms=staticArms;
    rod(root,[0,1.72,0],[0,1.88,0],.09,skin,.085);
    const f=faceHead(root,{skin:0xb98261,skinLight:0xc58d6d,hair:0x41352e,headScale:[.29,.36,.255],iris:0x473223});
    ball(f.group,f.hair,[-.257,.055,-.025],[.045,.26,.19],22);ball(f.group,f.hair,[.257,.055,-.025],[.045,.26,.19],22);
    tapered(f.group,hat,0,.395,-.015,.215,.215,.045,36);
    tapered(f.group,hat,0,.485,-.015,.145,.155,.17,32);
    tapered(f.group,metal,0,.405,-.015,.151,.151,.012,32);
    const frame=M(0x302c28,.34,.45);
    for(const s of [-1,1]){
      const x=s*.118,y=.045,z=.265,w=.095,h=.064;
      rod(f.group,[x-w,y-h,z],[x+w,y-h,z],.008,frame,.008);
      rod(f.group,[x-w,y+h,z],[x+w,y+h,z],.008,frame,.008);
      rod(f.group,[x-w,y-h,z],[x-w,y+h,z],.008,frame,.008);
      rod(f.group,[x+w,y-h,z],[x+w,y+h,z],.008,frame,.008);
      rod(f.group,[x+s*.095,y,z],[x+s*.23,y-.005,z-.13],.009,frame,.007);
    }
    rod(f.group,[-.025,.045,.267],[.025,.045,.267],.009,frame,.009);
    ball(f.group,beard,[0,-.238,.235],[.13,.10,.07],20);
    ball(f.group,beard,[-.056,-.19,.286],[.075,.027,.03],16);ball(f.group,beard,[.056,-.19,.286],[.075,.027,.03],16);
    ball(f.group,beard,[0,-.285,.272],[.072,.068,.048],18);
    for(let i=0;i<20;i++){const x=(Math.random()-.5)*.25,y=-.22+Math.random()*.08;ball(f.group,beard,[x,y,.268],[.004,.005,.003],6)}
    for(const s of [-1,1])rod(f.group,[s*.2,.14,.23],[s*.07,.16,.25],.012,beard,.009);
    ball(root,metal,[-.155,1.58,.24],[.018,.018,.01],12);
    root.userData.head=f.group;root.userData.headHome=f.group.position.clone();return root;
  }
  function buildJesse(skinId){
    const root=new THREE.Group(),pal=colors[skinId]||colors.classic;
    const hoodie=M(pal.jesse,.9),hoodieHi=M(0xf0c13c,.86),hoodieShade=M(0x9a6b20,.92),tee=M(0x17191d,.92),jeans=M(0x182b42,.92),jeansHi=M(0x29445f,.9),stitch=M(0x8d8064,.85),skin=M(0xc58b69,.82),skinHi=M(0xd29b78,.78),hair=M(0x30271f,.95),hairHi=M(0x4b3a2b,.92),shoe=M(0x222326,.76),sole=M(0xded9cd,.85),white=M(0xeae6dc,.8);
    for(const s of [-1,1]){
      ball(root,sole,[s*.115,.055,.045],[.105,.035,.17],20);
      ball(root,shoe,[s*.115,.115,.04],[.105,.085,.17],22);
      ball(root,white,[s*.115,.16,.115],[.09,.052,.09],18);
      rod(root,[s*.115,.17,.02],[s*.115,.24,.02],.055,shoe,.06);
      for(let j=0;j<3;j++)rod(root,[s*.115-.035,.19+j*.018,.12],[s*.115+.035,.19+j*.018,.12],.004,white,.004);
      tapered(root,jeans,s*.115,.57,-.005,.073,.085,.75,22);
      ball(root,jeansHi,[s*.115,.6,.059],[.07,.035,.018],16);
      rod(root,[s*.115,.27,.075],[s*.115,.84,.075],.002,stitch,.002);
      for(let j=0;j<3;j++)rod(root,[s*.07,.53+j*.025,.07],[s*.16,.52+j*.025,.07],.003,jeansHi,.003);
    }
    tapered(root,jeans,0,.94,0,.185,.19,.24,24);
    tapered(root,tee,0,1.39,0,.205,.17,.74,24);
    tapered(root,hoodie,0,1.39,-.015,.245,.185,.78,28);
    box(root,tee,[0,1.41,.216],[.22,.62,.03]);
    box(root,hoodieHi,[0,1.05,.205],[.37,.21,.035]);
    box(root,hoodieShade,[0,1.15,.226],[.38,.018,.012]);
    const hood=ball(root,hoodieShade,[0,1.78,-.12],[.25,.25,.14],24);hood.rotation.x=-.18;
    const hoodLip=add(root,new THREE.TorusGeometry(.19,.045,12,24),hoodieHi,[0,1.79,.035]);hoodLip.rotation.x=Math.PI/2;
    for(const s of [-1,1]){ball(root,hoodieShade,[s*.075,1.68,.25],[.018,.018,.012],10);rod(root,[s*.075,1.68,.25],[s*.08,1.38,.255],.008,white,.006);}
    const staticArms=new THREE.Group();staticArms.name='legacy-static-arms';root.add(staticArms);
    for(const s of [-1,1]){
      const shoulder=[s*.22,1.68,0],elbow=[s*.30,1.38,.035],wrist=[s*.26,1.08,.11];
      rod(staticArms,shoulder,elbow,.105,hoodie,.085);ball(staticArms,hoodieHi,elbow,[.085,.085,.085],18);
      rod(staticArms,elbow,wrist,.085,hoodie,.061);
      tapered(staticArms,hoodieShade,s*.26,1.075,.11,.064,.064,.07,18);
      ball(staticArms,skin,[s*.26,.98,.13],[.067,.08,.075],18);
      for(let i=0;i<4;i++)rod(staticArms,[s*.26+(i-1.5)*.026,.955,.17],[s*.26+(i-1.5)*.027,.895,.18],.011,skin,.008);
      ball(staticArms,skin,[s*.215,.95,.17],[.032,.052,.04],14);
      rod(staticArms,[s*.25,1.59,.072],[s*.29,1.15,.13],.002,hoodieShade,.002);
    }
    root.userData.staticArms=staticArms;
    rod(root,[0,1.73,0],[0,1.9,0],.082,skin,.078);
    const f=faceHead(root,{skin:0xc58b69,skinLight:0xd29b78,hair:0x30271f,headScale:[.285,.355,.25],iris:0x49372a});
    ball(f.group,hair,[0,.285,-.005],[.30,.12,.265],26);
    ball(f.group,hairHi,[-.18,.23,.09],[.105,.09,.16],18);ball(f.group,hairHi,[.17,.235,.085],[.10,.085,.15],18);
    for(let i=0;i<9;i++){const x=-.22+i*.055,y=.18+Math.sin(i*1.7)*.018;ball(f.group,hair,[x,y,.235],[.035,.055,.032],12);}
    const stubble=M(0x5c4639,.98);
    for(let i=0;i<34;i++){const a=Math.random()*Math.PI*2,x=Math.cos(a)*(.16+Math.random()*.045),y=-.19-Math.random()*.105;ball(f.group,stubble,[x,y,.225+Math.random()*.025],[.004,.005,.003],6);}
    for(const s of [-1,1])ball(f.group,skinHi,[s*.302,-.012,.03],[.025,.056,.03],12);
    root.userData.head=f.group;root.userData.headHome=f.group.position.clone();return root;
  }
  window.AGRO_CUSTOM_CHARACTERS={create:function(character,skin){if(character==='walter')return buildWalter(skin);if(character==='jesse')return buildJesse(skin);return null;}};
})();