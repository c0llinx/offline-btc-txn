# Offline Bitcoin Transfer Wallet — Developer Guide (v0.4)

This document is a deep‑dive for developers exploring the codebase. It explains the architecture, key modules, data shapes, and the offline claim/refund workflow built on Taproot/Tapscript.

Repository root: `offline-btc-txn/`

- Monorepo manager: `pnpm` (see `pnpm-workspace.yaml`)
- Primary UI: Next.js app at `apps/web/`
- Shared libraries: `packages/offline-core/`, `packages/offline-interop/`
- Legacy/experimental server: `src/server/`
- Docs: `docs/` and several root `*.md` files

The implementation targets test networks by default (signet/testnet). Where required, signet is mapped onto testnet parameters for addresses and PSBT construction.

---

## 1) Architecture Overview

- `apps/web/`
  - Next.js (14) + React UI with pages for the offline workflow:
    - `cold/`: air‑gapped generator of the Claim/Refund Taproot address and Claim Bundle (UR)
    - `receiver/`: decodes Claim Bundle, builds Claim/Refund PSBTs
    - `signer/`: finalizes PSBT offline; produces witness and raw transaction
    - `watch/`: online messenger to broadcast raw tx hex
    - `tools/`: helper tools — `address`, `keyfinder`
    - `docs/`: in‑app documentation
  - API routes (Next server functions) for small online actions, e.g. broadcasting

- `packages/offline-core/`
  - Core primitives and utilities used in the UI:
    - Taproot/Tapscript building for the 2‑leaf contract
    - Minimal funding PSBT helper
    - UR encode/decode helpers (BC‑UR v2)

- `packages/offline-interop/`
  - Interoperability helpers for data formats exchanged between pages/devices:
    - `parseClaimBundle` (CBOR → JS object)
    - `buildClaimWitness` shape

- `src/server/`
  - A separate Express server and a `RealBitcoinCalculator` class (`bitcoin.ts`) showing how to construct P2TR scripts and PSBTs on the server. The `workflow.ts` is intentionally stubbed.
  - This server is not required to run the Next web app; it is kept for reference and future integration.

---

## 2) Contract Model (Two‑leaf Taproot)

One Taproot output contains two leaves:

- Claim leaf (Merchant path):
  - Script: `OP_SHA256 <h> OP_EQUALVERIFY <R_pub> OP_CHECKSIG`
  - Redeem before expiry with preimage `x` such that `sha256(x) = h` and a Schnorr signature under R’s private key.

- Refund leaf (Buyer path):
  - Script: `<H_exp> OP_CHECKLOCKTIMEVERIFY OP_DROP <S_pub> OP_CHECKSIG`
  - Redeem after height `H_exp` with a Schnorr signature under S’s private key.

The internal key is a “burned” random x‑only pubkey generated on the fly. The script tree combines the two leaves.

Implementation:
- `packages/offline-core/src/taproot.js`
  - `buildClaimScript(R_xonly, h32)`
  - `buildRefundScript(H_exp, S_xonly)`
  - `buildClaimRefundTaproot({ R_xonly, S_xonly, h32, H_exp, network })`
  - `generateBurnedInternalKey()`

---

## 3) Data formats and Interop

- Claim Bundle (UR, CBOR): built in `apps/web/app/cold/page.js` and parsed in `apps/web/app/receiver/page.js`.
  - Version 2 fields (see code comments for exact types):
    - `ver: 2`
    - `h_alg: "sha256"`
    - `h`: 32‑byte hash of message
    - `R_pub`: x‑only pubkey (32 bytes)
    - `script`: claim leaf bytes
    - `leaf_ver`: 0xc0 (tapleaf version)
    - `control`: control block for the claim leaf
    - `expires_at`: H_exp (block height)
    - `refund_script`: refund leaf bytes (v2 specific)
    - `internal_pubkey`: internal x‑only pubkey (v2 specific)

- Parser: `packages/offline-interop/src/parse-claim-bundle.js`
  - Validates required fields for `ver` 1 or 2.

