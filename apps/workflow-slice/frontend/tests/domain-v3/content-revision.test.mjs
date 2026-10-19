import test from 'node:test';
import assert from 'node:assert/strict';
import { captureFollowUp, appendCommitmentEvent, projectCommitment, readCommitment, listPendingCommitments } from '../../src/domain/commitment.ts';

const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const view = value => ok(projectCommitment(value));
const clone = value => JSON.parse(JSON.stringify(value));
const event = (type, fields = {}) => ({ type, eventId: type, actorId: 'owner', recordedAt: '2026-10-19T10:00:00Z', ...fields });
const append = (value, entry) => ok(appendCommitmentEvent(value, { expectedRevision: value.events.length, event: entry }));
function create() {
  return ok(captureFollowUp({ id: 'c', eventId: 'created', actorId: 'owner', recordedAt: '2026-10-19T09:00:00Z',
    source: { visitId: 'v', organizationId: 'org', occurredOn: '2026-10-13', originalText: '  我答应核实A后回复。\r\nSource retained.  ' },
    declaration: { kind: 'explicit-self-commitment', ownerId: 'owner', confirmation: 'person-explicitly-confirmed',
      commitmentText: '核实A后回复', deadline: { kind: 'unknown' } } })).commitment;
}
function verifiedAndReplied() {
  let value = append(create(), event('progress-recorded', { status: 'verified', text: 'A已核实' }));
  value = append(value, event('reply-recorded', { direction: 'to-customer', occurredAt: '2026-10-19T09:30:00Z', text: 'A回复原文' }));
  value = append(value, event('reply-recorded', { eventId: 'incoming', direction: 'from-customer', occurredAt: '2026-10-19T09:40:00Z', text: 'A收讫' }));
  return value;
}
const expand = value => append(value, event('amended', { reason: '本人增加B', commitmentText: '核实A和B后回复' }));

test('v0.2 stores an explicit content revision on every event, separate from journal revision', () => {
  const value = verifiedAndReplied();
  assert.equal(value.schemaVersion, 3);
  assert.deepEqual(value.events.map(e => e.contentRevision), [1, 1, 1, 1]);
  assert.equal(view(value).revision, 4);
  assert.equal(view(value).contentRevision, 1);
  assert.equal(view(value).verificationEventId, 'progress-recorded');
  assert.equal(view(value).replyToCustomerEventId, 'reply-recorded');
  assert.equal(view(value).replyFromCustomerEventId, 'incoming');
});

test('expanding A to A+B resets current verification and both reply projections without deleting facts', () => {
  const old = verifiedAndReplied();
  const value = expand(old);
  const state = view(value);
  assert.equal(state.contentRevision, 2);
  assert.deepEqual([state.verificationStatus, state.replyToCustomer, state.replyFromCustomer], ['not-started', 'not-recorded', 'not-recorded']);
  assert.deepEqual([state.verificationEventId, state.replyToCustomerEventId, state.replyFromCustomerEventId], [null, null, null]);
  assert.deepEqual(value.events.slice(0, 4), old.events);
  assert.equal(value.events[1].contentRevision, 1);
  assert.equal(value.events[1].text, 'A已核实');
  assert.equal(value.events[2].text, 'A回复原文');
  assert.equal(value.events[4].contentRevision, 2);
  assert.equal(value.source.originalText, old.source.originalText);
});

test('explicit new-scope progress and reply restore only their own current states', () => {
  let value = expand(verifiedAndReplied());
  value = append(value, event('progress-recorded', { eventId: 'progress-v2', contentRevision: 2, status: 'verified', text: 'A及B均已核实' }));
  assert.equal(view(value).verificationStatus, 'verified');
  assert.equal(view(value).replyToCustomer, 'not-recorded');
  value = append(value, event('reply-recorded', { eventId: 'reply-v2', contentRevision: 2, direction: 'to-customer', occurredAt: '2026-10-19T09:50:00Z', text: '已回复A+B' }));
  assert.equal(view(value).replyToCustomer, 'recorded');
  assert.equal(view(value).replyToCustomerEventId, 'reply-v2');
  assert.equal(view(value).replyFromCustomer, 'not-recorded');
  assert.equal(view(value).completionStatus, 'open');
});

