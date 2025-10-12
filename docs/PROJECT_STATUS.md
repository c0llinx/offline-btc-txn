# Offline BTC Web — Project Status & History

_Last updated: 2025-10-10_

This document captures the current state of the codebase and the major changes that led here so a new contributor can pick up immediately.

---

## Application Overview

- **Stack**: Next.js 14 (app router), React 18, TailwindCSS, bitcoinjs-lib (Taproot), QRCode (renderer), `@bitcoinerlab/secp256k1`, `ecpair`.
- **Structure**: Single Next.js project (no monorepo). Core UI routes live under `app/`: `cold/`, `receiver/`, `refund/`, `tools/address/`, `wallets/`, etc.
- **Wallet storage**: `lib/wallets.js` handles browser-local wallets (Taproot-only). It stores WIF, compressed + x-only pubkeys, Taproot address, balance history.

---

## Feature Summary

### Cold Mode (`app/cold/page.js`)
- Generates Taproot claim bundles offline.
- Uses only User A’s funding wallet (Taproot) to auto-build the funding transaction. If UTXOs are missing, the UI instructs the user to fund the wallet or paste the raw funding transaction (`fundtx`).
- Added manual UTXO entry fallback so operators can paste txid/vout/value details when the device is fully offline.
- Receiver’s key is no longer required at this stage. Claim script falls back to pure hash-lock when no R key is provided.
- Claim bundle metadata includes `requires_signature` flag so the receiver knows whether a Taproot key signature is expected.
- Output panel offers:
  - Copy buttons for UR string and shareable URL.
  - Higher-resolution QR (PNG) for reliable scanning.

### Receiver (`app/receiver/page.js`)
- Imports claim bundles via manual UR text or camera scan (dynamic QR scanner component).
- Auto-selects the wallet whose x-only key matches the bundle; allows manual choice.
- Requires user to provide funding txid/vout/script/value if the bundle does not include them yet.
- Builds and signs the claim spend, adjusting payout for fees; skips signature when bundle indicates no Taproot key signature is required.
- Provides copy buttons for signed tx hex; updates local wallet history with the receive entry.

### Refund (`app/refund/page.js`)
- Offline assistant for finalising refund PSBTs produced by Cold mode.
- Accepts UR/base64 PSBTs, exposes the Taproot input index, and signs using the funding wallet key + original preimage.
- Outputs the fully-signed refund transaction hex for broadcasting once the claim window expires.

### Wallet Manager (`app/wallets/page.js` + `components/WalletManager.jsx`)
- Taproot-only wallets (P2WPKH generation & display removed).
- Generates/imports wallets, tracks balances/history, exposes copy buttons for WIF, public key, x-only key, Taproot address.
- Refresh UI now highlights pending Taproot sats separately from confirmed totals so recent broadcasts show up immediately without being wiped by sync.

### Tools (`app/tools/address/page.js`)
- Derives only Taproot addresses from a WIF or 32-byte hex private key.

### Shared Utilities
- `lib/clipboard.js` provides a resilient `copyToClipboard`.
- `components/CameraScanner.jsx` handles QR decoding using the BarcodeDetector API with graceful fallback.

---

## Deployment Notes

- **Build command**: `npm install && npm run build`
- **Start command**: `npm run start`
- **Node version**: Target Node 20.x (Render defaults to 22; adjust via `engines` or Render setting if required).
- Added dependency: `"ecpair": "^2.0.0"` (ensure lockfile is up to date).

---

## Recent Changes Timeline

### Taproot-Only Wallets
- Removed P2WPKH address generation/display throughout the app.
- Existing stored wallets have their `p2wpkh` field cleared on load to avoid legacy leakage.

