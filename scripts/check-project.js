'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const checked = [];
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      checked.push(full);
    }
  }
}

walk(root);
for (const file of checked) {
  try {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: path.relative(root, file) });
  } catch (error) {
    failures.push(path.relative(root, file) + ': ' + error.message);
  }
}

const htmlPath = path.join(publicDir, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const inlineScripts = [...html.matchAll(/<script\\b(?![^>]*\\bsrc=)[^>]*>([\\s\\S]*?)<\\/script>/gi)];
if (!inlineScripts.length) failures.push('public/index.html: no inline game script found');
inlineScripts.forEach((match, index) => {
  if (!match[1].trim()) return;
  try {
    new vm.Script(match[1], { filename: 'public/index.html:inline-script-' + (index + 1) });
  } catch (error) {
    failures.push('public/index.html inline script ' + (index + 1) + ': ' + error.message);
  }
});

for (const match of html.matchAll(/<script\\b[^>]*\\bsrc=["']([^"']+)["'][^>]*>/gi)) {
  const src = match[1];
  if (/^(https?:)?\\/\\//i.test(src) || src.startsWith('/socket.io/')) continue;
  const file = path.resolve(publicDir, '.' + (src.startsWith('/') ? src : '/' + src));
  if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file)) {
    failures.push('public/index.html references missing script: ' + src);
  }
}

if (failures.length) {
  console.error('AGROBULL CHECK FAILED');
  failures.forEach(item => console.error(' - ' + item));
  process.exit(1);
}
console.log('AGROBULL CHECK OK: ' + checked.length + ' JavaScript files and ' + inlineScripts.length + ' inline HTML scripts parsed; local script paths verified.');
