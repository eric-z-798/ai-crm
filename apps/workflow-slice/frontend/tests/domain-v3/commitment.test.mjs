import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTEGRATION_STATUS, captureFollowUp, readCommitment, projectCommitment,
  appendCommitmentEvent, listPendingCommitments,
} from '../../src/domain/commitment.ts';

const raw = '  10月13日见到李明。\r\n客户问配备情况，我答应明天中午前核实后回复。\nOriginal English · 药品 A 😀  ';
const clone = value => JSON.parse(JSON.stringify(value));
function input(overrides = {}) {
  return {
    id: 'commitment-1', eventId: 'event-created', actorId: 'representative-1',
    recordedAt: '2026-10-16T09:00:00+08:00',
    source: { visitId: 'visit-1', organizationId: 'hospital-1', occurredOn: '2026-10-13', originalText: raw },
    declaration: { kind: 'explicit-self-commitment', ownerId: 'representative-1',
      confirmation: 'person-explicitly-confirmed', commitmentText: '核实后回复', deadline: { kind: 'unknown' } },
    ...overrides,
  };
}
function ok(result) { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; }
function error(result, code = 'INVALID_INPUT') { assert.equal(result.ok, false); assert.equal(result.error.code, code); }
function create(overrides = {}) { return ok(captureFollowUp(input(overrides))).commitment; }
function view(commitment) { return ok(projectCommitment(commitment)); }
function event(type, fields = {}) {
  return { type, eventId: `event-${type}`, actorId: 'representative-1', recordedAt: '2026-10-16T10:00:00+08:00', ...fields };
}
function update(commitment, entry) {
  return ok(appendCommitmentEvent(commitment, { expectedRevision: commitment.events.length, event: entry }));
}
const query = { ownerId: 'representative-1', asOfDate: '2026-10-17', asOfInstant: '2026-10-17T12:00:00+08:00' };
function withDeadline(deadline, overrides = {}) {
  return create({ ...overrides, declaration: { ...input().declaration, deadline } });
}

test('contract is explicitly an isolated integration candidate', () => assert.equal(INTEGRATION_STATUS, 'isolated-integration-candidate-source-v3'));

test('P19 explicit self-confirmation creates an owned commitment', () => {
  const result = ok(captureFollowUp(input()));
  assert.equal(result.kind, 'follow-up-created');
  assert.equal(result.commitment.ownerId, 'representative-1');
  assert.equal(view(result.commitment).completionStatus, 'open');
  assert.equal(view(result.commitment).revision, 1);
});

for (const declaration of [
  { kind: 'customer-request', requestText: '请明天回复；客户原话包含“我答应”。' },
  { kind: 'unconfirmed', candidateText: '可能下次核实；I promise appears only in the notes.' },
  { kind: 'no-self-commitment' },
]) {
  test(`P19 ${declaration.kind} creates no follow-up and retains exact input`, () => {
    const original = input({ declaration });
    const result = ok(captureFollowUp(original));
    assert.equal(result.kind, 'no-follow-up-created');
    assert.equal(Object.hasOwn(result, 'commitment'), false);
    assert.deepEqual(result.decision, original);
    assert.notEqual(result.decision, original);
    assert.equal(result.decision.source.originalText, raw);
  });
}

test('P19 declaration and missing confirmation are not inferred from natural language', () => {
  const original = input(); delete original.declaration.confirmation;
  error(captureFollowUp(original));
  error(captureFollowUp({ ...input(), declaration: { kind: 'ai-inferred', commitmentText: '我答应回复' } }));
});

test('P19 another person cannot make an owner self-confirmation', () => {
  const original = input(); original.declaration.ownerId = 'representative-2';
  error(captureFollowUp(original), 'ACTOR_MISMATCH');
});

test('P19 unknown deadline remains explicitly unknown', () => {
  const result = create();
  assert.deepEqual(view(result).deadline, { kind: 'unknown' });
  assert.equal(ok(listPendingCommitments([result], query))[0].dueState, 'unknown');
});

