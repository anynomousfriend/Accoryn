import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isDemoObjectMatch,
  formatDemoSimilarity,
} from "../src/object-registration/demo-match.ts";
test("demo decision uses a strict 0.50 threshold and rejects invalid scores", () => {
  for (const score of [0.5000001, 0.7312, 1])
    assert.equal(isDemoObjectMatch(score), true);
  for (const score of [
    0.5,
    0.4999,
    0,
    -0.5,
    -1,
    NaN,
    Infinity,
    -Infinity,
    1.01,
  ])
    assert.equal(isDemoObjectMatch(score), false);
});
test("display distinguishes a rounded passing score from the rejected exact boundary", () => {
  assert.equal(formatDemoSimilarity(0.7312), "73.12 / 100");
  assert.equal(formatDemoSimilarity(0.5), "50.00 / 100");
  assert.equal(formatDemoSimilarity(0.5000001), ">50.00 / 100");
  assert.equal(formatDemoSimilarity(NaN), "Unavailable");
});
