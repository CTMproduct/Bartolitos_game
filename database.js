import pg from 'pg';
import { makeAssignments } from './draw.js';

export function createPool(connectionString) {
  if (!connectionString?.trim()) throw Object.assign(new Error('Falta DATABASE_URL.'), { code: 'MISSING_DATABASE_URL' });
  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error();
  } catch {
    throw Object.assign(new Error('DATABASE_URL no tiene formato PostgreSQL.'), { code: 'INVALID_DATABASE_URL' });
  }
  return new pg.Pool({ connectionString, max: 8, connectionTimeoutMillis: 10000 });
}

export async function initializeDatabase(pool, participants) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // All server replicas use the same transaction lock, including on first deployment.
    await client.query('SELECT pg_advisory_xact_lock(202620, 1)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS bartolitos_participants (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(name) > 0)
      );
      CREATE TABLE IF NOT EXISTS bartolitos_assignments (
        giver_id INTEGER PRIMARY KEY REFERENCES bartolitos_participants(id),
        recipient_id INTEGER NOT NULL UNIQUE REFERENCES bartolitos_participants(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (giver_id <> recipient_id)
      );
    `);
    const existing = await client.query('SELECT id, name FROM bartolitos_participants ORDER BY id');
    if (!existing.rowCount) {
      for (const participant of participants) {
        await client.query('INSERT INTO bartolitos_participants (id, name) VALUES ($1, $2)', [participant.id, participant.name]);
      }
    } else if (JSON.stringify(existing.rows) !== JSON.stringify([...participants].sort((a, b) => a.id - b.id))) {
      throw Object.assign(new Error('La lista de participantes cambió.'), { code: 'PARTICIPANTS_CHANGED' });
    }
    const count = await client.query('SELECT count(*)::integer AS total FROM bartolitos_assignments');
    if (count.rows[0].total === 0) {
      for (const assignment of makeAssignments(participants)) {
        await client.query('INSERT INTO bartolitos_assignments (giver_id, recipient_id) VALUES ($1, $2)', [assignment.giverId, assignment.recipientId]);
      }
    } else if (count.rows[0].total !== participants.length) {
      throw Object.assign(new Error('Sorteo incompleto en la base de datos.'), { code: 'INCOMPLETE_DRAW' });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function findRecipient(pool, giverId) {
  const result = await pool.query(`
    SELECT p.id, p.name FROM bartolitos_assignments a
    JOIN bartolitos_participants p ON p.id = a.recipient_id
    WHERE a.giver_id = $1
  `, [giverId]);
  return result.rows[0] ?? null;
}
