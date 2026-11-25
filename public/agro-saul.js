/* AGROBULL Saul Goodman 3D model bridge. The existing procedural Saul remains
   available until the self-contained GLB finishes loading or if loading fails. */
(() => {
  'use strict';
  const MODEL_URL = '/models/Saul_Goodman.glb';
  const LOADER_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
  let template = null;
  let loading = false;
  let failed = false;

  function ensureLoader() {
    if (window.THREE && THREE.GLTFLoader) return Promise.resolve();
    if (window.__agroGltfLoaderPromise) return window.__agroGltfLoaderPromise;
    window.__agroGltfLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = LOADER_URL;
      script.async = true;
      script.onload = () => window.THREE && THREE.GLTFLoader
        ? resolve()
        : reject(new Error('GLTFLoader не зарегистрировался'));
      script.onerror = () => reject(new Error('Не удалось загрузить GLTFLoader'));
      document.head.appendChild(script);
    });
    return window.__agroGltfLoaderPromise;
  }

  function normalize(gltf) {
    const source = gltf.scene || (gltf.scenes && gltf.scenes[0]);
    if (!source) throw new Error('В Saul_Goodman.glb отсутствует сцена');
    source.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source);
    const size = bounds.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y < 1) throw new Error('Некорректная высота модели Сола Гудмана');
    const center = bounds.getCenter(new THREE.Vector3());
    const wrapper = new THREE.Group();
    source.position.x -= center.x;
    source.position.z -= center.z;
    source.position.y -= bounds.min.y;
    source.scale.multiplyScalar(2.35 / size.y);
    wrapper.add(source);
    wrapper.position.y = -0.04;
    wrapper.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach(material => { if (material) material.needsUpdate = true; });
      }
    });
    wrapper.userData.agroSaul = true;
    wrapper.userData.agroGusUpdate = elapsed => {
      if (wrapper.userData.head) wrapper.userData.head.rotation.y = Math.sin(elapsed * 0.42) * 0.018;
    };
    return wrapper;
  }

  async function load() {
    if (loading || template || failed) return;
    loading = true;
    try {
      await ensureLoader();
      const loader = new THREE.GLTFLoader();
      const gltf = await new Promise((resolve, reject) => loader.load(MODEL_URL, resolve, undefined, reject));
      template = normalize(gltf);
      window.AGRO_SAUL_CHARACTER.ready = true;
      if (typeof window.__agroRefreshActors === 'function') window.__agroRefreshActors();
      console.info('AGROBULL: 3D-модель Сола Гудмана загружена');
    } catch (error) {
      failed = true;
      console.warn('AGROBULL: GLB Сола недоступен; используется встроенная 3D-модель.', error);
    } finally {
      loading = false;
    }
  }

  window.AGRO_SAUL_CHARACTER = {
    ready: false,
    create() {
      if (!template) return null;
      const clone = template.clone(true);
      clone.traverse(node => {
        if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
      });
      clone.userData.agroSaul = true;
      clone.userData.head = null;
      clone.userData.agroGusUpdate = template.userData.agroGusUpdate;
      return clone;
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();
