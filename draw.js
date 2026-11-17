import { randomInt } from 'node:crypto';

export function makeAssignments(participants) {
  if (participants.length < 2 || new Set(participants.map(p => p.id)).size !== participants.length) {
    throw new Error('Se necesitan al menos dos participantes con identificadores distintos.');
  }
  const ids = participants.map(p => p.id);
  // Rejection sampling over shuffled permutations: no self assignments, no duplicates.
  let recipients;
  do {
    recipients = [...ids];
    for (let i = recipients.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [recipients[i], recipients[j]] = [recipients[j], recipients[i]];
    }
  } while (recipients.some((id, i) => id === ids[i]));
  return ids.map((giverId, i) => ({ giverId, recipientId: recipients[i] }));
}
