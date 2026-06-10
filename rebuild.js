/**
 * rebuild.js — Reconstruye js/editor.js
 *
 * MODO ARCHIVOS SEPARADOS:
 *   ar-experience.html     → HTML ligero (~5 KB)
 *   assets/model.glb       → modelo 3D
 *   assets/targets.mind    → imagen target compilada
 *
 * Doc MindAR: https://hiukim.github.io/mind-ar-js-doc/
 */
const fs = require('fs');

const original = fs.readFileSync('js/editor_base.js', 'utf8');
const keep = original; // editor_base.js es la fuente canónica completa


const CDN_AFRAME  = 'https://aframe.io/releases/1.5.0/aframe.min.js';
const CDN_EXTRAS  = 'https://cdn.jsdelivr.net/npm/aframe-extras@7.4.0/dist/aframe-extras.min.js';
const CDN_MINDAR  = 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image-aframe.prod.js';
const CDN_ARJS    = 'https://cdn.jsdelivr.net/gh/AR-js-org/AR.js@3.4.5/aframe/build/aframe-ar.min.js';


// Las URLs de CDN se embeben ahora (en rebuild) usando ${} normal.
// Las variables de browser (pos, rot, scl, etc.) se manejan con concatenación.
const CODE = `
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


  var CDN_AF = '${CDN_AFRAME}';
  var CDN_EX = '${CDN_EXTRAS}';
  var CDN_MR = '${CDN_MINDAR}';
  var CDN_AJ = '${CDN_ARJS}';

  var tipText  = hasTarget ? 'Apunta al target para ver el modelo 3D' : 'Apunta al marcador Hiro para ver el modelo';
  var descText = hasTarget ? 'Seguimiento de imagen con MindAR' : 'Marcador Hiro de AR.js';

  // Scripts: A-Frame primero, luego aframe-extras, luego AR library
  var scripts = '<script src="' + CDN_AF + '"><\\/script>' +
    '<script src="' + CDN_EX + '"><\\/script>' +
    (hasTarget ? '<script src="' + CDN_MR + '"><\\/script>' : '<script src="' + CDN_AJ + '"><\\/script>');


  // Atributos del modelo 3D — animation-mixer usa solo clips seleccionados
  var enabledClips = animClips.filter(function(c){ return c.enabled; });
  var animAttr = '';
  if (enabledClips.length > 0) {
    var clipStr = (enabledClips.length === animClips.length || animClips.length === 0)
      ? '*'
      : enabledClips.map(function(c){ return c.name; }).join(',');
    animAttr = ' animation-mixer="clip: ' + clipStr + '; loop: repeat; timeScale: 1"';
  }

  var entityTag = '<a-entity gltf-model="' + modelPath + '"' +
    ' position="' + pos + '"' +
    ' rotation="' + rot + '"' +
    ' scale="' + scl + '"' +
    ' shadow="cast: true; receive: true"' +
    animAttr + '></a-entity>';

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
    "    scene.setAttribute('light','defaultLightsEnabled: false');\\n" +
    "    " + JSON.stringify(lightArr) + ".forEach(function(l){var e=document.createElement('a-light');e.setAttribute('type',l.t);e.setAttribute('color',l.c);e.setAttribute('intensity',l.i);if(l.p)e.setAttribute('position',l.p);if(l.s){e.setAttribute('cast-shadow','true');e.setAttribute('shadow-map-width','2048');e.setAttribute('shadow-map-height','2048');e.setAttribute('shadow-camera-near','0.1');e.setAttribute('shadow-camera-far','25');e.setAttribute('shadow-camera-left','-4');e.setAttribute('shadow-camera-right','4');e.setAttribute('shadow-camera-top','4');e.setAttribute('shadow-camera-bottom','-4');}scene.appendChild(e);});\\n";

  // Código de la escena (creado directamente en startAR sin setTimeout)
  var sceneCode;
  if (hasTarget) {
    sceneCode  = "    var scene = document.createElement('a-scene');\\n";
    sceneCode += "    scene.setAttribute('mindar-image', 'imageTargetSrc: " + mindPath + ";');\\n";
    sceneCode += "    scene.setAttribute('color-space', 'sRGB');\\n";
    sceneCode += "    scene.setAttribute('renderer', 'colorManagement: true; physicallyCorrectLights: true; toneMapping: aces; toneMappingExposure: 1.2; shadowMapEnabled: true; shadowMapType: 2;');\\n";
    sceneCode += "    scene.setAttribute('vr-mode-ui', 'enabled: false');\\n";
    sceneCode += "    scene.setAttribute('device-orientation-permission-ui', 'enabled: false');\\n";
    sceneCode += "    scene.innerHTML =\\n";
    sceneCode += "      '<a-camera position=\\\"0 0 0\\\" look-controls=\\\"enabled: false\\\"></a-camera>' +\\n";
    sceneCode += "      '<a-entity mindar-image-target=\\\"targetIndex: 0\\\">" +
      "<a-plane rotation=\\\"-90 0 0\\\" width=\\\"2\\\" height=\\\"2\\\" material=\\\"color:#000;opacity:0.3;transparent:true\\\" shadow=\\\"receive:true\\\"></a-plane>" +
      entityTag.replace(/'/g, "\\\\'").replace(/"/g, '\\\\"') +
      "</a-entity>';\\n";
    sceneCode += lightCode;
    sceneCode += "    document.body.appendChild(scene);\\n";
    sceneCode += "    scene.addEventListener('loaded', function(){var t=document.getElementById('tip');if(t)t.style.display='block';});\\n";
  } else {
    sceneCode  = "    var scene = document.createElement('a-scene');\\n";
    sceneCode += "    scene.setAttribute('embedded', '');\\n";
    sceneCode += "    scene.setAttribute('arjs', 'trackingMethod: best; sourceType: webcam; debugUIEnabled: false;');\\n";
    sceneCode += "    scene.setAttribute('renderer', 'colorManagement: true; physicallyCorrectLights: true; toneMapping: aces; toneMappingExposure: 1.2; shadowMapEnabled: true; shadowMapType: 2;');\\n";
    sceneCode += "    scene.setAttribute('vr-mode-ui', 'enabled: false');\\n";
    sceneCode += "    scene.innerHTML =\\n";
    sceneCode += "      '<a-marker preset=\\\"hiro\\\">" +
      entityTag.replace(/'/g, "\\\\'").replace(/"/g, '\\\\"') +
      "</a-marker>' +\\n";
    sceneCode += "      '<a-entity camera></a-entity>';\\n";
    sceneCode += lightCode;
    sceneCode += "    document.body.appendChild(scene);\\n";
    sceneCode += "    scene.addEventListener('loaded', function(){var t=document.getElementById('tip');if(t)t.style.display='block';});\\n";

  }

  var css =
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{background:#000;overflow:hidden;font-family:sans-serif}' +
    '#start-screen{position:fixed;inset:0;z-index:100;background:#050810;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#fff;text-align:center;padding:28px}' +
    '#start-screen h1{font-size:22px;font-weight:700;background:linear-gradient(90deg,#00d4ff,#7b5ea7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}' +
    '#start-screen p{font-size:13px;color:rgba(255,255,255,.5);max-width:300px;line-height:1.7}' +
    '#start-btn{padding:14px 38px;background:linear-gradient(135deg,#00d4ff,#0099cc);color:#000;font-weight:800;font-size:15px;border:none;border-radius:50px;cursor:pointer;box-shadow:0 0 30px rgba(0,212,255,.5)}' +
    '#tip{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:none;background:rgba(0,0,0,.85);color:#fff;padding:12px 22px;border-radius:24px;font-size:14px;z-index:50;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.15);white-space:nowrap}';

  var html =
    '<!DOCTYPE html>\\n<html lang="es">\\n<head>\\n' +
    '<meta charset="UTF-8">\\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\\n' +
    '<title>AR Experience</title>\\n' +
    scripts + '\\n' +
    '<style>' + css + '<\\/style>\\n' +
    '<\\/head>\\n<body>\\n' +
    '<div id="start-screen">\\n' +
    '  <div style="font-size:52px">&#x1F4E6;<\\/div>\\n' +
    '  <h1>AR Experience<\\/h1>\\n' +
    '  <p>' + descText + '<\\/p>\\n' +
    '  <button id="start-btn" onclick="startAR()">Iniciar AR<\\/button>\\n' +
    '  <p style="font-size:10px;color:rgba(255,255,255,.2)">localhost o HTTPS<\\/p>\\n' +
    '<\\/div>\\n' +
    '<div id="tip">' + tipText + '<\\/div>\\n' +
    '<script>\\n' +
    'var _s=false;\\n' +
    'function startAR(){\\n' +
    '  if(_s)return;_s=true;\\n' +
    '  if(location.protocol===\\'file:\\'){alert(\\'Abre desde http://localhost:8080/ar-experience.html\\');_s=false;return;}\\n' +
    '  var ss=document.getElementById(\\'start-screen\\');if(ss)ss.style.display=\\'none\\';\\n' +
    sceneCode +
    '  setTimeout(function(){var t=document.getElementById(\\'tip\\');if(t){t.style.opacity=\\'0\\';t.style.transition=\\'opacity .5s\\';}},9000);\\n' +
    '}\\n' +
    '<\\/script>\\n' +
    '<\\/body>\\n<\\/html>';

  return html;
}

// ============================================================
// EXPORT
// ============================================================
window.exportWebApp = async function() {
  if (!state.glbFile) { showToast('Carga un modelo GLB primero', 'error'); return; }

  const t   = state.transform;
  const pos = [t.position.x, t.position.y, t.position.z].join(' ');
  const rot = [t.rotation.x, t.rotation.y, t.rotation.z].join(' ');
  const scl = [t.scale.x,    t.scale.y,    t.scale.z   ].join(' ');
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
      const html = buildARHtmlFromPaths({ hasTarget, modelPath: 'assets/model.glb', mindPath, pos, rot, scl, animClips: state.animClips, lighting: state.lighting });



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
      // ── FALLBACK: TODO EMBEBIDO EN BASE64 ────────────────────────────────────
      showProgress('Sin servidor — generando HTML autocontenido...');
      showToast('Sin servidor detectado — modo embebido', 'info');

      const modelB64 = await fileToBase64(state.glbFile);
      let mindB64 = '';

      if (hasTarget) {
        if (!window.MINDAR || !window.MINDAR.IMAGE || !window.MINDAR.IMAGE.Compiler) {
          hideProgress(); showToast('Compilador MindAR no disponible', 'error'); return;
        }
        showProgress('Compilando imagen...');
        const buf = await compileImageToMind(state.targets[0].file, pct => showProgress('Compilando... ' + pct + '%'));
        const u8  = new Uint8Array(buf);
        let bin   = ''; for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
        mindB64   = btoa(bin);
      }

      hideProgress();

      const CDN_AF = '${CDN_AFRAME}';
      const CDN_EX = '${CDN_EXTRAS}';
      const CDN_MR = '${CDN_MINDAR}';
      const CDN_AJ = '${CDN_ARJS}';
      // A-Frame → aframe-extras (animation-mixer) → AR library
      const scripts = '<script src="' + CDN_AF + '"><\\/script>' +
        '<script src="' + CDN_EX + '"><\\/script>' +
        (hasTarget ? '<script src="' + CDN_MR + '"><\\/script>' : '<script src="' + CDN_AJ + '"><\\/script>');


      const blobModelCode = 'function _b(b64,mime){var bin=atob(b64),arr=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return URL.createObjectURL(new Blob([arr],{type:mime}));}\\n' +
        'var MODEL_URL=_b("' + modelB64 + '","model/gltf-binary");\\n' +
        (hasTarget ? 'var MIND_URL=_b("' + mindB64 + '","application/octet-stream");\\n' : '');

      // Build animation-mixer attr from selected clips (same logic as buildARHtmlFromPaths)
      const fbEnabled = state.animClips.filter(function(c){ return c.enabled; });
      const fbClipStr = fbEnabled.length === 0 ? '' :
        (fbEnabled.length === state.animClips.length || state.animClips.length === 0) ? '*' :
        fbEnabled.map(function(c){ return c.name; }).join(',');
      const fbAnimAttr = fbClipStr ? '\\\" animation-mixer=\\\"clip: ' + fbClipStr + '; loop: repeat; timeScale: 1' : '';

      // entityTag — usa MODEL_URL (blob URL definida en blobModelCode)
      const entityTag = '<a-entity gltf-model=\\\""+ MODEL_URL +"\\\" position=\\\"' + pos + '\\\" rotation=\\\"' + rot + '\\\" scale=\\\"' + scl + fbAnimAttr + '\\\" shadow=\\\"cast: true; receive: true\\\"></a-entity>';

      // lightCode dinámico desde state.lighting (igual que en buildARHtmlFromPaths)
      const fbActiveLights = state.lighting.filter(function(l){ return l.enabled; });
      const fbLightArr = fbActiveLights.map(function(l) {
        var o = { t: l.type, c: l.color, i: l.intensity };
        if (l.type === 'directional' && l.position) o.p = l.position.x + ' ' + l.position.y + ' ' + l.position.z;
        if (l.shadow) o.s = true;
        return o;
      });
      const fbLightCode =
        "    scene.setAttribute('light','defaultLightsEnabled:false');\\n" +
        "    " + JSON.stringify(fbLightArr) + ".forEach(function(l){var e=document.createElement('a-light');e.setAttribute('type',l.t);e.setAttribute('color',l.c);e.setAttribute('intensity',l.i);if(l.p)e.setAttribute('position',l.p);if(l.s){e.setAttribute('cast-shadow','true');e.setAttribute('shadow-map-width','2048');e.setAttribute('shadow-map-height','2048');e.setAttribute('shadow-camera-near','0.1');e.setAttribute('shadow-camera-far','25');e.setAttribute('shadow-camera-left','-4');e.setAttribute('shadow-camera-right','4');e.setAttribute('shadow-camera-top','4');e.setAttribute('shadow-camera-bottom','-4');}scene.appendChild(e);});\\n";

      var sc;
      if (hasTarget) {
        sc  = "    var scene=document.createElement('a-scene');\\n";
        sc += "    scene.setAttribute('mindar-image','imageTargetSrc:'+MIND_URL+';');\\n";
        sc += "    scene.setAttribute('color-space','sRGB');\\n";
        sc += "    scene.setAttribute('renderer','colorManagement:true;physicallyCorrectLights:true;toneMapping:aces;toneMappingExposure:1.2;shadowMapEnabled:true;shadowMapType:2;');\\n";
        sc += "    scene.setAttribute('vr-mode-ui','enabled:false');\\n";
        sc += "    scene.setAttribute('device-orientation-permission-ui','enabled:false');\\n";
        sc += "    scene.innerHTML='<a-camera position=\\\"0 0 0\\\" look-controls=\\\"enabled:false\\\"></a-camera><a-entity mindar-image-target=\\\"targetIndex:0\\\"><" + entityTag + "</a-entity>';\\n";
        sc += fbLightCode;
        sc += "    document.body.appendChild(scene);\\n";
        sc += "    scene.addEventListener('loaded',function(){var t=document.getElementById('tip');if(t)t.style.display='block';});\\n";

      } else {
        sc  = "    var scene=document.createElement('a-scene');\\n";
        sc += "    scene.setAttribute('embedded','');\\n";
        sc += "    scene.setAttribute('arjs','trackingMethod:best;sourceType:webcam;debugUIEnabled:false;');\\n";
        sc += "    scene.setAttribute('renderer','colorManagement:true;physicallyCorrectLights:true;toneMapping:aces;toneMappingExposure:1.2;shadowMapEnabled:true;shadowMapType:2;');\\n";
        sc += "    scene.setAttribute('vr-mode-ui','enabled:false');\\n";
        sc += "    scene.innerHTML='<a-marker preset=\\\"hiro\\\"><" + entityTag + "</a-marker><a-entity camera></a-entity>';\\n";
        sc += fbLightCode;
        sc += "    document.body.appendChild(scene);\\n";
        sc += "    scene.addEventListener('loaded',function(){var t=document.getElementById('tip');if(t)t.style.display='block';});\\n";

      }

      const tipText  = hasTarget ? 'Apunta al target' : 'Apunta al marcador Hiro';
      const descText = hasTarget ? 'Seguimiento de imagen MindAR' : 'Marcador Hiro AR.js';
      const html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AR Experience</title>\\n' +
        scripts + '\\n' +
        '<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;overflow:hidden;font-family:sans-serif}' +
        '#start-screen{position:fixed;inset:0;z-index:100;background:#050810;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#fff;text-align:center;padding:28px}' +
        '#start-screen h1{font-size:22px;font-weight:700;background:linear-gradient(90deg,#00d4ff,#7b5ea7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}' +
        '#start-screen p{font-size:13px;color:rgba(255,255,255,.5);max-width:300px;line-height:1.7}' +
        '#start-btn{padding:14px 38px;background:linear-gradient(135deg,#00d4ff,#0099cc);color:#000;font-weight:800;font-size:15px;border:none;border-radius:50px;cursor:pointer}' +
        '#tip{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:none;background:rgba(0,0,0,.85);color:#fff;padding:12px 22px;border-radius:24px;font-size:14px;z-index:50}' +
        '<\\/style><\\/head><body>\\n' +
        '<div id="start-screen"><div style="font-size:52px">&#x1F4E6;<\\/div><h1>AR Experience<\\/h1><p>' + descText + '<\\/p>' +
        '<button id="start-btn" onclick="startAR()">Iniciar AR<\\/button>' +
        '<p style="font-size:10px;color:rgba(255,255,255,.2)">localhost o HTTPS<\\/p><\\/div>\\n' +
        '<div id="tip">' + tipText + '<\\/div>\\n' +
        '<script>\\n' + blobModelCode +
        'var _s=false;\\nfunction startAR(){\\n' +
        '  if(_s)return;_s=true;\\n' +
        '  if(location.protocol===\\'file:\\'){alert(\\'Abre desde localhost:8080\\');_s=false;return;}\\n' +
        '  var ss=document.getElementById(\\'start-screen\\');if(ss)ss.style.display=\\'none\\';\\n' +
        sc +
        '  setTimeout(function(){var t=document.getElementById(\\'tip\\');if(t){t.style.opacity=\\'0\\';t.style.transition=\\'opacity .5s\\';}},9000);\\n' +
        '}\\n<\\/script><\\/body><\\/html>';

      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      a.download = 'ar-experience.html'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      showToast('HTML descargado (modo embebido — ' + (html.length/1024/1024).toFixed(1) + ' MB)', 'info');
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

`;