test('P19 unknown actual date stays null independently of deadline', () => {
  const result = create({ source: { ...input().source, occurredOn: null } });
  assert.equal(result.source.occurredOn, null);
  assert.deepEqual(view(result).deadline, { kind: 'unknown' });
});

test('P19 late-entry scenario never moves October 14 deadline to October 17', () => {
  const result = withDeadline({ kind: 'instant', at: '2026-10-14T12:00:00+08:00' });
  assert.equal(result.source.occurredOn, '2026-10-13');
  assert.equal(result.events[0].recordedAt, '2026-10-16T09:00:00+08:00');
  assert.equal(view(result).deadline.at, '2026-10-14T12:00:00+08:00');
  assert.equal(ok(listPendingCommitments([result], query))[0].dueState, 'overdue');
});

test('P24 next-day and much-later queries keep unknown-date pending work visible', () => {
  const result = create();
  for (const date of ['2026-10-17', '2026-11-30', '2027-01-01']) {
    const pending = ok(listPendingCommitments([result], { ...query, asOfDate: date, asOfInstant: `${date}T12:00:00+08:00` }));
    assert.equal(pending.length, 1);
    assert.equal(pending[0].commitment.source.visitId, 'visit-1');
  }
});

test('P24 date-only deadlines use explicit business day; future work is not hidden', () => {
  const values = [
    withDeadline({ kind: 'date', date: '2026-10-16' }, { id: 'past' }),
    withDeadline({ kind: 'date', date: '2026-10-17' }, { id: 'today' }),
    withDeadline({ kind: 'date', date: '2026-12-01' }, { id: 'future' }),
  ];
  const pending = ok(listPendingCommitments(values, query));
  assert.deepEqual(pending.map(item => item.dueState), ['overdue', 'due-today', 'upcoming']);
  assert.deepEqual(pending.map(item => item.commitment.id), ['past', 'today', 'future']);
});

test('P24 timed deadlines compare actual instants across offsets at exact boundary', () => {
  const values = [
    withDeadline({ kind: 'instant', at: '2026-10-17T03:59:59Z' }, { id: 'past' }),
    withDeadline({ kind: 'instant', at: '2026-10-17T04:00:00Z' }, { id: 'exact' }),
    withDeadline({ kind: 'instant', at: '2026-10-17T04:00:01Z' }, { id: 'future' }),
  ];
  assert.deepEqual(ok(listPendingCommitments(values, query)).map(item => item.dueState), ['overdue', 'due-now', 'upcoming']);
});

test('P24 owner filtering preserves input and is separate from authorization', () => {
  const original = create();
  assert.deepEqual(ok(listPendingCommitments([original], { ...query, ownerId: 'another-owner' })), []);
  assert.equal(view(original).completionStatus, 'open');
});

test('P25 deadline and text amendments keep original source and all previous values', () => {
  const original = withDeadline({ kind: 'date', date: '2026-10-14' });
  const revised = update(original, event('amended', { reason: '本人明确更正原承诺记录',
    commitmentText: '核实来源后回复', deadline: { kind: 'unknown' } }));
  assert.equal(view(revised).commitmentText, '核实来源后回复');
  assert.deepEqual(view(revised).deadline, { kind: 'unknown' });
  assert.deepEqual(revised.events[0], original.events[0]);
  assert.equal(revised.events[0].deadline.date, '2026-10-14');
  assert.equal(revised.source.originalText, raw);
  assert.equal(original.events.length, 1);
  assert.equal(revised.events.length, 2);
});

test('P25 amending a single field does not clear another field', () => {
  const original = withDeadline({ kind: 'date', date: '2026-10-14' });
  const revised = update(original, event('amended', { reason: '说明更正', commitmentText: '  新说明\r\n原话保留  ' }));
  assert.equal(view(revised).commitmentText, '  新说明\r\n原话保留  ');
  assert.deepEqual(view(revised).deadline, { kind: 'date', date: '2026-10-14' });
});

