import test from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../database.js';
import { describeStartupError, initializeWithRetry } from '../startup.js';

test('missing or invalid DATABASE_URL produces a specific, safe diagnosis', () => {
  for (const value of [undefined, '', ' ']) {
    assert.throws(() => createPool(value), { code: 'MISSING_DATABASE_URL' });
  }
  for (const value of ['${{Postgres.DATABASE_URL}}', 'https://example.com', 'not-a-url']) {
    assert.throws(() => createPool(value), { code: 'INVALID_DATABASE_URL' });
  }
  const secret = 'postgresql://user:super-secret@host/database';
  for (const code of ['ECONNREFUSED', '28P01', 'PARTICIPANTS_CHANGED', undefined, secret]) {
    const message = describeStartupError(Object.assign(new Error(secret), { code }));
    assert.ok(!message.includes(secret));
    assert.ok(!message.includes('super-secret'));
  }
  assert.match(describeStartupError({ code: 'MISSING_DATABASE_URL' }), /Falta DATABASE_URL/);
});

test('temporarily offline database retries then starts, without generating a fallback draw', async () => {
  let calls = 0;
  const logs = [], delays = [];
  await initializeWithRetry({}, [], {
    initialize: async () => {
      calls++;
      if (calls < 3) throw Object.assign(new Error('private information'), { code: 'ECONNREFUSED' });
    },
    wait: async delay => delays.push(delay),
    log: message => logs.push(message)
  });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [3000, 3000]);
  assert.equal(logs.length, 2);
  assert.ok(logs.every(message => !message.includes('private information')));
});

test('configuration and saved draw errors are not retried; connection failures stop after the limit', async () => {
  for (const code of ['28P01', 'PARTICIPANTS_CHANGED', 'INCOMPLETE_DRAW', 'ECONNREFUSED']) {
    let calls = 0;
    await assert.rejects(initializeWithRetry({}, [], {
      initialize: async () => { calls++; throw Object.assign(new Error(), { code }); },
      wait: async () => {}, log: () => {}, attempts: 3
    }), { code });
    assert.equal(calls, code === 'ECONNREFUSED' ? 3 : 1);
  }
});