- UR helpers: `packages/offline-core/src/ur.js`
  - `encodeUR(type, bytes, maxFragmentLength)` returns a fountain encoder wrapper
  - `decodeUR(parts)` constructs & normalizes CBOR bytes across browsers

---

## 4) UI Pages (Next.js)

### 4.1 `app/layout.js` + `app/nav.js`
- Global sticky header with nav links.
- `nav.js` uses `usePathname()` to highlight the active page.

### 4.2 `app/page.js` (Home)
- Aggregates links into three sections: Modes, Tools, Docs.

### 4.3 `app/cold/page.js` (Cold Mode)
- Provides tools to:
  - Generate random x‑only pubkeys for R/S (also reveals private keys for testing).
  - Compute `h = sha256(message)`.
  - Build claim/refund Taproot address and the Claim Bundle (UR v2) using `buildClaimRefundTaproot` from `@offline/core`.
- "Tip+6" button:
  - Fetches on‑chain tip height for selected network (supports `signet`, `testnet`, and `testnet4`) and sets `H_exp = tip + 6`.
  - Helper: `fetchTipHeight(networkKey)` with timeouts and fallback endpoints.
- Produces:
  - Taproot address for funding
  - Claim Bundle UR (multi‑line) ready for transfer to the Receiver

Key references:
- `NETWORKS` mapping in `packages/offline-core/src/taproot.js`
- Fetch logic for tip height in `cold/page.js`

### 4.4 `app/receiver/page.js` (Receiver)
- Decodes Claim Bundle (UR lines) and shows parsed content.
- Helper to decode a raw funding transaction hex and list outputs (identify `vout`, `value`, and `scriptPubKey` of the Taproot output).
- Build PSBT section (choose spend path):
  - Claim path:
    - Adds `tapLeafScript` with claim script + control block from the Claim Bundle.
  - Refund path:
    - Reconstructs refund control block using `{ internal_pubkey, [claim, refund] }` to compute witness like BitcoinJS would.
    - Sets `nLockTime = H_exp` and input `nSequence = 0xfffffffe`.
- Fee estimation:
  - Approx 151 vB for 1‑in/1‑out, +31 vB per extra output (change).
  - Optionally auto‑fills destination amount when no change is provided.
- Output:
  - PSBT (Base64) and UR (multipart) for offline signing

Key references:
- Building PSBT: `bitcoin.Psbt` in `receiver/page.js`
- Refund‑specific handling: see lines that set `psbt.setLocktime(lock)` and input `sequence`

### 4.5 `app/signer/page.js` (Offline Signer)
- Imports PSBT (Base64 or UR), detects script type (claim/refund) from `tapLeafScript`.
- For Claim path:
  - Requires preimage `x` (hex or text) and signs with private key of `R`.
- For Refund path:
  - Signs with private key of `S`, no preimage.
- Uses `@noble/curves/secp256k1` for Schnorr signing and assembles the final witness:
  - Claim witness: `[sigR, x, script, control]`
  - Refund witness: `[sigS, script, control]`
- Extracts final raw tx hex for broadcasting.

### 4.6 `app/watch/page.js` (Broadcast / Watch‑Only)
- Posts raw transaction hex to a chosen endpoint (defaults to mempool.space testnet).
- Server side route: `app/api/broadcast/route.js` implements robust POST with timeout and fallback.

### 4.7 Tools
- `tools/address/page.js`
  - Derives P2WPKH and P2TR single‑key addresses from a WIF or 32‑byte hex private key.
- `tools/keyfinder/page.js`
  - Recover a key by scanning BIP86 (Taproot) and BIP84 paths for a given address using BIP39 seed words.
  - Browser‑safe PBKDF2 (WebCrypto) and minimal BIP32 derivation.
  - Supports testnet/signet/mainnet; mnemonic normalization accepts newlines and numbering.

### 4.8 In‑app Docs
- `docs/buyer-merchant/page.js`: guided documentation of the flow embedded in the app UI.

---

## 5) Core Library (`packages/offline-core/`)

### 5.1 `src/taproot.js`
- `NETWORKS`: maps `{ signet: testnet, testnet, mainnet }`.
- `generateBurnedInternalKey()`:
  - Generates a random private scalar and returns the x‑only pubkey (32 bytes) as the internal key for Taproot.
