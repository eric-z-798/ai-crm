/**
 * SOURCE-V3 integration candidate. No storage, network, AI, NLP, clock or ID generator.
 * Commands record explicit caller decisions; the service must authenticate the actor.
 * All outputs are detached, deeply frozen snapshots. All input strings are verbatim.
 */
export const INTEGRATION_STATUS = "isolated-integration-candidate-source-v3" as const;

export type Deadline =
  | { readonly kind: "unknown" }
  | { readonly kind: "date"; readonly date: string }
  | { readonly kind: "instant"; readonly at: string };

export type CommunicationSource = {
  readonly visitId: string;
  /** Actual communication day. Null means unknown; never inferred from entry time. */
  readonly occurredOn: string | null;
  readonly originalText: string;
} & (
  | { readonly organizationId: string; readonly organizationText?: string }
  | { readonly organizationId: null; readonly organizationText: string }
);

export type Declaration =
  | { readonly kind: "no-self-commitment" }
  | { readonly kind: "customer-request"; readonly requestText: string }
  | { readonly kind: "unconfirmed"; readonly candidateText: string }
  | {
      readonly kind: "explicit-self-commitment";
      readonly ownerId: string;
      readonly confirmation: "person-explicitly-confirmed";
      readonly commitmentText: string;
      readonly deadline: Deadline;
    };

export interface CaptureInput {
  readonly id: string;
  readonly eventId: string;
  readonly actorId: string;
  readonly recordedAt: string;
  readonly source: CommunicationSource;
  readonly declaration: Declaration;
}

interface EventMetadata {
  readonly eventId: string;
  readonly actorId: string;
  readonly recordedAt: string;
}

export type VerificationStatus = "not-started" | "in-progress" | "verified";

export type CreatedEvent = EventMetadata & {
  readonly type: "created";
  readonly contentRevision: 1;
  readonly confirmation: "person-explicitly-confirmed";
  readonly commitmentText: string;
  readonly deadline: Deadline;
};

export type UpdateEvent = EventMetadata & {
  /** Optional scope assertion; amended uses the resulting scope, reopened uses the current one. */
  readonly contentRevision?: number;
} & (
  | { readonly type: "amended"; readonly reason: string;
      readonly commitmentText?: string; readonly deadline?: Deadline }
  | { readonly type: "progress-recorded"; readonly status: VerificationStatus;
      readonly text: string }
  /** Recording a reply is NOT sending it. Incoming and outgoing replies stay distinct. */
  | { readonly type: "reply-recorded"; readonly direction: "to-customer" | "from-customer";
      readonly occurredAt: string; readonly text: string }
  | { readonly type: "completed"; readonly confirmation: "person-confirmed-complete";
      readonly text: string }
  | { readonly type: "reopened"; readonly reason: string }
);

/** Every stored event has an explicit content scope, separate from the journal revision. */
export type StoredUpdateEvent = UpdateEvent & { readonly contentRevision: number };
export type CommitmentEvent = CreatedEvent | StoredUpdateEvent;

export interface Commitment {
  readonly schemaVersion: 3;
  readonly kind: "self-commitment";
  readonly id: string;
  readonly ownerId: string;
  readonly source: CommunicationSource;
  readonly events: readonly [CreatedEvent, ...StoredUpdateEvent[]];
}

export type CaptureOutcome =
  | { readonly kind: "no-follow-up-created"; readonly decision: CaptureInput }
  | { readonly kind: "follow-up-created"; readonly decision: CaptureInput;
      readonly commitment: Commitment };

export type ErrorCode = "INVALID_INPUT" | "ACTOR_MISMATCH" | "REVISION_CONFLICT"
  | "EVENT_ID_CONFLICT" | "INVALID_TRANSITION" | "DUPLICATE_COMMITMENT_ID";

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: ErrorCode; readonly message: string } };

export interface CommitmentView {
  readonly id: string;
  readonly ownerId: string;
  readonly source: CommunicationSource;
  readonly revision: number;
  readonly contentRevision: number;
  readonly commitmentText: string;
  readonly deadline: Deadline;
  readonly verificationStatus: VerificationStatus;
  readonly verificationEventId: string | null;
  readonly replyToCustomer: "not-recorded" | "recorded";
  readonly replyToCustomerEventId: string | null;
  readonly replyFromCustomer: "not-recorded" | "recorded";
  readonly replyFromCustomerEventId: string | null;
  readonly completionStatus: "open" | "completed";
  readonly history: readonly CommitmentEvent[];
}

