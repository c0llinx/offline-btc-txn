# Offline BTC Web

A Next.js interface for building and working with offline-friendly Bitcoin Taproot workflows. The app focuses on UR-encoded PSBT handoffs, claim/refund script generation, and quick access to testnet UTXO data without relying on any separate backend project.

## Features

- **Cold workflow tools** for creating claim/refund Taproot addresses, funding PSBTs, and QR-ready UR fragments.
- **Signer and Receiver assistants** that deserialize UR payloads, guide through claim bundle parsing, and help compose broadcast-ready PSBTs.
- **Wallet Manager** to generate/import WIFs, cache pubkeys/addresses locally, and reuse them across every workflow.
- **On-device balance tracking** with per-wallet history and a network-backed “Refresh” sync when you’re online.
- **Testnet helpers** including API routes that proxy mempool.space/testnet4 for raw transaction and UTXO lookups.
- **Local librairies** providing the Taproot, PSBT, UR, and bundle parsing utilities without extra packages.

## Getting Started

```bash
npm install
npm run dev
```

The development server runs at `http://localhost:3000`.

## Scripts

- `npm run dev` — start Next.js in development mode
- `npm run build` — create an optimized production build
- `npm start` — serve the production build
- `npm run lint` — lint the project with Next.js defaults

## Project Structure

```
app/            # Next.js route handlers and pages
components/     # Reusable UI pieces
lib/            # Local Bitcoin/Taproot/UR helpers and API services
public/         # Static assets and service workers
next.config.js  # Next.js configuration with Buffer polyfill
jsconfig.json   # Path aliases ("@/*") for cleaner imports
```

## Environment

The project targets Node 18+ and relies on public mempool.space Testnet4 endpoints for network data. No additional backend services are required after installing dependencies.

---

If you previously used the monorepo/server implementation, all functionality now lives inside this single Next.js project.