### Claim Bundle Flow
- Cold generator now auto-builds funding transaction or fails with actionable guidance when no Taproot UTXOs exist.
- Claim scripts now support receiverless (hash-lock-only) bundles and mark them via `requires_signature`.
- Bundle QR share updated (scannable PNG, copy buttons, share URL).
- Funding auto-build now filters UTXOs to Taproot-only scripts, preventing legacy P2WPKH outputs from being signed accidentally.
- Added preflight amount check in cold-mode auto builder to surface available Taproot balance when the commitment exceeds wallet funds.
- Taproot funding signer now uses a custom tweaked Schnorr signer object, ensuring bitcoinjs-lib can sign inputs even when the wallet holds only P2TR UTXOs.

### Receiver Experience
- Added camera QR scanner input alongside manual UR entry.
- Revised error messaging for missing funding txids to instruct user to paste the broadcast hash.
- Recording wallet events and balance refresh now run after signing.
- Receiver now auto-broadcasts claim spends on Build & Sign, ensuring funds leave the commitment output, land on the chosen destination, and credit whichever wallet tracks that address before running an immediate balance sync.
- Hash-lock bundles leave the destination blank until the operator confirms a payout address, preventing accidental reuse of the commitment output.
- Destination defaults only prefill when the bundle requires a Taproot signature so hash-lock claims must explicitly confirm the payout address.
- Destination picker now lists the active wallet’s Taproot addresses with a custom option so operators can paste an external payout without retyping known keys.
- Broadcasts respect the claim bundle or wallet network (mainnet / testnet / testnet4 / signet) and fall back between the two public test networks when needed so legacy coins remain spendable.
- Watch mode now lets you pick the target network while keeping the endpoint read-only for clarity.

### Refund Assistant
- Replaced the legacy signer view with a dedicated refund helper that imports PSBTs, applies the original preimage + sender key, and outputs a final refund transaction for broadcast after expiry.

### Clipboard & Sharing
- Introduced shared clipboard helper.
- Added quick-copy buttons to cold bundle output and wallet manager.

### Render Deploy Fixes
- Updated build/start commands to standard Next.js scripts.
- Added `ecpair` dependency (version ^2.0.0) so remote builds succeed.
- Documented need for Node 20 in Render environment.

### Balance Sync API
- Added `/api/balance/[network]/[address]` proxy for mempool.space to keep Taproot wallet refreshes accurate during manual syncs.
- Wallet refresh now pulls `/api/utxos` and sums only Taproot (`5120…`) UTXOs so the displayed balance reflects spendable claim funds, preventing confusion with legacy outputs.
- Cold-mode funding builder and wallet refresh both ignore unconfirmed UTXOs, so balances and auto-builds only reflect confirmed Taproot coins.
- Claim workflow now auto-syncs the recipient wallet’s confirmed Taproot balance immediately after a claim event, avoiding stale totals until the user refreshes manually.
- Wallets maintain a `taprootAddresses` list (updated on receive events), so refresh/auto-build scan every Taproot address associated with that wallet—covering cases where the user supplies a fresh payout address.
- Sync now tracks pending Taproot outputs separately and leaves wallet balances inclusive of unconfirmed sats, preventing auto-refresh from zeroing freshly claimed funds while still surfacing confirmed availability.
- Balance, UTXO, and broadcast proxies prefer Testnet4 but automatically fall back to the legacy testnet when the primary endpoint returns empty data, reducing mismatches during the migration window.

### QR Encoding
- Switched UR payloads to base64url alphabet to remove `+` and `/` characters that some scanners mis-handle. Updated decoder accordingly.
- Cold-mode QR image now renders at native resolution with pixelated scaling (and open-in-tab helper) so phone cameras can capture without blurring.

---

## Pending / Nice-to-Have

- Service worker / offline caching is unchanged from the legacy setup; revisit if we want progressive web app behavior.
- Consider adding automated UTXO discovery or manual entry helper to reduce friction when cold auto-build fails.
- Improve QR scanner fallback for browsers without `BarcodeDetector` (currently just shows unsupported message).

---

## How to Continue

1. Pull latest main/feature branch.
2. Run `npm install` (regenerates `package-lock.json` with `ecpair`).
3. Use `npm run dev` locally.
4. For production deploys (Render), ensure updated build/start commands and Node version.

Keep this document updated whenever flow or deployment behavior changes.
