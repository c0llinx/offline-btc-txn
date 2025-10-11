# Offline BTC Web — Project Status & History

_Last updated: 2025-10-10_

This document captures the current state of the codebase and the major changes that led here so a new contributor can pick up immediately.

---

## Application Overview

- **Stack**: Next.js 14 (app router), React 18, TailwindCSS, bitcoinjs-lib (Taproot), QRCode (renderer), `@bitcoinerlab/secp256k1`, `ecpair`.
- **Structure**: Single Next.js project (no monorepo). Core UI routes live under `app/`: `cold/`, `receiver/`, `signer/`, `tools/address/`, `wallets/`, etc.
- **Wallet storage**: `lib/wallets.js` handles browser-local wallets (Taproot-only). It stores WIF, compressed + x-only pubkeys, Taproot address, balance history.

---

## Feature Summary

### Cold Mode (`app/cold/page.js`)
- Generates Taproot claim bundles offline.
- Uses only User A’s funding wallet (Taproot) to auto-build the funding transaction. If UTXOs are missing, the UI instructs the user to fund the wallet or paste the raw funding transaction (`fundtx`).
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

### Wallet Manager (`app/wallets/page.js` + `components/WalletManager.jsx`)
- Taproot-only wallets (P2WPKH generation & display removed).
- Generates/imports wallets, tracks balances/history, exposes copy buttons for WIF, public key, x-only key, Taproot address.

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

### Receiver Experience
- Added camera QR scanner input alongside manual UR entry.
- Revised error messaging for missing funding txids to instruct user to paste the broadcast hash.
- Recording wallet events and balance refresh now run after signing.

### Clipboard & Sharing
- Introduced shared clipboard helper.
- Added quick-copy buttons to cold bundle output and wallet manager.

### Render Deploy Fixes
- Updated build/start commands to standard Next.js scripts.
- Added `ecpair` dependency (version ^2.0.0) so remote builds succeed.
- Documented need for Node 20 in Render environment.

### Balance Sync API
- Added `/api/balance/[network]/[address]` proxy for mempool.space to keep Taproot wallet refreshes accurate during manual syncs.

### QR Encoding
- Switched UR payloads to base64url alphabet to remove `+` and `/` characters that some scanners mis-handle. Updated decoder accordingly.

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
