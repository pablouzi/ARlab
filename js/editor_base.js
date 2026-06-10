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
const clock = new THREE.Clock();
const threeJsLights = {}; // id -> THREE.Light
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

  state.lighting.forEach(ld => {
    let light;
    if (ld.type === 'ambient') {
      light = new THREE.AmbientLight(ld.color, ld.intensity);
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
    }
    light.visible = ld.enabled;
    threeJsLights[ld.id] = light;
    scene.add(light);
  });
}

function updateLightProp(id, prop, value) {
  const ld = state.lighting.find(l => l.id === id);
  if (!ld) return;
  const tl = threeJsLights[id];

  if (prop === 'enabled') {
    ld.enabled = value;
    if (tl) tl.visible = value;
  } else if (prop === 'color') {
    ld.color = value;
    if (tl) tl.color.set(value);
  } else if (prop === 'intensity') {
    ld.intensity = value;
    if (tl) tl.intensity = value;
  } else if (prop === 'shadow') {
    ld.shadow = value;
    if (tl && tl.isDirectionalLight) tl.castShadow = value;
  } else if (prop === 'px') { ld.position.x = value; if(tl) tl.position.x = value; }
    else if (prop === 'py') { ld.position.y = value; if(tl) tl.position.y = value; }
    else if (prop === 'pz') { ld.position.z = value; if(tl) tl.position.z = value; }
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
  controls.update();
  renderer.render(scene, camera);
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
  _renderAnimCheckboxes();
  document.querySelector('.anim-section').style.display = list.length ? 'block' : 'none';
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

function getAnimButtons(addAnimButtons, clips) {
  var active = clips.filter(c => c.enabled);
  if (!addAnimButtons || active.length === 0) return { css: '', html: '', js: '' };
  
  var css = '.ar-ui{position:fixed;bottom:70px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:9999;max-width:90vw;overflow-x:auto;padding:8px;background:rgba(0,0,0,0.5);border-radius:12px;backdrop-filter:blur(4px);scrollbar-width:none;}.ar-ui::-webkit-scrollbar{display:none;}.ar-btn{background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:8px 16px;font-size:14px;cursor:pointer;white-space:nowrap;transition:0.2s;}.ar-btn.active{background:rgba(0,212,255,0.5);border-color:#00d4ff;}.ar-btn:active{transform:scale(0.95);}';
  
  var html = '<div class="ar-ui">\n';
  active.forEach((c, idx) => {
    var cls = idx === 0 ? 'ar-btn anim-toggle active' : 'ar-btn anim-toggle';
    html += '  <button class="' + cls + '" data-clip="' + c.name.replace(/'/g, "\\'") + '" onclick="toggleAnim(this, \'' + c.name.replace(/'/g, "\\'") + '\')">' + c.name + '</button>\n';
  });
  html += '  <button class="ar-btn" onclick="stopAnim()" style="color:#ff6b6b;border-color:rgba(255,107,107,0.3)">🛑 Detener</button>\n</div>\n';
  
  var js = 'function toggleAnim(btn,n){var e=document.querySelector("[gltf-model]");if(!e)return;if(btn.classList.contains("active"))btn.classList.remove("active");else btn.classList.add("active");syncMixers(e);}function stopAnim(){var e=document.querySelector("[gltf-model]");if(!e)return;document.querySelectorAll(".ar-btn.anim-toggle").forEach(function(b){b.classList.remove("active");});syncMixers(e);}function syncMixers(e){e.removeAttribute("animation-mixer");var a=document.querySelectorAll(".ar-btn.anim-toggle.active");if(a.length>0){var c=[];a.forEach(function(b){c.push(b.getAttribute("data-clip").replace(/([.*+?^=!:${}()|\\[\\]\\/\\\\])/g,"\\\\$1"));});setTimeout(function(){e.setAttribute("animation-mixer","clip: ("+c.join("|")+"); loop: repeat; timeScale: 1");},10);}}\n';
  
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
  }));
  document.querySelectorAll('#btn-reset-cam').forEach(el=>el.addEventListener('click',resetCamera));
  document.querySelectorAll('#btn-top-view').forEach(el=>el.addEventListener('click',topView));
  document.querySelectorAll('#btn-front-view').forEach(el=>el.addEventListener('click',frontView));
  document.querySelectorAll('#btn-frame').forEach(el=>el.addEventListener('click',frameModel));
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
