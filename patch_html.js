// patch_html.js — Reemplaza la sección de animaciones en index.html
const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Marcadores únicos en el HTML
const START = '    <!-- ANIMACIONES -->';
const END   = '    </div>\n\n    <!-- ESCENA -->';

const si = html.indexOf(START);
const ei = html.indexOf(END);

if (si === -1 || ei === -1) {
  console.error('Marcadores no encontrados. si=' + si + ' ei=' + ei);
  process.exit(1);
}

const NEW_SECTION = `    <!-- ANIMACIONES -->
    <div class="prop-group anim-section" style="display:none;">
      <div class="prop-group-title amber">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Animaciones
        <span id="anim-count-badge" class="anim-count-badge"></span>
      </div>

      <div class="toggle-row">
        <span class="toggle-label">Reproducir en preview</span>
        <label class="toggle">
          <input type="checkbox" id="toggle-anim" checked>
          <span class="toggle-slider"></span>
        </label>
      </div>

      <!-- Botones Todas / Ninguna -->
      <div class="anim-controls-row">
        <button class="anim-ctrl-btn" id="btn-anim-all">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" width="10" height="10"><path d="M2 2l12 6-12 6V2z"/></svg>
          Todas
        </button>
        <button class="anim-ctrl-btn secondary" id="btn-anim-none">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><rect x="2" y="2" width="12" height="12" rx="2"/></svg>
          Ninguna
        </button>
        <span class="anim-export-hint">Se exportan las activas</span>
      </div>

      <!-- Lista dinámica de clips con checkboxes -->
      <div id="anim-list" class="anim-list"></div>
    </div>

`;

html = html.substring(0, si) + NEW_SECTION + html.substring(ei + '    </div>\n'.length);

// Verify
if (!html.includes('anim-list')) { console.error('anim-list not in output!'); process.exit(1); }
if (!html.includes('btn-anim-all')) { console.error('btn-anim-all not in output!'); process.exit(1); }

fs.writeFileSync('index.html', html, 'utf8');
console.log('OK - index.html updated, new length:', html.length);
console.log('anim-count-badge:', html.includes('anim-count-badge') ? 'found' : 'MISSING');
console.log('anim-list:', html.includes('id="anim-list"') ? 'found' : 'MISSING');
console.log('btn-anim-all:', html.includes('btn-anim-all') ? 'found' : 'MISSING');