type JsonRecord = Record<string, unknown>;
class DomainError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) { super(message); this.code = code; }
}

function fail(message: string, code: ErrorCode = "INVALID_INPUT"): never {
  throw new DomainError(code, message);
}
function obj(value: unknown, label: string): asserts value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${label}: expected a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label}: expected a plain object`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !Object.getOwnPropertyDescriptor(value, key)?.enumerable
        || !Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), "value")) {
      fail(`${label}: only enumerable JSON data properties are supported`);
    }
  }
}
function keys(value: JsonRecord, required: readonly string[], optional: readonly string[] = []): void {
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`Missing field: ${key}`);
  for (const key of Object.keys(value)) if (![...required, ...optional].includes(key)) fail(`Unsupported field: ${key}; input was not changed`);
}
function denseArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) fail(`${label}: expected a plain array`);
  const allowed = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !allowed.has(key) || !Object.hasOwn(descriptor, "value")) fail(`${label}: unsupported array property`);
  }
  for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) fail(`${label}: sparse arrays are not accepted`);
}
function text(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) fail(`${label}: expected non-blank text`);
}
function id(value: unknown, label: string): asserts value is string {
  text(value, label);
  if (value.trim() !== value) fail(`${label}: surrounding whitespace is not accepted`);
}
function day(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${label}: expected YYYY-MM-DD`);
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const date = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || date < 1 || date > days[month - 1]!) fail(`${label}: invalid calendar date`);
}
function instant(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") fail(`${label}: expected an explicit-offset timestamp`);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) fail(`${label}: expected timestamp with seconds and Z or explicit offset`);
  day(match[1], label);
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) fail(`${label}: invalid time`);
  const offset = match[5]!;
  if (offset !== "Z") {
    const hours = Number(offset.slice(1, 3));
    const minutes = Number(offset.slice(4, 6));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0) || offset === "-00:00") {
      fail(`${label}: invalid or unknown offset`);
    }
  }
  if (!Number.isFinite(Date.parse(value))) fail(`${label}: invalid timestamp`);
}
function deadline(value: unknown): asserts value is Deadline {
  obj(value, "deadline");
  switch (value.kind) {
    case "unknown": keys(value, ["kind"]); break;
    case "date": keys(value, ["kind", "date"]); day(value.date, "deadline.date"); break;
    case "instant": keys(value, ["kind", "at"]); instant(value.at, "deadline.at"); break;
    default: fail("deadline.kind: expected unknown, date or instant");
  }
}
function source(value: unknown): asserts value is CommunicationSource {
  obj(value, "source"); keys(value, ["visitId", "organizationId", "occurredOn", "originalText"], ["organizationText"]);
  id(value.visitId, "source.visitId");
  if (value.organizationId !== null) id(value.organizationId, "source.organizationId");
  if (value.organizationId === null || Object.hasOwn(value, "organizationText")) text(value.organizationText, "source.organizationText");
  if (value.occurredOn !== null) day(value.occurredOn, "source.occurredOn");
  text(value.originalText, "source.originalText");
}
function declaration(value: unknown): asserts value is Declaration {
  obj(value, "declaration");
  switch (value.kind) {
    case "no-self-commitment": keys(value, ["kind"]); break;
    case "customer-request": keys(value, ["kind", "requestText"]); text(value.requestText, "requestText"); break;
    case "unconfirmed": keys(value, ["kind", "candidateText"]); text(value.candidateText, "candidateText"); break;
    case "explicit-self-commitment":
      keys(value, ["kind", "ownerId", "confirmation", "commitmentText", "deadline"]);
      id(value.ownerId, "ownerId"); text(value.commitmentText, "commitmentText"); deadline(value.deadline);
      if (value.confirmation !== "person-explicitly-confirmed") fail("Explicit personal confirmation is required");
      break;
    default: fail("Unsupported declaration kind; no natural-language classification is performed");
  }
}
function metadata(value: JsonRecord): void {
  id(value.eventId, "eventId"); id(value.actorId, "actorId"); instant(value.recordedAt, "recordedAt");
}
const eventKeys = ["type", "eventId", "actorId", "recordedAt"] as const;
function event(value: unknown, allowCreated: boolean, stored: true): asserts value is CommitmentEvent;
function event(value: unknown, allowCreated: boolean, stored: false): asserts value is CommitmentEvent | UpdateEvent;
function event(value: unknown, allowCreated: boolean, stored: boolean): asserts value is CommitmentEvent | UpdateEvent {
  obj(value, "event"); metadata(value);
  const requiredScope = stored ? ["contentRevision"] : [];
  const optionalScope = stored ? [] : ["contentRevision"];
  if (Object.hasOwn(value, "contentRevision") && (!Number.isSafeInteger(value.contentRevision) || (value.contentRevision as number) < 1)) fail("contentRevision must be a positive integer");
  switch (value.type) {
    case "created":
      if (!allowCreated) fail("Created event is not an update");
      keys(value, [...eventKeys, "contentRevision", "confirmation", "commitmentText", "deadline"]);
      if (value.contentRevision !== 1) fail("Created contentRevision must be 1");
      if (value.confirmation !== "person-explicitly-confirmed") fail("Explicit personal confirmation is required");
      text(value.commitmentText, "commitmentText"); deadline(value.deadline); break;
    case "amended":
      keys(value, [...eventKeys, ...requiredScope, "reason"], [...optionalScope, "commitmentText", "deadline"]); text(value.reason, "reason");
      if (!Object.hasOwn(value, "commitmentText") && !Object.hasOwn(value, "deadline")) fail("Amendment must specify a changed field");
      if (Object.hasOwn(value, "commitmentText")) text(value.commitmentText, "commitmentText");
      if (Object.hasOwn(value, "deadline")) deadline(value.deadline); break;
    case "progress-recorded":
      keys(value, [...eventKeys, ...requiredScope, "status", "text"], optionalScope); text(value.text, "text");
      if (typeof value.status !== "string" || !["not-started", "in-progress", "verified"].includes(value.status)) fail("Invalid progress status");
      break;
    case "reply-recorded":
      keys(value, [...eventKeys, ...requiredScope, "direction", "occurredAt", "text"], optionalScope); text(value.text, "text");
      if (value.direction !== "to-customer" && value.direction !== "from-customer") fail("Reply direction must be explicit");
      instant(value.occurredAt, "reply.occurredAt");
      if (Date.parse(value.occurredAt) > Date.parse(value.recordedAt as string)) fail("A recorded reply cannot have occurred after its recording time");
      break;
    case "completed":
      keys(value, [...eventKeys, ...requiredScope, "confirmation", "text"], optionalScope); text(value.text, "text");
      if (value.confirmation !== "person-confirmed-complete") fail("Explicit completion confirmation is required");
      break;
    case "reopened": keys(value, [...eventKeys, ...requiredScope, "reason"], optionalScope); text(value.reason, "reason"); break;
    default: fail("Unsupported event type");
  }
}

