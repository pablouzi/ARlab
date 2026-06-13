/**
 * AR WebApp Builder — Editor Base
 * Fuente canónica para rebuild.js
 * Three.js r134 (examples/js UMD)
 */

// ============================================================
// STATE
// ============================================================
const state = {
  glbFile: null, glbName: '', glbSize: 0,
  targets: [],
  animClips: [],   // [{name, enabled}] — clips del GLB cargado
  transform: {
    position: { x:0, y:0, z:0 },
    rotation: { x:0, y:0, z:0 },
    scale:    { x:1, y:1, z:1 },
  },
  targetTransform: {
    position: { x:0, y:0, z:0 },
    rotation: { x:-90, y:0, z:0 },
    scale:    { x:1, y:1, z:1 },
  },
  animAutoPlay: 'first',
  tapAction: { type: 'none', target: '' },
  trackingFilter: { minCF: 0.001, beta: 10 },
  scene_options: { autoRotate:false, showShadow:true, showGrid:true, animateModel:true },
  // Luces — state canónico (editor + export)
  lighting: [
    { id:'ambient', type:'ambient',     label:'Ambiental', enabled:true, color:'#ffffff', intensity:0.6 },
    { id:'key',     type:'directional', label:'Principal', enabled:true, color:'#ffffff', intensity:1.2, position:{x:3,y:6,z:3},   shadow:true  },
    { id:'fill',    type:'directional', label:'Relleno',   enabled:true, color:'#00d4ff', intensity:0.3, position:{x:-3,y:2,z:-3},  shadow:false },
    { id:'rim',     type:'directional', label:'Contraluz', enabled:true, color:'#7b5ea7', intensity:0.4, position:{x:0,y:-2,z:-4},  shadow:false },
  ],
};


// ============================================================
// THREE.JS SCENE
// ============================================================
let scene, camera, renderer, controls, currentModel, gridHelper;
let animations = [], mixer = null;
let transformControl = null, raycaster = null, mouse = null;
const clock = new THREE.Clock();
const threeJsLights = {}; // id -> THREE.Light
const threeJsLightHelpers = {}; // id -> THREE.DirectionalLightHelper
const threeJsLightTargets = {}; // id -> THREE.Mesh (esfera)
let targetPlaneMesh = null; // Para previsualizar el target en el editor

function initThree() {
  const canvas    = document.getElementById('three-canvas');
  const container = document.querySelector('.viewport');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060810);

  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.001, 1000);
  camera.position.set(0, 0.5, 2);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  renderer.outputEncoding    = THREE.sRGBEncoding;
  renderer.toneMapping       = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  initLights(); // crea luces desde state.lighting


  gridHelper = new THREE.GridHelper(10, 20, 0x1a1d2e, 0x1a1d2e);
  gridHelper.material.opacity = 0.5; gridHelper.material.transparent = true;
  scene.add(gridHelper);

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.ShadowMaterial({ opacity: 0.4 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.receiveShadow = true; shadowPlane.name = 'shadowPlane';
  scene.add(shadowPlane);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 0.1; controls.maxDistance = 50;
  controls.target.set(0, 0, 0); controls.update();

  // Raycaster y Mouse para selección
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // TransformControls
  transformControl = new THREE.TransformControls(camera, renderer.domElement);
  transformControl.addEventListener('dragging-changed', (e) => {
    controls.enabled = !e.value;
  });
  transformControl.addEventListener('change', () => {
    // Si estamos interactuando activamente con el gizmo (arrastrando)
    if (transformControl.dragging && transformControl.object) {
      const obj = transformControl.object;
      
      if (obj.userData && obj.userData.isLightTarget) {
        // Es una luz
        const lightId = obj.userData.lightId;
        updateLightProp(lightId, 'px', obj.position.x);
        updateLightProp(lightId, 'py', obj.position.y);
        updateLightProp(lightId, 'pz', obj.position.z);
        
        // Actualizar UI de luces
        const pxInp = document.querySelector(`.lc-pos-sl[data-id="${lightId}"][data-axis="px"]`);
        if (pxInp) {
          pxInp.value = obj.position.x; pxInp.nextElementSibling.textContent = obj.position.x.toFixed(1);
          const pyInp = document.querySelector(`.lc-pos-sl[data-id="${lightId}"][data-axis="py"]`);
          pyInp.value = obj.position.y; pyInp.nextElementSibling.textContent = obj.position.y.toFixed(1);
          const pzInp = document.querySelector(`.lc-pos-sl[data-id="${lightId}"][data-axis="pz"]`);
          pzInp.value = obj.position.z; pzInp.nextElementSibling.textContent = obj.position.z.toFixed(1);
        }
      } else {
        // Es modelo o target
        const tr = (obj === currentModel) ? state.transform : state.targetTransform;
        
        tr.position.x = obj.position.x;
        tr.position.y = obj.position.y;
        tr.position.z = obj.position.z;

        tr.rotation.x = THREE.MathUtils.radToDeg(obj.rotation.x);
        tr.rotation.y = THREE.MathUtils.radToDeg(obj.rotation.y);
        tr.rotation.z = THREE.MathUtils.radToDeg(obj.rotation.z);

        tr.scale.x = obj.scale.x;
        tr.scale.y = obj.scale.y;
        tr.scale.z = obj.scale.z;

        syncTransformUI();
      }
    }
  });
  scene.add(transformControl);

  // Escuchar clicks para seleccionar modelo o target
  canvas.addEventListener('pointerdown', onCanvasPointerDown);

  new ResizeObserver(() => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }).observe(container);

  animate();
  document.querySelector('.viewport-empty').style.display = 'flex';
}

