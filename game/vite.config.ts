import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Dev only: debug mode posts a fall-through-the-level record here; it lands in the repo's tmp/falls/ (gitignored). */
function fallCapture(): Plugin {
  const folder = resolve(__dirname, '..', 'tmp', 'falls');
  return {
    name: 'wincs-fall-capture',
    configureServer(server) {
      server.middlewares.use('/__debug/fall', (request, response) => {
        if (request.method !== 'POST') { response.statusCode = 405; response.end(); return; }
        let body = '';
        request.on('data', chunk => { body += chunk; if (body.length > 20e6) request.destroy(); });
        request.on('end', () => {
          try {
            const record = JSON.parse(body) as { at: string; region: string; image?: string };
            const stamp = `${record.at.replace(/[:.]/g, '-')}-${String(record.region).replace(/[^a-z0-9-]/gi, '')}`;
            mkdirSync(folder, { recursive: true });
            const { image, ...data } = record;
            if (image?.startsWith('data:image/png;base64,')) writeFileSync(join(folder, `${stamp}.png`), Buffer.from(image.slice(22), 'base64'));
            writeFileSync(join(folder, `${stamp}.json`), JSON.stringify(data, null, 1));
            response.end('ok');
          } catch { response.statusCode = 400; response.end(); }
        });
      });
    },
  };
}

export default defineConfig({ plugins: [fallCapture()] });