// Interpolar las URLs de CDN ahora (en Node.js), generando el código final
const editorAddition = CODE
  .replace(/\$\{CDN_AFRAME\}/g, CDN_AFRAME)
  .replace(/\$\{CDN_EXTRAS\}/g, CDN_EXTRAS)
  .replace(/\$\{CDN_MINDAR\}/g, CDN_MINDAR)
  .replace(/\$\{CDN_ARJS\}/g,   CDN_ARJS);

fs.writeFileSync('js/editor.js', keep + '\n' + editorAddition, 'utf8');
const total = (keep + '\n' + editorAddition).split('\n').length;
console.log('OK - Total lines:', total);

const r = fs.readFileSync('js/editor.js', 'utf8');
console.log('saveBinaryToServer:',   r.includes('saveBinaryToServer')   ? '\u2713' : '\u2717');
console.log('assets/model.glb:',     r.includes('assets/model.glb')     ? '\u2713' : '\u2717');
console.log('assets/targets.mind:',  r.includes('assets/targets.mind')  ? '\u2713' : '\u2717');
console.log('MINDAR.IMAGE.Compiler:',r.includes('MINDAR.IMAGE.Compiler')? '\u2713' : '\u2717');
console.log('aframe-extras@7.4.0:',  r.includes('aframe-extras@7.4.0') ? '\u2713' : '\u2717');
console.log('animation-mixer clip:', (r.includes('animation-mixer') && r.includes('fbClipStr')) ? '\u2713' : '\u2717');

console.log('A-Frame 1.5.0:',        r.includes('1.5.0')                ? '\u2713' : '\u2717');
console.log('MindAR 1.2.5:',         r.includes('mind-ar@1.2.5')        ? '\u2713' : '\u2717');
