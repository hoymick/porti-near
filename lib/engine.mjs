// Server-side sandbox ledger. All values are integer millionths of a sandbox WIF.
// This models the vault state machine; it does not submit blockchain transactions.
export const UNIT = 1_000_000;
export const SERVICES = [
  { id: 'extract', name: 'Document extraction', description: 'Split two text documents into numbered passages.', price: UNIT, icon: 'file', unit: 'document pair' },
  { id: 'compare', name: 'Document comparison', description: 'Find changed, added and removed passages with source references.', price: 2 * UNIT, icon: 'compare', unit: 'comparison' },
  { id: 'report', name: 'Report generation', description: 'Assemble a readable comparison and an itemized expense record.', price: UNIT, icon: 'report', unit: 'report' },
];
export class DomainError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export const fail = (code, message, status) => { throw new DomainError(code, message, status); };
export function amount(value, max = 1_000 * UNIT) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,5})(\.\d{1,6})?$/.test(value)) fail('INVALID_AMOUNT', 'Enter a positive amount with at most six decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const n = Number(whole) * UNIT + Number(fraction.padEnd(6, '0'));
  if (!Number.isSafeInteger(n) || n <= 0 || n > max) fail('INVALID_AMOUNT', `Amount must be greater than zero and no more than ${max / UNIT}.`);
  return n;
}
const day = now => Math.floor(now / 86400000);
export function initialState(now = Date.now()) {
  return { version: 1, mode: 'sandbox', createdAt: now, agent: { name: 'Document analyst', active: true, version: 1, expiresAt: now + 30 * 86400000 }, policy: { perCall: 3 * UNIT, perTask: 5 * UNIT, daily: 20 * UNIT, lifetime: 50 * UNIT, allowed: SERVICES.map(s => s.id) }, budget: { deposits: 50 * UNIT, withdrawals: 0, available: 50 * UNIT, reserved: 0, spent: 0, providerCredits: 0, platformCredits: 0 }, days: {}, tasks: [], jobs: [], events: [{ id: crypto.randomUUID(), at: now, type: 'funded', message: 'Sandbox initialized with 50 test credits. No real tokens deposited.' }] };
}
export function event(s, type, message, now, taskId) {
  s.events.unshift({ id: crypto.randomUUID(), at: now, type, message, taskId });
  s.events = s.events.slice(0, 150);
}
export function createTask(s, input, now = Date.now()) {
  const { title, documents, requestId } = input;
  if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) fail('INVALID_REQUEST', 'A valid unique request ID is required.');
  if (typeof title !== 'string' || !title.trim() || title.length > 100) fail('INVALID_TITLE', 'Give this task a title of 1–100 characters.');
  if (!Array.isArray(documents) || documents.length !== 2 || documents.some(x => typeof x !== 'string' || !x.trim() || x.length > 30000)) fail('INVALID_DOCUMENTS', 'Provide two text documents, each up to 30,000 characters.');
  const existing = s.tasks.find(t => t.requestId === requestId);
  if (existing) {
    if (existing.title !== title.trim() || JSON.stringify(existing.documents) !== JSON.stringify(documents) || existing.maxSpend !== amount(input.maxSpend)) fail('IDEMPOTENCY_CONFLICT', 'This request ID was already used with different content.', 409);
    return existing;
  }
  if (s.tasks.length >= 100) fail('TASK_LIMIT', 'This development workspace is limited to 100 tasks.');
  const max = amount(input.maxSpend, s.policy.perTask);
  const task = { id: crypto.randomUUID(), requestId, title: title.trim(), documents, maxSpend: max, committed: 0, spent: 0, createdAt: now, expiresAt: now + 86400000, status: 'queued', stage: 0, output: null, error: null };
  s.tasks.unshift(task); event(s, 'task', `Task created: ${task.title}`, now, task.id); return task;
}
export function reserveNext(s, taskId, now = Date.now()) {
  const t = s.tasks.find(t => t.id === taskId);
  if (!t) fail('NOT_FOUND', 'Task not found.', 404);
  if (t.status === 'archived') fail('INPUT_EXPIRED', 'Task documents have been deleted. Create a new task.', 409);
  if (t.stage >= SERVICES.length) return { task: t, job: null, created: false };
  const inFlight = s.jobs.find(j => j.taskId === t.id && j.status === 'reserved');
  if (inFlight) return { task: t, job: inFlight, created: false };
  const service = SERVICES[t.stage]; const total = service.price;
  const spentToday = s.days[day(now)] || 0;
  const checks = [
    [s.agent.active, 'AGENT_REVOKED', 'Agent is paused. Resume it in Agent controls.'],
    [now < s.agent.expiresAt, 'AGENT_EXPIRED', 'Agent authorization expired. Renew it in Agent controls.'],
    [now < t.expiresAt, 'TASK_EXPIRED', 'Task authorization expired. Create a new task.'],
    [s.policy.allowed.includes(service.id), 'SERVICE_NOT_ALLOWED', `${service.name} is not allowed by the owner policy.`],
    [total <= s.policy.perCall, 'CALL_CAP', 'This service exceeds the per-call spending limit.'],
    [t.committed + total <= t.maxSpend && t.committed + total <= s.policy.perTask, 'TASK_CAP', 'The next service would exceed this task’s spending cap.'],
    [spentToday + total <= s.policy.daily, 'DAILY_CAP', 'The next service would exceed the UTC-day spending cap.'],
    [s.budget.spent + s.budget.reserved + total <= s.policy.lifetime, 'LIFETIME_CAP', 'The lifetime spending cap would be exceeded.'],
    [s.budget.available >= total, 'INSUFFICIENT_FUNDS', 'Not enough available sandbox credits.'],
  ];
  const rejected = checks.find(c => !c[0]);
  if (rejected) { t.status = 'blocked'; t.error = { code: rejected[1], message: rejected[2] }; event(s, 'blocked', rejected[2], now, t.id); return { task: t, job: null, created: false }; }
  const job = { id: crypto.randomUUID(), taskId: t.id, stage: t.stage, serviceId: service.id, serviceName: service.name, total, fee: Math.floor(total * 200 / 10000), day: day(now), status: 'reserved', createdAt: now, deadline: now + 60000, agentVersion: s.agent.version };
  s.jobs.unshift(job); s.budget.available -= total; s.budget.reserved += total; s.days[job.day] = spentToday + total; t.committed += total; t.status = 'running'; t.error = null;
  event(s, 'reserved', `Reserved ${total / UNIT} credits for ${service.name}.`, now, t.id);
  return { task: t, job, created: true };
}
export function settle(s, jobId, output, now = Date.now()) {
  const j = s.jobs.find(j => j.id === jobId);
  if (!j) fail('NOT_FOUND', 'Job not found.', 404);
  if (j.status !== 'reserved') fail('JOB_TERMINAL', 'This job has already finished.', 409);
  if (now >= j.deadline) fail('JOB_EXPIRED', 'Delivery deadline passed. Release the reservation and retry.', 409);
  const t = s.tasks.find(t => t.id === j.taskId);
  j.status = 'settled'; j.settledAt = now;
  s.budget.reserved -= j.total; s.budget.spent += j.total; s.budget.providerCredits += j.total - j.fee; s.budget.platformCredits += j.fee;
  t.spent += j.total; t.stage += 1; t.output = output; t.status = t.stage === SERVICES.length ? 'completed' : 'running';
  event(s, 'settled', `${j.serviceName} delivered. ${j.total / UNIT} credits settled.`, now, t.id);
  return t;
}
export function cancel(s, jobId, reason = 'Service failed; reservation released.', now = Date.now(), expired = false) {
  const j = s.jobs.find(j => j.id === jobId);
  if (!j || j.status !== 'reserved') return false;
  if (expired && now < j.deadline) return false;
  const t = s.tasks.find(t => t.id === j.taskId);
  j.status = expired ? 'expired' : 'cancelled'; j.finishedAt = now;
  s.budget.reserved -= j.total; s.budget.available += j.total; s.days[j.day] -= j.total; t.committed -= j.total;
  t.status = 'failed'; t.error = { code: expired ? 'JOB_EXPIRED' : 'SERVICE_FAILED', message: reason };
  event(s, 'released', reason, now, t.id); return true;
}
export function recover(s, now = Date.now()) {
  for (const j of s.jobs) if (j.status === 'reserved' && j.deadline <= now) cancel(s, j.id, 'Reservation expired. Credits released; task can be resumed.', now, true);
  for (const t of s.tasks) if (now - t.createdAt > 7 * 86400000 && !s.jobs.some(j => j.taskId === t.id && j.status === 'reserved')) { t.documents = null; t.output = null; t.status = 'archived'; }
  for (const t of s.liveTasks||[]) if(now-t.createdAt>7*86400000){t.documents=null;t.output=null;t.salt=null;t.status='archived';for(const j of t.jobs)delete j.output;}
}
export function updatePolicy(s, input, now = Date.now()) {
  const policy = {};
  for (const key of ['perCall','perTask','daily','lifetime']) policy[key] = amount(input[key]);
  if (!Array.isArray(input.allowed) || input.allowed.some(x => !SERVICES.some(service => service.id === x))) fail('INVALID_POLICY', 'Unknown service permission.');
  policy.allowed = [...new Set(input.allowed)]; s.policy = policy;
  event(s, 'policy', 'Owner updated spending limits and service permissions.', now);
}
export function setAgent(s, active, now = Date.now()) {
  if (typeof active !== 'boolean') fail('INVALID_AGENT', 'Agent state must be true or false.');
  s.agent.active = active; s.agent.version += 1;
  if (active) s.agent.expiresAt = now + 30 * 86400000;
  event(s, active ? 'resumed' : 'paused', active ? 'Agent resumed with a new authorization version.' : 'Agent paused. No new purchases can be reserved.', now);
}
export function funds(s, action, value, now = Date.now()) {
  const n = amount(value);
  if (action === 'deposit') { if (s.budget.deposits + n > 10000 * UNIT) fail('DEPOSIT_LIMIT', 'Sandbox deposit limit reached.'); s.budget.deposits += n; s.budget.available += n; }
  else if (action === 'withdraw') { if (n > s.budget.available) fail('INSUFFICIENT_FUNDS', 'Only available credits can be removed.'); s.budget.withdrawals += n; s.budget.available -= n; }
  else fail('INVALID_ACTION', 'Unknown budget action.');
  event(s, action, `${action === 'deposit' ? 'Added' : 'Removed'} ${n / UNIT} sandbox credits. No real tokens moved.`, now);
}
export function assertAccounting(s) {
  const b = s.budget;
  if (b.deposits - b.withdrawals !== b.available + b.reserved + b.providerCredits + b.platformCredits) throw new Error('Ledger conservation failed');
  if (b.spent !== b.providerCredits + b.platformCredits || Object.values(b).some(v => v < 0 || !Number.isSafeInteger(v))) throw new Error('Ledger integrity failed');
}
const paragraphs = text => {
  const parts = text.trim().split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z])/u).map(x => x.trim()).filter(Boolean);
  if(parts.length > 200) fail('DOCUMENT_TOO_COMPLEX', 'This release supports at most 200 passages per document.');
  return parts;
};
export function runService(serviceId, task) {
  if (serviceId === 'extract') return { documents: task.documents.map((text, index) => ({ label: index ? 'Document B' : 'Document A', passages: paragraphs(text).map((text, p) => ({ id: `${index ? 'B' : 'A'}${p + 1}`, text })) })) };
  if (serviceId === 'compare') {
    const documents = task.output.documents; const a = documents[0].passages, b = documents[1].passages;
    const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const remaining = new Set(b.map((_, i) => i)); const changes = []; let unchanged = 0;
    for (const passage of a) {
      const exact = [...remaining].find(i => norm(b[i].text) === norm(passage.text));
      if (exact !== undefined) { remaining.delete(exact); unchanged++; continue; }
      const words = new Set(norm(passage.text).split(/\W+/).filter(Boolean)); let best = -1, score = 0;
      for (const i of remaining) {
        const other = new Set(norm(b[i].text).split(/\W+/).filter(Boolean));
        const similarity = [...words].filter(x => other.has(x)).length / Math.max(1, new Set([...words, ...other]).size);
        if (similarity > score) { score = similarity; best = i; }
      }
      if (score >= .3 && best >= 0) { remaining.delete(best); changes.push({ kind: 'changed', before: passage.text, after: b[best].text, refs: [passage.id, b[best].id] }); }
      else changes.push({ kind: 'removed', before: passage.text, after: '', refs: [passage.id] });
    }
    for (const i of remaining) changes.push({ kind: 'added', before: '', after: b[i].text, refs: [b[i].id] });
    return { documents, changes, unchanged, method: 'Deterministic passage matching using normalized text and word overlap. Not an LLM or legal analysis.' };
  }
  if (serviceId === 'report') return { ...task.output, title: task.title, generatedAt: new Date().toISOString(), summary: `${task.output.changes.length} differences identified; ${task.output.unchanged} passages unchanged.` };
  fail('SERVICE_NOT_FOUND', 'Service is not installed.', 404);
}
