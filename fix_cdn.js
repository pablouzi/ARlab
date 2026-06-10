/**
 * fix_cdn.js — Aplica el fix de orden de CDN al rebuild.js
 * A-Frame SIEMPRE debe cargarse ANTES que MindAR
 */
const fs = require('fs');

let txt = fs.readFileSync('rebuild.js', 'utf8');

// Buscar el bloque de scripts en el template y reemplazarlo
const oldBlock = `\${hasTarget
  ? '<script src="' + cdnMindar + '"><\\\\/script>'
  : '<script src="' + cdnAframe + '"><\\\\/script>\\\\n<script src="' + cdnArjs + '"><\\\\/script>'
}`;

const newBlock = `<script src="\` + cdnAframe + \`"><\\/script>
\${hasTarget
  ? '<script src="' + cdnMindar + '"><\\\\/script>'
  : '<script src="' + cdnArjs   + '"><\\\\/script>'
}`;

if (!txt.includes(oldBlock)) {
  console.log('Block not found exactly. Trying fallback search...');
  // Check what's there
  const idx = txt.indexOf('cdnMindar');
  if (idx >= 0) {
    console.log('Found cdnMindar at char', idx);
    console.log('Context:', JSON.stringify(txt.substring(idx - 50, idx + 100)));
  }
} else {
  txt = txt.replace(oldBlock, newBlock);
  fs.writeFileSync('rebuild.js', txt, 'utf8');
  console.log('Fixed! A-Frame now always loads first.');
}