function checkTransition(isComplete: boolean, type: UpdateEvent["type"]): boolean {
  // A later customer fact does not undo the owner's completion decision.
  if (type === "reply-recorded") return isComplete;
  if (type === "reopened") {
    if (!isComplete) fail("Only a completed commitment can be reopened", "INVALID_TRANSITION");
    return false;
  }
  if (isComplete) fail("Reopen before changing a completed commitment", "INVALID_TRANSITION");
  return type === "completed";
}

function checkCommitment(value: unknown): asserts value is Commitment {
  obj(value, "commitment"); keys(value, ["schemaVersion", "kind", "id", "ownerId", "source", "events"]);
  if (value.schemaVersion !== 3 || value.kind !== "self-commitment") fail("Unsupported commitment schema; retain original data for an explicit migration");
  id(value.id, "id"); id(value.ownerId, "ownerId"); source(value.source);
  denseArray(value.events, "events");
  if (value.events.length === 0) fail("Commitment requires its original created event");
  const seen = new Set<string>();
  let lastTime = -Infinity;
  let complete = false;
  let contentRevision = 1;
  let commitmentText = "";
  for (const [index, item] of value.events.entries()) {
    event(item, index === 0, true);
    if (index === 0 && item.type !== "created") fail("First event must be created");
    if (item.type === "created") commitmentText = item.commitmentText;
    if (item.type === "amended" && item.commitmentText !== undefined && item.commitmentText !== commitmentText) {
      contentRevision++;
      commitmentText = item.commitmentText;
    }
    if (item.type === "reply-recorded") {
      if (item.contentRevision! > contentRevision) fail("Reply refers to a content revision that does not exist");
    } else if (item.contentRevision !== contentRevision) fail("Event contentRevision does not match the content being acted on");
    if (item.actorId !== value.ownerId) fail("Only the owner may record a personal commitment event", "ACTOR_MISMATCH");
    if (seen.has(item.eventId)) fail("Duplicate event ID in history", "EVENT_ID_CONFLICT");
    seen.add(item.eventId);
    const time = Date.parse(item.recordedAt);
    if (time < lastTime) fail("History recording times must be nondecreasing");
    lastTime = time;
    if (item.type !== "created") complete = checkTransition(complete, item.type);
  }
}

