import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ed25519 } from "@noble/curves/ed25519.js";
import {
  attestationMessage,
  ceremonySeed,
  decodeChallenge,
  encodeChallenge,
  generateChallenge,
  nearPublicKey,
  sessionPublicKey,
  signAttestation,
} from "../src/engines/ceremony/crypto.ts";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const fromHex = (value: string) => new Uint8Array(Buffer.from(value, "hex"));

type Vector = {
  name: string;
  gateId: string;
  daoId: string;
  proposalId: string;
  sessionId: string;
  receiverId: string;
  amountAtomic: string;
  attendeeId: string;
  challengeHex: string;
  challengeText: string;
  seedHex: string;
  sessionPublicKey: string;
  messageHex: string;
  signatureHex: string;
};

const vectors: { version: string; vectors: Vector[] } = JSON.parse(
  readFileSync(new URL("../../contracts/ceremony-gate/tests/vectors.json", import.meta.url), "utf8"),
);

test("challenge text is exactly 20 base64url characters and round-trips", () => {
  const challenge = generateChallenge();
  assert.equal(challenge.length, 15);
  const text = encodeChallenge(challenge);
  assert.match(text, /^[A-Za-z0-9_-]{20}$/);
  assert.deepEqual(decodeChallenge(text), challenge);
});

test("challenge decoding rejects corrupted or wrong-length frames", () => {
  for (const frame of ["", "short", "A".repeat(19), "A".repeat(21), "AAAAAAAAAAAAAAAAAAA=", "AAAAAAAAAAAAAAAAAA+/", "AAAA AAAAAAAAAAAAAAA"]) {
    assert.equal(decodeChallenge(frame), null, frame);
  }
});

test("generated challenges are fresh", () => {
  const seen = new Set<string>();
  for (let index = 0; index < 64; index += 1) seen.add(encodeChallenge(generateChallenge()));
  assert.equal(seen.size, 64);
});

test("published vectors reproduce seed, session key, message and signature exactly", () => {
  assert.equal(vectors.version, "accoryn-ceremony-v1");
  assert.ok(vectors.vectors.length >= 2);
  for (const vector of vectors.vectors) {
    const challenge = fromHex(vector.challengeHex);
    assert.equal(encodeChallenge(challenge), vector.challengeText, vector.name);
    const seed = ceremonySeed(vector.gateId, vector.daoId, vector.proposalId, challenge);
    assert.equal(hex(seed), vector.seedHex, vector.name);
    assert.equal(nearPublicKey(sessionPublicKey(seed)), vector.sessionPublicKey, vector.name);
    const message = attestationMessage(vector);
    assert.equal(hex(message), vector.messageHex, vector.name);
    const signature = signAttestation(message, seed);
    assert.equal(hex(signature), vector.signatureHex, vector.name);
    assert.ok(ed25519.verify(signature, message, sessionPublicKey(seed)));
  }
});

test("seed is domain-separated by gate, DAO, proposal and challenge", () => {
  const challenge = fromHex("000102030405060708090a0b0c0d0e");
  const base = hex(ceremonySeed("gate.testnet", "a.sputnikv2.testnet", "7", challenge));
  const variants = [
    ceremonySeed("gate2.testnet", "a.sputnikv2.testnet", "7", challenge),
    ceremonySeed("gate.testnet", "b.sputnikv2.testnet", "7", challenge),
    ceremonySeed("gate.testnet", "a.sputnikv2.testnet", "8", challenge),
    ceremonySeed("gate.testnet", "a.sputnikv2.testnet", "7", fromHex("000102030405060708090a0b0c0d0f")),
  ];
  for (const variant of variants) assert.notEqual(hex(variant), base);
});

test("attestation message binds every payment and identity field", () => {
  const input = {
    gateId: "gate.testnet",
    daoId: "a.sputnikv2.testnet",
    proposalId: "3",
    sessionId: "11",
    receiverId: "payee.testnet",
    amountAtomic: "500000000000000000000000",
    attendeeId: "alice.testnet",
  };
  const base = hex(attestationMessage(input));
  for (const [field, value] of Object.entries({
    gateId: "gate2.testnet",
    daoId: "b.sputnikv2.testnet",
    proposalId: "4",
    sessionId: "12",
    receiverId: "other.testnet",
    amountAtomic: "500000000000000000000001",
    attendeeId: "bob.testnet",
  })) {
    assert.notEqual(hex(attestationMessage({ ...input, [field]: value })), base, field);
  }
});

test("protocol inputs are validated rather than silently encoded", () => {
  const challenge = generateChallenge();
  assert.throws(() => ceremonySeed("Bad Gate", "a.sputnikv2.testnet", "1", challenge));
  assert.throws(() => ceremonySeed("gate.testnet", "a.sputnikv2.testnet", "01", challenge));
  assert.throws(() => ceremonySeed("gate.testnet", "a.sputnikv2.testnet", "1", new Uint8Array(14)));
  const message = {
    gateId: "gate.testnet",
    daoId: "a.sputnikv2.testnet",
    proposalId: "1",
    sessionId: "1",
    receiverId: "payee.testnet",
    amountAtomic: "1",
    attendeeId: "alice.testnet",
  };
  assert.throws(() => attestationMessage({ ...message, amountAtomic: "1.5" }));
  assert.throws(() => attestationMessage({ ...message, amountAtomic: "0" }));
  assert.throws(() => attestationMessage({ ...message, sessionId: "-1" }));
  assert.throws(() => attestationMessage({ ...message, attendeeId: "UPPER.testnet" }));
});
