import test from 'node:test';
import assert from 'node:assert/strict';
import {browserRequestId} from '../lib/browser-request-id.mjs';

test('browser without randomUUID generates cryptographic RFC 4122 version 4 request IDs', () => {
  let calls = 0;
  const source = {getRandomValues(bytes) { calls++; return crypto.getRandomValues(bytes); }};
  const ids = Array.from({length: 100}, () => browserRequestId(source));
  assert.equal(calls, 100);
  assert.equal(new Set(ids).size, 100);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('request IDs retain native UUID behavior and fail closed without secure randomness', () => {
  assert.equal(browserRequestId({randomUUID: () => 'native-result'}), 'native-result');
  assert.throws(() => browserRequestId({}), /Secure random/);
});