function cloneFreeze<T>(value: T): T {
  const clone: T = JSON.parse(JSON.stringify(value));
  const freeze = (item: unknown): void => {
    if (item !== null && typeof item === "object") {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  freeze(clone);
  return clone;
}
function result<T>(operation: () => T): Result<T> {
  try { return Object.freeze({ ok: true, value: cloneFreeze(operation()) }); }
  catch (error) {
    if (error instanceof DomainError) return Object.freeze({ ok: false, error: Object.freeze({ code: error.code, message: error.message }) });
    // Programmer/runtime failures must remain visible rather than masquerading as user validation.
    throw error;
  }
}

/** Accepts structured human decisions only. Requests and uncertain candidates are retained without creating a task. */
export function captureFollowUp(input: CaptureInput): Result<CaptureOutcome> {
  return result(() => {
    obj(input, "capture"); keys(input, ["id", "eventId", "actorId", "recordedAt", "source", "declaration"]);
    id(input.id, "id"); metadata(input); source(input.source); declaration(input.declaration);
    if (input.declaration.kind !== "explicit-self-commitment") return { kind: "no-follow-up-created", decision: input };
    if (input.declaration.ownerId !== input.actorId) fail("A person can confirm only their own commitment", "ACTOR_MISMATCH");
    const created: CreatedEvent = { type: "created", contentRevision: 1, eventId: input.eventId, actorId: input.actorId,
      recordedAt: input.recordedAt, confirmation: input.declaration.confirmation,
      commitmentText: input.declaration.commitmentText, deadline: input.declaration.deadline };
    const commitment: Commitment = { schemaVersion: 3, kind: "self-commitment", id: input.id,
      ownerId: input.declaration.ownerId, source: input.source, events: [created] };
    return { kind: "follow-up-created", decision: input, commitment };
  });
}

/** Strict boundary for data loaded by a future API adapter. Unsupported fields are rejected, never dropped. */
export function readCommitment(value: unknown): Result<Commitment> {
  return result(() => { checkCommitment(value); return value; });
}

function project(value: Commitment): CommitmentView {
  let commitmentText = value.events[0].commitmentText;
  let contentRevision = 1;
  let currentDeadline = value.events[0].deadline;
  let verificationStatus: VerificationStatus = "not-started";
  let verificationEventId: string | null = null;
  let replyToCustomer: CommitmentView["replyToCustomer"] = "not-recorded";
  let replyToCustomerEventId: string | null = null;
  let replyFromCustomer: CommitmentView["replyFromCustomer"] = "not-recorded";
  let replyFromCustomerEventId: string | null = null;
  let completionStatus: CommitmentView["completionStatus"] = "open";
  for (const entry of value.events) {
    if (entry.type === "amended") {
      if (entry.commitmentText !== undefined && entry.commitmentText !== commitmentText) {
        commitmentText = entry.commitmentText;
        contentRevision = entry.contentRevision;
        // No NLP equivalence inference: any actual text change starts an unverified scope.
        verificationStatus = "not-started"; verificationEventId = null;
        replyToCustomer = "not-recorded"; replyToCustomerEventId = null;
        replyFromCustomer = "not-recorded"; replyFromCustomerEventId = null;
      }
      if (entry.deadline !== undefined) currentDeadline = entry.deadline;
    } else if (entry.type === "progress-recorded" && entry.contentRevision === contentRevision) {
      verificationStatus = entry.status; verificationEventId = entry.eventId;
    } else if (entry.type === "reply-recorded" && entry.contentRevision === contentRevision) {
      if (entry.direction === "to-customer") { replyToCustomer = "recorded"; replyToCustomerEventId = entry.eventId; }
      else { replyFromCustomer = "recorded"; replyFromCustomerEventId = entry.eventId; }
    } else if (entry.type === "completed") completionStatus = "completed";
    else if (entry.type === "reopened") completionStatus = "open";
  }
  return { id: value.id, ownerId: value.ownerId, source: value.source, revision: value.events.length, contentRevision,
    commitmentText, deadline: currentDeadline, verificationStatus, verificationEventId, replyToCustomer, replyToCustomerEventId,
    replyFromCustomer, replyFromCustomerEventId, completionStatus, history: value.events };
}

export function projectCommitment(value: Commitment): Result<CommitmentView> {
  return result(() => { checkCommitment(value); return project(value); });
}

// Object key order is irrelevant to retry comparison. String content is not normalized.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as JsonRecord)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface UpdateCommand { readonly expectedRevision: number; readonly event: UpdateEvent }

/** Optimistic revision and event-ID retry checks are in-memory only, not a database transaction. */
export function appendCommitmentEvent(value: Commitment, command: UpdateCommand): Result<Commitment> {
  return result(() => {
    checkCommitment(value); obj(command, "update"); keys(command, ["expectedRevision", "event"]);
    if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 1) fail("expectedRevision must be a positive integer");
    event(command.event, false, false);
    if (command.event.actorId !== value.ownerId) fail("Only the owner may update their commitment", "ACTOR_MISMATCH");
    const duplicate = value.events.find(item => item.eventId === command.event.eventId);
    if (duplicate) {
      const retryScope = "contentRevision" in command.event ? command.event.contentRevision : duplicate.contentRevision;
      if (canonical(duplicate) === canonical({ ...command.event, contentRevision: retryScope })) return value;
      fail("This event ID already holds different content; nothing was overwritten", "EVENT_ID_CONFLICT");
    }
    if (command.expectedRevision !== value.events.length) fail("Revision changed; retain input and reconcile before retry", "REVISION_CONFLICT");
    if (Date.parse(command.event.recordedAt) < Date.parse(value.events[value.events.length - 1]!.recordedAt)) fail("recordedAt cannot precede the latest history entry");
    const current = project(value);
    checkTransition(current.completionStatus === "completed", command.event.type);
    let contentRevision = command.event.contentRevision ?? current.contentRevision;
    if (command.event.type === "amended" || command.event.type === "reopened") {
      const targetScope = current.contentRevision + (command.event.type === "amended"
        && command.event.commitmentText !== undefined && command.event.commitmentText !== current.commitmentText ? 1 : 0);
      if (command.event.contentRevision !== undefined && command.event.contentRevision !== targetScope) fail("Explicit contentRevision does not match the resulting content scope");
      contentRevision = targetScope;
    }
    const storedEvent: StoredUpdateEvent = { ...command.event, contentRevision };
    const updated: Commitment = { ...value, events: [...value.events, storedEvent] as [CreatedEvent, ...StoredUpdateEvent[]] };
    checkCommitment(updated);
    return updated;
  });
}

export type DueState = "unknown" | "overdue" | "due-today" | "due-now" | "upcoming";
export interface PendingQuery {
  readonly ownerId: string;
  /** Caller supplies the business-local day; no server timezone inference. */
  readonly asOfDate: string;
  readonly asOfInstant: string;
}
export interface PendingCommitment { readonly commitment: CommitmentView; readonly dueState: DueState }

/** Lists ALL open owned commitments, including unknown/future deadlines, regardless of source visit date. */
export function listPendingCommitments(values: readonly Commitment[], query: PendingQuery): Result<readonly PendingCommitment[]> {
  return result(() => {
    denseArray(values, "commitments");
    obj(query, "query"); keys(query, ["ownerId", "asOfDate", "asOfInstant"]);
    id(query.ownerId, "ownerId"); day(query.asOfDate, "asOfDate"); instant(query.asOfInstant, "asOfInstant");
    const ids = new Set<string>();
    const pending: PendingCommitment[] = [];
    for (const value of values) {
      checkCommitment(value);
      if (ids.has(value.id)) fail("Duplicate commitment ID; caller must reconcile instead of silently collapsing records", "DUPLICATE_COMMITMENT_ID");
      ids.add(value.id);
      const view = project(value);
      if (view.ownerId !== query.ownerId || view.completionStatus === "completed") continue;
      let dueState: DueState = "unknown";
      if (view.deadline.kind === "date") {
        dueState = view.deadline.date < query.asOfDate ? "overdue"
          : view.deadline.date === query.asOfDate ? "due-today" : "upcoming";
      } else if (view.deadline.kind === "instant") {
        const delta = Date.parse(view.deadline.at) - Date.parse(query.asOfInstant);
        dueState = delta < 0 ? "overdue" : delta === 0 ? "due-now" : "upcoming";
      }
      pending.push({ commitment: view, dueState });
    }
    // Preserve caller ordering; do not invent priority between date-only and timed promises.
    return pending;
  });
}
