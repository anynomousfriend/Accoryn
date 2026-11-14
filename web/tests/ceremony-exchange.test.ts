// Sound-exchange control flow in the treasury engine. The modem is a local
// fake: these tests cover timing, retries and what survives a pause, not
// physical audio, which needs the two-device manual check.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { TreasuryFlow } from "../src/engines/app/writes.ts";
import type { PaymentView } from "../src/engines/app/engine.ts";
import { parseSession, type Session } from "../src/engines/app/protocol.ts";
import {
  Keystore,
  createMemoryKeyRecordStore,
} from "../src/engines/near/keystore.ts";
import {
  TxJournal,
  createMemoryTxRecordStore,
} from "../src/engines/near/txjournal.ts";
import {
  Operations,
  memoryOperationStore,
} from "../src/engines/app/operations.ts";
import { NearRpcClient } from "../src/engines/near/rpc.ts";
import type {
  AcousticModem,
  PlaybackResult,
} from "../src/engines/acoustic/modem.ts";
import { GATE } from "../src/engines/app/engine.ts";
import {
  ceremonySeed,
  encodeChallenge,
  generateChallenge,
  nearPublicKey,
  sessionPublicKey,
} from "../src/engines/ceremony/crypto.ts";
import { soundBlockedReason } from "../src/engines/app/ceremony-ui.ts";

const DAO = "team.sputnikv2.testnet";
const proposal = {
  treasuryId: DAO,
  id: "0",
  recipient: "payee.testnet",
  amountAtomic: "50",
  contentHash: "hash",
};

type Fake = {
  modem: AcousticModem;
  plays: number;
  frames: string[];
  play: () => Promise<PlaybackResult>;
};
function fakeModem(): Fake {
  let finish: ((r: PlaybackResult) => void) | null = null;
  const fake: Fake = {
    plays: 0,
    frames: [],
    play: () =>
      new Promise<PlaybackResult>((resolve) => {
        finish = resolve;
        setTimeout(() => resolve("completed"), 5);
      }),
    modem: {
      async init() {},
      play: () => {
        fake.plays += 1;
        return fake.play();
      },
      stopPlayback: () => finish?.("stopped"),
      async startListening(onFrame) {
        for (const f of fake.frames) setTimeout(() => onFrame(f), 5);
        return true;
      },
      stopListening() {},
      dispose() {},
    },
  };
  return fake;
}

// Each flow arms a session-expiry timer; release them so the process exits.
const flows: TreasuryFlow[] = [];
afterEach(() => {
  for (const f of flows.splice(0)) f.releaseResources();
});
function flowWith(fake: Fake, account: string) {
  const flow = new TreasuryFlow({
    keys: new Keystore(createMemoryKeyRecordStore()),
    journal: new TxJournal(createMemoryTxRecordStore(), { locks: null }),
    operations: new Operations(memoryOperationStore()),
    rpc: new NearRpcClient(),
    authorize: async () => true,
    createModem: () => fake.modem,
  });
  flow.accountId = account;
  flows.push(flow);
  return flow;
}

function sessionFor(pk: string, host: string, ttlMs = 300_000): Session {
  return parseSession({
    session_id: "7",
    dao_id: DAO,
    proposal_id: 0,
    host,
    session_pk: pk,
    receiver_id: "payee.testnet",
    amount: "50",
    eligible: ["alice.testnet", "bob.testnet"],
    attestations: [],
    required: 2,
    opened_at: "1",
    expires_at: String(BigInt(Date.now() + ttlMs) * 1_000_000n),
    status: "Open",
    last_error: null,
    evidence_txs: [],
  });
}

function serve(flow: TreasuryFlow, session: Session): PaymentView {
  const view = {
    currentMembers: ["alice.testnet", "bob.testnet"],
    proposal,
    session,
    transactionIds: [],
    createdAt: new Date().toISOString(),
    invoiceId: null,
  } as unknown as PaymentView;
  flow.payment = async () => view;
  flow.session = async () => session;
  return view;
}

/** The host opens a session; returns the payment view the chain would serve. */
function hostSession(fake: Fake) {
  const flow = flowWith(fake, "alice.testnet");
  const draft = { proposal, session: null } as unknown as PaymentView;
  const op = flow.planOpen(draft, "open-request");
  const pk = (op.args.input as { session_pk: string }).session_pk;
  const view = serve(flow, sessionFor(pk, "alice.testnet"));
  return { flow, view };
}

const quick = { windowMs: 60, intervalMs: 0 };
const signal = () => new AbortController().signal;

