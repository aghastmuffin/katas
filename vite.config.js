import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const yowaspGen = path.resolve(root, 'node_modules/@yowasp/clang/gen');

const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.tar': 'application/octet-stream',
  '.a': 'application/octet-stream',
  '.map': 'application/json',
};

/** Serve YoWASP gen/ as static files (no Vite transform of new URL + wasm). */
function yowaspStaticPlugin() {
  return {
    name: 'yowasp-static',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url?.split('?')[0] ?? '';
        if (!raw.startsWith('/yowasp/')) return next();

        const rel = decodeURIComponent(raw.slice('/yowasp/'.length));
        if (!rel || rel.includes('..')) {
          res.statusCode = 400;
          res.end('Bad request');
          return;
        }

        const file = path.join(yowaspGen, rel);
        if (!file.startsWith(yowaspGen) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

        const ext = path.extname(file);
        res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      // Production: copy gen assets next to dist so /yowasp/* works after build
      const outDir = path.resolve(root, 'dist/yowasp');
      fs.mkdirSync(outDir, { recursive: true });
      for (const name of fs.readdirSync(yowaspGen)) {
        fs.copyFileSync(path.join(yowaspGen, name), path.join(outDir, name));
      }
    },
  };
}

export default defineConfig({
  base: '/katas/', // Matches your GitHub repository name
  assetsInclude: ['**/*.a', '**/*.wasm', '**/*.tar'],
  optimizeDeps: {
    exclude: ['@yowasp/clang'],
  },
  worker: {
    format: 'es',
  },
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 200000,
  },
  server: {
    fs: {
      allow: ['.', 'node_modules'],
    },
  },
  plugins: [yowaspStaticPlugin()],
});
