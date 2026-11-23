import { appendFileSync, createReadStream, existsSync, mkdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
function localAssets(): Plugin {
  const models = resolve(import.meta.dirname, '../models');
  const results = resolve(import.meta.dirname, '../../results');
  mkdirSync(results, { recursive: true });
  return { name: 'checkpoint-local-assets', configureServer(server) {
    server.middlewares.use('/models', (req, res, next) => {
      try {
        const file = resolve(models, '.' + decodeURIComponent((req.url || '/').split('?')[0]));
        if (!file.startsWith(models + sep) || !/\.(onnx|json)$/.test(file) || !existsSync(file) || !statSync(file).isFile() || !realpathSync(file).startsWith(realpathSync(models) + sep)) return next();
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
        res.setHeader('Content-Length', statSync(file).size);
        for (const [key, value] of Object.entries(isolation)) res.setHeader(key, value);
        createReadStream(file).pipe(res);
      } catch { res.statusCode = 400; res.end('Invalid asset path'); }
    });
    server.middlewares.use('/result', (req, res) => {
      if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
      if (!/^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(req.headers.host || '')) { res.statusCode = 403; res.end(); return; }
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { res.statusCode = 403; res.end(); return; }
      const name = new URL(req.url || '/', 'http://localhost').searchParams.get('name') || '';
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,150}\.(jsonl|wav)$/.test(name)) { res.statusCode = 400; res.end(); return; }
      const chunks: Buffer[] = []; let size = 0; let rejected = false;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) {
          if (!rejected) { rejected = true; chunks.length = 0; res.statusCode = 413; res.end(); }
          return;
        }
        if (!rejected) chunks.push(chunk);
      });
      req.on('end', () => {
        if (rejected) return;
        try {
          const bytes = Buffer.concat(chunks);
          if (name.endsWith('.jsonl')) appendFileSync(resolve(results, name), bytes);
          else writeFileSync(resolve(results, name), bytes);
          res.end('saved');
        } catch { res.statusCode = 500; res.end('Could not save local result'); }
      });
    });
  } };
}
export default defineConfig({
  plugins: [localAssets()],
  server: { host: '127.0.0.1', port: 5189, strictPort: true, hmr: false, headers: {
    ...isolation,
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
  } },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  build: { target: 'es2022' },
});