test("the host plays the sound repeatedly, not once, until stopped", async () => {
  const fake = fakeModem();
  const { flow, view } = hostSession(fake);
  const progress: string[] = [];
  const done = flow.exchange(view, "host", signal(), (m) => progress.push(m), {
    windowMs: 60_000,
    intervalMs: 0,
  });
  while (fake.plays < 3) await new Promise((r) => setTimeout(r, 5));
  flow.stopHostSound();
  await done;
  assert.ok(fake.plays >= 3, `played ${fake.plays} rounds`);
  assert.ok(progress.some((m) => /round 3/.test(m)));
  assert.match(progress.at(-1) ?? "", /Sound exchange ready/);
});

test("a failed host play keeps the challenge, so Play can simply be tapped again", async () => {
  const fake = fakeModem();
  const { flow, view } = hostSession(fake);
  fake.play = () => Promise.reject(new Error("speaker busy"));
  await assert.rejects(() =>
    flow.exchange(view, "host", signal(), () => {}, quick),
  );
  fake.play = () => Promise.resolve("completed");
  await flow.exchange(view, "host", signal(), () => {}, quick);
  const op = await flow.planAttest(view, "attest-request", signal());
  assert.equal(op.kind, "attest");
});

test("a host round that never completes is reported, and the challenge is kept", async () => {
  const fake = fakeModem();
  const { flow, view } = hostSession(fake);
  fake.play = () => Promise.resolve("stalled");
  await assert.rejects(
    () => flow.exchange(view, "host", signal(), () => {}, quick),
    /did not play/i,
  );
  fake.play = () => Promise.resolve("completed");
  await flow.exchange(view, "host", signal(), () => {}, quick);
});

test("pausing audio (page hidden or a tab switch) keeps the ceremony; sign-out clears it", async () => {
  const fake = fakeModem();
  const { flow, view } = hostSession(fake);
  flow.stopAudio();
  await flow.exchange(view, "host", signal(), () => {}, quick);
  flow.releaseResources();
  await assert.rejects(
    () => flow.exchange(view, "host", signal(), () => {}, quick),
    /Host challenge was lost/,
  );
});

test("a listener decodes the host frame and is ready to approve", async () => {
  const challenge = generateChallenge();
  const pk = nearPublicKey(
    sessionPublicKey(ceremonySeed(GATE, DAO, "0", challenge)),
  );
  const fake = fakeModem();
  fake.frames = [encodeChallenge(challenge)];
  const flow = flowWith(fake, "bob.testnet");
  const view = serve(flow, sessionFor(pk, "alice.testnet"));
  const progress: string[] = [];
  await flow.exchange(view, "listener", signal(), (m) => progress.push(m));
  assert.match(progress.at(-1) ?? "", /Sound exchange ready/);
  const op = await flow.planAttest(view, "attest-request", signal());
  assert.equal(op.actor, "bob.testnet");
});

test("a listener that hears nothing is told what to check", async () => {
  const fake = fakeModem();
  const flow = flowWith(fake, "bob.testnet");
  const view = serve(
    flow,
    sessionFor("ed25519:6osrwDbQxpTrREpBynRKRkr6xu3YLnocP4zMX8xUqZXM", "alice.testnet", 300),
  );
  await assert.rejects(
    () => flow.exchange(view, "listener", signal(), () => {}),
    /microphone heard almost nothing.*volume/i,
  );
});

const ready = {
  writesEnabled: true,
  signedIn: true,
  pending: false,
  account: "bob.testnet",
  members: ["alice.testnet", "bob.testnet"],
  paymentLoaded: true,
  paymentOpen: true,
  sessionOpen: true,
};
test("the sound step says why it is unavailable instead of silently greying out", () => {
  assert.equal(soundBlockedReason(ready), null);
  assert.match(
    soundBlockedReason({ ...ready, signedIn: false }) ?? "",
    /sign in with your object/i,
  );
  assert.match(
    soundBlockedReason({ ...ready, pending: true }) ?? "",
    /reconcile/i,
  );
  assert.match(
    soundBlockedReason({ ...ready, paymentLoaded: false, members: null }) ?? "",
    /load this payment/i,
  );
  assert.match(
    soundBlockedReason({ ...ready, members: ["alice.testnet"] }) ?? "",
    /not a member/i,
  );
  assert.match(
    soundBlockedReason({ ...ready, sessionOpen: false }) ?? "",
    /waiting for the host.*checks every few seconds/i,
  );
});
