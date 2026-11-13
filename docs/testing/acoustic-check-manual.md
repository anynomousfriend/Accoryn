# M1 manual checkpoint: testnet gate and physical sound exchange

Automated tests cover the real ggwave encoder/decoder with simulated audio, real Chrome Web Audio playback and microphone permission handling. They cannot measure whether a real speaker reaches a real microphone. This checklist does.

## Part A: confirm the testnet deployment (5 minutes, any browser)

1. Open the gate: https://testnet.nearblocks.io/address/ceremony-gate-v1.accoryn.testnet
   **Expect:** a deployed contract account.
2. Open the payout transaction: https://testnet.nearblocks.io/txns/4NKh8ik6P9a66RfDyUsaVNpbYSPVnBPmjNJwon2swzw5
   **Expect:** `ceremony-gate-v1.accoryn.testnet` calls `act_proposal` on `accoryn-spike.sputnikv2.testnet`, and the DAO transfers **0.05 NEAR** to `accoryn-payee.testnet`.
3. Open a member's direct approval attempt: https://testnet.nearblocks.io/txns/243Qb7wwWDtXN6yyAiq6g1fVUjjppLkSpRuCbQ8ACHfB
   **Expect:** it failed with `ERR_PERMISSION_DENIED`. Humans cannot approve transfers; only the gate can.

## Part B: physical sound exchange (about 20 minutes, two devices)

### Setup

1. On the laptop, run:
   ```sh
   npm run dev:lan --prefix web
   ```
2. Vite prints a `Network: https://<LAN-IP>:5173/` address. The certificate is self-signed for local testing.
3. Put the phone on the **same Wi-Fi**. Open `https://<LAN-IP>:5173/acoustic-check/` and accept the certificate warning.
   - Chrome: *Advanced → Proceed*.
   - Safari: *Show details → visit this website*.
4. On the laptop, open `https://localhost:5173/acoustic-check/`.
5. Before the trials:
   - Turn **Bluetooth audio off**.
   - Set system volume to about **50–70%**.
   - On iPhone, turn **silent mode off**.
   - Keep both browsers in the foreground.
   - Hold the devices about an arm's length apart.
6. Use the same **Sound mode** on both devices. Start with `audible-fast` and volume `25`.

### Trials

For each trial:
1. On the listener, tap **Start listening** (allow the microphone the first time).
2. On the broadcaster, tap **Start broadcast**.
3. **Expect:** within about 2–6 seconds, the listener shows **Heard check code** equal to the broadcaster's **Check code**. Listening stops by itself and the attempt appears under **Listening trials**.
4. Tap **Stop** on the broadcaster before the next trial, so each trial uses a fresh challenge.

| # | Broadcaster → listener | Mode / volume | Room | Trials |
|---|---|---|---|---|
| 1 | laptop → phone | audible-fast / 25 | quiet | 10 |
| 2 | phone → laptop | audible-fast / 25 | quiet | 5 |
| 3 | laptop → phone | audible-fast / 25 (try 50 if 25 fails) | noisy (music or talking) | 5 |
| 4 (optional) | laptop → phone | audible-fastest / 25 | quiet | 3 |
| 5 (optional) | laptop → phone | ultrasound-fast / 50 | quiet | 3 |

### Please report back

- Device models and browsers, for example "MacBook Air + Chrome 142; iPhone 15 + Safari".
- For each row: successes out of trials and typical seconds, copied from the trials table.
- Any **Needs attention** message, a check-code mismatch, or a decode taking more than 20 s.
- Whether the sound was acceptable to hear in a meeting.

A failed decode is a real result, not a bug to hide. We will tune the mode and volume, or the challenge length, from these numbers.