test('late reply explicitly associated with historical content stays historical', () => {
  const value = append(expand(verifiedAndReplied()), event('reply-recorded', { eventId: 'late-A-reply', contentRevision: 1,
    direction: 'from-customer', occurredAt: '2026-10-19T09:55:00Z', text: '仅确认收到A' }));
  assert.equal(view(value).replyFromCustomer, 'not-recorded');
  assert.equal(value.events.at(-1).contentRevision, 1);
  assert.equal(value.events.at(-1).text, '仅确认收到A');
});

test('new facts default to the current scope protected by the exact expected journal revision', () => {
  const value = append(expand(create()), event('progress-recorded', { status: 'in-progress', text: '核实新增的B' }));
  assert.equal(value.events.at(-1).contentRevision, 2);
  assert.equal(view(value).verificationStatus, 'in-progress');
});

test('date-only amendment retains same-content verified/replied facts and their original event IDs', () => {
  const old = verifiedAndReplied();
  const value = append(old, event('amended', { reason: '明确原未知期限', deadline: { kind: 'date', date: '2026-10-20' } }));
  assert.equal(view(value).contentRevision, 1);
  assert.equal(view(value).verificationStatus, 'verified');
  assert.equal(view(value).replyToCustomerEventId, 'reply-recorded');
});

test('identical text does not create a false content revision', () => {
  const value = append(verifiedAndReplied(), event('amended', { reason: '重复确认同文', commitmentText: '核实A后回复' }));
  assert.equal(view(value).contentRevision, 1);
  assert.equal(view(value).verificationStatus, 'verified');
});

test('even a formatting-only text change requires fresh scope confirmation; no equivalence inference', () => {
  const value = append(verifiedAndReplied(), event('amended', { reason: '更改原文', commitmentText: ' 核实A后回复 ' }));
  assert.equal(view(value).contentRevision, 2);
  assert.equal(view(value).verificationStatus, 'not-started');
  assert.equal(view(value).commitmentText, ' 核实A后回复 ');
});

test('changing A to B and back to A never resurrects an old verification', () => {
  let value = expand(verifiedAndReplied());
  value = append(value, event('amended', { eventId: 'back-to-A', reason: '再次变更', commitmentText: '核实A后回复' }));
  assert.equal(view(value).contentRevision, 3);
  assert.equal(view(value).verificationStatus, 'not-started');
  assert.equal(view(value).replyToCustomer, 'not-recorded');
});

test('stale progress/completion scope is rejected instead of qualifying new content', () => {
  const value = expand(create());
  for (const entry of [
    event('progress-recorded', { contentRevision: 1, status: 'verified', text: '只核实A' }),
    event('completed', { contentRevision: 1, confirmation: 'person-confirmed-complete', text: '只完成A' }),
  ]) {
    const before = JSON.stringify({ value, entry });
    const result = appendCommitmentEvent(value, { expectedRevision: value.events.length, event: entry });
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify({ value, entry }), before);
  }
});

test('nonexistent/fractional/undefined content references are rejected', () => {
  const value = expand(create());
  for (const revision of [0, -1, 1.5, 3, undefined]) {
    assert.equal(appendCommitmentEvent(value, { expectedRevision: value.events.length,
      event: event('reply-recorded', { contentRevision: revision, direction: 'from-customer', occurredAt: '2026-10-19T09:50:00Z', text: 'x' }) }).ok, false);
  }
});

test('same event retry after content expansion keeps its original scope and does not append', () => {
  const value = expand(verifiedAndReplied());
  const retry = event('progress-recorded', { status: 'verified', text: 'A已核实' });
  const result = ok(appendCommitmentEvent(value, { expectedRevision: 1, event: retry }));
  assert.deepEqual(result, value);
  assert.equal(view(result).verificationStatus, 'not-started');
  const changedScope = appendCommitmentEvent(value, { expectedRevision: 1, event: { ...retry, contentRevision: 2 } });
  assert.equal(changedScope.ok, false);
  assert.equal(changedScope.error.code, 'EVENT_ID_CONFLICT');
});

