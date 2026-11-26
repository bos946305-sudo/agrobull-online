/* AGROBULL Gustavo Fring — self-contained GLB v2 loader with embedded texture support. */
(() => {
  'use strict';
  const MODEL_URL='/models/Gustavo_Fring%20(3).glb';
  const TYPES={
    5121:{bytes:1,ctor:Uint8Array,read:(v,a)=>v.getUint8(a)},
    5123:{bytes:2,ctor:Uint16Array,read:(v,a)=>v.getUint16(a,true)},
    5125:{bytes:4,ctor:Uint32Array,read:(v,a)=>v.getUint32(a,true)},
    5126:{bytes:4,ctor:Float32Array,read:(v,a)=>v.getFloat32(a,true)}
  };
  const SIZES={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
  let template=null,loading=false,failed=false;

  function parse(buffer){
    if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<20)throw new Error('GLB Гуса пустой или повреждён');
    const h=new DataView(buffer);
    if(h.getUint32(0,true)!==0x46546c67||h.getUint32(4,true)!==2)throw new Error('Ожидался GLB версии 2');
    const total=h.getUint32(8,true);
    if(total<20||total>buffer.byteLength)throw new Error('Неверная длина GLB');
    let offset=12,json=null,binary=null;
    while(offset+8<=total){
      const length=h.getUint32(offset,true),type=h.getUint32(offset+4,true);offset+=8;
      if(offset+length>total)throw new Error('Повреждён блок GLB');
      if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,offset,length)).replace(/[\u0000-\u0020]+$/g,''));
      else if(type===0x004e4942)binary=new Uint8Array(buffer,offset,length);
      offset+=length;
    }
    if(!json||!binary)throw new Error('В GLB отсутствует JSON или BIN-блок');
    return {json,binary};
  }

  function readAccessor(json,binary,index){
    const a=json.accessors&&json.accessors[index];
    const b=a&&json.bufferViews&&json.bufferViews[a.bufferView];
    const t=a&&TYPES[a.componentType],n=a&&SIZES[a.type];
    if(!a||!b||!t||!n||a.sparse)throw new Error('Неподдерживаемый accessor модели Гуса');
    const element=t.bytes*n,stride=b.byteStride||element,start=(b.byteOffset||0)+(a.byteOffset||0);
    const end=a.count?start+(a.count-1)*stride+element:start;
    if(stride<element||start<0||end>binary.byteLength)throw new Error('Повреждены данные геометрии Гуса');
    const out=new t.ctor(a.count*n),view=new DataView(binary.buffer,binary.byteOffset,binary.byteLength);
    for(let row=0;row<a.count;row++)for(let col=0;col<n;col++)out[row*n+col]=t.read(view,start+row*stride+col*t.bytes);
    return {array:out,itemSize:n};
  }

  function loadTexture(json,binary,index){
    const info=json.textures&&json.textures[index];
    const img=info&&json.images&&json.images[info.source];
    const bv=img&&img.bufferView!=null&&json.bufferViews&&json.bufferViews[img.bufferView];
    if(!info||!img||!bv||!img.mimeType)return Promise.reject(new Error('В GLB Гуса не найдена встроенная текстура'));
    const begin=bv.byteOffset||0,end=begin+bv.byteLength;
    if(begin<0||end>binary.byteLength)return Promise.reject(new Error('Повреждён блок текстуры Гуса'));
    const url=URL.createObjectURL(new Blob([binary.slice(begin,end)],{type:img.mimeType}));
    return new Promise((resolve,reject)=>{
      new THREE.TextureLoader().load(url,texture=>{
        URL.revokeObjectURL(url);
        const sampler=(json.samplers||[])[info.sampler]||{};
        texture.flipY=false;
        if('encoding'in texture&&THREE.sRGBEncoding!=null)texture.encoding=THREE.sRGBEncoding;
        const wrap=value=>value===33071?THREE.ClampToEdgeWrapping:value===33648?THREE.MirroredRepeatWrapping:THREE.RepeatWrapping;
        texture.wrapS=wrap(sampler.wrapS);texture.wrapT=wrap(sampler.wrapT);
        texture.magFilter=sampler.magFilter===9728?THREE.NearestFilter:THREE.LinearFilter;
        const filters={9728:THREE.NearestFilter,9729:THREE.LinearFilter,9984:THREE.NearestMipmapNearestFilter,9985:THREE.LinearMipmapNearestFilter,9986:THREE.NearestMipmapLinearFilter,9987:THREE.LinearMipmapLinearFilter};
        texture.minFilter=filters[sampler.minFilter]||THREE.LinearMipmapLinearFilter;
        texture.anisotropy=Math.min(window.__agroLowPowerDevice?2:6,
          window.__agroRenderer&&window.__agroRenderer.capabilities?window.__agroRenderer.capabilities.getMaxAnisotropy():2);
        texture.needsUpdate=true;
        resolve(texture);
      },undefined,error=>{
        URL.revokeObjectURL(url);
        reject(error||new Error('Не удалось декодировать текстуру Гуса'));
      });
    });
  }

  async function buildMaterials(json,binary){
    const list=json.materials||[];
    if(!list.length)return [new THREE.MeshStandardMaterial({color:0xffffff,roughness:.82})];
    return Promise.all(list.map(async data=>{
      const p=data.pbrMetallicRoughness||{},factor=p.baseColorFactor||[1,1,1,1];
      const material=new THREE.MeshStandardMaterial({
        color:new THREE.Color(factor[0],factor[1],factor[2]),
        roughness:Number.isFinite(p.roughnessFactor)?p.roughnessFactor:.82,
        metalness:Number.isFinite(p.metallicFactor)?p.metallicFactor:0,
        opacity:Number.isFinite(factor[3])?factor[3]:1,
        transparent:Number(factor[3])<1,
        side:data.doubleSided?THREE.DoubleSide:THREE.FrontSide
      });
      if(p.baseColorTexture)material.map=await loadTexture(json,binary,p.baseColorTexture.index);
      material.needsUpdate=true;
      return material;
    }));
  }

  async function buildScene(json,binary){
    if(!Array.isArray(json.nodes)||!Array.isArray(json.meshes))throw new Error('В GLB Гуса нет объектов сцены');
    const materials=await buildMaterials(json,binary);
    const fallback=materials[0]||new THREE.MeshStandardMaterial({color:0xffffff});

    function makeGeometry(primitive){
      if(primitive.mode!=null&&primitive.mode!==4)throw new Error('Неподдерживаемый режим геометрии Гуса');
      const geometry=new THREE.BufferGeometry(),attrs=primitive.attributes||{};
      [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv']].forEach(([key,name])=>{
        if(attrs[key]==null)return;
        const attr=readAccessor(json,binary,attrs[key]);
        geometry.setAttribute(name,new THREE.BufferAttribute(attr.array,attr.itemSize));
      });
      if(!geometry.attributes.position)throw new Error('У Гуса отсутствуют координаты вершин');
      if(primitive.indices!=null){
        const indices=readAccessor(json,binary,primitive.indices);
        geometry.setIndex(new THREE.BufferAttribute(indices.array,1));
      }
      if(!geometry.attributes.normal)geometry.computeVertexNormals();
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      return geometry;
    }

    function makeNode(index){
      const data=json.nodes[index];
      if(!data)throw new Error('Повреждён список нод модели Гуса');
      const group=new THREE.Group();
      group.name=data.name||'Gustavo Fring';
      if(data.matrix)new THREE.Matrix4().fromArray(data.matrix).decompose(group.position,group.quaternion,group.scale);
      else{
        if(data.translation)group.position.fromArray(data.translation);
        if(data.rotation)group.quaternion.fromArray(data.rotation);
        if(data.scale)group.scale.fromArray(data.scale);
      }
      if(data.mesh!=null){
        const meshData=json.meshes[data.mesh];
        if(!meshData||!Array.isArray(meshData.primitives))throw new Error('Повреждена сетка модели Гуса');
        meshData.primitives.forEach(primitive=>{
          const mesh=new THREE.Mesh(makeGeometry(primitive),materials[primitive.material==null?0:primitive.material]||fallback);
          mesh.name=meshData.name||data.name||'Gustavo Fring';
          mesh.frustumCulled=false;
          mesh.castShadow=!window.__agroLowPowerDevice;
          mesh.receiveShadow=!window.__agroLowPowerDevice;
          group.add(mesh);
        });
      }
      (data.children||[]).forEach(child=>group.add(makeNode(child)));
      return group;
    }

    const root=new THREE.Group(),active=(json.scenes||[])[json.scene||0];
    root.name='Gustavo Fring';
    const childNodes=new Set();json.nodes.forEach(node=>(node.children||[]).forEach(child=>childNodes.add(child)));const roots=active&&Array.isArray(active.nodes)?active.nodes:json.nodes.map((n,i)=>childNodes.has(i)?-1:i).filter(i=>i>=0);
    roots.forEach(index=>root.add(makeNode(index)));
    return root;
  }

  function normalize(source){
    source.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(source);
    const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    if(!Number.isFinite(size.y)||size.y<.1)throw new Error('Некорректная высота модели Гуса');
    const scale=2.35/size.y,wrapper=new THREE.Group();
    wrapper.scale.setScalar(scale);
    // The offsets use the same scale as the source mesh, so the character stays at its seat.
    wrapper.position.set(-center.x*scale,-bounds.min.y*scale-.04,-center.z*scale);
    wrapper.add(source);
    wrapper.updateMatrixWorld(true);
    wrapper.traverse(node=>{
      if(!node.isMesh)return;
      node.frustumCulled=false;
      node.castShadow=!window.__agroLowPowerDevice;
      node.receiveShadow=!window.__agroLowPowerDevice;
      const mats=Array.isArray(node.material)?node.material:[node.material];
      mats.forEach(material=>{
        if(!material)return;
        material.side=THREE.DoubleSide;
        material.needsUpdate=true;
      });
    });
    wrapper.userData.agroGus=true;
    wrapper.userData.agroGusUpdate=elapsed=>{wrapper.rotation.y=Math.sin(elapsed*.28)*.012;};
    return wrapper;
  }

  const api={
    ready:false,error:null,
    create(){
      if(!template)return null;
      const clone=template.clone(true);
      clone.userData.agroGus=true;
      clone.userData.glb=true;
      // Three lightweight cards held in front of Gus.
      const cardGroup=new THREE.Group();
      cardGroup.name='Gus visible cards';
      const cardMat=new THREE.MeshBasicMaterial({color:0xffedc2,side:THREE.DoubleSide});
      const edgeMat=new THREE.MeshBasicMaterial({color:0xd6a24f,side:THREE.DoubleSide});
      for(let i=0;i<3;i++){
        const card=new THREE.Group();
        const back=new THREE.Mesh(new THREE.PlaneGeometry(.29,.43),cardMat);
        const border=new THREE.Mesh(new THREE.PlaneGeometry(.315,.455),edgeMat);
        border.position.z=-.006;
        card.add(border,back);
        card.position.set((i-1)*.19,0,Math.abs(i-1)*-.018);
        card.rotation.z=(i-1)*-.16;
        cardGroup.add(card);
      }
      cardGroup.position.set(0,1.18,.43);
      cardGroup.rotation.x=-.08;
      clone.add(cardGroup);
      clone.userData.gusCards=cardGroup;
      clone.userData.head=clone.getObjectByName('Guss Head')||clone.getObjectByName('Gus Head')||null;
      clone.userData.agroGusUpdate=elapsed=>{if(clone.userData.head)clone.userData.head.rotation.y=Math.sin(elapsed*.48)*.012;if(clone.userData.gusCards){const cards=clone.userData.gusCards;cards.rotation.z=Math.sin(elapsed*1.15)*.018;cards.position.y=1.18+Math.sin(elapsed*1.8)*.012;}};
      clone.traverse(node=>{
        if(!node.isMesh)return;
        node.frustumCulled=false;
        node.castShadow=!window.__agroLowPowerDevice;
        node.receiveShadow=!window.__agroLowPowerDevice;
      });
      return clone;
    }
  };
  window.AGRO_GUS_CHARACTER=api;

  async function load(){
    if(loading||template||failed||typeof THREE==='undefined')return;
    loading=true;
    try{
      const response=await fetch(MODEL_URL,{cache:'force-cache'});
      if(!response.ok)throw new Error('Не удалось загрузить GLB Гуса: HTTP '+response.status);
      const parsed=parse(await response.arrayBuffer());
      template=normalize(await buildScene(parsed.json,parsed.binary));
      api.ready=true;api.error=null;
      if(typeof window.__agroRefreshActors==='function')window.__agroRefreshActors();
      console.info('AGROBULL: Gustavo Fring GLB with optimized embedded textures loaded');
    }catch(error){
      failed=true;api.error=error&&error.message?error.message:String(error);
      console.error('AGROBULL: Gus GLB failed; procedural fallback remains active:',error);
      if(typeof window.__agroRefreshActors==='function')window.__agroRefreshActors();
    }finally{loading=false;}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});
  else load();
})();