// ============================================================
// LUCES — Sistema de iluminación sincronizado editor ↔ export
// ============================================================
function initLights() {
  // Limpiar luces existentes
  Object.values(threeJsLights).forEach(l => { if (l) scene.remove(l); });
  Object.keys(threeJsLights).forEach(k => delete threeJsLights[k]);

  Object.values(threeJsLightHelpers).forEach(h => { if (h) scene.remove(h); });
  Object.keys(threeJsLightHelpers).forEach(k => delete threeJsLightHelpers[k]);

  Object.values(threeJsLightTargets).forEach(t => { if (t) scene.remove(t); });
  Object.keys(threeJsLightTargets).forEach(k => delete threeJsLightTargets[k]);

  state.lighting.forEach(ld => {
    let light;
    if (ld.type === 'ambient') {
      light = new THREE.AmbientLight(ld.color, ld.intensity);
      light.visible = ld.enabled;
      threeJsLights[ld.id] = light;
      scene.add(light);
    } else {
      light = new THREE.DirectionalLight(ld.color, ld.intensity);
      light.position.set(ld.position.x, ld.position.y, ld.position.z);
      if (ld.shadow) {
        light.castShadow = true;
        light.shadow.mapSize.set(2048, 2048);
        light.shadow.camera.top = light.shadow.camera.right = 4;
        light.shadow.camera.bottom = light.shadow.camera.left = -4;
        light.shadow.bias = -0.001;
      }
      light.visible = ld.enabled;
      threeJsLights[ld.id] = light;
      scene.add(light);
      scene.add(light.target);

      // Crear Helper
      const helper = new THREE.DirectionalLightHelper(light, 1.0);
      helper.visible = ld.enabled;
      threeJsLightHelpers[ld.id] = helper;
      scene.add(helper);
      helper.update();

      // Crear Esfera interactiva (Target)
      const sphereGeom = new THREE.SphereGeometry(0.4, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({ color: ld.color, visible: false }); // Invisible pero seleccionable
      const targetMesh = new THREE.Mesh(sphereGeom, sphereMat);
      targetMesh.position.copy(light.position);
      targetMesh.visible = ld.enabled;
      targetMesh.userData = { isLightTarget: true, lightId: ld.id };
      threeJsLightTargets[ld.id] = targetMesh;
      scene.add(targetMesh);
    }
  });
}

function updateLightProp(id, prop, value) {
  const ld = state.lighting.find(l => l.id === id);
  if (!ld) return;
  const tl = threeJsLights[id];
  const th = threeJsLightHelpers[id];
  const tt = threeJsLightTargets[id];

  if (prop === 'enabled') {
    ld.enabled = value;
    if (tl) tl.visible = value;
    if (th) th.visible = value;
    if (tt) tt.visible = value;
  } else if (prop === 'color') {
    ld.color = value;
    if (tl) tl.color.set(value);
    if (th) th.update();
    if (tt) tt.material.color.set(value);
  } else if (prop === 'intensity') {
    ld.intensity = value;
    if (tl) tl.intensity = value;
  } else if (prop === 'shadow') {
    ld.shadow = value;
    if (tl && tl.isDirectionalLight) tl.castShadow = value;
  } else if (prop === 'px') { 
    ld.position.x = value; 
    if(tl) tl.position.x = value; 
    if(th) th.update();
    if(tt) tt.position.x = value;
  } else if (prop === 'py') { 
    ld.position.y = value; 
    if(tl) tl.position.y = value; 
    if(th) th.update();
    if(tt) tt.position.y = value;
  } else if (prop === 'pz') { 
    ld.position.z = value; 
    if(tl) tl.position.z = value; 
    if(th) th.update();
    if(tt) tt.position.z = value;
  }
}

function renderLightsPanel() {
  const container = document.getElementById('lights-list');
  if (!container) return;
  container.innerHTML = '';

  state.lighting.forEach(ld => {
    const isDir = ld.type === 'directional';
    const maxInt = isDir ? 3 : 2;
    const card = document.createElement('div');
    card.className = 'light-card' + (ld.enabled ? ' lc-enabled' : '');
    card.dataset.id = ld.id;

    const posRows = isDir ? `
      <div class="lc-pos-grid">
        <div class="lc-axis">
          <label>X</label>
          <input type="range" class="lc-pos-sl" data-id="${ld.id}" data-axis="px"
                 min="-10" max="10" step="0.5" value="${ld.position.x}">
          <span class="lc-pos-val">${ld.position.x}</span>
        </div>
        <div class="lc-axis">
          <label>Y</label>
          <input type="range" class="lc-pos-sl" data-id="${ld.id}" data-axis="py"
                 min="-10" max="10" step="0.5" value="${ld.position.y}">
          <span class="lc-pos-val">${ld.position.y}</span>
        </div>
        <div class="lc-axis">
          <label>Z</label>
          <input type="range" class="lc-pos-sl" data-id="${ld.id}" data-axis="pz"
                 min="-10" max="10" step="0.5" value="${ld.position.z}">
          <span class="lc-pos-val">${ld.position.z}</span>
        </div>
      </div>` : '';

    const shadowRow = isDir ? `
      <div class="lc-shadow-row">
        <span class="lc-shadow-label">Sombra</span>
        <label class="toggle" style="transform:scale(0.8);transform-origin:right">
          <input type="checkbox" class="lc-shadow-cb" data-id="${ld.id}" ${ld.shadow ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>` : '';

    card.innerHTML = `
      <div class="lc-header">
        <button class="lc-toggle ${ld.enabled ? 'on' : ''}" data-id="${ld.id}">
          <span class="lc-dot"></span>
        </button>
        <label class="lc-swatch" style="background:${ld.color}" title="Color">
          <input type="color" class="lc-color" data-id="${ld.id}" value="${ld.color}">
        </label>
        <span class="lc-label">${ld.label}</span>
        <span class="lc-badge${isDir ? '' : ' amb'}">${isDir ? 'DIR' : 'AMB'}</span>
        <span class="lc-ival">${ld.intensity.toFixed(1)}</span>
      </div>
      <div class="lc-int-row">
        <label class="lc-ilabel">Intensidad</label>
        <input type="range" class="lc-int-sl" data-id="${ld.id}"
               min="0" max="${maxInt}" step="0.05" value="${ld.intensity}">
      </div>
      ${shadowRow}
      ${posRows}
    `;
    container.appendChild(card);
  });

  _bindLightCardEvents(container);
  _updateLightsBadge();
}

function _bindLightCardEvents(container) {
  container.querySelectorAll('.lc-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const ld = state.lighting.find(l => l.id === id);
      updateLightProp(id, 'enabled', !ld.enabled);
      btn.classList.toggle('on', ld.enabled);
      btn.closest('.light-card').classList.toggle('lc-enabled', ld.enabled);
      _updateLightsBadge();
    });
  });

  container.querySelectorAll('.lc-color').forEach(inp => {
    inp.addEventListener('input', e => {
      const id = inp.dataset.id;
      updateLightProp(id, 'color', e.target.value);
      inp.closest('.lc-swatch').style.background = e.target.value;
    });
  });

  container.querySelectorAll('.lc-int-sl').forEach(sl => {
    sl.addEventListener('input', e => {
      const id = sl.dataset.id;
      const val = parseFloat(e.target.value);
      updateLightProp(id, 'intensity', val);
      sl.closest('.light-card').querySelector('.lc-ival').textContent = val.toFixed(1);
    });
  });

  container.querySelectorAll('.lc-shadow-cb').forEach(cb => {
    cb.addEventListener('change', e => {
      updateLightProp(cb.dataset.id, 'shadow', e.target.checked);
    });
  });

  container.querySelectorAll('.lc-pos-sl').forEach(sl => {
    sl.addEventListener('input', e => {
      const val = parseFloat(e.target.value);
      updateLightProp(sl.dataset.id, sl.dataset.axis, val);
      sl.nextElementSibling.textContent = val.toFixed(1);
    });
  });
}

function _updateLightsBadge() {
  const badge = document.getElementById('lights-badge');
  if (!badge) return;
  const total   = state.lighting.length;
  const enabled = state.lighting.filter(l => l.enabled).length;
  badge.textContent = enabled + '/' + total + ' activas';
  badge.style.color = enabled === 0 ? 'var(--accent-error,#f87171)'
                    : enabled === total ? 'var(--accent-cyan)'
                    : 'var(--accent-amber)';
}


function animate() {
  requestAnimationFrame(animate);
  if (mixer && state.scene_options.animateModel) mixer.update(clock.getDelta());
  else clock.getDelta();

  Object.values(threeJsLightHelpers).forEach(h => {
    if (h && h.visible) h.update();
  });

  controls.update();
  renderer.render(scene, camera);
}

function onCanvasPointerDown(event) {
  // Solo interceptar clic principal
  if (event.button !== 0) return;

  const canvas = document.getElementById('three-canvas');
  const rect = canvas.getBoundingClientRect();
  
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  
  const objectsToTest = [];
  if (currentModel) objectsToTest.push(currentModel);
  if (targetPlaneMesh) objectsToTest.push(targetPlaneMesh);
  Object.values(threeJsLightTargets).forEach(lt => { if (lt) objectsToTest.push(lt); });
  
  const intersects = raycaster.intersectObjects(objectsToTest, true);
  
  if (intersects.length > 0) {
    // Buscar la raíz
    let obj = intersects[0].object;
    while (obj.parent && obj !== currentModel && obj !== targetPlaneMesh && !obj.userData.isLightTarget && obj.parent.type !== 'Scene') {
      obj = obj.parent;
    }
    
    if (obj.userData && obj.userData.isLightTarget) {
      activeTransformTarget = 'light_' + obj.userData.lightId;
      transformControl.setMode('translate'); // Luces solo se mueven
      transformControl.attach(obj);
      // Opcional: enfocar o expandir el panel de iluminación
    } else if (obj === currentModel) {
      document.getElementById('btn-transform-model')?.click(); // actualiza UI y estado
      transformControl.attach(currentModel);
    } else if (obj === targetPlaneMesh) {
      document.getElementById('btn-transform-target')?.click(); // actualiza UI y estado
      transformControl.attach(targetPlaneMesh);
    }
  } else {
    // Si hace clic fuera y NO está arrastrando el gizmo
    if (!transformControl.dragging) {
      transformControl.detach();
    }
  }
}