test('P25 empty amendments and implicit clearing are rejected', () => {
  const original = create();
  for (const fields of [{ reason: 'x' }, { reason: 'x', deadline: undefined }, { reason: 'x', commitmentText: '  ' }]) {
    error(appendCommitmentEvent(original, { expectedRevision: 1, event: event('amended', fields) }));
  }
});

test('P26 verified progress does not imply any customer reply or completion', () => {
  const progressed = update(create(), event('progress-recorded', { status: 'verified', text: '已核到配备信息，尚未回复客户' }));
  const state = view(progressed);
  assert.equal(state.verificationStatus, 'verified');
  assert.equal(state.replyToCustomer, 'not-recorded');
  assert.equal(state.replyFromCustomer, 'not-recorded');
  assert.equal(state.completionStatus, 'open');
  assert.equal(ok(listPendingCommitments([progressed], query)).length, 1);
});

test('progress status must be a literal enum string, never coerced from an object', () => {
  error(appendCommitmentEvent(create(), { expectedRevision: 1,
    event: event('progress-recorded', { status: { toString: () => 'verified' }, text: 'x' }) }));
});

for (const direction of ['to-customer', 'from-customer']) {
  test(`P26 ${direction} reply is independent of verification, opposite direction and completion`, () => {
    const replied = update(create(), event('reply-recorded', { direction, occurredAt: '2026-10-16T09:30:00+08:00', text: '  实际回复原文\r\n保留  ' }));
    const state = view(replied);
    assert.equal(state.verificationStatus, 'not-started');
    assert.equal(state.replyToCustomer, direction === 'to-customer' ? 'recorded' : 'not-recorded');
    assert.equal(state.replyFromCustomer, direction === 'from-customer' ? 'recorded' : 'not-recorded');
    assert.equal(state.completionStatus, 'open');
    assert.equal(replied.events[1].text, '  实际回复原文\r\n保留  ');
  });
}

test('P26 completion requires explicit confirmation and does not fabricate replies', () => {
  const original = create();
  error(appendCommitmentEvent(original, { expectedRevision: 1, event: event('completed', { text: '完成' }) }));
  const completed = update(original, event('completed', { confirmation: 'person-confirmed-complete', text: '本人确认已履行' }));
  assert.equal(view(completed).completionStatus, 'completed');
  assert.equal(view(completed).replyToCustomer, 'not-recorded');
  assert.equal(view(completed).verificationStatus, 'not-started');
  assert.equal(ok(listPendingCommitments([completed], query)).length, 0);
  assert.equal(completed.events.length, 2);
});

test('P25/P26 reopening retains completion history and restores cross-day pending work', () => {
  const completed = update(create(), event('completed', { confirmation: 'person-confirmed-complete', text: '本人确认完成' }));
  const reopened = update(completed, event('reopened', { reason: '发现仍有未完成事项', recordedAt: '2026-10-17T11:00:00+08:00' }));
  assert.equal(view(reopened).completionStatus, 'open');
  assert.equal(reopened.events[1].type, 'completed');
  assert.equal(ok(listPendingCommitments([reopened], query)).length, 1);
});

test('P26 illegal transitions do not silently change completed work', () => {
  const original = create();
  error(appendCommitmentEvent(original, { expectedRevision: 1, event: event('reopened', { reason: 'x' }) }), 'INVALID_TRANSITION');
  const completed = update(original, event('completed', { confirmation: 'person-confirmed-complete', text: '完成' }));
  error(appendCommitmentEvent(completed, { expectedRevision: 2, event: event('progress-recorded', { status: 'verified', text: 'x' }) }), 'INVALID_TRANSITION');
});

test('P25 revision conflict returns error without altering existing history or submitted input', () => {
  const original = create();
  const command = { expectedRevision: 2, event: event('progress-recorded', { status: 'in-progress', text: raw }) };
  const before = JSON.stringify({ original, command });
  error(appendCommitmentEvent(original, command), 'REVISION_CONFLICT');
  assert.equal(JSON.stringify({ original, command }), before);
});

