import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontendPort = Number(process.env.FRONTEND_PORT || 4173);
const backendPort = Number(process.env.BACKEND_PORT || 8787);
const backendPath = process.env.API_PATH || '/query-api';
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

function resolveStaticPath(pathname) {
  const decodedPath = decodeURIComponent(pathname.split('?')[0] || '/');
  const normalizedPath = normalize(decodedPath).replace(/^(\.\.(?:\/|\\|$))+/u, '');
  const filePath = resolve(rootDir, normalizedPath === sep ? 'index.html' : normalizedPath.slice(1));

  if (!filePath.startsWith(rootDir)) {
    return '';
  }

  return filePath;
}

function sendText(response, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType
  });
  response.end(body);
}

async function serveStaticFile(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  let filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = join(filePath, 'index.html');
    }

    const contentType = mimeTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream';
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': (await stat(filePath)).size,
      'Content-Type': contentType
    });
    createReadStream(filePath).pipe(response);
  } catch (_error) {
    sendText(response, 404, 'Not found');
  }
}

function listen(server, port) {
  return new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
}

const backend = spawn(process.execPath, ['examples/minimal-backend/server.mjs'], {
  cwd: rootDir,
  env: {
    ...process.env,
    API_PATH: backendPath,
    PORT: String(backendPort)
  },
  stdio: 'inherit'
});
const staticServer = createServer((request, response) => {
  serveStaticFile(request, response).catch(error => {
    sendText(response, 500, error.message || 'Static server error');
  });
});

function shutdown() {
  staticServer.close();
  backend.kill('SIGTERM');
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
backend.on('exit', code => {
  if (code && code !== 0) {
    staticServer.close();
    process.exit(code);
  }
});

await listen(staticServer, frontendPort);

const apiUrl = `http://127.0.0.1:${backendPort}${backendPath}`;
const appUrl = `http://127.0.0.1:${frontendPort}/index.html?api_url=${encodeURIComponent(apiUrl)}`;

console.log(`Static frontend: http://127.0.0.1:${frontendPort}/index.html`);
console.log(`Example backend: ${apiUrl}`);
console.log(`Demo URL: ${appUrl}`);
