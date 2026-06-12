import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontendPort = Number(process.env.FRONTEND_PORT || 4173);
const liveApiUrl = process.env.LIVE_API_URL || 'https://mlp.sirsi.net/uhtbin/query_api.pl';
const proxyPath = process.env.LIVE_API_PROXY_PATH || '/live-query-api';

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

  if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${sep}`)) {
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

function redirectToProxyBackedApp(url, response) {
  const appUrl = new URL('/index.html', url.origin);
  url.searchParams.forEach((value, key) => {
    appUrl.searchParams.set(key, value);
  });
  appUrl.searchParams.set('api_url', proxyPath);

  response.writeHead(302, {
    'Cache-Control': 'no-store',
    Location: `${appUrl.pathname}${appUrl.search}`
  });
  response.end();
}

function shouldForceProxyApi(url) {
  return (url.pathname === '/' || url.pathname === '/index.html')
    && !url.searchParams.has('api_url')
    && !url.searchParams.has('query_api_url');
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function proxyLiveApi(request, response) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Headers': 'content-type, accept',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });
    response.end();
    return;
  }

  const headers = new Headers();
  const accept = request.headers.accept;
  const contentType = request.headers['content-type'];

  if (accept) {
    headers.set('accept', String(accept));
  }
  if (contentType) {
    headers.set('content-type', String(contentType));
  }

  const body = (request.method === 'GET' || request.method === 'HEAD')
    ? undefined
    : await readRequestBody(request);

  try {
    const upstream = await fetch(liveApiUrl, {
      body,
      headers,
      method: request.method
    });

    const responseHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream'
    };
    const queryId = upstream.headers.get('x-query-id');
    if (queryId) {
      responseHeaders['X-Query-Id'] = queryId;
    }

    response.writeHead(upstream.status, responseHeaders);
    if (!upstream.body) {
      response.end();
      return;
    }

    await new Promise((resolvePipe, rejectPipe) => {
      const stream = Readable.fromWeb(upstream.body);
      stream.on('error', rejectPipe);
      response.on('finish', resolvePipe);
      stream.pipe(response);
    });
  } catch (error) {
    sendText(
      response,
      502,
      JSON.stringify({ error: error?.message || 'Live API proxy request failed' }),
      'application/json; charset=utf-8'
    );
  }
}

async function serveStaticFile(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  let filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  try {
    let fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = join(filePath, 'index.html');
      fileStat = await stat(filePath);
    }

    const contentType = mimeTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream';
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': fileStat.size,
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

const staticServer = createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === proxyPath) {
    proxyLiveApi(request, response).catch(error => {
      sendText(response, 500, error.message || 'Live API proxy error');
    });
    return;
  }

  if (shouldForceProxyApi(url)) {
    redirectToProxyBackedApp(url, response);
    return;
  }

  serveStaticFile(request, response).catch(error => {
    sendText(response, 500, error.message || 'Static server error');
  });
});

function shutdown() {
  staticServer.close();
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

await listen(staticServer, frontendPort);

const appUrl = `http://127.0.0.1:${frontendPort}/index.html?api_url=${encodeURIComponent(proxyPath)}`;

console.log(`Static frontend: http://127.0.0.1:${frontendPort}/index.html`);
console.log(`Live API target: ${liveApiUrl}`);
console.log(`Live API proxy: http://127.0.0.1:${frontendPort}${proxyPath}`);
console.log(`Live-backed test URL: ${appUrl}`);