- `buildClaimScript(R_xonly, h32)` → Buffer
- `buildRefundScript(H_exp, S_xonly)` → Buffer
- `buildClaimRefundTaproot({ R_xonly, S_xonly, h32, H_exp, network })` → `{ address, output, internalPubkey, leaves, scriptTree }`
  - Uses `bitcoin.payments.p2tr({ internalPubkey, scriptTree, network })`

### 5.2 `src/psbt.js`
- `buildFundingPsbt({ utxos, sendOutputScript, sendValueSat, changeAddress, feeRateSatVb, network })`
  - Adds inputs using provided `witnessUtxo`
  - Adds P2TR output (by `script`), optional change
  - Simple fee estimate; throws on insufficient funds

### 5.3 `src/ur.js`
- BC‑UR v2 wrappers for encoding and decoding CBOR payloads.
- Normalizes CBOR bytes across heterogeneous browser/Node Buffer types.

---

## 6) Interop Library (`packages/offline-interop/`)

- `parse-claim-bundle.js`:
  - `decode(cborBytes)` using `cbor-x`
  - Validates `ver` and presence of required keys
- `build-witness.js`:
  - Simple constructor for a claim witness array `[sigR, x, script, control]`

---

## 7) Legacy/Reference Server (`src/server/`)

The Express server demonstrates a server‑side build of the same primitives and exposes REST endpoints. It is optional for running the web app.

- `server.ts`
  - Sets up API endpoints (`/api/...`) for a prior arithmetic concept and the offline workflow placeholders.
  - Calls into `OfflineWorkflowService` (stub) and `RealBitcoinCalculator` (alias for `OfflineBtcWallet`).

- `bitcoin.ts` (aka `RealBitcoinCalculator`)
  - `createSpendingScripts(senderPublicKey, receiverPublicKey, preimageHash, refundTimeLock)`
  - `createTaprootAddress(internalPublicKey, claimScript, refundScript)`
  - `createSenderFundingTransaction(SenderData, feeRate)`
  - `createReceiverClaimTransaction(ReceiverClaimData, feeRate)`
  - `createSenderRefundTransaction(SenderRefundData, feeRate)`
  - Uses `mempool.space/testnet` for fetching prev tx hex (adjust for signet/mainnet as needed)

- `workflow.ts`
  - Stubbed `OfflineWorkflowService` with `TODO` return shapes

- `src/shared/types.ts`
  - Central TypeScript types used across server modules: `SenderData`, `ReceiverClaimData`, `SenderRefundData`, `OfflineTxoData`, `SignedTransaction`, `UTXO`, etc.

> Note: The server and the Next app are independent. The Next app implements the fully offline claim/refund flow already; the server is kept for reference and potential future consolidation.

---

## 8) Network Handling

- The UI generally treats signet/testnet with testnet parameters (`bitcoin.networks.testnet`) for address and PSBT construction.
- `cold/` supports `testnet4` for fetching tip height (`/testnet4/api/blocks/tip/height`) but still uses testnet params for address derivation (compatible for PSBT construction on non‑mainnet networks).
- Broadcasting (`watch/`) defaults to mempool.space testnet; endpoint is user‑selectable and should be pointed to the intended network.

---

## 9) CLTV / Refund Rules

- Refund is possible once chain tip ≥ `H_exp`.
- Refund PSBT must set:
  - `nLockTime = H_exp`
  - Input `nSequence = 0xfffffffe` (strictly less than `0xffffffff`)
- Receiver’s refund PSBT reconstruction uses `internal_pubkey` and both leaves to build the correct control block, mirroring `bitcoin.payments.p2tr` behavior.

---

## 10) Running the Project

Prerequisites: Node 18+, pnpm 8+

1) Install deps (monorepo root):
```
pnpm install
```

2) Run the Next.js app (UI):
```
pnpm -F @offline/web dev
# App on http://localhost:3000
```

3) (Optional) Run the legacy Express server:
```
pnpm dev
# Server on http://localhost:3001
```

