import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp, loadGameHtml } from '../server.js';

test('loads index.html, supports previous filenames, and reports a missing page', async () => {
  const actual = await loadGameHtml();
  assert.match(actual.toString(), /<!doctype html>/i);
  for (const filename of ['index.html', 'Bartolitos.html', 'Bartolitos (1).html']) {
    const html = await loadGameHtml(async url => {
      if (decodeURIComponent(url.pathname).endsWith('/' + filename)) return '<h1>Game</h1>';
      throw Object.assign(new Error(), { code: 'ENOENT' });
    });
    assert.equal(html, '<h1>Game</h1>');
  }
  await assert.rejects(loadGameHtml(async () => { throw Object.assign(new Error(), { code: 'ENOENT' }); }), { code: 'MISSING_GAME_HTML' });
  await assert.rejects(loadGameHtml(async () => { throw Object.assign(new Error(), { code: 'EACCES' }); }), { code: 'EACCES' });
});

test('API repeats the stored assignment across concurrent requests and validates inputs', async () => {
  const participants = [{ id: 1, name: 'Ana' }, { id: 2, name: 'Juan' }];
  const pool = { async query(sql, params) {
    if (sql === 'SELECT 1') return { rows: [] };
    return { rows: params[0] === 1 ? [participants[1]] : [participants[0]] };
  } };
  const server = createApp({ pool, participants, html: '<h1>Bartolitos</h1>' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const draw = body => fetch(base + '/api/draw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const results = await Promise.all(Array.from({ length: 40 }, async () => (await draw({ participantId: 1 })).json()));
    assert.ok(results.every(r => r.recipient.id === 2));
    assert.equal((await (await draw({ participantId: 2 })).json()).recipient.id, 1);
    for (const participantId of [null, 99, '1', -1, 1.5]) assert.equal((await draw({ participantId })).status, 400);
    assert.equal((await fetch(base + '/health')).status, 200);
    assert.deepEqual(await (await fetch(base + '/api/participants')).json(), participants);
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(base + '/participants.json')).status, 404);
    assert.equal((await fetch(base + '/.env')).status, 404);
    const photo = await fetch(base + '/assets/plants/plant-12.jpg');
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/jpeg');
    const imageBytes = new Uint8Array(await photo.arrayBuffer());
    assert.deepEqual([...imageBytes.slice(0, 2)], [255, 216]);
    assert.equal((await fetch(base + '/assets/plants/plant-99.jpg')).status, 404);
    assert.equal((await (await fetch(base + '/assets/plants/credits.json')).json()).length, 13);
    assert.equal((await fetch(base + '/api/draw', { method: 'POST', body: 'text' })).status, 415);
    assert.equal((await draw({ participantId: 1, large: 'a'.repeat(1500) })).status, 413);
    pool.query = async () => { throw new Error('offline'); };
    assert.equal((await draw({ participantId: 1 })).status, 503);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
