# Reference-led redesign: manual test checkpoint

Branch: `design/variant-treasury-revamp` (local; not merged or pushed).

## Open the app

The existing HTTPS development server is serving the redesign with testnet writes enabled. Use the same address on your laptop and phone, with both on the same Wi-Fi:

- Landing: https://192.168.1.45:5173/
- Treasury: https://192.168.1.45:5173/treasury/
- Device checks: https://192.168.1.45:5173/device-check/

The LAN address may change if the computer joins another network. Use your existing trusted development-certificate setup. A certificate error must be resolved before relying on camera/microphone access. Existing keys/templates are tied to their browser and origin: use the address where you previously created the account; do not clear browser data to refresh the design. Reload the page instead.

## 1. Landing and motion

1. Open the landing page on laptop and phone. Expect a dark green-black background, ivory/gold display text and original floating treasury forms. Text and controls must remain unobscured.
2. Click **Pause motion**; artwork should stop. Click **Resume motion** to continue. With operating-system reduced motion enabled, decorative movement should stop and all explanations remain readable.
3. Scroll through **The way it comes together**. Desktop has a sticky UI preview and three selectable chapters; mobile has the previews next to each explanation.
4. Inspect the account-creation explanation, payment details and member approval illustration. These are explicitly labeled examples and must not prompt for camera/microphone access or create an account/payment.
5. Click **Open treasury**. Expect the real account screen, not a demo balance.

## 2. Account and navigation

1. On each device choose **Create account** or **Use saved account**. Use saved accounts to avoid unnecessary account creation/faucet requests.
2. Click **Start browser session** after reading the local-key notice. This authorizes the existing ten-minute browser session; a personal object does not generate signing keys.
3. New account: enter a unique **New username**, then **Create testnet account**. Saved account: select **Local account**, then **Use local account**. The latter verifies the saved signing key against testnet. A public user appearing in the demo directory does not give this device that user's signing key.
4. Expect to continue into the vault flow. Use **Account** in the header to switch back. Signer keys remain on their original device.
5. Try **Overview**, **Payments**, **Members** and **Vault settings**, then browser Back/Forward. The visible task and address hash should follow navigation. A pending request must remain discoverable after moving between sections or reloading.
6. **Device help** must be reachable on mobile and desktop. In the device-check page, test the real camera, microphone and speaker using the displayed instructions.

## 3. Shared vault and member setup

1. In **Overview**, choose **Open a vault** to reuse an existing vault, enter its full **Treasury account**, then **Load treasury**. Both devices should open the same vault.
2. Alternatively choose **Create a vault**, enter **Team name**, then **Next: members**. Select your partner's public username from the shared demo list, or expand manual entry. Your own account is included automatically. Click **Review vault**, inspect the roster, then **Create shared vault — 6 testnet NEAR**. This is an actual testnet action and requires sufficient testnet balance.
3. Confirm the real vault ID, members, governance approvals and balances load. Share the **Member invitation link** with your partner.
4. Each member opens **Members** on their own device. Start registration, capture and confirm three views of their chosen object, enter **Object label**, then **Save visual template**. Templates remain local to the member/vault/device.
5. Expect **Continue to payment** to become available after a saved template. On the other device, repeat its own member enrollment.
6. Fund the loaded vault from **Overview → Fund your vault** using a small amount of testnet NEAR. Funding is separate from creating a payment proposal.

## 4. Payment and two-device approvals

1. On one member's device open **Payments → New payment → New invoice**. Select the recipient, enter **Purpose** and **Amount in NEAR** (for example `0.05`, subject to the loaded vault's balance and policy).
2. **Save local draft**, then **Review exact payment**. Inspect full recipient, amount, purpose and vault; check the explicit review checkbox, then **Submit reviewed invoice proposal**. This creates the proposal; it does not by itself pay the recipient.
3. Open **Payments → Approvals**. Load the proposal if necessary with **Transfer proposal ID → Refresh payment and ceremony**. Share its **Payment invitation link** with the partner. They select their own account, open the same vault/payment and refresh it.
4. A member clicks **Open host session — 0.1 testnet NEAR**. Refresh the session on both devices. Session validity is five minutes; expired sessions need a new ceremony.
5. Each approving member performs a **fresh member object check** for this exact session. Review the result and its research limitations, acknowledge it when appropriate, then use the matched scan. A non-match must not enable the next approval step.
6. The listening member taps **Listen to host sound** before the host taps **Play host sound**. Use built-in speakers and microphones and grant microphone permission when prompted. Confirm the decoded/accepted challenge through the real UI; do not infer success from the sound animation alone.
7. Each required member checks explicit consent and clicks **Sign member approval**. Refresh to see authoritative approval progress. A scan or an acoustic response alone is not a payment authorization.
8. Once the required approvals are present, **Execute approved payment**. For a pending/unknown outcome, reconcile the original request instead of sending a replacement.
9. After a verified successful transfer, publish evidence if prompted and open **Completed & records**. Verify the receipt and read-only sharing link on the other device. An approved vote or a submitted transaction is not a verified payout.

## Expected limits and test coverage

- Automated UI tests include real browser storage, routing/history, error states and permission denial, local model inference on photo fixtures, and acoustic software round trips. Illustrative previews do not replace those integrations.
- Physical object capture across different angles, real speaker-to-microphone reception, touchscreen/keyboard behavior on actual phones and a fresh two-device funded testnet payout remain manual checkpoints. The opt-in physical/live-spending tests are not automatically run for this UI release.
- Object matching retains the existing experimental threshold. It does not prove the identity of an individual object, person or signing key. Audio remains relayable. This redesign does not change those security properties.
- Account helpers may return HTTP 429 due to faucet quotas. Keep the existing account/key, respect cooldowns and use saved accounts where possible; do not retry under new identities to evade quotas.
- The production build still reports its existing large-bundle warning; no new animation library was added.

Record the device/browser, step, expected vs actual result and visible error for any failure. Do not share private keys or raw personal-object captures in a public issue.


## Automated release verification

`npm run check` completed successfully on the final release source:

| Check | Result |
|---|---|
| Unit tests | 213 passed; 2 opt-in skipped |
| TypeScript | Passed |
| Browser suite | 86 passed; 2 opt-in skipped |
| Production build | Passed; existing large-bundle warning remains |
| Production smoke | Passed, including actual local DINOv2 worker inference, storage, route and failure checks |
| Independent review | Findings fixed and rechecked; no remaining blocking issues |
| Desktop/mobile visual inspection | Rendered Chromium screenshots inspected; physical-device acceptance remains pending |

The LAN server returned HTTP 200 in Chromium and testnet writes were confirmed enabled. Only the temporary QA server was stopped; the existing HTTPS server was left running. No account was created and no funds were spent as part of this UI release verification.
