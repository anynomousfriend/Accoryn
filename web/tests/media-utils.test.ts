import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMediaError, rmsLevel } from '../src/media-utils.ts';

// Catches misclassified browser failures that would leave a person without a useful retry path.
for (const [name, kind, hint] of [
  ['NotAllowedError', 'denied', /permission/i],
  ['NotFoundError', 'missing', /connect|available/i],
  ['NotReadableError', 'busy', /other app|in use/i],
  ['OverconstrainedError', 'error', /settings|retry/i],
] as const) {
  test(`${name} gives the correct actionable failure`, () => {
    const result = classifyMediaError(new DOMException('Browser detail', name));
    assert.equal(result.kind, kind);
    assert.match(result.message, hint);
  });
}

test('unexpected failures do not expose arbitrary error text', () => {
  const result = classifyMediaError(new Error('sensitive arbitrary input'));
  assert.equal(result.kind, 'error');
  assert.doesNotMatch(result.message, /sensitive/);
  assert.match(result.message, /retry|again/i);
});

// Catches fabricated/incorrect activity and invalid values propagating into the meter.
test('silence and empty samples have zero measured level', () => {
  assert.equal(rmsLevel(new Float32Array(128)), 0);
  assert.equal(rmsLevel(new Float32Array()), 0);
});

test('RMS measures actual sample amplitude regardless of sign', () => {
  assert.equal(rmsLevel(new Float32Array([0.5, 0.5, 0.5, 0.5])), 0.5);
  assert.equal(rmsLevel(new Float32Array([-1, 1, -1, 1])), 1);
});

test('invalid sample values cannot produce a non-finite meter', () => {
  assert.equal(rmsLevel(new Float32Array([Number.NaN, Infinity])), 0);
});
