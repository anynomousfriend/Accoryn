// Regenerates contracts/ceremony-gate/tests/vectors.json from fixed inputs.
// The Rust gate tests verify these bytes with an independent ed25519
// implementation, so a format change on either side fails both suites.
// Usage: node web/scripts/generate-ceremony-vectors.ts
import { writeFileSync } from "node:fs";
import {
  attestationMessage,
  ceremonySeed,
  encodeChallenge,
  nearPublicKey,
  sessionPublicKey,
  signAttestation,
} from "../src/engines/ceremony/crypto.ts";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const inputs = [
  {
    name: "testnet-small-payment",
    gateId: "ceremony-gate-v1.accoryn.testnet",
    daoId: "accoryn-spike.sputnikv2.testnet",
    proposalId: "0",
    sessionId: "1",
    receiverId: "accoryn-payee.testnet",
    amountAtomic: "100000000000000000000000",
    attendeeId: "accoryn-alice.testnet",
    challengeHex: "000102030405060708090a0b0c0d0e",
  },
  {
    name: "large-ids-and-amount",
    gateId: "gate.sandbox",
    daoId: "dao1.factory.sandbox",
    proposalId: "18446744073709551615",
    sessionId: "18446744073709551615",
    receiverId: "bob_payee-1.testnet",
    amountAtomic: "340282366920938463463374607431768211455",
    attendeeId: "carol.factory.sandbox",
    challengeHex: "fffefdfcfbfaf9f8f7f6f5f4f3f2f1",
  },
];

const vectors = inputs.map((input) => {
  const challenge = new Uint8Array(Buffer.from(input.challengeHex, "hex"));
  const seed = ceremonySeed(input.gateId, input.daoId, input.proposalId, challenge);
  const message = attestationMessage(input);
  return {
    ...input,
    challengeText: encodeChallenge(challenge),
    seedHex: hex(seed),
    sessionPublicKey: nearPublicKey(sessionPublicKey(seed)),
    sessionPublicKeyHex: hex(sessionPublicKey(seed)),
    messageHex: hex(message),
    signatureHex: hex(signAttestation(message, seed)),
  };
});

const target = new URL("../../contracts/ceremony-gate/tests/vectors.json", import.meta.url);
writeFileSync(target, JSON.stringify({ version: "accoryn-ceremony-v1", vectors }, null, 2) + "\n");
console.log(`Wrote ${vectors.length} vectors to ${target.pathname}`);
