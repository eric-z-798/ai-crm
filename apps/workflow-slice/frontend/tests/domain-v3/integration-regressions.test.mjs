import test from 'node:test';
import assert from 'node:assert/strict';
import { captureFollowUp, appendCommitmentEvent, projectCommitment } from '../../src/domain/commitment.ts';

// Independent QA regression body unchanged; only import adapted to the v0.2.0 candidate.
// Original v0.1.0 failure evidence is retained separately.
// These tests do not change the candidate and are not security tests.
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.value; };
function initial() {
  return ok(captureFollowUp({ id: 'regression-c', eventId: 'created', actorId: 'owner',
    recordedAt: '2026-10-19T10:00:00Z',
    source: { visitId: 'v', organizationId: 'org', occurredOn: '2026-10-13', originalText: '我答应核实A后回复。' },
    declaration: { kind: 'explicit-self-commitment', ownerId: 'owner',
      confirmation: 'person-explicitly-confirmed', commitmentText: '核实A后回复', deadline: { kind: 'unknown' } },
  })).commitment;
}
function add(c, event) {
  return ok(appendCommitmentEvent(c, { expectedRevision: c.events.length,
    event: { actorId: 'owner', recordedAt: '2026-10-19T10:01:00Z', ...event } }));
}

test('BLOCKER-01: expanding the promise must not present old verification as verification of the new scope', () => {
  let c = initial();
  c = add(c, { type: 'progress-recorded', eventId: 'progress-a', status: 'verified', text: 'A已核实' });
  c = add(c, { type: 'reply-recorded', eventId: 'reply-a', direction: 'to-customer',
    occurredAt: '2026-10-19T10:00:30Z', text: '已回复A的信息' });
  c = add(c, { type: 'amended', eventId: 'expanded', reason: '本人明确扩展任务', commitmentText: '核实A和B后回复' });
  const v = ok(projectCommitment(c));
  assert.equal(v.commitmentText, '核实A和B后回复');
  assert.equal(v.history.length, 4, 'old facts must stay available');
  assert.notEqual(v.verificationStatus, 'verified', 'old A verification cannot qualify new A+B scope');
  assert.equal(v.replyToCustomer, 'not-recorded', 'current-scope reply must be distinguished from historical A reply');
});

test('BLOCKER-02: a customer acknowledgement after completion can be recorded without reopening the commitment', () => {
  let c = initial();
  c = add(c, { type: 'completed', eventId: 'completed', confirmation: 'person-confirmed-complete', text: '本人确认已履行' });
  const r = appendCommitmentEvent(c, { expectedRevision: c.events.length, event: {
    type: 'reply-recorded', eventId: 'late-acknowledgement', actorId: 'owner',
    recordedAt: '2026-10-19T10:03:00Z', occurredAt: '2026-10-19T10:02:00Z',
    direction: 'from-customer', text: '客户：已收到，谢谢。',
  } });
  const withAck = ok(r);
  assert.equal(ok(projectCommitment(withAck)).completionStatus, 'completed');
  assert.equal(withAck.events.length, 3);
  assert.equal(withAck.events.some(e => e.type === 'reopened'), false);
});