test('retrying the identical event is idempotent even after a later revision', () => {
  const entry = event('progress-recorded', { status: 'in-progress', text: '处理中' });
  const progressed = update(create(), entry);
  const revised = update(progressed, event('amended', { reason: '期限核实', deadline: { kind: 'date', date: '2026-10-20' } }));
  const retry = { expectedRevision: 1, event: Object.fromEntries(Object.entries(entry).reverse()) };
  assert.deepEqual(ok(appendCommitmentEvent(revised, retry)), revised);
  assert.equal(revised.events.length, 3);
});

test('same event ID with different content cannot replace or duplicate a prior event', () => {
  const entry = event('progress-recorded', { status: 'in-progress', text: '原文' });
  const progressed = update(create(), entry);
  error(appendCommitmentEvent(progressed, { expectedRevision: 2, event: { ...entry, text: '不同原文' } }), 'EVENT_ID_CONFLICT');
  assert.equal(progressed.events[1].text, '原文');
});

test('update actor must match owner', () => {
  error(appendCommitmentEvent(create(), { expectedRevision: 1,
    event: event('progress-recorded', { actorId: 'other-person', status: 'verified', text: 'x' }) }), 'ACTOR_MISMATCH');
});

test('unknown fields and attempted owner/source changes are rejected rather than stripped', () => {
  for (const original of [
    { ...input(), extraExistingData: 'must not disappear' },
    { ...input(), source: { ...input().source, existingNote: 'retain me' } },
    { ...input(), declaration: { ...input().declaration, extra: 'retain me' } },
  ]) {
    const before = JSON.stringify(original); error(captureFollowUp(original)); assert.equal(JSON.stringify(original), before);
  }
  for (const extra of [{ ownerId: 'other' }, { source: input().source }, { deleted: true }]) {
    error(appendCommitmentEvent(create(), { expectedRevision: 1,
      event: event('amended', { reason: 'x', commitmentText: 'x', ...extra }) }));
  }
});

test('source and declaration text preserve Chinese, English, Unicode, CRLF and whitespace exactly', () => {
  const original = input(); original.declaration.commitmentText = raw;
  const result = ok(captureFollowUp(original));
  assert.deepEqual(Buffer.from(result.commitment.source.originalText, 'utf8'), Buffer.from(raw, 'utf8'));
  assert.deepEqual(Buffer.from(view(result.commitment).commitmentText, 'utf8'), Buffer.from(raw, 'utf8'));
  const restored = ok(readCommitment(JSON.parse(JSON.stringify(result.commitment))));
  assert.equal(restored.source.originalText, raw);
  assert.equal(view(restored).commitmentText, raw);
});

test('successful outputs are detached and deeply immutable without freezing the caller input', () => {
  const original = input();
  const result = ok(captureFollowUp(original));
  assert.equal(Object.isFrozen(original), false);
  original.source.originalText = 'caller edited';
  original.declaration.deadline.kind = 'changed';
  assert.equal(result.commitment.source.originalText, raw);
  assert.equal(view(result.commitment).deadline.kind, 'unknown');
  assert.throws(() => { result.commitment.source.originalText = 'overwrite'; }, TypeError);
  assert.throws(() => { result.commitment.events.push({}); }, TypeError);
});

test('repeated runs with identical input are deterministic; no clock/random/global state', () => {
  assert.deepEqual(captureFollowUp(input()), captureFollowUp(input()));
  const original = create();
  assert.deepEqual(listPendingCommitments([original], query), listPendingCommitments([original], query));
});

for (const invalidDate of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-01', '2026-10-00', '0000-01-01', '2026-1-01']) {
  test(`invalid calendar date ${invalidDate} is rejected without auto-normalization`, () => {
    const original = input(); original.declaration.deadline = { kind: 'date', date: invalidDate };
    error(captureFollowUp(original));
  });
}

test('valid leap day is accepted without requiring current/future dates', () => {
  assert.equal(view(withDeadline({ kind: 'date', date: '2024-02-29' })).deadline.date, '2024-02-29');
});

