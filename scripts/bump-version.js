// Aggiorna il numero di versione dell'app (da lanciare prima di ogni pubblicazione).
// Scrive version.json e aggiunge ?v=<versione> a CSS e JS in index.html, così i telefoni
// scaricano i file nuovi invece di usare quelli in memoria.
// Uso: node scripts/bump-version.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const version = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;

const indexPath = path.join(root, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8')
  .replace(/((?:href|src)="(?:css|js)\/[^"?]+\.(?:css|js))(?:\?v=[^"]*)?"/g, `$1?v=${version}"`);
fs.writeFileSync(indexPath, html);
fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({ version }) + '\n');
console.log(`Versione ${version}`);