// ============================================================
// GLB LOADING
// ============================================================
function loadGLB(file) {
  const url = URL.createObjectURL(file);
  showLoading('Cargando modelo 3D…');
  new THREE.GLTFLoader().load(url,
    (gltf) => {
      hideLoading();
      document.querySelector('.viewport-empty').style.display = 'none';
      if (currentModel) { scene.remove(currentModel); mixer = null; animations = []; }

      const model = gltf.scene;
      const box   = new THREE.Box3().setFromObject(model);
      const size  = box.getSize(new THREE.Vector3());
      const sc    = 1 / Math.max(size.x, size.y, size.z);
      model.scale.multiplyScalar(sc);
      model.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(sc));
      const box2 = new THREE.Box3().setFromObject(model);
      model.position.y -= box2.min.y;
      model.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });

      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        animations = gltf.animations;
        renderAnimationsList(gltf.animations);   // inicializa state.animClips
        // Crear y arrancar TODAS las acciones desde el inicio
        animations.forEach(clip => mixer.clipAction(clip).play());
        // Luego aplicar estado activo/pausado segun checkboxes
        _syncAnimPlayback();
      } else { renderAnimationsList([]); }


      scene.add(model); currentModel = model;
      state.transform = { position:{x:0,y:0,z:0}, rotation:{x:0,y:0,z:0}, scale:{x:sc,y:sc,z:sc} };

      const sphere = box2.getBoundingSphere(new THREE.Sphere());
      camera.position.set(sphere.center.x + sphere.radius*2, sphere.center.y + sphere.radius*1.5, sphere.center.z + sphere.radius*2);
      controls.target.copy(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()));
      controls.update();
      syncTransformUI(); updateFooterStatus();
      showToast('✅ Modelo GLB cargado', 'success');
      URL.revokeObjectURL(url);
    },
    (p) => showLoading(`Cargando… ${(p.loaded/(p.total||1)*100).toFixed(0)}%`),
    (e) => { hideLoading(); console.error(e); showToast('❌ Error al cargar el modelo', 'error'); }
  );
}

// ============================================================
// ANIMACIONES — Lista de clips con checkboxes
// ============================================================
function renderAnimationsList(list) {
  state.animClips = list.map(a => ({ name: a.name || 'Clip sin nombre', enabled: true }));
  updateTapAnimOptions(state.animClips);
  updateAutoPlayAnimOptions(state.animClips);
  document.querySelector('.anim-section').style.display = list.length ? 'block' : 'none';
  _renderAnimCheckboxes();
  _updateAnimBadge();
}

function _updateAnimBadge() {
  const badge = document.getElementById('anim-count-badge');
  if (!badge) return;
  const total   = state.animClips.length;
  const enabled = state.animClips.filter(c => c.enabled).length;
  badge.textContent = enabled + '/' + total + ' activas';
  badge.style.color = enabled === 0 ? 'var(--accent-error, #f87171)' :
                      enabled === total ? 'var(--accent-cyan)' : 'var(--accent-amber)';
}

function _renderAnimCheckboxes() {
  const container = document.getElementById('anim-list');
  if (!container) return;
  container.innerHTML = '';

  state.animClips.forEach((clip, i) => {
    const row = document.createElement('div');
    row.className = 'anim-clip-row' + (clip.enabled ? ' enabled' : '');
    row.innerHTML =
      '<label class="anim-clip-label">' +
        '<input type="checkbox" class="anim-clip-cb" data-idx="' + i + '"' + (clip.enabled ? ' checked' : '') + '>' +
        '<span class="anim-clip-pip"></span>' +
        '<span class="anim-clip-name">' + clip.name + '</span>' +
      '</label>';
    row.querySelector('input').addEventListener('change', e => {
      state.animClips[i].enabled = e.target.checked;
      row.classList.toggle('enabled', e.target.checked);
      _updateAnimBadge();
      _syncAnimPlayback();
    });
    container.appendChild(row);
  });
}

function _syncAnimPlayback() {
  if (!mixer || !animations.length) return;
  animations.forEach((clip, i) => {
    const action = mixer.clipAction(clip);
    const shouldPlay = (state.animClips[i]?.enabled ?? false) && state.scene_options.animateModel;
    if (shouldPlay) {
      // Re-activar si fue detenida completamente
      if (!action.isRunning()) {
        action.reset();
        action.play();
      }
      action.paused = false;
    } else {
      action.paused = true;
    }
  });
}