for (const invalidInstant of ['2026-10-14', '2026-10-14T12:00:00', '2026-10-14T24:00:00Z',
  '2026-10-14T12:00:60Z', '2026-02-30T12:00:00Z', '2026-10-14T12:00:00+14:30', '2026-10-14T12:00:00-00:00']) {
  test(`invalid timestamp ${invalidInstant} does not invent timezone/date`, () => {
    const original = input(); original.declaration.deadline = { kind: 'instant', at: invalidInstant };
    error(captureFollowUp(original));
  });
}

test('recording timeline is append-only while reply occurrence can precede recording', () => {
  error(appendCommitmentEvent(create(), { expectedRevision: 1,
    event: event('progress-recorded', { status: 'verified', text: 'x', recordedAt: '2026-10-15T12:00:00Z' }) }));
  error(appendCommitmentEvent(create(), { expectedRevision: 1,
    event: event('reply-recorded', { direction: 'to-customer', text: 'x', occurredAt: '2026-10-20T12:00:00Z' }) }));
  assert.equal(update(create(), event('reply-recorded', { direction: 'to-customer', text: 'x', occurredAt: '2026-10-13T12:00:00Z' })).events.length, 2);
});

test('read boundary rejects corrupted and unknown-schema histories without repair or partial results', () => {
  const original = create();
  for (const corrupted of [
    { ...clone(original), schemaVersion: 99 },
    { ...clone(original), events: [] },
    { ...clone(original), events: [event('reopened', { reason: 'x' })] },
    { ...clone(original), extra: 'do not drop' },
    { ...clone(original), events: [original.events[0], original.events[0]] },
    { ...clone(original), ownerId: 'wrong-owner' },
  ]) {
    const before = JSON.stringify(corrupted);
    assert.equal(readCommitment(corrupted).ok, false);
    assert.equal(JSON.stringify(corrupted), before);
  }
});

test('duplicate commitment IDs are an explicit conflict, never a silent overwrite', () => {
  error(listPendingCommitments([create(), create()], query), 'DUPLICATE_COMMITMENT_ID');
});

test('a malformed item makes list projection fail as a whole rather than dropping that item', () => {
  error(listPendingCommitments([create(), { ...create({ id: 'bad' }), source: null }], query));
});

test('malformed JSON-like containers, sparse arrays and extra array fields are rejected', () => {
  const original = input(); Object.defineProperty(original, 'hidden', { value: 'do not discard' });
  error(captureFollowUp(original));
  const accessor = input(); Object.defineProperty(accessor, 'source', { enumerable: true, get() { throw new Error('getter must not run'); } });
  error(captureFollowUp(accessor));
  const withSymbol = input(); withSymbol[Symbol('extra')] = 'do not discard'; error(captureFollowUp(withSymbol));
  const history = clone(create()); history.events.extra = 'do not discard'; error(readCommitment(history));
  const sparse = clone(create()); sparse.events.length = 2; error(readCommitment(sparse));
  error(readCommitment(null)); error(readCommitment(new Date()));
});

test('all supported progress/reply/completion combinations stay independent across a full lifecycle', () => {
  let value = create();
  value = update(value, event('progress-recorded', { eventId: 'p1', status: 'in-progress', text: '开始核实' }));
  value = update(value, event('reply-recorded', { eventId: 'incoming', direction: 'from-customer', occurredAt: '2026-10-16T09:30:00+08:00', text: '客户补充问题' }));
  value = update(value, event('progress-recorded', { eventId: 'p2', status: 'verified', text: '核实完成' }));
  value = update(value, event('reply-recorded', { eventId: 'outgoing', direction: 'to-customer', occurredAt: '2026-10-16T09:45:00+08:00', text: '已回复核实结果' }));
  assert.equal(view(value).completionStatus, 'open');
  value = update(value, event('completed', { confirmation: 'person-confirmed-complete', text: '本人确认本次承诺履行完毕' }));
  assert.deepEqual([view(value).verificationStatus, view(value).replyToCustomer, view(value).replyFromCustomer, view(value).completionStatus],
    ['verified', 'recorded', 'recorded', 'completed']);
  assert.equal(value.events.length, 6);
  assert.equal(value.source.originalText, raw);
});
