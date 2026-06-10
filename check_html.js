const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const lines = html.split('\n');

// Find drop zone and input IDs
const ids = ['drop-glb','input-glb','drop-target','input-target'];
ids.forEach(id => {
  const found = lines.filter(l => l.includes('id="' + id + '"') || l.includes("id='" + id + "'"));
  console.log(id + ':', found.length > 0 ? 'FOUND' : 'MISSING', found.length > 0 ? '→ ' + found[0].trim().slice(0,80) : '');
});

// Find file inputs
console.log('\nFile inputs:');
lines.forEach((l, i) => {
  if (l.includes('type="file"') || l.includes("type='file'")) {
    console.log('  Line ' + (i+1) + ': ' + l.trim().slice(0,100));
  }
});

// Check for display:none on inputs
console.log('\nHidden inputs:');
lines.forEach((l, i) => {
  if ((l.includes('type="file"') || l.includes("type='file'")) && (l.includes('display:none') || l.includes('display: none'))) {
    console.log('  Line ' + (i+1) + ': ' + l.trim().slice(0,100));
  }
});
