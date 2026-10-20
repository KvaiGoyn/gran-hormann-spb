import { createReadStream, watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve('release/static');
const rootInfo = await stat(root).catch(() => null);
if (!rootInfo?.isDirectory()) {
  throw new Error('Static export not found. Run "npm run export:static" first.');
}

const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};

const clients = new Set();
const changedFiles = new Set();
let reloadTimer;
const liveReloadScript = `<script>(()=>{const events=new EventSource('/__live-reload');events.onmessage=e=>{let files=[];try{files=JSON.parse(e.data)}catch{}if(files.length&&files.every(file=>file.endsWith('.css'))){let updated=false;for(const file of files){for(const link of document.querySelectorAll('link[rel="stylesheet"]')){if(new URL(link.href,location.href).pathname==='/'+file){link.href=link.href.split('?')[0]+'?live='+Date.now();updated=true}}}if(updated)return}location.reload()}})();</script>`;

function scheduleReload(filename) {
  if (filename) changedFiles.add(filename.toString().replaceAll('\\', '/'));
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    const files = [...changedFiles];
    changedFiles.clear();
    const message = `data: ${JSON.stringify(files)}\n\n`;
    for (const client of clients) client.write(message);
    console.log(`Changed in release/static: ${files.join(', ') || 'file'}`);
  }, 120);
}

function watchChanged(_event, filename) {
  if (!filename) {
    scheduleReload();
    return;
  }

  const relative = filename.toString().replaceAll('\\', '/');
  const file = resolve(root, relative);
  if (file !== root && !file.startsWith(root + sep)) return;
  stat(file).then(info => {
    if (info.isFile()) scheduleReload(relative);
  }).catch(() => scheduleReload(relative));
}

const server = createServer(async (request, response) => {
  if (request.url?.split('?', 1)[0] === '/__live-reload') {
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' }).end('Method not allowed');
      return;
    }
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8'
    });
    response.write(': connected\n\n');
    clients.add(response);
    request.on('close', () => clients.delete(response));
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  let file = resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    let info = await stat(file);
    if (info.isDirectory()) {
      file = resolve(file, 'index.html');
      info = await stat(file);
    }
    if (!info.isFile()) throw new Error('Not a file');

    const isHtml = extname(file).toLowerCase() === '.html';
    const body = isHtml ? (await readFile(file, 'utf8')).replace('</body>', `${liveReloadScript}</body>`) : null;
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': body === null ? info.size : Buffer.byteLength(body),
      'Content-Type': mimeTypes[extname(file).toLowerCase()] ?? 'application/octet-stream'
    });
    if (request.method === 'HEAD') response.end();
    else if (body !== null) response.end(body);
    else createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use; try --port ${port + 1}.` : error.message);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Static preview with auto-reload: http://127.0.0.1:${port}`);
  console.log('Edits inside release/static refresh the page automatically. Press Ctrl+C to stop.');
  const watcher = watch(root, { recursive: true }, watchChanged);
  watcher.on('error', error => console.error(`Watching release/static failed: ${error.message}`));
});