> The web app does not require the Express server. The server is helpful if you want to examine the alternative server‑side script/PSBT constructors.

---

## 11) Security & Privacy Considerations

- Keep the `cold/` page offline when entering real secrets. It has a Service Worker to enforce no‑network mode (toggleable).
- The Claim Bundle includes only public data required for spend construction; never include private keys.
- The Signer page accepts WIF/hex private keys. Use in a truly air‑gapped environment for real funds.
- The Key Finder tool can derive private keys from seed words; use strictly offline and only on test networks unless you fully trust the environment.

---

## 12) Extending the System

- Add more spend leaves:
  - Expand `scriptTree` in `buildClaimRefundTaproot` to include additional policy leaves.
  - Update interop/schema to publish any new proofs required to reconstruct control blocks on the receiver.

- Support mainnet production mode:
  - Add mainnet endpoints in `watch/` and tip‑height fetchers.
  - Audit fee estimation and dust thresholds for production usage.

- Improve PSBT estimation/selection:
  - Replace rough constants with template‑based size estimation per script path.
  - Add change selection logic with better coin control if multiple inputs are supported.

- Persist and scan:
  - Add a small persistence store for Claim Bundles and associated funding txs.
  - Integrate a watch‑only wallet for automatic prevout fill.

---

## 13) Notable Files & Symbols Cheat Sheet

- UI
  - `apps/web/app/cold/page.js`: `fetchTipHeight()`, `handleSetExpiryNearTip()`, `buildClaimRefundTaproot()`
  - `apps/web/app/receiver/page.js`: `handleDecodeTx()`, `handleClaimDecode()`, `handleBuildClaimPsbt()`
  - `apps/web/app/signer/page.js`: `handleImportPsbt()`, `handleSign()`
  - `apps/web/app/watch/page.js`: broadcast UI
  - `apps/web/app/api/broadcast/route.js`: robust POST `/api/tx`
  - `apps/web/app/tools/address/page.js`: derive P2WPKH and P2TR from WIF/hex
  - `apps/web/app/tools/keyfinder/page.js`: BIP39 + BIP32 (86/84) key scanning

- Core
  - `packages/offline-core/src/taproot.js`: `buildClaimScript`, `buildRefundScript`, `buildClaimRefundTaproot`
  - `packages/offline-core/src/psbt.js`: `buildFundingPsbt`
  - `packages/offline-core/src/ur.js`: `encodeUR`, `decodeUR`

- Interop
  - `packages/offline-interop/src/parse-claim-bundle.js`: `parseClaimBundle`
  - `packages/offline-interop/src/build-witness.js`: `buildClaimWitness`

- Server (optional)
  - `src/server/bitcoin.ts`: `OfflineBtcWallet` (a.k.a. `RealBitcoinCalculator`)
  - `src/server/server.ts`: Express API
  - `src/server/workflow.ts`: placeholder service
  - `src/shared/types.ts`: shared TS types

---

## 14) Known Limitations

- The Receiver builder uses testnet params for PSBT creation even when signet/testnet4 are selected. This is acceptable for non‑mainnet workflows but keep endpoints consistent when broadcasting.
- Fee estimation is deliberately conservative/simplified.
- The legacy server’s workflow service is stubbed.

---

## 15) Contributing Guidelines

- Prefer small, reviewable PRs per feature.
- Keep UI pages self‑contained and stateless where possible.
- When adding a new interop payload, update both the generator (Cold) and parser (Receiver), plus this guide.
- Validate network handling and endpoints for each new network added.

---

## 16) Appendix: Glossary

- R, S: x‑only pubkeys. R signs Claim, S signs Refund.
- h, x: hash preimage (`h = sha256(x)`) and the preimage itself.
- H_exp: CLTV block height after which refund is permitted.
- Control Block: Taproot proof of branch and internal key for the revealed leaf.
- UR: Bytewords‑based fountain code format (BC‑UR v2) for QR/air‑gap transfer.

---

If you need a deeper reference of the protocol intent and rationale, see:
- `Offline Bitcoin Transfer Wallet — Protocol & Engineering Approach (v0.4).md`
- `Specs.md`
