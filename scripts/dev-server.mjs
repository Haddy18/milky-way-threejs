/* ═══ Servidor de desarrollo con recarga en vivo ══════════════
 * Sirve el sitio estático y empuja un evento Server-Sent Events cada vez que
 * cambia un fichero. El cliente inyectado en el HTML escucha ese flujo y
 * recarga la página solo. Cero dependencias: http + fs + crypto de Node.
 *
 * Uso:  node scripts/dev-server.mjs [--port 8080]
 *   o:  npm run dev
 *
 * No es un servidor de producción: sin compresión, sin caché, sin TLS. Su
 * único trabajo es que al guardar un .js/.css/.html veas el cambio al
 * instante en el navegador, sin tocar F5.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// Puerto por CLI (--port N) o PORT, con 8080 por defecto.
const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const PORT = Number(flag('--port', process.env.PORT || 8080));

// Tipos MIME que el navegador necesita para importar módulos ES y pintar.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bin': 'application/octet-stream',
  '.tle': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm'
};

// Cliente SSE inyectado antes de </body> en las respuestas HTML.
const CLIENT = `<script>
(() => {
  const es = new EventSource('/__livereload');
  es.onmessage = (e) => { if (e.data === 'reload') location.reload(); };
  es.onerror = () => { /* el servidor se reinició: el EventSource reintenta solo */ };
})();
</script>`;

const MIME_TYPE = (p) => MIME[extname(p).toLowerCase()] || 'application/octet-stream';

// Asegura que la ruta pedida cae dentro de ROOT (sin ../ ni rutas absolutas).
function safePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const rel = normalize(clean).replace(/^(\.\.[/\\])+/, '');
  const full = resolve(join(ROOT, rel));
  if (full !== ROOT && !full.startsWith(ROOT + sep)) return null;
  return full;
}

// Clientes SSE conectados.
const clients = new Set();

function broadcastReload() {
  for (const res of clients) res.write('data: reload\n\n');
}

const server = createServer(async (req, res) => {
  const urlPath = req.url || '/';

  // Flujo de recarga en vivo.
  if (urlPath.startsWith('/__livereload')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write(':conectado\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  let full = safePath(urlPath === '/' ? '/index.html' : urlPath);
  if (!full) { res.writeHead(403).end('403'); return; }

  // Si es un directorio, sirve su index.html.
  try {
    const s = await stat(full);
    if (s.isDirectory()) full = join(full, 'index.html');
  } catch { /* no existe: puede ser una ruta "limpia" sin extensión */ }

  try {
    let body = await readFile(full);
    // Inyecta el cliente de recarga en el HTML.
    if (MIME_TYPE(full).startsWith('text/html')) {
      let html = body.toString('utf8');
      html = html.includes('</body>')
        ? html.replace('</body>', CLIENT + '</body>')
        : html + CLIENT;
      body = Buffer.from(html, 'utf8');
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPE(full),
      'Cache-Control': 'no-store',
      'Content-Length': body.length
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 — ' + urlPath);
  }
});

// Observa el árbol del proyecto y avisa de cambios (con debounce: los
// editores a veces escriben dos veces de golpe).
let timer = null;
function onChange(event, file) {
  if (file.includes(`${sep}data${sep}raw${sep}`)) return;   // catálogos crudos
  if (file.includes(`${sep}node_modules${sep}`)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(`  ~ ${file.replace(ROOT + sep, '')} → recargando`);
    broadcastReload();
  }, 80);
}

const watchDirs = ['', 'js', 'css', 'data', 'vendor'];
for (const d of watchDirs) {
  const dir = join(ROOT, d);
  try { watch(dir, { recursive: true }, onChange); } catch { /* dir opcional */ }
}

server.listen(PORT, () => {
  console.log(`▸ Vía Láctea (dev) en http://localhost:${PORT}`);
  console.log(`  recarga en vivo activa — guarda un fichero y el navegador solo se actualiza`);
  console.log(`  Ctrl+C para parar`);
});
