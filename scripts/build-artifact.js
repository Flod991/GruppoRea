// Crea una versione a file unico dell'app (CSS e JS incorporati) da pubblicare come pagina su claude.ai.
// Uso: node scripts/build-artifact.js <file-di-destinazione.html>
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const out = process.argv[2];
if (!out) {
  console.error('Uso: node scripts/build-artifact.js <destinazione.html>');
  process.exit(1);
}

const html = read('index.html');
const title = html.match(/<title>(.*?)<\/title>/)[1];
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src='));
const script = (code) => {
  if (code.includes('</script')) throw new Error('Il codice contiene </script>');
  return `<script>\n${code}\n</script>`;
};

const page = [
  `<title>${title}</title>`,
  `<style>\n${read('css/style.css')}\n</style>`,
  body.trim(),
  script('window.TURNI_EMBED = true;'),
  script(read('js/config.js')),
  script(read('js/scheduler.js')),
  script(read('js/storage.js')),
  script(read('js/app.js')),
  '',
].join('\n');

fs.writeFileSync(out, page);
console.log(`Creato ${out} (${Math.round(page.length / 1024)} KB)`);
