// Accoryn ceremony protocol v1 (see docs/security/ceremony-threat-model.md).
//
// The host broadcasts a fresh 15-byte challenge over sound. Every device that
// heard it derives the same session key pair; only the public key is published
// on-chain. An attendee proves they received the challenge by signing an
// attestation bound to the payment and to their own account, then submits it in
// a transaction signed by that account. The challenge itself never goes on-chain.
//
// Hearing the sound is communication evidence only. It is not proof of physical
// proximity, of distinct people, or of consent — consent is the separate,
// explicit attestation transaction.
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { baseEncode } from "near-api-js";
import { isAccountId } from "../../workspace/drafts.ts";

export const CHALLENGE_BYTES = 15;
const SEED_DOMAIN = "accoryn-ceremony-seed-v1";
const ATTEST_DOMAIN = "accoryn-ceremony-attest-v1";
const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const encoder = new TextEncoder();

export type AttestationInput = {
  gateId: string;
  daoId: string;
  proposalId: string;
  sessionId: string;
  receiverId: string;
  amountAtomic: string;
  attendeeId: string;
};

function account(value: string): Uint8Array {
  if (typeof value !== "string" || !isAccountId(value))
    throw new Error("Invalid NEAR account ID in ceremony input.");
  return encoder.encode(value);
}

function decimal(value: string, max: bigint, allowZero: boolean): Uint8Array {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value))
    throw new Error("Ceremony numbers must be canonical unsigned integers.");
  const parsed = BigInt(value);
  if (parsed > max || (!allowZero && parsed === 0n))
    throw new Error("Ceremony number is out of range.");
  return encoder.encode(value);
}

// Account IDs and decimal strings can never contain NUL, so a 0x00 separator
// gives an unambiguous encoding.
function joined(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0) + parts.length - 1;
  const out = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part, index) => {
    if (index > 0) offset += 1;
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}

export function generateChallenge(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(CHALLENGE_BYTES));
}

// 15 bytes encode to exactly 20 base64url characters with no padding, which
// keeps the acoustic frame short and free of NUL bytes.
export function encodeChallenge(challenge: Uint8Array): string {
  if (!(challenge instanceof Uint8Array) || challenge.length !== CHALLENGE_BYTES)
    throw new Error("Challenge must be exactly 15 bytes.");
  return btoa(String.fromCharCode(...challenge)).replace(/\+/g, "-").replace(/\//g, "_");
}

export function decodeChallenge(text: string): Uint8Array | null {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]{20}$/.test(text)) return null;
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.length === CHALLENGE_BYTES && encodeChallenge(bytes) === text ? bytes : null;
}

export function ceremonySeed(
  gateId: string,
  daoId: string,
  proposalId: string,
  challenge: Uint8Array,
): Uint8Array {
  if (!(challenge instanceof Uint8Array) || challenge.length !== CHALLENGE_BYTES)
    throw new Error("Challenge must be exactly 15 bytes.");
  return sha256(
    joined([
      encoder.encode(SEED_DOMAIN),
      account(gateId),
      account(daoId),
      decimal(proposalId, U64_MAX, true),
      challenge,
    ]),
  );
}

export function sessionPublicKey(seed: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(seed);
}

export function nearPublicKey(publicKey: Uint8Array): string {
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== 32)
    throw new Error("Expected a 32-byte ed25519 public key.");
  return "ed25519:" + baseEncode(publicKey);
}

export function attestationMessage(input: AttestationInput): Uint8Array {
  return joined([
    encoder.encode(ATTEST_DOMAIN),
    account(input.gateId),
    account(input.daoId),
    decimal(input.proposalId, U64_MAX, true),
    decimal(input.sessionId, U64_MAX, true),
    account(input.receiverId),
    decimal(input.amountAtomic, U128_MAX, false),
    account(input.attendeeId),
  ]);
}

export function signAttestation(message: Uint8Array, seed: Uint8Array): Uint8Array {
  return ed25519.sign(message, seed);
}
