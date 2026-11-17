import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { MultiplayerServer } from './src/server/multiplayerServer.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_PROD = process.env.NODE_ENV === 'production';

function resolvePort(): number {
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx >= 0 && process.argv[portArgIdx + 1]) {
    const cliPort = Number(process.argv[portArgIdx + 1]);
    if (Number.isFinite(cliPort) && cliPort > 0) return cliPort;
  }
  if (!IS_PROD && process.env.NGINX_PORT && process.env.PORT === process.env.NGINX_PORT) {
    return Number(process.env.DEFAULT_APP_PORT || 3000);
  }
  return Number(process.env.PORT || 3000);
}

const PORT = resolvePort();

const NO_HMR_VITE_CLIENT = `export class ErrorOverlay {}
export function createHotContext() {
  return {
    accept() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
    data: {},
  };
}
export function injectQuery(url) {
  return url;
}
export function updateStyle(id, css) {
  let el = document.querySelector(\`style[data-vite-dev-id="\${id}"]\`);
  if (!el) {
    el = document.createElement('style');
    el.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(el);
  }
  el.textContent = css;
}
export function removeStyle(id) {
  const el = document.querySelector(\`style[data-vite-dev-id="\${id}"]\`);
  if (el) el.remove();
}
`;

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const mp = new MultiplayerServer(httpServer);

  app.get('/health', (_req, res) => {
    res.json({ ok: true, ...mp.getStats() });
  });

  if (IS_PROD) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript').send(NO_HMR_VITE_CLIENT);
    });
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use((req, res, next) => {
      if (req.method === 'GET' && (req.path === '/' || req.path.endsWith('.html'))) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      }
      next();
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Platform X server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