function getAnimButtons(addAnimButtons, clips, autoPlay = 'first') {
  var active = clips.filter(c => c.enabled);
  if (active.length === 0) return { css: '', html: '', js: '' };
  
  var css = '.ar-ui{position:fixed;bottom:40px;left:50%;transform:translateX(-50%);display:flex;gap:12px;z-index:9999;max-width:90vw;overflow-x:auto;padding:12px 16px;background:rgba(20,20,25,0.6);border:1px solid rgba(255,255,255,0.1);border-radius:24px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,0.3);scrollbar-width:none;}.ar-ui::-webkit-scrollbar{display:none;}.ar-btn{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.8);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:10px 20px;font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap;transition:all 0.3s cubic-bezier(0.4,0,0.2,1);}.ar-btn.active{background:rgba(0,212,255,0.15);color:#00d4ff;border-color:rgba(0,212,255,0.4);box-shadow:0 0 15px rgba(0,212,255,0.2);}.ar-btn:active{transform:scale(0.95);}.ar-btn-stop{color:#ff6b6b;border-color:rgba(255,107,107,0.2);}.ar-btn-stop:hover{background:rgba(255,107,107,0.1);border-color:rgba(255,107,107,0.4);}';
  
  var html = '';
  if (addAnimButtons) {
    html += '<div class="ar-ui">\n';
    active.forEach((c, idx) => {
      var isActive = false;
      if (autoPlay === 'all') isActive = true;
      else if (autoPlay === 'first' && idx === 0) isActive = true;
      else if (autoPlay === c.name) isActive = true;
      
      var cls = isActive ? 'ar-btn anim-toggle active' : 'ar-btn anim-toggle';
      html += '  <button class="' + cls + '" data-clip="' + c.name.replace(/'/g, "\\'") + '" onclick="toggleAnim(this, \'' + c.name.replace(/'/g, "\\'") + '\')">' + c.name + '</button>\n';
    });
    html += '  <button class="ar-btn ar-btn-stop" onclick="stopAnim()"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:4px;margin-top:-2px"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>Detener</button>\n</div>\n';
  } else {
    // Si no hay botones, creamos elementos ocultos para que el JS sepa qué reproducir al inicio
    html += '<div style="display:none;">\n';
    active.forEach((c, idx) => {
      var isActive = false;
      if (autoPlay === 'all') isActive = true;
      else if (autoPlay === 'first' && idx === 0) isActive = true;
      else if (autoPlay === c.name) isActive = true;
      if (isActive) {
        html += '  <span class="ar-btn anim-toggle active" data-clip="' + c.name.replace(/'/g, "\\'") + '"></span>\n';
      }
    });
    html += '</div>\n';
  }
  
  var js = `AFRAME.registerComponent('ar-anim-controller', {
  init: function() {
    this.mixer = null;
    this.actions = {};
    this.el.addEventListener('model-loaded', () => {
      const mesh = this.el.getObject3D('mesh');
      if (mesh && mesh.animations && mesh.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(mesh);
        mesh.animations.forEach(clip => {
          const action = this.mixer.clipAction(clip);
          action.play();
          action.paused = true;
          this.actions[clip.name] = action;
        });
        document.querySelectorAll('.ar-btn.anim-toggle.active').forEach(b => {
          const n = b.getAttribute('data-clip');
          if (this.actions[n]) this.actions[n].paused = false;
        });
      }
    });
  },
  tick: function(t, dt) {
    if (this.mixer) this.mixer.update(dt / 1000);
  },
  toggle: function(name, active) {
    const action = this.actions[name];
    if (action) {
      if (active && !action.isRunning()) { action.reset(); action.play(); }
      action.paused = !active;
    }
  },
  stopAll: function() {
    Object.values(this.actions).forEach(action => {
      action.paused = true;
      action.reset();
    });
  }
});

function toggleAnim(btn, n) {
  var e = document.querySelector("[gltf-model]");
  if (!e || !e.components['ar-anim-controller']) return;
  btn.classList.toggle('active');
  var isActive = btn.classList.contains('active');
  e.components['ar-anim-controller'].toggle(n, isActive);
}

function stopAnim() {
  var e = document.querySelector("[gltf-model]");
  if (!e || !e.components['ar-anim-controller']) return;
  document.querySelectorAll(".ar-btn.anim-toggle").forEach(b => b.classList.remove("active"));
  e.components['ar-anim-controller'].stopAll();
}`;
  
  return { css, html, js };
}


// ============================================================
// TRANSFORM
// ============================================================
let activeTransformTarget = 'model'; // 'model' or 'target'

function applyTransform() {
  if (currentModel) {
    const t = state.transform;
    currentModel.position.set(t.position.x, t.position.y, t.position.z);
    currentModel.rotation.set(THREE.MathUtils.degToRad(t.rotation.x), THREE.MathUtils.degToRad(t.rotation.y), THREE.MathUtils.degToRad(t.rotation.z));
    currentModel.scale.set(t.scale.x, t.scale.y, t.scale.z);
  }
  if (targetPlaneMesh) {
    const t = state.targetTransform;
    targetPlaneMesh.position.set(t.position.x, t.position.y, t.position.z);
    targetPlaneMesh.rotation.set(THREE.MathUtils.degToRad(t.rotation.x), THREE.MathUtils.degToRad(t.rotation.y), THREE.MathUtils.degToRad(t.rotation.z));
    targetPlaneMesh.scale.set(t.scale.x, t.scale.y, t.scale.z);
  }
}

function syncTransformUI() {
  const t = activeTransformTarget === 'model' ? state.transform : state.targetTransform;
  ['x','y','z'].forEach(ax => {
    const v = (id) => document.getElementById(id);
    if (v(`pos-${ax}`))    v(`pos-${ax}`).value    = t.position[ax].toFixed(3);
    if (v(`pos-${ax}-sl`)) v(`pos-${ax}-sl`).value = t.position[ax];
    if (v(`rot-${ax}`))    v(`rot-${ax}`).value    = t.rotation[ax].toFixed(1);
    if (v(`rot-${ax}-sl`)) v(`rot-${ax}-sl`).value = t.rotation[ax];
    if (v(`scl-${ax}`))    v(`scl-${ax}`).value    = t.scale[ax].toFixed(3);
  });
  const u = document.getElementById('scl-uni');
  if (u) u.value = t.scale.x.toFixed(3);
}

function bindTransformControls() {
  document.getElementById('btn-transform-model')?.addEventListener('click', e => {
    activeTransformTarget = 'model';
    e.target.style.background = 'var(--bg-card)'; e.target.style.color = '#fff'; e.target.style.borderColor = 'var(--border-light)';
    const bt = document.getElementById('btn-transform-target'); if(bt){ bt.style.background = 'transparent'; bt.style.color = 'var(--text-muted)'; bt.style.borderColor = 'transparent'; }
    syncTransformUI();
  });
  document.getElementById('btn-transform-target')?.addEventListener('click', e => {
    activeTransformTarget = 'target';
    e.target.style.background = 'var(--bg-card)'; e.target.style.color = '#fff'; e.target.style.borderColor = 'var(--border-light)';
    const bm = document.getElementById('btn-transform-model'); if(bm){ bm.style.background = 'transparent'; bm.style.color = 'var(--text-muted)'; bm.style.borderColor = 'transparent'; }
    syncTransformUI();
  });

  ['x','y','z'].forEach(ax => {
    const bind = (inputId, sliderId, prop) => {
      const inp = document.getElementById(inputId);
      const sl  = document.getElementById(sliderId);
      inp?.addEventListener('input', () => { 
        const tr = activeTransformTarget === 'model' ? state.transform : state.targetTransform;
        tr[prop][ax] = parseFloat(inp.value)||0; if(sl) sl.value=tr[prop][ax]; applyTransform(); 
      });
      sl?.addEventListener('input',  () => { 
        const tr = activeTransformTarget === 'model' ? state.transform : state.targetTransform;
        tr[prop][ax] = parseFloat(sl.value); if(inp) inp.value=tr[prop][ax].toFixed(prop==='rotation'?1:3); applyTransform(); 
      });
    };
    bind(`pos-${ax}`, `pos-${ax}-sl`, 'position');
    bind(`rot-${ax}`, `rot-${ax}-sl`, 'rotation');
    document.getElementById(`scl-${ax}`)?.addEventListener('input', e => { 
      const tr = activeTransformTarget === 'model' ? state.transform : state.targetTransform;
      tr.scale[ax]=parseFloat(e.target.value)||0.01; applyTransform(); 
    });
  });
  document.getElementById('scl-uni')?.addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    const tr = activeTransformTarget === 'model' ? state.transform : state.targetTransform;
    tr.scale = {x:v,y:v,z:v};
    ['x','y','z'].forEach(ax => { const i = document.getElementById(`scl-${ax}`); if(i) i.value=v.toFixed(3); });
    applyTransform();
  });
  document.getElementById('reset-position')?.addEventListener('click', () => { 
    const tr = activeTransformTarget === 'model' ? state.transform : state.targetTransform;
    tr.position={x:0,y:0,z:0}; syncTransformUI(); applyTransform(); 
  });
  document.getElementById('reset-rotation')?.addEventListener('click', () => { 
    const tr = activeTransformTarget === 'model' ? state.transform : state.targetTransform;
    tr.rotation = activeTransformTarget === 'model' ? {x:0,y:0,z:0} : {x:-90,y:0,z:0}; 
    syncTransformUI(); applyTransform(); 
  });
  document.getElementById('reset-scale')?.addEventListener('click',    () => { 
    const tr = activeTransformTarget === 'model' ? state.transform : state.targetTransform;
    tr.scale={x:1,y:1,z:1}; syncTransformUI(); applyTransform(); 
  });
}

function bindTrackingFilters() {
  const minCFInp = document.getElementById('ar-filter-min-cf');
  const minCFSl = document.getElementById('ar-filter-min-cf-sl');
  const betaInp = document.getElementById('ar-filter-beta');
  const betaSl = document.getElementById('ar-filter-beta-sl');

  if (minCFInp && minCFSl) {
    minCFInp.addEventListener('input', () => { state.trackingFilter.minCF = parseFloat(minCFInp.value) || 0.001; minCFSl.value = state.trackingFilter.minCF; });
    minCFSl.addEventListener('input', () => { state.trackingFilter.minCF = parseFloat(minCFSl.value); minCFInp.value = state.trackingFilter.minCF; });
  }

  if (betaInp && betaSl) {
    betaInp.addEventListener('input', () => { state.trackingFilter.beta = parseFloat(betaInp.value) || 0; betaSl.value = state.trackingFilter.beta; });
    betaSl.addEventListener('input', () => { state.trackingFilter.beta = parseFloat(betaSl.value); betaInp.value = state.trackingFilter.beta; });
  }
}

function bindTapActionControls() {
  const typeSelect = document.getElementById('ar-tap-action');
  const urlContainer = document.getElementById('ar-tap-target-url-container');
  const animContainer = document.getElementById('ar-tap-target-anim-container');
  const urlInput = document.getElementById('ar-tap-target-url');
  const animSelect = document.getElementById('ar-tap-target-anim');

  if (typeSelect) {
    typeSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      state.tapAction.type = val;
      urlContainer.style.display = val === 'url' ? 'block' : 'none';
      animContainer.style.display = val === 'anim' ? 'block' : 'none';
      
      if (val === 'url') state.tapAction.target = urlInput.value;
      else if (val === 'anim') state.tapAction.target = animSelect.value;
      else state.tapAction.target = '';
    });
  }
  if (urlInput) {
    urlInput.addEventListener('input', (e) => {
      if (state.tapAction.type === 'url') state.tapAction.target = e.target.value;
    });
  }
  if (animSelect) {
    animSelect.addEventListener('change', (e) => {
      if (state.tapAction.type === 'anim') state.tapAction.target = e.target.value;
    });
  }
}

function updateTapAnimOptions(clips) {
  const animSelect = document.getElementById('ar-tap-target-anim');
  if (!animSelect) return;
  animSelect.innerHTML = '';
  if (!clips || clips.length === 0) {
    animSelect.innerHTML = '<option value="">(No hay animaciones)</option>';
    if (state.tapAction.type === 'anim') state.tapAction.target = '';
    return;
  }
  clips.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = c.name;
    animSelect.appendChild(opt);
  });
  if (state.tapAction.type === 'anim') state.tapAction.target = animSelect.value;
}

