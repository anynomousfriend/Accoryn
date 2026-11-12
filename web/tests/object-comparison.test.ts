import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmbedding, compareEmbeddings } from '../src/object-registration/comparison.ts';
const axis = (index: number, sign = 1) => Array.from({ length: 384 }, (_, i) => i === index ? sign : 0);
// Catches accepting broken model output as a usable template.
test('embedding normalization rejects malformed outputs', () => {
  for (const value of [[], [1], Array(384).fill(0), axis(0).map((x,i) => i === 5 ? NaN : x), axis(0).map((x,i) => i === 5 ? Infinity : x)]) {
    assert.throws(() => normalizeEmbedding(value));
  }
  const unit = normalizeEmbedding(axis(0).map(x => x * 3));
  assert.equal(unit[0], 1);
  assert.equal(unit.length, 384);
});
// Catches taking the max alone, averaging all views, or clipping negative scores.
test('comparison averages the two strongest signed cosine scores', () => {
  const result = compareEmbeddings([axis(0), axis(1), axis(2)], axis(0), 12);
  assert.deepEqual(result.scores, [1, 0, 0]);
  assert.equal(result.topTwoMean, 0.5);
  assert.equal(result.inferenceMs, 12);
  assert.equal(compareEmbeddings([axis(1), axis(2), axis(0)], axis(0), 12).topTwoMean, 0.5);
  assert.deepEqual(compareEmbeddings([axis(0), axis(0), axis(0)], axis(0, -1), 0).scores, [-1,-1,-1]);
});
test('cosine validates inputs and preserves self-similarity', () => {
  const v=normalizeEmbedding(Array.from({length:384},(_,i)=>Math.sin(i)));
  assert.ok(Math.abs(compareEmbeddings([v,v,v],v,1).topTwoMean - 1) < 1e-6);
  assert.throws(()=>compareEmbeddings([v,v,v],Array(384).fill(0),1));
  assert.throws(()=>compareEmbeddings([v,v,v],v,NaN));
});
