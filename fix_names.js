// fix_names.js — renombra showLoading/hideLoading en rebuild.js
// para evitar conflicto con las funciones del editor principal
const fs = require('fs');
let code = fs.readFileSync('rebuild.js', 'utf8');

// El bloque CODE está entre "const CODE = `" y el cierre "`;"
// Buscamos la sección de CODE para renombrar solo dentro de ella
const marker = 'const CODE = `\n';
const endMarker = '`;\n\n// Interpolar';
const start = code.indexOf(marker);
const end   = code.indexOf(endMarker);

if (start === -1 || end === -1) {
  console.error('No se encontró el bloque CODE en rebuild.js');
  console.log('Inicio:', start, 'Fin:', end);
  process.exit(1);
}

const before = code.substring(0, start + marker.length);
const codeBlock = code.substring(start + marker.length, end);
const after  = code.substring(end);

// Reemplazar showLoading/hideLoading con showProgress/hideProgress
const fixed = codeBlock
  .replace(/\bshowLoading\b/g, 'showProgress')
  .replace(/\bhideLoading\b/g, 'hideProgress');

console.log('showProgress:', (fixed.match(/\bshowProgress\b/g)||[]).length, 'ocurrencias');
console.log('hideProgress:', (fixed.match(/\bhideProgress\b/g)||[]).length, 'ocurrencias');
console.log('showLoading sobrantes en CODE:', (fixed.match(/\bshowLoading\b/g)||[]).length, '(debe ser 0)');

fs.writeFileSync('rebuild.js', before + fixed + after, 'utf8');
console.log('OK - rebuild.js actualizado');