function updateAutoPlayAnimOptions(clips) {
  const autoSelect = document.getElementById('ar-anim-autoplay');
  if (!autoSelect) return;
  autoSelect.innerHTML = '';
  const optAll = document.createElement('option'); optAll.value = 'all'; optAll.textContent = 'Todas a la vez';
  const optNone = document.createElement('option'); optNone.value = 'none'; optNone.textContent = 'Ninguna (estático)';
  const optFirst = document.createElement('option'); optFirst.value = 'first'; optFirst.textContent = 'Primera de la lista';
  autoSelect.appendChild(optAll);
  autoSelect.appendChild(optNone);
  autoSelect.appendChild(optFirst);
  
  if (clips && clips.length > 0) {
    clips.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = `Solo: ${c.name}`;
      autoSelect.appendChild(opt);
    });
  }
  autoSelect.value = state.animAutoPlay;
}

function bindAnimControls() {
  // Toggle preview playback
  document.getElementById('toggle-anim')?.addEventListener('change', e => {
    state.scene_options.animateModel = e.target.checked;
    _syncAnimPlayback();
  });

  // Select All
  document.getElementById('btn-anim-all')?.addEventListener('click', () => {
    state.animClips.forEach(c => c.enabled = true);
    document.querySelectorAll('.anim-clip-cb').forEach(cb => cb.checked = true);
    document.querySelectorAll('.anim-clip-row').forEach(r => r.classList.add('enabled'));
    _updateAnimBadge();
    _syncAnimPlayback();
  });

  // Select None
  document.getElementById('btn-anim-none')?.addEventListener('click', () => {
    state.animClips.forEach(c => c.enabled = false);
    document.querySelectorAll('.anim-clip-cb').forEach(cb => cb.checked = false);
    document.querySelectorAll('.anim-clip-row').forEach(r => r.classList.remove('enabled'));
    _updateAnimBadge();
    _syncAnimPlayback();
  });
}


function bindSceneOptions() {
  document.getElementById('toggle-autorotate')?.addEventListener('change', e => { controls.autoRotate = e.target.checked; });
  document.getElementById('toggle-grid')?.addEventListener('change',       e => { gridHelper.visible = e.target.checked; });
  document.getElementById('toggle-shadow')?.addEventListener('change',     e => { const p = scene.getObjectByName('shadowPlane'); if(p) p.visible = e.target.checked; });
  document.getElementById('bg-color')?.addEventListener('input',           e => { scene.background=new THREE.Color(e.target.value); document.getElementById('bg-color-hex').textContent=e.target.value; });
  document.getElementById('ar-scale')?.addEventListener('change',          e => { state.scene_options.arScale = e.target.value; });

  const autoSelect = document.getElementById('ar-anim-autoplay');
  if (autoSelect) {
    autoSelect.addEventListener('change', (e) => {
      state.animAutoPlay = e.target.value;
    });
  }
}


// ============================================================
// DROP ZONES
// ============================================================
function initDropZones() {
  const glbZone  = document.getElementById('drop-glb');
  const glbInput = document.getElementById('input-glb');
  glbZone.addEventListener('click', () => { glbInput.value=''; glbInput.click(); });
  glbInput.addEventListener('change', e => { const f=e.target.files&&e.target.files[0]; if(f) handleGLBFile(f); });
  setupDropZone(glbZone, f => { if(/\.(glb|gltf)$/i.test(f.name)) handleGLBFile(f); else showToast('⚠️ Solo .glb o .gltf','error'); });

  const tZone  = document.getElementById('drop-target');
  const tInput = document.getElementById('input-target');
  tZone.addEventListener('click', () => { tInput.value=''; tInput.click(); });
  tInput.addEventListener('change', e => { Array.from(e.target.files||[]).forEach(f=>handleTargetFile(f)); });
  setupDropZone(tZone, f => { if(f.type.startsWith('image/')) handleTargetFile(f); else showToast('⚠️ Solo imágenes','error'); });
}

function setupDropZone(zone, onDrop) {
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); const f=e.dataTransfer.files[0]; if(f) onDrop(f); });
}

