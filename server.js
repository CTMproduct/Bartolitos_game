import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createPool, findRecipient } from './database.js';
import { describeStartupError, initializeWithRetry } from './startup.js';

export async function loadGameHtml(read = readFile) {
  for (const filename of ['index.html', 'Bartolitos.html', 'Bartolitos (1).html']) {
    try {
      return await read(new URL(filename, import.meta.url));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw Object.assign(new Error('No se encontró la página del juego.'), { code: 'MISSING_GAME_HTML' });
}

export function createApp({ pool, participants, html }) {
  const allowedIds = new Set(participants.map(p => p.id));
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    const send = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(value));
    };
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (request.method === 'GET' && ['/', '/index.html', '/Bartolitos.html', '/Bartolitos%20(1).html'].includes(path)) {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(html);
      } else if (request.method === 'GET' && /^\/assets\/plants\/(?:plant-(?:[0-9]|1[0-2])\.jpg|credits\.json)$/.test(path)) {
        let asset;
        try {
          asset = await readFile(new URL('.' + path, import.meta.url));
        } catch (error) {
          if (error.code === 'ENOENT') return send(404, { error: 'Imagen no encontrada.' });
          throw error;
        }
        response.writeHead(200, {
          'Content-Type': path.endsWith('.jpg') ? 'image/jpeg' : 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=86400'
        });
        response.end(asset);
      } else if (request.method === 'GET' && path === '/health') {
        await pool.query('SELECT 1');
        send(200, { ok: true });
      } else if (request.method === 'GET' && path === '/api/participants') {
        send(200, participants);
      } else if (request.method === 'POST' && path === '/api/draw') {
        if (!request.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Se requiere JSON.' });
        let body = '';
        for await (const chunk of request) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 1024) return send(413, { error: 'Solicitud demasiado grande.' });
        }
        let data;
        try { data = JSON.parse(body); } catch { return send(400, { error: 'JSON inválido.' }); }
        if (!Number.isInteger(data?.participantId) || !allowedIds.has(data.participantId)) {
          return send(400, { error: 'Participante inválido.' });
        }
        const recipient = await findRecipient(pool, data.participantId);
        if (!recipient) return send(503, { error: 'Sorteo no disponible. Reintenta más tarde.' });
        send(200, { recipient });
      } else {
        send(404, { error: 'No encontrado.' });
      }
    } catch {
      console.error('No se pudo atender la solicitud. Comprueba la conexión a PostgreSQL.');
      if (!response.headersSent) send(503, { error: 'Servicio no disponible. Reintenta más tarde.' });
      else response.end();
    }
  });
}

async function start() {
  const participants = JSON.parse(await readFile(new URL('./participants.json', import.meta.url), 'utf8'));
  const html = await loadGameHtml();
  const pool = createPool(process.env.DATABASE_URL);
  pool.on('error', () => console.error('Conexión PostgreSQL interrumpida.'));
  try {
    await initializeWithRetry(pool, participants);
  } catch (error) {
    await pool.end();
    throw error;
  }
  const server = createApp({ pool, participants, html });
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Bartolitos listo; sorteo compartido en PostgreSQL.'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close(async () => { await pool.end(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch(error => {
    console.error(`No se pudo iniciar Bartolitos: ${describeStartupError(error)}`);
    process.exitCode = 1;
  });
}
