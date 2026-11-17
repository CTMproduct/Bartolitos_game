import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeAssignments } from '../draw.js';

const participants = JSON.parse(await readFile(new URL('../participants.json', import.meta.url), 'utf8'));

test('1,000 complete draws: every person gives and receives exactly once, never themselves', () => {
  for (let run = 0; run < 1000; run++) {
    const assignments = makeAssignments(participants);
    assert.equal(assignments.length, participants.length);
    assert.equal(new Set(assignments.map(a => a.giverId)).size, participants.length);
    assert.equal(new Set(assignments.map(a => a.recipientId)).size, participants.length);
    assert.ok(assignments.every(a => a.giverId !== a.recipientId));
  }
});

test('two participants exchange gifts and invalid participant lists are rejected', () => {
  assert.deepEqual(makeAssignments([{ id: 3 }, { id: 9 }]), [{ giverId: 3, recipientId: 9 }, { giverId: 9, recipientId: 3 }]);
  assert.throws(() => makeAssignments([{ id: 1 }]));
  assert.throws(() => makeAssignments([{ id: 1 }, { id: 1 }]));
});
