import test from 'node:test';
import assert from 'node:assert/strict';
import { captureFollowUp, appendCommitmentEvent, projectCommitment } from '../../src/domain/commitment.ts';

const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.value; };
const view = c => ok(projectCommitment(c));
const evt = (type, details = {}) => ({ type, eventId: type, actorId: 'owner', recordedAt: '2026-10-19T10:00:00Z', ...details });
const append = (c, e) => ok(appendCommitmentEvent(c, { expectedRevision: c.events.length, event: e }));
const clone = x => JSON.parse(JSON.stringify(x));
function initial() {
  return ok(captureFollowUp({ id: 'c', eventId: 'created', actorId: 'owner', recordedAt: '2026-10-19T09:00:00Z',
    source: { visitId: 'v', organizationId: 'org', occurredOn: null, originalText: ' 原始A\r\nEnglish ' },
    declaration: { kind: 'explicit-self-commitment', ownerId: 'owner', confirmation: 'person-explicitly-confirmed',
      commitmentText: 'A', deadline: { kind: 'unknown' } } })).commitment;
}
function complete(c) { return append(c, evt('completed', { confirmation: 'person-confirmed-complete', text: '本人确认完成' })); }
function lifecycle() {
  let c = append(initial(), evt('amended', { reason: '本人扩展', commitmentText: 'B' }));
  c = append(c, evt('progress-recorded', { status: 'verified', text: 'B已核' }));
  c = append(c, evt('reply-recorded', { direction: 'to-customer', occurredAt: '2026-10-19T09:30:00Z', text: '已回B' }));
  c = complete(c);
  c = append(c, evt('reopened', { reason: '本人决定重开' }));
  c = append(c, evt('amended', { eventId: 'amended-again', reason: '再次扩展', commitmentText: 'C' }));
  return c;
}

for (const type of ['amended', 'progress-recorded', 'reply-recorded', 'completed', 'reopened']) {
  test(`stored ${type} can be replayed unchanged after the current scope changed`, () => {
    const c = lifecycle();
    const stored = c.events.find(e => e.type === type);
    const replay = Object.fromEntries(Object.entries(clone(stored)).reverse());
    const before = JSON.stringify({ c, replay });
    const result = ok(appendCommitmentEvent(c, { expectedRevision: 1, event: replay }));
    assert.deepEqual(result, c);
    assert.equal(result.events.length, 7);
    assert.equal(view(result).contentRevision, 3);
    assert.equal(JSON.stringify({ c, replay }), before);
  });
}

test('amended explicit contentRevision is the resulting scope and is not incremented twice', () => {
  const c = append(initial(), evt('amended', { reason: '明确扩展', commitmentText: 'B', contentRevision: 2 }));
  assert.equal(view(c).contentRevision, 2);
  assert.equal(c.events.at(-1).contentRevision, 2);
  assert.deepEqual(ok(appendCommitmentEvent(c, { expectedRevision: 1, event: c.events.at(-1) })), c);
});

for (const [name, fields] of [
  ['deadline-only', { deadline: { kind: 'date', date: '2026-10-20' } }],
  ['identical-text', { commitmentText: 'A' }],
]) {
  test(`${name} amendment uses current scope and is replayable`, () => {
    const c = append(initial(), evt('amended', { reason: '本人核对', contentRevision: 1, ...fields }));
    assert.equal(view(c).contentRevision, 1);
    assert.deepEqual(ok(appendCommitmentEvent(c, { expectedRevision: 1, event: clone(c.events.at(-1)) })), c);
  });
}

test('reopened explicit contentRevision is current and is replayable', () => {
  const c = append(complete(initial()), evt('reopened', { reason: '本人重新打开', contentRevision: 1 }));
  assert.equal(view(c).contentRevision, 1);
  assert.equal(view(c).completionStatus, 'open');
  assert.deepEqual(ok(appendCommitmentEvent(c, { expectedRevision: 2, event: c.events.at(-1) })), c);
});

test('new amendment wrong target scope never changes input or double-increments', () => {
  const c = initial();
  for (const [scope, fields] of [[1, { commitmentText: 'B' }], [3, { commitmentText: 'B' }], [2, { commitmentText: 'A' }], [2, { deadline: { kind: 'unknown' } }]]) {
    const event = evt('amended', { reason: '测试错误范围', contentRevision: scope, ...fields });
    const before = JSON.stringify({ c, event });
    const r = appendCommitmentEvent(c, { expectedRevision: 1, event });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'INVALID_INPUT');
    assert.equal(JSON.stringify({ c, event }), before);
  }
});

test('new reopen wrong target scope is rejected with all history/input retained', () => {
  const c = complete(initial());
  const event = evt('reopened', { reason: '测试错误范围', contentRevision: 2 });
  const before = JSON.stringify({ c, event });
  const r = appendCommitmentEvent(c, { expectedRevision: 2, event });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'INVALID_INPUT');
  assert.equal(JSON.stringify({ c, event }), before);
});

test('same stored event ID with changed scope is a conflict and cannot become a new event', () => {
  const c = lifecycle();
  for (const stored of c.events.slice(1)) {
    const r = appendCommitmentEvent(c, { expectedRevision: c.events.length, event: { ...stored, contentRevision: stored.contentRevision + 1 } });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'EVENT_ID_CONFLICT');
  }
  assert.equal(c.events.length, 7);
});

test('unscoped original amendment/reopen commands remain idempotent after later scopes', () => {
  const c = lifecycle();
  for (const stored of c.events.filter(e => ['amended', 'reopened'].includes(e.type))) {
    const replay = clone(stored); delete replay.contentRevision;
    assert.deepEqual(ok(appendCommitmentEvent(c, { expectedRevision: 1, event: replay })), c);
  }
});

test('explicit undefined, fractional or missing-valid-scope values cannot silently default', () => {
  for (const contentRevision of [undefined, 0, -1, 1.1, '2']) {
    assert.equal(appendCommitmentEvent(initial(), { expectedRevision: 1,
      event: evt('amended', { reason: 'x', commitmentText: 'B', contentRevision }) }).ok, false);
  }
});

test('revision conflict still applies to new correctly scoped commands and keeps raw input', () => {
  const c = initial();
  const e = evt('amended', { reason: '原始理由\r\n保留', commitmentText: 'B', contentRevision: 2 });
  const before = JSON.stringify(e);
  const r = appendCommitmentEvent(c, { expectedRevision: 2, event: e });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'REVISION_CONFLICT');
  assert.equal(JSON.stringify(e), before);
});
