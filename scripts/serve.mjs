import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { readCatalog } from './catalog.mjs';
import { bundleJavaScript } from './bundle.mjs';
const root = fileURLToPath(new URL('../src/', import.meta.url));
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let body;
    let type;
    if (pathname === '/data/catalog.json') {
      body = JSON.stringify(await readCatalog());
      type = types['.json'];
    } else if (pathname === '/assets/js/app.js') {
      body = await bundleJavaScript();
      type = types['.js'];
    } else {
      const path = await realpath(resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`));
      if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) {
        response.writeHead(403).end();
        return;
      }
      type = types[extname(path)];
      if (!type) {
        response.writeHead(404).end();
        return;
      }
      body = await readFile(path);
    }
    response.writeHead(200, {
      'Content-Type': type === 'image/png' ? type : `${type}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
    response.end(
      error.code === 'ENOENT'
        ? 'Not found'
        : 'Unable to serve file or validate catalog. See terminal.'
    );
    if (error.code !== 'ENOENT') console.error(error);
  }
});
server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () =>
  console.log(`WAF builder: http://127.0.0.1:${server.address().port} (refresh after edits)`)
);
