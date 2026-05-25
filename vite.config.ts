import { defineConfig } from 'vite';
import type { Connect } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const safeFileName = (value: string) =>
  value
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);

const recordMiddleware = (): Connect.NextHandleFunction => (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  let body = '';
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const payload = JSON.parse(body) as { filename?: string; markdown?: string };
      const recordsDir = resolve(process.cwd(), 'records');
      mkdirSync(recordsDir, { recursive: true });
      const filename = safeFileName(payload.filename || `record-${Date.now()}.md`);
      writeFileSync(resolve(recordsDir, filename), payload.markdown || '', 'utf8');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    } catch {
      res.statusCode = 400;
      res.end('Bad Request');
    }
  });
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'silent-match-record-writer',
      configureServer(server) {
        server.middlewares.use('/__records', recordMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use('/__records', recordMiddleware());
      }
    }
  ],
  server: {
    port: 5174
  }
});
