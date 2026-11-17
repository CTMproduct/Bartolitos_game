import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createPool, initializeDatabase, findRecipient } from '../database.js';

test('PostgreSQL: simultaneous startups, persistence, and database uniqueness constraints', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run against PostgreSQL'
}, async () => {
  const url = process.env.TEST_DATABASE_URL;
  const admin = createPool(url);
  const schema = 'test_' + randomUUID().replaceAll('-', '');
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: url, max: 8, options: `-c search_path=${schema}` });
  const participants = JSON.parse(await readFile(new URL('../participants.json', import.meta.url), 'utf8'));
  try {
    await Promise.all(Array.from({ length: 6 }, () => initializeDatabase(pool, participants)));
    const first = await Promise.all(participants.map(p => findRecipient(pool, p.id)));
    assert.equal(new Set(first.map(p => p.id)).size, participants.length);
    assert.ok(first.every((p, i) => p.id !== participants[i].id));
    await initializeDatabase(pool, participants);
    assert.deepEqual(await Promise.all(participants.map(p => findRecipient(pool, p.id))), first);
    await assert.rejects(pool.query('UPDATE bartolitos_assignments SET recipient_id = giver_id WHERE giver_id = $1', [participants[0].id]), { code: '23514' });
    const duplicate = first.find((recipient, i) => i !== 0 && recipient.id !== participants[0].id);
    await assert.rejects(pool.query('UPDATE bartolitos_assignments SET recipient_id = $1 WHERE giver_id = $2', [duplicate.id, participants[0].id]), { code: '23505' });
    await assert.rejects(initializeDatabase(pool, participants.slice(1)));
    assert.deepEqual(await findRecipient(pool, participants[0].id), first[0]);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
