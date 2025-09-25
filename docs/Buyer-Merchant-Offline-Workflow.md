# Offline Bitcoin Wallet — Buyer/Merchant Workflow (Testnet)

This guide explains how the wallet enables truly offline transaction flows using a Taproot contract with two paths: Claim (for the Merchant) and Refund (for the Buyer after expiry). It uses PSBT and UR encoding so that construction and signing can be split across air‑gapped devices.

Roles and mapping
- Merchant = Receiver usinsetg R key (can claim with preimage x)
- Buyer = Sender using S key (can refund after expiry H_exp)

Key pages and code
- Cold generator: `apps/web/app/cold/page.js`
- Receiver PSBT builder: `apps/web/app/receiver/page.js`
- Signer (offline finalizer): `apps/web/app/signer/page.js`
- Watch/Broadcast: `apps/web/app/watch/page.js`
- Address tool (simple wallet address derivation): `apps/web/app/tools/address/page.js`
- Claim‑bundle parser: `packages/offline-interop/src/parse-claim-bundle.js` (supports v1 and v2)

What the contract is
- One Taproot address (P2TR) holds the payment.
- Two tapscript leaves:
  - Claim path: Merchant proves knowledge of preimage x where sha256(x) = h and signs with R.
  - Refund path: After height H_exp, Buyer signs with S (CLTV enforced by nLockTime + non‑final nSequence).

How offline is enforced
- The Cold page registers a Service Worker scoped to `/cold/` that blocks network requests. This keeps R/x generation and claim‑bundle creation fully offline.
- All large payloads (claim‑bundle, PSBT) use UR encoding (CBOR fragments) to move data between devices via QR/copy‑paste.

Default network
- Testnet by default across pages and the broadcast API. You can still choose signet/mainnet in the UI.

---

## End‑to‑end flows

### 1) Setup by Merchant (Cold device)
1. Open `/cold` on the air‑gapped machine.
2. Choose Network = `testnet`.
3. Set Expiry (H_exp). For quick testing, click `Tip+2` to set expiry near the current chain tip.
   - Note: Cold Mode blocks network calls. Temporarily disable Cold to fetch tip, then re‑enable.
4. Choose/enter keys:
   - R x‑only (Merchant’s claim key). You can click `Random` and securely store the private key.
   - S x‑only (Buyer’s refund key). In real usage, the Buyer should provide S_pub; in demos you can generate S and hand the private key to the Buyer.
5. Set message and compute `h = sha256(message)` or paste your own 32‑byte `h`.
6. Click `Generate Claim Bundle`.
   - Outputs a testnet P2TR address and a multi‑part `ur:claim-bundle/...` (version 2), which includes `refund_script` and `internal_pubkey`.

Share with the Buyer
- The Merchant shares:
  - The P2TR address (so the Buyer can fund it)
  - The Claim Bundle UR (so the Buyer can build refund if needed)
- Keep R private key and preimage x secret on the Cold device.

### 2) Buyer funds the contract
1. Send tBTC to the P2TR address.
2. Optionally, share the funding txid with the Merchant.

### 3) Merchant claims before expiry (normal success path)
On the online machine:
1. Open `/receiver`.
2. Paste the Claim Bundle UR and click `Decode Claim`.
3. Paste funding prevout details: `txid`, `vout`, `value (sats)`, `scriptPubKey (hex)`.
4. Choose Spend Path = `Claim`.
5. Set destination address (e.g., derived from `/tools/address`). Optionally add a change address.
6. `Estimate Fee`, adjust amounts if needed, then `Build Claim PSBT`.

On the Cold Signer (/signer):
1. Import the PSBT (base64 or UR).
2. Preimage x: required for claim; paste hex or text.
3. Private key: R private key (WIF or 32‑byte hex).
4. Sign and finalize to get raw tx hex.

Broadcast:
- On `/watch` paste your signed tx hex and broadcast (testnet default, fallback endpoints).

### 4) Buyer refunds after expiry (safety path)
This is only needed if the Merchant doesn’t claim before H_exp.

On the online machine:
1. Open `/receiver`.
2. Paste the (v2) Claim Bundle and click `Decode Claim`.
3. Enter funding prevout details.
4. Choose Spend Path = `Refund`.
   - The app reconstructs the refund control block using `internal_pubkey + {claim, refund}` leaves.
   - It sets CLTV by applying `nLockTime = expires_at` and input `nSequence = 0xfffffffe`.
5. Set destination address (Buyer’s wallet), optional change, estimate fee, and `Build Claim PSBT`.

On the Buyer’s Signer (/signer):
1. Import PSBT (base64 or UR).
2. Leave preimage empty (not needed).
3. Sign with S private key (WIF or 32‑byte hex). Finalize to get raw tx hex.

Broadcast:
- `/watch` to broadcast on testnet. If attempted before H_exp, nodes will reject as non‑final due to CLTV; try again once tip >= H_exp.

---

## Operational notes

- Change outputs:
  - For privacy and simplicity, do not reuse the P2TR contract address for change. Use a normal wallet address (e.g., P2WPKH) for change.

- PSBT details:
  - Claim: includes claim tapscript and control block from the bundle.
  - Refund: reconstructs control block for refund leaf and sets CLTV (locktime/sequence).

- Signer detection:
  - The Signer auto‑detects claim vs refund from the tapscript.
  - Witness assembly:
    - Claim: `[sigR, x, script, control]`
    - Refund: `[sigS, script, control]`

- UR data transfer:
  - All large payloads are split into `ur:...` parts and can be moved offline. Use copy/paste or QR between devices.

- Network endpoints:
  - Broadcast API uses testnet by default and has fallback endpoints and timeouts.
  - For signet/mainnet, set endpoints accordingly in `/watch`.

---

## Troubleshooting
- Broadcast fails as non‑final: You are trying to spend refund before H_exp, or the input sequence isn’t non‑final. Use the Refund path builder and wait until tip >= H_exp.
- Fee too high / change dust: Lower fee rate, reduce outputs, or remove change. The UI warns on dust values.
- Cold page Tip+2 fetch fails: Cold Mode blocks network. Disable Cold temporarily, fetch, then re‑enable.

---

## File references
- `apps/web/app/cold/page.js` — Cold generator with Tip+2 and claim‑bundle v2 output.
- `apps/web/app/receiver/page.js` — PSBT builder with Claim/Refund switch and CLTV handling for refund.
- `apps/web/app/signer/page.js` — Offline PSBT import, script detection, and Schnorr finalization.
- `apps/web/app/watch/page.js` — Broadcast tool with timeout and fallback endpoints.
- `packages/offline-interop/src/parse-claim-bundle.js` — v1/v2 claim‑bundle parser.

---

## Quick checklist by role

Merchant
- Generate v2 bundle on `/cold` (Tip+2 to expedite testing).
- Share P2TR address and the claim bundle with the Buyer.
- After funding, build Claim PSBT on `/receiver`, sign on `/signer` with R + x, broadcast via `/watch`.

Buyer
- Fund the Merchant’s P2TR address.
- If Merchant did not claim in time and tip >= H_exp: build Refund PSBT on `/receiver`, sign with S on `/signer`, broadcast on `/watch`.