for (const direction of ['from-customer', 'to-customer']) {
  test(`completed commitment accepts ${direction} facts without reopening or hiding completion`, () => {
    const completed = append(create(), event('completed', { confirmation: 'person-confirmed-complete', text: '确认履行完毕' }));
    const value = append(completed, event('reply-recorded', { direction, occurredAt: '2026-10-19T09:50:00Z', text: '完成后的补充事实' }));
    assert.equal(view(value).completionStatus, 'completed');
    assert.equal(value.events.some(e => e.type === 'reopened'), false);
    assert.equal(value.events[1].type, 'completed');
    assert.equal(ok(listPendingCommitments([value], { ownerId: 'owner', asOfDate: '2026-10-20', asOfInstant: '2026-10-20T00:00:00Z' })).length, 0);
  });
}

test('post-completion reply retry is idempotent and explicit reopen remains a separate action', () => {
  let value = append(create(), event('completed', { confirmation: 'person-confirmed-complete', text: '确认完成' }));
  const reply = event('reply-recorded', { direction: 'from-customer', occurredAt: '2026-10-19T09:50:00Z', text: '客户收讫' });
  value = append(value, reply);
  assert.deepEqual(ok(appendCommitmentEvent(value, { expectedRevision: 2, event: reply })), value);
  value = append(value, event('reopened', { reason: '本人决定重新处理' }));
  assert.equal(view(value).completionStatus, 'open');
  assert.equal(view(value).replyFromCustomer, 'recorded');
  assert.equal(view(value).contentRevision, 1);
});

test('historical-scope late reply after a later scope completed does not become that scope reply', () => {
  let value = expand(create());
  value = append(value, event('completed', { confirmation: 'person-confirmed-complete', text: 'A+B完成' }));
  value = append(value, event('reply-recorded', { contentRevision: 1, direction: 'from-customer', occurredAt: '2026-10-19T09:50:00Z', text: '客户仅确认A' }));
  assert.equal(view(value).completionStatus, 'completed');
  assert.equal(view(value).replyFromCustomer, 'not-recorded');
  assert.equal(value.events.at(-1).contentRevision, 1);
});

test('read boundary rejects missing, forged and inconsistent stored content scopes', () => {
  const original = expand(verifiedAndReplied());
  for (const mutate of [
    x => { delete x.events[1].contentRevision; },
    x => { x.events[0].contentRevision = 2; },
    x => { x.events[1].contentRevision = 2; },
    x => { x.events.at(-1).contentRevision = 1; },
    x => { x.events[2].contentRevision = 0; },
  ]) {
    const invalid = clone(original); mutate(invalid);
    const before = JSON.stringify(invalid);
    assert.equal(readCommitment(invalid).ok, false);
    assert.equal(JSON.stringify(invalid), before);
  }
});

test('v1 snapshots are preserved and rejected for explicit migration, never guessed into v2', () => {
  const legacy = clone(create()); legacy.schemaVersion = 1; delete legacy.events[0].contentRevision;
  const before = JSON.stringify(legacy);
  assert.equal(readCommitment(legacy).ok, false);
  assert.equal(JSON.stringify(legacy), before);
});

test('v2 full JSON round trip retains historical scope, raw text, current statuses and completion', () => {
  let value = expand(verifiedAndReplied());
  value = append(value, event('completed', { confirmation: 'person-confirmed-complete', text: '  本人确认\r\nA+B完成  ' }));
  value = append(value, event('reply-recorded', { eventId: 'late', direction: 'from-customer', contentRevision: 1,
    occurredAt: '2026-10-19T09:50:00Z', text: '原A回复\r\nEnglish 😀' }));
  assert.deepEqual(ok(readCommitment(clone(value))), value);
  assert.deepEqual(view(ok(readCommitment(clone(value)))), view(value));
});
