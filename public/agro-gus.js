/* AGROBULL Gus Fring 3D model bridge.
   Loads the self-contained GLB when it is present. The existing procedural Gus
   remains as a safe fallback if the model asset or CDN loader is unavailable. */
(() => {
  'use strict';
  const MODEL_URL = '/models/gustavo_fring_agrobull.glb';
  const LOADER_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
  let modelTemplate = null;
  let loading = false;
  let failed = false;

  function loadLoader() {
    if (window.THREE && THREE.GLTFLoader) return Promise.resolve();
    if (window.__agroGltfLoaderPromise) return window.__agroGltfLoaderPromise;
    window.__agroGltfLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = LOADER_URL;
      script.async = true;
      script.onload = () => THREE && THREE.GLTFLoader ? resolve() : reject(new Error('GLTFLoader не зарегистрировался'));
      script.onerror = () => reject(new Error('Не удалось загрузить GLTFLoader'));
      document.head.appendChild(script);
    });
    return window.__agroGltfLoaderPromise;
  }

  function prepareModel(gltf) {
    const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
    if (!root) throw new Error('В GLB отсутствует сцена');
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y < 0.1) throw new Error('Некорректная высота модели Гуса');
    const center = bounds.getCenter(new THREE.Vector3());
    const wrapper = new THREE.Group();
    const model = root;
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= bounds.min.y;
    model.scale.multiplyScalar(2.35 / size.y);
    wrapper.add(model);
    wrapper.position.y = -0.04;
    wrapper.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach(material => {
          if (material && 'roughness' in material && material.roughness > 0.95) material.roughness = 0.82;
          if (material) material.needsUpdate = true;
        });
      }
      if (!wrapper.userData.head && /head|skull/i.test(node.name || '')) wrapper.userData.head = node;
    });
    wrapper.userData.agroGus = true;
    wrapper.userData.agroGusUpdate = elapsed => {
      if (wrapper.userData.head) wrapper.userData.head.rotation.y = Math.sin(elapsed * 0.48) * 0.025;
    };
    return wrapper;
  }

  async function start() {
    if (loading || modelTemplate || failed) return;
    loading = true;
    try {
      await loadLoader();
      const loader = new THREE.GLTFLoader();
      const gltf = await new Promise((resolve, reject) => loader.load(MODEL_URL, resolve, undefined, reject));
      modelTemplate = prepareModel(gltf);
      window.AGRO_GUS_CHARACTER.ready = true;
      if (typeof window.__agroRefreshActors === 'function') window.__agroRefreshActors();
      console.info('AGROBULL: 3D-модель Гуса Фринга загружена');
    } catch (error) {
      failed = true;
      console.warn('AGROBULL: GLB Гуса пока недоступен; используется встроенная 3D-модель.', error);
    } finally {
      loading = false;
    }
  }

  window.AGRO_GUS_CHARACTER = {
    ready: false,
    create() {
      if (!modelTemplate) return null;
      const clone = modelTemplate.clone(true);
      clone.traverse(node => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      clone.userData.agroGus = true;
      clone.userData.head = clone.getObjectByName('Gus_Head_Skull') || clone.getObjectByName('Guss Head') || null;
      clone.userData.agroGusUpdate = elapsed => {
        if (clone.userData.head) clone.userData.head.rotation.y = Math.sin(elapsed * 0.48) * 0.025;
      };
      return clone;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();