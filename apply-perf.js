/* apply-perf.js — AGROBULL renderer/scene optimizations.
   Run from the repository root:
     node apply-perf.js
     node apply-perf.js path/to/public
   Each change is independent and idempotent. A backup is written only if a change is made.
   The live game already contains these optimizations; this script keeps them reproducible. */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(process.argv[2] || 'public', 'index.html');
let src = fs.readFileSync(file, 'utf8');
let out = src;

const P = [
  {
    name: 'disable MSAA on high-DPI phones',
    find: 'antialias:!lowPower||((Number(navigator.hardwareConcurrency)||4)>=6&&(Number(navigator.deviceMemory)||4)>=4),alpha:false',
    done: 'antialias:(!lowPower||((Number(navigator.hardwareConcurrency)||4)>=6&&(Number(navigator.deviceMemory)||4)>=4))&&!(/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)&&(devicePixelRatio||1)>=2),alpha:false',
    to: 'antialias:(!lowPower||((Number(navigator.hardwareConcurrency)||4)>=6&&(Number(navigator.deviceMemory)||4)>=4))&&!(/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)&&(devicePixelRatio||1)>=2),alpha:false'
  },
  {
    name: 'use a cheaper shadow filter on low-power devices',
    find: 'renderer.shadowMap.type=THREE.PCFSoftShadowMap;',
    done: 'renderer.shadowMap.type=lowPower?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;',
    to: 'renderer.shadowMap.type=lowPower?THREE.PCFShadowMap:THREE.PCFSoftShadowMap;'
  },
  {
    name: 'cap card texture anisotropy on mobile',
    find: 'tex.encoding=THREE.sRGBEncoding;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());',
    done: 'tex.encoding=THREE.sRGBEncoding;tex.anisotropy=Math.min(lowPowerMode?2:4,renderer.capabilities.getMaxAnisotropy());',
    to: 'tex.encoding=THREE.sRGBEncoding;tex.anisotropy=Math.min(lowPowerMode?2:4,renderer.capabilities.getMaxAnisotropy());'
  },
  {
    name: 'avoid rebuilding an unchanged card pile and share its material',
    find: `function update3dPile(count){
 if(!cardStack)return;
 while(cardStack.children.length){const o=cardStack.children[0];cardStack.remove(o);o.geometry?.dispose?.();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose?.()}
 const n=Math.min(18,Math.max(0,count|0));if(!n)return;
 if(!cardBackMaterial){cardBackMaterial=makeCardBackMaterial();window.__agroCardBackMaterial=cardBackMaterial;}
 for(let i=0;i<n;i++){
   const material=cardBackMaterial.clone();
   const card=mesh(cardStack,new THREE.BoxGeometry(.52,.025,.72),material,[(i%5-2)*.045,i*.018,((i%3)-1)*.035]);
   card.rotation.y=i*.17;card.castShadow=true;
 }
}`,
    done: 'if(cardStack.userData.agroPileCount===n)return;',
    to: `function update3dPile(count){
 if(!cardStack)return;
 const n=Math.min(18,Math.max(0,count|0));
 if(cardStack.userData.agroPileCount===n)return;
 cardStack.userData.agroPileCount=n;
 while(cardStack.children.length){const o=cardStack.children[0];cardStack.remove(o);o.geometry?.dispose?.()}
 if(!n)return;
 if(!cardBackMaterial){cardBackMaterial=makeCardBackMaterial();window.__agroCardBackMaterial=cardBackMaterial;}
 for(let i=0;i<n;i++){
   const card=mesh(cardStack,new THREE.BoxGeometry(.52,.025,.72),cardBackMaterial,[(i%5-2)*.045,i*.018,((i%3)-1)*.035]);
   card.rotation.y=i*.17;card.castShadow=!lowPowerMode;
 }
}`
  },
  {
    name: 'remove per-frame CPU updates of every dust particle',
    find: 'if(dust){dust.rotation.y+=dt*.012;const a=dust.geometry.attributes.position,positions=a.array;for(let i=1;i<positions.length;i+=3){let y=positions[i]+dt*.055;if(y>7)y=0;positions[i]=y}a.needsUpdate=true}',
    done: 'if(dust){dust.rotation.y+=dt*.012;}',
    to: 'if(dust){dust.rotation.y+=dt*.012;}'
  }
];

const log = [];
for (const p of P) {
  if (out.includes(p.done)) {
    log.push('already applied: ' + p.name);
    continue;
  }
  const n = out.split(p.find).length - 1;
  if (n === 0) {
    log.push('skipped (source changed or not found): ' + p.name);
    continue;
  }
  if (n !== 1) {
    log.push('skipped (ambiguous: ' + n + ' matches): ' + p.name);
    continue;
  }
  out = out.replace(p.find, p.to);
  log.push('applied: ' + p.name);
}
console.log(log.join('\\n'));
if (out !== src) {
  fs.writeFileSync(file + '.bak-perf', src);
  fs.writeFileSync(file, out);
  console.log('\\nDone. Backup: ' + file + '.bak-perf');
} else {
  console.log('\\nNo changes needed.');
}
