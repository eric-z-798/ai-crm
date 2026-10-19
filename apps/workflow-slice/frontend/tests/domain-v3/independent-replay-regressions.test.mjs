import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../../src/domain/commitment.ts';
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.value; };
function create() { return ok(api.captureFollowUp({ id: 'c', eventId: 'created', actorId: 'u', recordedAt: '2026-10-19T10:00:00Z',
  source: { visitId: 'v', organizationId: 'o', occurredOn: null, originalText: '本人明确承诺' },
  declaration: { kind: 'explicit-self-commitment', ownerId: 'u', confirmation: 'person-explicitly-confirmed', commitmentText: 'A', deadline: { kind: 'unknown' } } })).commitment; }
function append(c, e) { return ok(api.appendCommitmentEvent(c, { expectedRevision: c.events.length,
  event: { actorId: 'u', recordedAt: '2026-10-19T10:01:00Z', ...e } })); }
for (const type of ['amended', 'reopened']) {
  test(`BLOCKER-03 ${type}: exact stored event can be retried without stripping contentRevision`, () => {
    let c = create();
    if (type === 'reopened') c = append(c, { type: 'completed', eventId: 'done', confirmation: 'person-confirmed-complete', text: '完成' });
    const beforeRevision = c.events.length;
    c = append(c, type === 'amended' ? { type, eventId: 'amend', commitmentText: 'B', reason: '明确修改' }
      : { type, eventId: 'reopen', reason: '明确重开' });
    const stored = c.events.at(-1);
    const snapshot = JSON.stringify(c);
    const retry = ok(api.appendCommitmentEvent(c, { expectedRevision: beforeRevision, event: stored }));
    assert.deepEqual(retry, c); assert.equal(JSON.stringify(c), snapshot);
  });
}