function handleGLBFile(file) {
  state.glbFile=file; state.glbName=file.name; state.glbSize=file.size;
  renderGLBCard(file); loadGLB(file);
}
function handleTargetFile(file) {
  state.targets.push({ file, url:URL.createObjectURL(file), name:file.name, size:file.size });
  renderTargetsList(); updateFooterStatus();
  updateTargetPlane();
  showToast(`🎯 Target "${file.name}" agregado`, 'success');
}
function renderGLBCard(file) {
  document.getElementById('glb-asset-container').innerHTML = `
    <div class="asset-card">
      <div class="asset-thumb"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>
      <div class="asset-info"><div class="asset-name">${file.name}</div><div class="asset-meta">${formatSize(file.size)} · GLB</div></div>
      <button class="asset-remove" onclick="removeGLB()"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>`;
}
function renderTargetsList() {
  const c = document.getElementById('targets-list'); c.innerHTML='';
  state.targets.forEach((t,i) => {
    const d = document.createElement('div'); d.className='asset-card';
    d.innerHTML=`<div class="asset-thumb"><img src="${t.url}" style="width:100%;height:100%;object-fit:cover;border-radius:4px"></div>
      <div class="asset-info"><div class="asset-name">${t.name}</div><div class="asset-meta">${formatSize(t.size)} · Target ${i+1}</div></div>
      <button class="asset-remove" onclick="removeTarget(${i})"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;
    c.appendChild(d);
  });
}
window.removeGLB = function() {
  state.glbFile=null; state.glbName=''; state.glbSize=0;
  if(currentModel){ scene.remove(currentModel); currentModel=null; mixer=null; animations=[]; state.animClips=[]; }
  document.getElementById('glb-asset-container').innerHTML='';
  document.querySelector('.viewport-empty').style.display='flex';
  document.querySelector('.anim-section').style.display='none';
  updateFooterStatus(); showToast('🗑️ Modelo eliminado','info');
};
window.removeTarget = function(i) {
  URL.revokeObjectURL(state.targets[i].url); state.targets.splice(i,1);
  renderTargetsList(); updateFooterStatus(); updateTargetPlane(); showToast('🗑️ Target eliminado','info');
};

function updateTargetPlane() {
  if (targetPlaneMesh) {
    scene.remove(targetPlaneMesh);
    if (targetPlaneMesh.material.map) targetPlaneMesh.material.map.dispose();
    targetPlaneMesh.material.dispose();
    targetPlaneMesh.geometry.dispose();
    targetPlaneMesh = null;
  }
  
  if (state.targets.length > 0) {
    const target = state.targets[0];
    new THREE.TextureLoader().load(target.url, (texture) => {
      const img = texture.image;
      const aspect = img.height / img.width;
      
      const geometry = new THREE.PlaneGeometry(1, aspect);
      const material = new THREE.MeshBasicMaterial({ 
        map: texture, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      
      targetPlaneMesh = new THREE.Mesh(geometry, material);
      const tt = state.targetTransform;
      targetPlaneMesh.position.set(tt.position.x, tt.position.y, tt.position.z);
      targetPlaneMesh.rotation.set(THREE.MathUtils.degToRad(tt.rotation.x), THREE.MathUtils.degToRad(tt.rotation.y), THREE.MathUtils.degToRad(tt.rotation.z));
      targetPlaneMesh.scale.set(tt.scale.x, tt.scale.y, tt.scale.z);
      scene.add(targetPlaneMesh);
    });
  }
}

// ============================================================
// VIEWPORT CAMERA
// ============================================================
function resetCamera() {
  camera.position.set(0, 0.5, 2); controls.target.set(0,0,0); controls.update();
}
function topView() {
  camera.position.set(0, 3, 0.001); controls.target.set(0,0,0); controls.update();
}
function frontView() {
  camera.position.set(0, 0.5, 2); controls.target.set(0,0,0); controls.update();
}
function frameModel() {
  if (!currentModel) return;
  const box = new THREE.Box3().setFromObject(currentModel);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  camera.position.set(sphere.center.x + sphere.radius*2, sphere.center.y + sphere.radius*1.5, sphere.center.z + sphere.radius*2);
  controls.target.copy(sphere.center); controls.update();
}

// ============================================================
// TOOLBAR
// ============================================================
function initToolbar() {
  document.querySelectorAll('[data-gizmo]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-gizmo]').forEach(x=>x.classList.remove('active')); b.classList.add('active');
    const mode = b.getAttribute('data-gizmo');
    if (transformControl) {
      if (mode === 'move') transformControl.setMode('translate');
      else if (mode === 'rotate') transformControl.setMode('rotate');
      else if (mode === 'scale') transformControl.setMode('scale');
    }
  }));
  document.querySelectorAll('#btn-reset-cam').forEach(el=>el.addEventListener('click',resetCamera));
  document.querySelectorAll('#btn-top-view').forEach(el=>el.addEventListener('click',topView));
  document.querySelectorAll('#btn-front-view').forEach(el=>el.addEventListener('click',frontView));
  document.querySelectorAll('#btn-frame').forEach(el=>el.addEventListener('click',frameModel));

  // Atajos de teclado para el gizmo
  window.addEventListener('keydown', (e) => {
    // Ignorar si estamos escribiendo en un input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    let mode = null;
    switch(e.key.toLowerCase()) {
      case 't': mode = 'move'; break;
      case 'r': mode = 'rotate'; break;
      case 's': mode = 'scale'; break;
    }
    if (mode) {
      const btn = document.querySelector(`[data-gizmo="${mode}"]`);
      if (btn) btn.click();
    }
  });
}

function updateFooterStatus() {
  const el = document.getElementById('footer-status-text');
  const parts = [];
  if(state.glbName) parts.push(`📦 ${state.glbName}`);
  if(state.targets.length) parts.push(`🎯 ${state.targets.length} target${state.targets.length>1?'s':''}`);
  if(state.animClips.length) {
    const en = state.animClips.filter(c=>c.enabled).length;
    parts.push(`▶ ${en}/${state.animClips.length} clips`);
  }
  el.textContent = parts.length ? parts.join('  ·  ') : 'Sin archivos cargados';
}

// ============================================================
// UTILITIES
// ============================================================
function formatSize(b) { if(b<1024) return b+' B'; if(b<1048576) return (b/1024).toFixed(1)+' KB'; return (b/1048576).toFixed(1)+' MB'; }
function showLoading(msg='Cargando…') { const ov=document.querySelector('.loading-overlay'); const tx=ov?.querySelector('.loading-text'); if(tx) tx.textContent=msg; ov?.classList.add('active'); }
function hideLoading() { document.querySelector('.loading-overlay')?.classList.remove('active'); }
function showToast(msg, type='info') {
  const c=document.querySelector('.toast-container');
  const t=document.createElement('div'); t.className=`toast ${type}`; t.innerHTML=`<span>${msg}</span>`; c.appendChild(t);
  setTimeout(()=>{ t.classList.add('fade-out'); setTimeout(()=>t.remove(),300); },3000);
}
function fileToBase64(file) {
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file); });
}


// ============================================================
// MINDAR — Compilar imagen PNG/JPG → .mind
// window.MINDAR.IMAGE (UMD build v1.1.5 GitHub CDN)
// ============================================================
async function compileImageToMind(imageFile, onProgress) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageFile);
    img.onload = async () => {
      try {
        if (!window.MINDAR || !window.MINDAR.IMAGE || !window.MINDAR.IMAGE.Compiler)
          throw new Error('window.MINDAR.IMAGE.Compiler no disponible');
        const compiler = new window.MINDAR.IMAGE.Compiler();
        await compiler.compileImageTargets([img], p => onProgress && onProgress(Math.round(p * 100)));
        const buffer = await compiler.exportData();
        URL.revokeObjectURL(url);
        resolve(buffer);
      } catch(e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Error cargando imagen')); };
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

// ============================================================
// UI HELPERS
// ============================================================
function showProgress(msg) {
  let el = document.getElementById('__ar-loading');
  if (!el) {
    el = document.createElement('div');
    el.id = '__ar-loading';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(5,8,16,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#fff;font-family:sans-serif';
    el.innerHTML = '<div style="width:52px;height:52px;border-radius:50%;border:3px solid rgba(0,212,255,.15);border-top-color:#00d4ff;animation:__spin .8s linear infinite"></div>' +
      '<p id="__ar-loading-msg" style="font-size:14px;color:#00d4ff;max-width:280px;text-align:center"></p>' +
      '<style>@keyframes __spin{to{transform:rotate(360deg)}}</style>';
    document.body.appendChild(el);
  }
  const m = document.getElementById('__ar-loading-msg');
  if (m) m.textContent = msg || 'Procesando...';
}
function hideProgress() {
  const el = document.getElementById('__ar-loading'); if (el) el.remove();
}

// ============================================================
// SUBIR ARCHIVO BINARIO AL SERVIDOR
// ============================================================
async function saveBinaryToServer(filename, fileOrBuffer) {
  let b64;
  if (fileOrBuffer instanceof File || fileOrBuffer instanceof Blob) {
    b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload  = e => res(e.target.result.split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(fileOrBuffer);
    });
  } else {
    const bytes = new Uint8Array(fileOrBuffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    b64 = btoa(bin);
  }
  const res  = await fetch('/save-binary', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, data: b64 }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error('Error guardando ' + filename + ': ' + data.error);
  return data;
}

// ============================================================
// GENERAR HTML CON RUTAS RELATIVAS (modo archivos separados)
// Usa concatenación de strings — sin template literals anidados.
// ============================================================
function buildARHtmlFromPaths(opts) {
  var hasTarget = opts.hasTarget;
  var modelPath = opts.modelPath; // 'assets/model.glb'
  var mindPath  = opts.mindPath;  // 'assets/targets.mind'
  var pos       = opts.pos;
  var rot       = opts.rot;
  var scl       = opts.scl;
  var animClips = opts.animClips || []; // [{name, enabled}]
  var animUI    = opts.animUI || { css: '', html: '', js: '' };


  var CDN_AF = 'https://aframe.io/releases/1.5.0/aframe.min.js';
  var CDN_EX = 'https://cdn.jsdelivr.net/npm/aframe-extras@7.4.0/dist/aframe-extras.min.js';
  var CDN_MR = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js';
  var CDN_AJ = 'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.4.5/aframe/build/aframe-ar.min.js';

  var tipText  = hasTarget ? 'Apunta al target para ver el modelo 3D' : 'Apunta al marcador Hiro para ver el modelo';
  var descText = hasTarget ? 'Seguimiento de imagen con MindAR' : 'Marcador Hiro de AR.js';

  // Scripts: A-Frame primero, luego aframe-extras, luego AR library
  var scripts = '<script src="' + CDN_AF + '"><\/script>' +
    '<script src="' + CDN_EX + '"><\/script>' +
    (hasTarget ? '<script src="' + CDN_MR + '"><\/script>' : '<script src="' + CDN_AJ + '"><\/script>');


  // Atributos del modelo 3D
  var enabledClips = animClips.filter(function(c){ return c.enabled; });
  var animAttr = '';
  if (enabledClips.length > 0) {
    if (animUI && animUI.html) {
      // Si hay botones de UI interactivos, delegamos en nuestro componente ar-anim-controller
      animAttr = ' ar-anim-controller';
    } else {
      // Si no hay botones, reproducir automáticamente todo lo seleccionado usando animation-mixer
      var clipStr = (enabledClips.length === animClips.length || animClips.length === 0)
        ? '*'
        : '(' + enabledClips.map(function(c){ return c.name; }).join('|') + ')';
      animAttr = ' animation-mixer="clip: ' + clipStr + '; loop: repeat; timeScale: 1"';
    }
  }

  var entityTag = '<a-entity gltf-model="' + modelPath + '"' +
    ' position="' + pos + '"' +
    ' rotation="' + rot + '"' +
    ' scale="' + scl + '"' +
    ' shadow="cast: true; receive: true"' +
    animAttr;
    
  var tapJs = "";
  var cameraInner = "";
  if (opts.tapAction && opts.tapAction.type !== 'none') {
    entityTag += ' class="clickable" ar-tap-handler="type: ' + opts.tapAction.type + '; target: ' + opts.tapAction.target + '"';
    cameraInner = '<a-entity cursor="fuse: false; rayOrigin: mouse;" raycaster="objects: .clickable"></a-entity>';
    tapJs = "\n" +
"AFRAME.registerComponent('ar-tap-handler', {\n" +
"  schema: { type: {type: 'string'}, target: {type: 'string'} },\n" +
"  init: function() {\n" +
"    this.el.addEventListener('click', () => {\n" +
"      console.log('TAP ACTION TRIGGERED!');\n" +
"      if (this.data.type === 'url') {\n" +
"        window.open(this.data.target, '_blank');\n" +
"      } else if (this.data.type === 'anim') {\n" +
"        const ctrl = this.el.components['ar-anim-controller'];\n" +
"        if (ctrl && ctrl.actions && ctrl.actions[this.data.target]) {\n" +
"          const action = ctrl.actions[this.data.target];\n" +
"          ctrl.toggle(this.data.target, action.paused);\n" +
"        } else if (this.el.components['animation-mixer']) {\n" +
"          this.el.setAttribute('animation-mixer', 'clip: ' + this.data.target);\n" +
"        }\n" +
"      }\n" +
"    });\n" +
"  }\n" +
"});\n";
  }
  entityTag += '></a-entity>';

  // lightCode dinámico: refleja exactamente state.lighting al momento de exportar
  var activeLights = (opts.lighting || []).filter(function(l){ return l.enabled; });
  var lightArr = activeLights.map(function(l) {
    var obj = { t: l.type, c: l.color, i: l.intensity };
    if (l.type === 'directional' && l.position)
      obj.p = l.position.x + ' ' + l.position.y + ' ' + l.position.z;
    if (l.shadow) obj.s = true;
    return obj;
  });
  var lightCode =
    "    scene.setAttribute('light','defaultLightsEnabled: false');\n" +
    "    " + JSON.stringify(lightArr) + ".forEach(function(l){var e=document.createElement('a-light');e.setAttribute('type',l.t);e.setAttribute('color',l.c);e.setAttribute('intensity',l.i);if(l.p)e.setAttribute('position',l.p);if(l.s){e.setAttribute('cast-shadow','true');e.setAttribute('shadow-map-width','2048');e.setAttribute('shadow-map-height','2048');e.setAttribute('shadow-camera-near','0.1');e.setAttribute('shadow-camera-far','25');e.setAttribute('shadow-camera-left','-4');e.setAttribute('shadow-camera-right','4');e.setAttribute('shadow-camera-top','4');e.setAttribute('shadow-camera-bottom','-4');}scene.appendChild(e);});\n";

  // Código de la escena (creado directamente en startAR sin setTimeout)
  var sceneCode;
  if (hasTarget) {
    var minCF = (opts.trackingFilter && opts.trackingFilter.minCF !== undefined) ? opts.trackingFilter.minCF : 0.001;
    var beta  = (opts.trackingFilter && opts.trackingFilter.beta !== undefined) ? opts.trackingFilter.beta : 10;
    sceneCode  = "    var scene = document.createElement('a-scene');\n";
    if (opts.tapAction && opts.tapAction.type !== 'none') {
      sceneCode += "    scene.setAttribute('cursor', 'rayOrigin: mouse; fuse: false');\n";
      sceneCode += "    scene.setAttribute('raycaster', 'objects: .clickable');\n";
    }
    sceneCode += "    scene.setAttribute('mindar-image', 'imageTargetSrc: " + mindPath + "; filterMinCF: " + minCF + "; filterBeta: " + beta + ";');\n";
    sceneCode += "    scene.setAttribute('color-space', 'sRGB');\n";
    sceneCode += "    scene.setAttribute('renderer', 'colorManagement: true; physicallyCorrectLights: true; toneMapping: ACESFilmic;');\n";
    sceneCode += "    scene.setAttribute('vr-mode-ui', 'enabled: false');\n";
    sceneCode += "    scene.setAttribute('device-orientation-permission-ui', 'enabled: false');\n";
    sceneCode += "    scene.innerHTML =\n";
    sceneCode += "      '<a-camera position=\"0 0 0\" look-controls=\"enabled: false\"></a-camera>' +\n";
    sceneCode += "      '<a-entity mindar-image-target=\"targetIndex: 0\">" +
      entityTag.replace(/'/g, "\\'").replace(/"/g, '\\"') +
      "</a-entity>';\n";
    sceneCode += lightCode;
    sceneCode += "    document.body.appendChild(scene);\n";
    sceneCode += "    scene.addEventListener('loaded', function(){var t=document.getElementById('tip');if(t)t.style.display='block';});\n";
  } else {
    sceneCode  = "    var scene = document.createElement('a-scene');\n";
    if (opts.tapAction && opts.tapAction.type !== 'none') {
      sceneCode += "    scene.setAttribute('cursor', 'rayOrigin: mouse; fuse: false');\n";
      sceneCode += "    scene.setAttribute('raycaster', 'objects: .clickable');\n";
    }
    sceneCode += "    scene.setAttribute('embedded', '');\n";
    sceneCode += "    scene.setAttribute('arjs', 'trackingMethod: best; sourceType: webcam; debugUIEnabled: false;');\n";
    sceneCode += "    scene.setAttribute('renderer', 'colorManagement: true; physicallyCorrectLights: true; toneMapping: ACESFilmic;');\n";
    sceneCode += "    scene.setAttribute('vr-mode-ui', 'enabled: false');\n";
    sceneCode += "    scene.innerHTML =\n";
    sceneCode += "      '<a-marker preset=\"hiro\">" +
      entityTag.replace(/'/g, "\\'").replace(/"/g, '\\"') +
      "</a-marker>' +\n";
    sceneCode += "      '<a-camera position=\"0 0 0\" look-controls=\"enabled: false\"></a-camera>';\n";
    sceneCode += lightCode;
    sceneCode += "    document.body.appendChild(scene);\n";
    sceneCode += "    scene.addEventListener('loaded', function(){var t=document.getElementById('tip');if(t)t.style.display='block';});\n";

  }

  var css =
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{background:#000;overflow:hidden;font-family:sans-serif}' +
    '#start-screen{position:fixed;inset:0;z-index:100;background:#050810;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#fff;text-align:center;padding:28px}' +
    '#start-screen h1{font-size:22px;font-weight:700;background:linear-gradient(90deg,#00d4ff,#7b5ea7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}' +
    '#start-screen p{font-size:13px;color:rgba(255,255,255,.5);max-width:300px;line-height:1.7}' +
    '#start-btn{padding:14px 38px;background:linear-gradient(135deg,#00d4ff,#0099cc);color:#000;font-weight:800;font-size:15px;border:none;border-radius:50px;cursor:pointer;box-shadow:0 0 30px rgba(0,212,255,.5)}' +
    '#tip{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:none;background:rgba(0,0,0,.85);color:#fff;padding:12px 22px;border-radius:24px;font-size:14px;z-index:50;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.15);white-space:nowrap}' +
    '.mindar-ui-overlay{pointer-events:none;}';

  var html =
    '<!DOCTYPE html>\n<html lang="es">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>AR Experience</title>\n' +
    scripts + '\n' +
    '<style>' + css + animUI.css + '<\/style>\n' +
    '<\/head>\n<body>\n' +
    '<div id="start-screen">\n' +
    '  <div style="font-size:52px">&#x1F4E6;<\/div>\n' +
    '  <h1>AR Experience<\/h1>\n' +
    '  <p>' + descText + '<\/p>\n' +
    '  <button id="start-btn" onclick="startAR()">Iniciar AR<\/button>\n' +
    '  <p style="font-size:10px;color:rgba(255,255,255,.2)">localhost o HTTPS<\/p>\n' +
    '<\/div>\n' +
    animUI.html +
    '<div id="tip">' + tipText + '<\/div>\n' +
    '<script>\n' +
    'var _s=false;\n' +
    'function startAR(){\n' +
    '  if(_s)return;_s=true;\n' +
    '  if(location.protocol===\'file:\'){alert(\'Abre desde http://localhost:8080/ar-experience.html\');_s=false;return;}\n' +
    '  var ss=document.getElementById(\'start-screen\');if(ss)ss.style.display=\'none\';\n' +
    sceneCode +
    '  setTimeout(function(){var t=document.getElementById(\'tip\');if(t){t.style.opacity=\'0\';t.style.transition=\'opacity .5s\';}},9000);\n' +
    '}\n' +
    tapJs + '\n' +
    animUI.js +
    '<\/script>\n' +
    '<\/body>\n<\/html>';

  return html;
}

// ============================================================
// EXPORT
// ============================================================
window.exportWebApp = async function() {
  if (!state.glbFile) { showToast('Carga un modelo GLB primero', 'error'); return; }

  const tt = state.targetTransform;
  const targetMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(tt.position.x, tt.position.y, tt.position.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(tt.rotation.x), THREE.MathUtils.degToRad(tt.rotation.y), THREE.MathUtils.degToRad(tt.rotation.z))),
      new THREE.Vector3(tt.scale.x, tt.scale.y, tt.scale.z)
  );
  const t = state.transform;
  const modelMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(t.position.x, t.position.y, t.position.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(t.rotation.x), THREE.MathUtils.degToRad(t.rotation.y), THREE.MathUtils.degToRad(t.rotation.z))),
      new THREE.Vector3(t.scale.x, t.scale.y, t.scale.z)
  );
  
  const relativeMatrix = targetMatrix.invert().multiply(modelMatrix);
  const relPos = new THREE.Vector3();
  const relQuat = new THREE.Quaternion();
  const relScale = new THREE.Vector3();
  relativeMatrix.decompose(relPos, relQuat, relScale);
  const relRot = new THREE.Euler().setFromQuaternion(relQuat);

  const pos = [relPos.x.toFixed(3), relPos.y.toFixed(3), relPos.z.toFixed(3)].join(' ');
  const rot = [THREE.MathUtils.radToDeg(relRot.x).toFixed(2), THREE.MathUtils.radToDeg(relRot.y).toFixed(2), THREE.MathUtils.radToDeg(relRot.z).toFixed(2)].join(' ');
  const scl = [relScale.x.toFixed(3), relScale.y.toFixed(3), relScale.z.toFixed(3)].join(' ');
  const hasTarget = state.targets.length > 0;

  showToast('Iniciando export...', 'info');

  try {
    // Verificar si el servidor está disponible
    let serverOk = false;
    try {
      const ping = await fetch('/save-binary', { method: 'OPTIONS' });
      serverOk = ping.status === 204 || ping.status === 200;
    } catch(e) { serverOk = false; }

    if (serverOk) {
      // ── MODO ARCHIVOS SEPARADOS ─────────────────────────────────────────────
      showProgress('Guardando modelo 3D...');
      const glbResult = await saveBinaryToServer('assets/model.glb', state.glbFile);
      showToast('✅ GLB: ' + (glbResult.size/1024/1024).toFixed(2) + ' MB guardado', 'success');

      let mindPath = null;
      if (hasTarget) {
        if (!window.MINDAR || !window.MINDAR.IMAGE || !window.MINDAR.IMAGE.Compiler) {
          hideProgress(); showToast('Compilador MindAR no disponible — recarga la página', 'error'); return;
        }
        showProgress('Compilando imagen target...');
        const mindBuffer = await compileImageToMind(
          state.targets[0].file,
          pct => showProgress('Compilando imagen... ' + pct + '%')
        );
        showProgress('Guardando .mind...');
        const mindResult = await saveBinaryToServer('assets/targets.mind', mindBuffer);
        mindPath = mindResult.path;
        showToast('✅ Target .mind: ' + (mindResult.size/1024).toFixed(0) + ' KB guardado', 'success');
      }

      showProgress('Generando HTML...');
      const addAnimButtons = document.getElementById('ar-anim-buttons')?.checked || false;
      const animUI = getAnimButtons(addAnimButtons, state.animClips, state.animAutoPlay);
      const html = buildARHtmlFromPaths({ hasTarget, modelPath: 'assets/model.glb', mindPath, pos, rot, scl, animClips: state.animClips, lighting: state.lighting, animUI });



      const htmlRes  = await fetch('/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'ar-experience.html', content: html }),
      });
      const htmlData = await htmlRes.json();
      hideProgress();

      if (htmlData.ok) {
        showToast('✅ HTML: ' + (html.length/1024).toFixed(1) + ' KB — abriendo...', 'success');
        console.log('📁 Archivos exportados:');
        console.log('   ├── ar-experience.html');
        console.log('   └── assets/');
        console.log('       ├── model.glb');
        if (mindPath) console.log('       └── targets.mind');
        setTimeout(() => window.open(htmlData.url, '_blank'), 800);
      }
    } else {
      // ── FALLBACK: DESCARGAR ARCHIVOS SEPARADOS (SIN SERVIDOR) ────────────────
      showProgress('Preparando descarga de archivos...');
      showToast('Generando archivos para descarga local...', 'info');

      let mindBuffer = null;
      if (hasTarget) {
        if (!window.MINDAR || !window.MINDAR.IMAGE || !window.MINDAR.IMAGE.Compiler) {
          hideProgress(); showToast('Compilador MindAR no disponible', 'error'); return;
        }
        showProgress('Compilando imagen target...');
        mindBuffer = await compileImageToMind(state.targets[0].file, pct => showProgress('Compilando... ' + pct + '%'));
      }

      showProgress('Generando HTML...');
      const addAnimButtons = document.getElementById('ar-anim-buttons')?.checked || false;
      const animUI = getAnimButtons(addAnimButtons, state.animClips, state.animAutoPlay);
      const html = buildARHtmlFromPaths({ 
        hasTarget, 
        modelPath: 'assets/model.glb', 
        mindPath: mindBuffer ? 'assets/targets.mind' : null, 
        pos, rot, scl, 
        animClips: state.animClips, 
        lighting: state.lighting,
        animUI,
        trackingFilter: state.trackingFilter,
        tapAction: state.tapAction
      });

      function downloadFile(blob, filename) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      }

      // Descargar GLB
      downloadFile(state.glbFile, 'model.glb');
      
      // Descargar MIND
      if (mindBuffer) {
        downloadFile(new Blob([mindBuffer], { type: 'application/octet-stream' }), 'targets.mind');
      }

      // Descargar HTML (con pequeño retraso)
      setTimeout(() => {
        downloadFile(new Blob([html], { type: 'text/html' }), 'ar-experience.html');
        hideProgress();
        showToast('✅ 3 archivos descargados. Crea una carpeta "assets" y mételos ahí.', 'success');
      }, 500);

    }
  } catch(e) {
    hideProgress();
    console.error(e);
    showToast('Error: ' + e.message, 'error');
  }
};

window.previewAR = window.exportWebApp;

window.copyARCode = async function() {
  showToast('Usa "Exportar Webapp AR" para generar los archivos', 'info');
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initThree();
  initDropZones();
  bindTransformControls();
  bindTrackingFilters();
  bindTapActionControls();
  bindAnimControls();
  bindSceneOptions();
  renderLightsPanel(); // renderiza panel de iluminación
  initToolbar();
  updateFooterStatus();
  document.getElementById('btn-export')?.addEventListener('click', exportWebApp);
  document.getElementById('btn-copy')?.addEventListener('click',   copyARCode);
  document.getElementById('btn-preview')?.addEventListener('click', previewAR);
  document.getElementById('toggle-anim').checked       = true;
  document.getElementById('toggle-grid').checked       = true;
  document.getElementById('toggle-shadow').checked     = true;
  document.getElementById('toggle-autorotate').checked = false;
  setTimeout(() => {
    const ok = !!(window.MINDAR && window.MINDAR.IMAGE && window.MINDAR.IMAGE.Compiler);
    console.log('MindAR compilador:', ok ? '✅ DISPONIBLE' : '⚠ cargando...');
  }, 1500);
});

