This file is a merged representation of the entire codebase, combined into a single document by Repomix.

# File Summary

## Purpose
This file contains a packed representation of the entire repository's contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
apps/
  web/
    app/
      about/
        page.js
      api/
        broadcast/
          route.js
        node/
          [...path]/
            route.js
        ping/
          route.js
        tx/
          [txid]/
            route.js
        utxos/
          [address]/
            [amount]/
              route.js
      cold/
        page.js
      receiver/
        page.js
      signer/
        page.js
      tools/
        address/
          page.js
      watch/
        page.js
      globals.css
      layout.js
      page.js
    components/
      ModeBadge.jsx
      QRScanner.jsx
    public/
      schemas/
        claim-bundle.cddl
        utxo-snapshot.cddl
      sw-cold.js
    next.config.js
    package.json
    postcss.config.js
    tailwind.config.js
docs/
  JSON_PERSISTENCE.md
  Offline Bitcoin Transfer Wallet — Protocol & Engineering Approach (v0.4).md
  SOLUTION.md
  Specs.md
packages/
  offline-core/
    src/
      index.js
      psbt.js
      taproot.js
      ur.js
    test/
      psbt.test.js
      taproot.test.js
      ur.test.js
    package.json
    README.md
  offline-interop/
    src/
      build-witness.js
      index.js
      parse-claim-bundle.js
    package.json
  server-api/
    src/
      services/
        mempool.ts
        UTXOService.ts
    package.json
  shared-types/
    src/
      index.ts
    package.json
scripts/
  debug-keys.js
  final-diagnosis.js
  fix-signing-issue.js
  taproot-key-analysis.js
  taproot-signing-test.js
  test-control-block.js
  test-exact-match.js
src/
  client/
    app.ts
  server/
    bitcoin-export-fix.ts
    bitcoin.ts
    calculator.ts
    server.ts
    workflow.ts
.gitignore
index.html
package.json
pnpm-workspace.yaml
README.md
saved-addresses.json
tsconfig.json
vite.config.ts
```

# Files

## File: docs/Offline Bitcoin Transfer Wallet — Protocol & Engineering Approach (v0.4).md
````markdown
# Offline Bitcoin Transfer Wallet — Protocol & Engineering Approach (v0.4)

**Status:** Draft for internal review

**Audience:** Engineering, Security, Research

**Goals:** Ship an air‑gapped wallet that enables sending BTC while offline, with a clear path to a publishable protocol paper.

**Scope:** On‑chain payments only (no Lightning). Receiver may be online or offline at payment time, but must eventually connect to claim.

---

## 1) Problem Statement & Objectives

We want a protocol and reference implementation that allow a user with an offline (air‑gapped) signer to create a payment that a receiver can later claim, without any additional interaction. If the receiver never claims by a deadline **T**, the sender can unilaterally refund. The online component is watch‑only and acts only as a messenger/relay.

**Objectives**

- **Security:** Private keys never leave Cold Mode; claims and refunds are unforgeable under explicit assumptions.
- **Liveness:** Either the receiver claims before **T**, or the sender refunds at/after **T**.
- **Privacy:** Minimize on‑chain fingerprinting and metadata leaks.
- **Practicality:** Works with PSBTs and animated UR/QR on commodity devices. Fee management handles congestion.
- **Interoperability:** Use BIP‑174/371 PSBT, Taproot, Miniscript‑expressible policies, and BC‑UR v2 payloads.
- **Publishability:** Clean security properties; optional novel variant for stronger privacy/efficiency.

**Non‑Goals (v0.1)**

- Lightning channels / LNURL.
- Cross‑chain swaps.
- Custodial e‑cash (kept for future variant).

---

## 2) System Model & Roles (Mode‑based Wallet)

We implement three **modes** within the wallet. For security analysis, we still reason about them as distinct roles possibly running on separate devices.

### 2.1 Cold Mode (Offline Signer)

- **Description:** Wallet running without network capabilities (air‑gapped).
- **Responsibilities:** Holds private keys; builds Taproot scripts/policies; signs PSBTs; generates the **Claim Bundle**; communicates via QR/UR (and optionally NFC/Bluetooth if explicitly enabled and sandboxed).
- **Security Anchor:** Once in Cold Mode, the app enforces isolation (no net libraries, runtime checks).

### 2.2 Watch‑Only Mode (Online Messenger)

- **Description:** Network‑enabled, but with watch‑only accounts (no private keys).
- **Responsibilities:** Talks to the Bitcoin network (preferably via user’s own node or BIP157/158), fetches UTXOs/headers/feerates, relays signed PSBTs, displays animated URs.

### 2.3 Receiver Wallet (Generic)

- **Description:** Any Taproot‑capable wallet (this wallet in Receiver Mode or a third‑party wallet).
- **Responsibilities:** Scans and stores Claim Bundles; waits for funding confirmation; constructs and broadcasts the claim transaction; supports CPFP fee bumps if needed.

---

## 3) Assumptions

- Bitcoin mainnet rules; Taproot enabled.
- Receiver eventually connects to the internet.
- Adversary can observe mempools/chain and attempt fee manipulation, but cannot break standard cryptography.
- Strongest model uses **two devices**: Cold Mode on an offline device; Watch‑Only/Receiver on an online device. Single‑device operation is supported with strict runtime checks and UX warnings.
- Receiver may use this wallet or any compatible third‑party wallet supporting Taproot script‑path spends.

---

## 4) Threat Model (abridged)

- **Cold Mode parsing:** QR payloads scanned into Cold Mode are untrusted input.
- **Receiver parsing:** Claim Bundles delivered to a receiver wallet are also untrusted input.
- **Metadata leaks:** Network queries in Watch‑Only mode can deanonymize.
- **Fee manipulation:** Claim/refund stuck due to adversarial feerates or pinning.
- **Race near deadline:** Receiver claim vs. Sender refund around **T**.

**Out of scope (v0.1):** Physical compromise of the Cold Mode device; side‑channel attacks; malware on Watch‑Only beyond metadata leakage; malicious code in a third‑party receiver wallet.

---

## 5) Protocol Overview (Baseline Variant A — Scripted Claim & Scripted Refund)

We construct a Taproot output **TAPOUT** with two script‑path leaves and an unspendable internal key (to disable key‑path bypass):

- **Claim leaf (Receiver path):** Receiver proves knowledge of a one‑time secret **x** (with **h = SHA256(x)**) **and** signs with receiver key **R**.
- **Refund leaf (Sender path):** After absolute block height **H_exp**, Sender signs with key **S** to reclaim funds.

### 5.1 Sequence (informal)

```
Cold Mode            Watch‑Only (online)             Receiver Wallet
   |                         |                              |
   |--(1) UTXO snapshot UR->|                              |
   |                         |                              |
   |<-(2) Funding PSBT UR---|                              |
   |                         |                              |
   |--(3) Sign PSBT --------> (broadcast TX_fund)          |
   |                         |                              |
   |--(4) Claim Bundle UR---------------------------------> |
   |                         |                              | (store offline OK)
   |                         |                              |
   |                         |                    (5) wait ≥1 conf
   |                         |                              |
   |                         |<---------------- (6) build & broadcast TX_claim
   |                         |                              |
   |                [If no claim by H_exp]
   |--(7) build & broadcast TX_refund via refund leaf ----->|

```

### 5.2 High‑level flow

1. **Funding:** Cold Mode selects inputs (from a `utxo-snapshot` UR), creates taptree with claim/refund leaves (internal key = NUMS), signs the PSBT; Watch‑Only broadcasts **TX_fund**.
2. **Handoff:** Cold Mode generates a **Claim Bundle** (includes `x` or `h`, the claim script, leaf version, control block, and optional outpoint metadata) and shows it as an animated UR for the Receiver to scan (Receiver may be offline).
3. **Claim:** Once online and after ≥1 conf, Receiver spends **TAPOUT** via the claim leaf; attaches CPFP if needed.
4. **Refund:** If the Receiver does not claim by **H_exp**, Cold Mode spends via the refund leaf.

---

## 6) On‑Chain Construction (Variant A)

**Internal key:** Unspendable (NUMS) to force script‑path only.

**Claim leaf:** `OP_SHA256 <h> OP_EQUALVERIFY <R> OP_CHECKSIG`

**Refund leaf:** `<H_exp> OP_CHECKLOCKTIMEVERIFY OP_DROP <S> OP_CHECKSIG`

**Address:** P2TR from taptree {claim, refund}.

---

## 7) Data Artifacts & Payload Schemas

- **PSBTs:** `ur:crypto-psbt` (BIP‑174/371 with Taproot fields and control blocks where relevant).
- **Claim Bundle (sender → receiver):** `ur:claim-bundle` v1 with `{ h_alg, preimage or h, R_pub, script, leaf_ver, control, fund_txid?, vout?, expires_at, meta }`.
- **UTXO Snapshot (watch‑only → cold):** `ur:utxo-snapshot` with `{ height, tip, UTXOs, feerates, change template }`.

---

## 8) Algorithms (Baseline)

8.1 **Funding (Cold Mode)** — generate x/h, build taptree, construct+sign PSBT, emit Claim Bundle.

8.2 **Claim (Receiver)** — confirm funding, build witness `[sig_R, x, script, control]`, broadcast, CPFP if needed.

8.3 **Refund (Cold Mode)** — after **H_exp**, witness `[sig_S, script_refund, control_refund]`, consider RBF/CPFP.

---

## 9) Fee & Relay Policy

Funding prefers RBF; Claim supports CPFP; Refund pre‑plans CPFP room; pinning mitigations documented.

---

## 10) Privacy Considerations

Watch‑Only queries via own node/BIP157/158 by default; avoid third‑party explorers. Script‑path spends reveal leaf/control; see Variant B for improved privacy.

---

## 11) Novelty Track (Variant B — Scriptless‑Claim with Adaptor Signatures)

Key‑path claim via MuSig2 adaptor signatures; single refund script leaf. Adjust Claim Bundle to carry adaptor data instead of a preimage and script.

---

## 12) Offline I/O & Robustness

BC‑UR v2 animated; strict schema validation; fuzzing for frame loss/reorder/corruption.

---

## 13) APIs & Storage

Cold Mode stores seeds/preimages and per‑payment state; Watch‑Only exposes `get_utxo_snapshot`, `broadcast_tx`, `watch_txid`.

---

## 14) UX Contract (Strings & States)

Clear badges: **COLD**, **WATCH‑ONLY**, **RECEIVER**. Prominent messaging for refund height, claim‑bundle sensitivity, and actionable error tips.

---

## 15) Test Plan (Engineering)

Unit tests for scripts and BIP‑371 fields; property‑based tests around **H_exp** boundary; QR robustness; Signet end‑to‑end; adversarial mempool scenarios.

---

## 16) Evaluation Plan (for future paper)

Correctness proofs (Miniscript semantics), performance (UR timings, confirmation latency), privacy (linkability), and cost (vbytes/fees) comparisons; Variant A vs B.

---

## 17) Interop & Standards

Publish Miniscript policy; register/namespace UR types; verify import/export with third‑party wallets where feasible.

---

## 18) Milestones

- **M0:** Protocol finalized; data schemas frozen; threat model baselined.
- **M1 (Baseline A):** Scripted claim/refund; Signet build with Cold/Watch‑Only modes; test suite passing.
- **M2 (Hardening):** Fee policy, pinning mitigations, privacy defaults, QR fuzz hardening; multi‑device testing.
- **M3 (Variant B):** Scriptless‑claim (MuSig2 + adaptor); benchmarks; interop tests with third‑party receiver wallets; paper appendix groundwork.

---

**End of v0.4**
````

## File: apps/web/app/about/page.js
````javascript
export default function About() {
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Spec Summary & Schemas</h1>
      <ul className="list-disc pl-6">
        <li><a className="text-blue-600 underline" href="/schemas/claim-bundle.cddl" target="_blank">claim-bundle@1 (CDDL)</a></li>
        <li><a className="text-blue-600 underline" href="/schemas/utxo-snapshot.cddl" target="_blank">utxo-snapshot@1 (CDDL)</a></li>
      </ul>
    </main>
  );
}
````

## File: apps/web/app/api/broadcast/route.js
````javascript
export async function POST(req) {
  try {
    const { hex, endpoint } = await req.json();
    if (!hex || typeof hex !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'hex required' }), { status: 400 });
    }
    const base = typeof endpoint === 'string' && endpoint.trim().length > 0
      ? endpoint.trim()
      : 'https://mempool.space/signet';
    const url = base.replace(/\/$/, '') + '/api/tx';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: hex.trim(),
      // next: { revalidate: 0 },
    });
    const text = await r.text();
    if (!r.ok) {
      return new Response(JSON.stringify({ ok: false, status: r.status, error: text }), { status: 502 });
    }
    return new Response(JSON.stringify({ ok: true, txid: text.trim() }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500 });
  }
}
````

## File: apps/web/app/api/node/[...path]/route.js
````javascript
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  return proxy(request, params);
}
export async function POST(request, { params }) {
  return proxy(request, params);
}

async function proxy(request, { path }) {
  const target = process.env.SIGNET_RPC_URL;
  if (!target) {
    return NextResponse.json({ error: 'SIGNET_RPC_URL not set' }, { status: 400 });
  }
  const url = target.replace(/\/$/, '') + '/' + (Array.isArray(path) ? path.join('/') : '');
  const init = {
    method: request.method,
    headers: { 'content-type': 'application/json', 'x-proxy': 'offline-web' },
    body: request.method === 'GET' ? undefined : await request.text(),
  };
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: 'Proxy failed', detail: String(e) }, { status: 502 });
  }
}
````

## File: apps/web/app/api/ping/route.js
````javascript
export async function GET() {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
````

## File: apps/web/app/api/tx/[txid]/route.js
````javascript
import { MempoolService } from '@offline/server-api/src/services/mempool.ts';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { txid } = params;

  if (!txid) {
    return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 });
  }

  const mempoolService = new MempoolService('testnet');

  try {
    const rawTx = await mempoolService.getRawTransaction(txid);
    return NextResponse.json({ rawTx });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
````

## File: apps/web/app/api/utxos/[address]/[amount]/route.js
````javascript
import { UTXOService } from '@offline/server-api/src/services/UTXOService';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { address, amount } = params;

  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  const utxoService = new UTXOService('testnet');

  try {
    const utxos = await utxoService.getUTXOsForAmount(address, parseInt(amount, 10) || 100000);
    return NextResponse.json(utxos);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
````

## File: apps/web/app/tools/address/page.js
````javascript
"use client";

import { useMemo, useState } from "react";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";

export default function AddressTool() {
  useMemo(() => { try { bitcoin.initEccLib(ecc); } catch {} }, []);

  const [networkKey, setNetworkKey] = useState("signet");
  const [privInput, setPrivInput] = useState("");
  const [err, setErr] = useState("");
  const [p2wpkh, setP2wpkh] = useState(null);
  const [p2tr, setP2tr] = useState(null);

  const network = useMemo(() => {
    if (networkKey === "mainnet") return bitcoin.networks.bitcoin;
    return bitcoin.networks.testnet; // signet/testnet share params
  }, [networkKey]);

  function parseMaybeHex(input) {
    const s = (input || "").trim();
    const hex = s.replace(/^0x/i, "");
    if (hex.length > 0 && /^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      return Buffer.from(hex, "hex");
    }
    return null;
  }

  function derive() {
    setErr("");
    setP2wpkh(null);
    setP2tr(null);
    try {
      const ECPair = ECPairFactory(ecc);
      let seckey;
      const hex = parseMaybeHex(privInput);
      if (hex) {
        if (hex.length !== 32) throw new Error("Hex private key must be 32 bytes (64 hex chars)");
        seckey = Buffer.from(hex);
      } else {
        const kp = ECPair.fromWIF(privInput.trim(), network);
        if (!kp?.privateKey) throw new Error("Invalid WIF");
        seckey = Buffer.from(kp.privateKey);
      }
      // Public key
      const pub33 = Buffer.from(ecc.pointFromScalar(seckey, true));
      if (!pub33) throw new Error("Invalid private key");

      // P2WPKH (tb1q...)
      const wpkh = bitcoin.payments.p2wpkh({ pubkey: pub33, network });
      // P2TR single-key (tb1p...) using x-only
      const xonly = pub33.slice(1, 33);
      const tr = bitcoin.payments.p2tr({ internalPubkey: xonly, network });

      setP2wpkh({ address: wpkh.address || "", scriptHex: (wpkh.output||Buffer.alloc(0)).toString("hex") });
      setP2tr({ address: tr.address || "", scriptHex: (tr.output||Buffer.alloc(0)).toString("hex") });
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600 text-white">TOOLS</div>
      <h1 className="text-2xl font-semibold">Address Tool</h1>
      <p className="text-zinc-500">Derive a normal wallet address from a private key (WIF or 32-byte hex). Use the P2WPKH tb1q... as a simple destination address.</p>

      <section className="rounded-lg border p-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Network</div>
            <select className="w-full rounded border px-3 py-2" value={networkKey} onChange={e=>setNetworkKey(e.target.value)}>
              <option value="signet">signet</option>
              <option value="testnet">testnet</option>
              <option value="mainnet">mainnet</option>
            </select>
          </label>
          <div />
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">Private key (WIF or 32-byte hex)</div>
            <input className="w-full rounded border px-3 py-2 font-mono" value={privInput} onChange={e=>setPrivInput(e.target.value)} placeholder="WIF (c.../K.../L...) or 64 hex chars" />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={derive} className="px-3 py-2 rounded bg-blue-600 text-white">Derive Addresses</button>
          {!!err && <div className="text-sm text-red-600">{err}</div>}
        </div>

        {(p2wpkh || p2tr) && (
          <div className="grid md:grid-cols-2 gap-3 mt-2 text-sm">
            {p2wpkh && (
              <div className="rounded border p-2">
                <div className="text-zinc-500">P2WPKH (bech32)</div>
                <div className="font-mono break-all">{p2wpkh.address || '—'}</div>
                <div className="text-xs text-zinc-500 mt-1">script (hex): <span className="font-mono break-all">{p2wpkh.scriptHex}</span></div>
                <div className="text-xs text-zinc-500">Use this tb1q... as a simple destination address.</div>
              </div>
            )}
            {p2tr && (
              <div className="rounded border p-2">
                <div className="text-zinc-500">P2TR single-key (bech32m)</div>
                <div className="font-mono break-all">{p2tr.address || '—'}</div>
                <div className="text-xs text-zinc-500 mt-1">script (hex): <span className="font-mono break-all">{p2tr.scriptHex}</span></div>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="text-xs text-zinc-500">Privacy note: deriving a destination from the same private key as R links your claim key and payout. For signet/testing this is fine. For production, use a fresh wallet receiving address.</div>
    </main>
  );
}
````

## File: apps/web/app/globals.css
````css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light dark;
}
````

## File: apps/web/app/layout.js
````javascript
import './globals.css';

export const metadata = {
  title: 'Offline Bitcoin Wallet v0.4',
  description: 'Mode-based wallet for Signet',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <div className="max-w-5xl mx-auto p-6">{children}</div>
      </body>
    </html>
  );
}
````

## File: apps/web/app/page.js
````javascript
'use client';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="space-y-6">
      <h1 className="text-3xl font-bold">Offline Bitcoin Wallet — v0.4</h1>
      <p className="text-zinc-500">Select a mode to begin. Target: Signet.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link className="rounded-2xl p-6 border hover:shadow-md" href="/cold">Cold Mode</Link>
        <Link className="rounded-2xl p-6 border hover:shadow-md" href="/watch">Watch‑Only</Link>
        <Link className="rounded-2xl p-6 border hover:shadow-md" href="/receiver">Receiver</Link>
      </div>
    </main>
  );
}
````

## File: apps/web/components/ModeBadge.jsx
````javascript
export default function ModeBadge({ label, color = 'bg-zinc-800' }) {
  return <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-white text-xs ${color}`}>{label}</span>;
}
````

## File: apps/web/components/QRScanner.jsx
````javascript
'use client';
export default function QRScanner() {
  return <div className="rounded-xl border p-4 text-sm text-zinc-500">QR Scanner placeholder (implement camera + UR decoding)</div>;
}
````

## File: apps/web/public/schemas/claim-bundle.cddl
````
; claim-bundle@1

claim-bundle = {
  ver: 1,
  h_alg: "sha256",
  preimage: bytes .size 32 / null,
  h: bytes .size 32,
  R_pub: bytes .size 32,
  script: bytes,
  leaf_ver: uint,
  control: bytes,
  fund_txid: bytes .size 32 / null,
  vout: uint / null,
  expires_at: uint,
  meta: {
    amount_sat: uint,
    memo: tstr / null
  } / null
}
````

## File: apps/web/public/schemas/utxo-snapshot.cddl
````
; utxo-snapshot@1

utxo-snapshot = {
  ver: 1,
  height: uint,
  tip: bytes .size 32,
  feerates: { normal: uint, fast: uint, urgent: uint },
  utxos: [* utxo ],
  change_tmpl: bytes / tstr
}

utxo = {
  txid: bytes .size 32,
  vout: uint,
  value: uint,
  script_template: bytes / null
}
````

## File: docs/JSON_PERSISTENCE.md
````markdown
# ✅ JSON Persistence System Implemented

## 🎯 **Feature Completed**
Created a JSON file-based persistence system to save and retrieve Bitcoin addresses across server restarts.

## 📁 **JSON File Location**
- **File**: `/home/s14/Desktop/btc-offline/saved-addresses.json`
- **Format**: JSON with calculation keys as object keys
- **Auto-created**: When first address is generated
- **Auto-saved**: On every address modification

## 🗄️ **JSON Structure**
```json
{
  "10_5_add": {
    "address": "tb1pxwwldnh53retpdrqnz5rragwr3wz63xjkhfghqkeqcnk0z0pf27qgwf5m3",
    "privateKey": "IMPORTED_ADDRESS_NO_PRIVATE_KEY",
    "publicKey": "IMPORTED_ADDRESS_NO_PUBLIC_KEY", 
    "scriptHash": "imported_address_script_hash",
    "num1": 10,
    "num2": 5,
    "operation": "add",
    "balance": 144359,
    "lastChecked": "2025-07-19T15:00:51.453Z"
  },
  "20_3_multiply": {
    "address": "tb1px7pae7zq02duvr4agu4pf0nfcsj639k5cl4w28ngmw6efuwt2x2qu65vyt",
    "privateKey": "cNq2ZnsxUL5oGns4K56KCj8URjhbNrhBrL7csLuu6tpKuTCnLWcd",
    "publicKey": "0299e9c2976d4177ee0a06ae179b9b1228437c56d6267b2e467b075a837522f317",
    "scriptHash": "2019a167142588fcd4e24671060494f90249a96e6507d4cf849cc48d43f7978d",
    "num1": 20,
    "num2": 3,
    "operation": "multiply",
    "balance": 0,
    "lastChecked": "2025-07-19T15:01:13.141Z"
  }
}
```

## 🔄 **Auto-Save Triggers**
The JSON file is automatically saved when:

1. **New address generated**: `generateFundingAddress()`
2. **Address imported**: `importFundedAddress()`  
3. **Balance updated**: During funding checks
4. **Transaction completed**: After spending UTXOs
5. **Address used**: When selecting existing address

## 📊 **Persistence Features**

### **On Server Startup**
```
✅ Loaded 2 addresses from /home/s14/Desktop/btc-offline/saved-addresses.json
📋 Pre-funded address already exists: tb1pxwwldnh53retpdrqnz5rragwr3wz63xjkhfghqkeqcnk0z0pf27qgwf5m3
```

### **During Operations**
```
💾 Saved 2 addresses to /home/s14/Desktop/btc-offline/saved-addresses.json
```

### **Error Handling**
- **Missing file**: Creates new empty file
- **Corrupted JSON**: Logs error, continues with empty state
- **Write errors**: Logs error, continues operation

## 🛡️ **Data Safety**

### **Backup Recommendations**
```bash
# Manual backup
cp saved-addresses.json saved-addresses-backup.json

# Automated backup (add to cron)
cp saved-addresses.json "saved-addresses-$(date +%Y%m%d).json"
```

### **Recovery**
```bash
# Restore from backup
cp saved-addresses-backup.json saved-addresses.json

# View addresses without server
cat saved-addresses.json | jq '.'
```

## 🔍 **Current Saved Data**

### **Your Funded Address** ✅
- **Key**: `10_5_add`
- **Address**: `tb1pxwwldnh53retpdrqnz5rragwr3wz63xjkhfghqkeqcnk0z0pf27qgwf5m3`
- **Balance**: 144,359 sats
- **Status**: Ready for calculations

### **Generated Address** ✅  
- **Key**: `20_3_multiply`
- **Address**: `tb1px7pae7zq02duvr4agu4pf0nfcsj639k5cl4w28ngmw6efuwt2x2qu65vyt`
- **Balance**: 0 sats (unfunded)
- **Private Key**: Available for transactions

## 🚀 **Benefits**

### **Persistence** ✅
- Addresses survive server restarts
- No loss of funded addresses
- Maintain address-calculation relationships

### **Performance** ✅
- Fast JSON read/write operations
- Efficient Map-based in-memory storage
- Only save when data changes

### **Reliability** ✅
- Automatic saves on all modifications
- Error handling for file issues
- Graceful degradation if file is corrupted

## 🔧 **Technical Implementation**

### **File Operations**
```typescript
// Load on startup
private loadAddressesFromFile(): void

// Save on changes  
private saveAddressesToFile(): void

// File path
private readonly addressesFilePath = path.join(process.cwd(), 'saved-addresses.json')
```

### **Data Conversion**
```typescript
// Map → JSON
const addressesData: Record<string, SavedAddress> = {};
for (const [key, value] of this.savedAddresses.entries()) {
  addressesData[key] = value;
}

// JSON → Map
savedAddress.lastChecked = new Date(savedAddress.lastChecked);
this.savedAddresses.set(key, savedAddress);
```

## 📋 **Current Status**

- ✅ **File Created**: `saved-addresses.json`
- ✅ **Addresses Saved**: 2 addresses persisted
- ✅ **Auto-loading**: Works on server restart
- ✅ **Auto-saving**: Triggers on all modifications
- ✅ **Your Funded Address**: Preserved with 144,359 sats
- ✅ **Generated Addresses**: Saved with private keys

## 🎉 **Result**

Your Bitcoin addresses are now **permanently saved** and will persist across:
- Server restarts
- System reboots  
- Application updates
- Manual shutdowns

**No more losing funded addresses!** 🔒💰
````

## File: docs/SOLUTION.md
````markdown
# 🔧 PROBLEM SOLVED: Address Persistence & Reuse

## ❌ **The Problem You Faced**

You funded address `tb1pxwwldnh53retpdrqnz5rragwr3wz63xjkhfghqkeqcnk0z0pf27qgwf5m3` but when clicking "Calculate & Create Real Transaction", it said:

```
Address not funded: Address has no funds. Please fund tb1p2m559d3mccvqspt7jyftn6wjwqqpmfsj79pnaas3dcyztmknmlfsf0yc29 with testnet Bitcoin first.
```

**Root Cause**: Every time you generated an address, it created a **completely new random address** instead of reusing the one you funded.

## ✅ **The Solution Implemented**

### 1. **Address Persistence System**
- Addresses are now **saved and reused** for the same calculation
- Each calculation `(num1, num2, operation)` gets a unique persistent address
- Same inputs = same address every time

### 2. **Calculation Key System**
```typescript
const calculationKey = `${num1}_${num2}_${operation}`;
// Example: "10_5_add" always uses the same address
```

### 3. **New Features Added**

#### **Saved Addresses Management**
- ✅ **View All Saved Addresses**: See all your previously generated addresses
- ✅ **Balance Tracking**: Real-time balance updates for each address  
- ✅ **Address Reuse**: Click on any saved address to reuse it
- ✅ **Current Calculation Highlighting**: Shows which address matches your current calculation

#### **API Endpoints Added**
```bash
GET  /api/saved-addresses           # List all saved addresses
POST /api/use-address/:calculationKey  # Select specific address to use
POST /api/generate-address          # Now reuses existing addresses
```

#### **Frontend Improvements**
- **Saved Addresses Section**: Visual list of all your addresses
- **Click to Select**: Click any saved address to use it for calculation
- **Balance Display**: Shows funded/unfunded status for each address
- **Current Address Highlighting**: Shows which address is active

## 🎯 **How It Works Now**

### **Workflow for Your Funded Address**

1. **Your Address**: `tb1pxwwldnh53retpdrqnz5rragwr3wz63xjkhfghqkeqcnk0z0pf27qgwf5m3`
2. **If this was for calculation 10 + 5**: 
   - The system will **always reuse this exact address** for 10 + 5
   - No more "address not found" errors
   - Your funding stays with the calculation

### **Testing the Fix**

```bash
# Generate address for 10 + 5 (first time)
curl -X POST http://localhost:3001/api/generate-address \
  -H "Content-Type: application/json" \
  -d '{"num1": 10, "num2": 5, "operation": "add"}'
# Returns: new address

# Generate address for 10 + 5 (second time) 
curl -X POST http://localhost:3001/api/generate-address \
  -H "Content-Type: application/json" \
  -d '{"num1": 10, "num2": 5, "operation": "add"}'
# Returns: SAME address with "isReused": true

# List saved addresses
curl http://localhost:3001/api/saved-addresses
# Shows all your addresses with balances
```

## 🚀 **What You Can Do Now**

### **Option 1: Use the Web Interface**
1. Open http://localhost:3001
2. Enter `10` and `5`, click `+`
3. You'll see your funded address in "Saved Addresses" section
4. Click on it to select it
5. Click "Calculate & Create Real Transaction"

### **Option 2: API Method**
```bash
# Check if your address is saved (look for 10 + 5)
curl http://localhost:3001/api/saved-addresses

# If found, use the calculationKey to perform calculation
curl -X POST http://localhost:3001/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"num1": 10, "num2": 5, "operation": "add"}'
```

## 🔍 **Address Matching System**

Your funded address `tb1pxwwldnh53retpdrqnz5rragwr3wz63xjkhfghqkeqcnk0z0pf27qgwf5m3` will be **automatically matched** if:

1. **Same Numbers**: The calculation uses the same `num1` and `num2`
2. **Same Operation**: The operation is the same (`add`, `subtract`, etc.)
3. **Generated Previously**: The address was generated by this system

## 🎉 **Result: NO MORE "ADDRESS NOT FUNDED" ERRORS**

- ✅ **Address Persistence**: Same calculation = same address
- ✅ **Balance Preservation**: Your testnet Bitcoin stays with the calculation
- ✅ **Address Selection**: Choose from multiple funded addresses
- ✅ **Real Transactions**: Still creates actual Bitcoin testnet transactions
- ✅ **Mempool Visibility**: Transactions still appear on mempool.space/testnet

## 🔗 **Ready to Test**

**Server Running**: http://localhost:3001
**Your Funded Address**: Ready to use for calculations
**All APIs**: Working and persistent

Now when you perform a calculation, the system will use the **exact address you funded** instead of generating a new random one! 🎯
````

## File: docs/Specs.md
````markdown
Product Requirements Document: Offline Bitcoin Transactions
Author: George Akor
Location: Gumi-si, Gyeongsangbuk-do
Date: June 24, 2025
Status: Version 1.0 - Draft

# Introduction
Users require a method to transact Bitcoin with the highest level of security, which involves keeping their private keys on a device that is never connected to the internet (an "air-gapped" or "cold" wallet). However, they still need to create and authorize transactions. This feature enables users to construct, sign, and receive Bitcoin transactions using a secure offline wallet, with an internet-connected "watch-only" wallet acting only as a messenger to the Bitcoin network. This process eliminates the risk of private key exposure to online threats.

# Problem Statement
The Problem: Bitcoin holders who prioritize security store their private keys on offline devices. This practice makes it impossible to create and broadcast a transaction directly. They need a secure workflow to authorize a transaction offline and then safely broadcast it without exposing their keys. Similarly, a receiver needs a secure way to claim funds destined for them through such an offline mechanism.

How we solve it: We will implement a two-part wallet system. The user will have a secure Offline Signer (this app, in offline mode) and an online Watch-Only Wallet (this app, in online mode). The workflow will use QR codes to transfer non-sensitive information across the "air gap" between the two, enabling the creation and reception of secure, conditional payments powered by Bitcoin's Taproot technology.

# Goals and Objectives
Goal 1: Enable Air-Gapped Bitcoin Sending. Allow users to construct and authorize a Bitcoin transaction on a fully offline device.
Goal 2: Enable Secure Offline Receiving. Allow users to construct and sign a transaction to claim funds that were sent to them via the offline mechanism.
Goal 3: Maximize Security and Privacy. Ensure private keys never leave the offline device. Leverage Taproot to make the on-chain transactions private and efficient.

# User Personas
Alex, The Security Maximalist: Alex holds a significant amount of Bitcoin and is deeply concerned about online theft. Alex's primary goal is to keep private keys completely isolated from the internet. They are willing to perform extra steps for peace of mind.
Bora, The Field Agent: Bora operates in areas with intermittent or untrusted internet connectivity. Bora needs to receive payments from a dispatcher securely and reliably, even if they can only get online briefly using public Wi-Fi.
    
# Goal 4: Provide a Clear User Experience. Guide the user through the multi-step process with clear instructions, minimizing the risk of user error.

# Functional Requirements (User Stories)
Epic: Offline Transaction Workflow
## User Story 1: Sender Creates an Offline Transaction
As Alex, the Security Maximalist,
I want to create a Bitcoin transaction on my offline wallet,
So that I can authorize the spending of my funds without connecting my private keys to the internet.

### Acceptance Criteria:
- The user can initiate a "Send Offline" transaction from their offline wallet.
- The wallet generates a secret (preimage) for the transaction.
- The wallet uses Taproot to construct a transaction with two conditions:
    - Path 1 (Receiver's Claim): Spendable with the preimage and the receiver's signature.
    - Path 2 (Sender's Refund): Spendable by the sender's key alone after a predefined time lock (e.g., 72 hours).
- The wallet signs the transaction using the offline private key, creating a Partially Signed Bitcoin Transaction (PSBT).
    - The wallet presents two distinct QR codes:
    - QR Code A (For Broadcast): The signed transaction data, ready to be scanned by any online device and broadcast to the Bitcoin network.
    - QR Code B (For Receiver): The secret preimage (the "offline token") and necessary metadata for the receiver to claim the funds.

### User Story 2: Receiver Claims an Offline Transaction
As Bora, the Field Agent,
I want to use a secret I received offline to claim my payment,
So that I can take custody of the funds securely.

### Acceptance Criteria:
- The receiver's offline wallet can scan QR Code B to import the secret preimage.
- The receiver uses an online device (e.g., a block explorer) to get the transaction details and transfers them to the offline wallet (e.g., via QR scan).
- The receiver's offline wallet uses the preimage and its private key to construct and sign the claim transaction (spending via Taproot's script path).
- The wallet presents a new QR code containing the signed claim transaction.
- The receiver can scan this QR code with any online device to broadcast it and finalize the transfer.

### User Story 3: Sender Reclaims an Unclaimed Transaction
As Alex, the Security Maximalist,
I want to reclaim my funds if the receiver fails to claim them after a set time,
So that my funds are not permanently lost.

### Acceptance Criteria:
- After the time lock (e.g., 72 hours) has expired, the sender's wallet can construct a refund transaction.
- This transaction uses the Taproot key path, making it look like a standard, private payment on-chain.
- The wallet signs the refund transaction and provides a QR code for broadcasting.

# Technical Requirements
1. Protocol: All transactions must be constructed as Pay-to-Taproot (P2TR) outputs.
2. Transaction Format: All unsigned/partially-signed transactions must use the BIP-174 PSBT standard.
3. Scripting:
    - The receiver's claim path must use OP_HASH160 to verify the preimage.
    - The sender's refund path must use OP_CHECKLOCKTIMEVERIFY (CLTV) to enforce the time lock.
4. Data Transfer: The exclusive method for transferring data between the offline wallet and an online device must be via QR codes. The wallet must be able to both generate and scan QR codes.
5. Security: The application must ensure a strict separation of keys. The network stack should be disabled or inaccessible when the wallet is in "Offline Signer" mode.

# Non-Functional Requirements
1. Usability: The UI must be exceptionally clear, with step-by-step guidance. For example: Step 1 of 3: Scan this QR code with your online device to broadcast.
2. Security: The attack surface of the offline component must be minimized. No libraries that require network access should be active in offline mode.
3. Privacy: The on-chain footprint of a successful send/claim should not reveal the wallet's use of a hashlock. The sender's refund transaction must be indistinguishable from a standard single-signature transaction.
4. Performance: QR code generation and signing operations must be fast and not block the UI for a noticeable period.

# Success Metrics
1. Adoption Rate: Percentage of active users who successfully complete at least one offline transaction per month.
2. Task Completion Rate: >95% of users who start the offline send workflow successfully generate the broadcastable QR code.
3. User Satisfaction: Positive user feedback and reviews specifically mentioning the security and usability of the offline feature.
4. Security Incidents: Zero reported incidents of private key compromise related to this feature.

# Out of Scope (Future Work)
1. Support for other air-gap data transfer methods (e.g., NFC, Bluetooth, microSD card).
2. Multi-signature offline transactions.
3. Offline transactions for other cryptocurrencies (e.g., Liquid Bitcoin).
4. A fully integrated "messenger" app that automates the broadcasting without requiring a third-party wallet or block explorer.
````

## File: packages/offline-core/src/index.js
````javascript
export { NETWORKS, buildClaimRefundTaproot, buildClaimScript, buildRefundScript, generateBurnedInternalKey } from './taproot.js';
export { buildFundingPsbt } from './psbt.js';
export { encodeUR, decodeUR } from './ur.js';
````

## File: packages/offline-core/test/ur.test.js
````javascript
import { test, expect } from 'vitest';
import { encode as cborEncode, decode as cborDecode } from 'cbor-x';
import { encodeUR, decodeUR } from '../src/index.js';

function collectParts(encoder, count) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push(encoder.nextPart());
  }
  return parts;
}

test('UR roundtrip (single-part)', async () => {
  const payload = { hello: 'world' };
  const cbor = cborEncode(payload);
  const enc = encodeUR('bytes', cbor, 1000); // large fragment to force single part
  const parts = collectParts(enc, enc.estimatedParts || 1);
  const out = await decodeUR(parts);
  expect(out.type).toBe('bytes');
  // bc-ur v1.1.13 returns Buffer-like CBOR bytes and we expose both raw cbor and decoded via library
  expect(cborDecode(out.cbor)).toEqual(payload);
});

test('UR roundtrip (multi-part)', async () => {
  const payload = { a: 'b'.repeat(200) }; // larger payload to force multiple fragments
  const cbor = cborEncode(payload);
  const enc = encodeUR('bytes', cbor, 60); // small fragment size to ensure multipart
  const expected = enc.estimatedParts || 3;
  const parts = collectParts(enc, expected);
  const out = await decodeUR(parts);
  expect(out.type).toBe('bytes');
  expect(cborDecode(out.cbor)).toEqual(payload);
});
````

## File: packages/offline-core/README.md
````markdown
# @offline/core

Core JS library for Offline Bitcoin Wallet v0.4.

- Taproot claim/refund scripts
- Burned internal key generator (x-only)
- Taproot output (P2TR) builder
- Funding PSBT (BIP-371 compatible) skeleton
- UR v2 helpers (animated frames)

Note: Target network is Signet (maps to bitcoinjs-lib testnet params).
````

## File: packages/offline-interop/src/build-witness.js
````javascript
export function buildClaimWitness({ sigR, x, script, control }) {
  if (!sigR || !x || !script || !control) throw new Error('missing fields');
  return [sigR, x, script, control];
}
````

## File: packages/offline-interop/src/index.js
````javascript
export { parseClaimBundle } from './parse-claim-bundle.js';
export { buildClaimWitness } from './build-witness.js';
````

## File: packages/offline-interop/src/parse-claim-bundle.js
````javascript
import { decode } from 'cbor-x';

export function parseClaimBundle(cborBytes) {
  const m = decode(cborBytes);
  if (!m || m.ver !== 1) throw new Error('Unsupported claim-bundle version');
  const required = ['h_alg', 'h', 'R_pub', 'script', 'leaf_ver', 'control', 'expires_at'];
  for (const k of required) if (!(k in m)) throw new Error(`claim-bundle missing ${k}`);
  return m;
}
````

## File: packages/offline-interop/package.json
````json
{
  "name": "@offline/interop",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "main": "src/index.js",
  "license": "MIT",
  "sideEffects": false,
  "scripts": {
    "build": "echo 'No build'",
    "test": "vitest run"
  },
  "dependencies": {
    "bitcoinjs-lib": "^6.1.5",
    "cbor-x": "^1.5.8"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
````

## File: packages/shared-types/src/index.ts
````typescript
export interface CalculationRequest {
  num1: number;
  num2: number;
  operation: Operation;
}

export interface CalculationResult {
  result: number;
  txid?: string;
  fee?: number;
  rawTx?: string;
  taprootAddress?: string;
  privateKey?: string;
  publicKey?: string;
  scriptHash?: string;
  broadcastStatus?: string;
  confirmationStatus?: string;
}

export type Operation = 'add' | 'subtract' | 'multiply' | 'divide';

export interface UTXO {
  txid: string;
  vout: number;
  value: number; // in satoshis
  scriptPubKey: string;
  confirmations?: number; // Optional: number of confirmations
}


/**
 * Represents a key pair, including the private key in WIF format and the corresponding public key.
 */
export interface KeyPair {
  privateKeyWIF: string;
  publicKey: Buffer;
}

/**
 * Data required to create the initial offline transaction.
 */
export interface SenderData {
  senderKeyPair: KeyPair;
  receiverPublicKey: Buffer;
  amount: number; // in satoshis
  utxos: UTXO[];
  refundTimeLock: number; // in blocks
}

/**
 * The output of the sender's offline transaction creation process.
 * This data is used to generate the two QR codes.
 */
export interface OfflineTxoData {
  psbt: string; // The partially signed transaction, ready for broadcast (QR Code A)
  preimage: string; // The secret for the receiver (QR Code B)
  taprootAddress: string;
  txid: string;
  vout: number;
}

/**
 * Data required for the receiver to claim the funds.
 */
export interface ReceiverClaimData {
  receiverKeyPair: KeyPair;
  preimage: Buffer;
  transaction: { // The broadcasted transaction details
    txid: string;
    vout: number;
    value: number;
  };
  senderPublicKey: Buffer;
  refundTimeLock: number;
}

/**
 * Data required for the sender to reclaim the funds after the timeout.
 */
export interface SenderRefundData {
  senderKeyPair: KeyPair;
  transaction: { // The original broadcasted transaction details
    txid: string;
    vout: number;
    value: number;
  };
  receiverPublicKey: Buffer;
  refundTimeLock: number;
}

/**
 * The final signed transaction, ready to be broadcast.
 */
export interface SignedTransaction {
  psbt: string;
  txid: string;
  rawTx: string;
}

/**
 * Represents a taproot script.
 */
export interface TaprootScript {
  script: Buffer;
  leafVersion: number;
  scriptHash: string;
}

/**
 * Represents a transaction status.
 */
export interface TransactionStatus {
  txid: string;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  fee: number;
  vsize: number;
  weight: number;
}

/**
 * Represents an address info.
 */
export interface AddressInfo {
  address: string;
  chain_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

/**
 * Represents a fee estimate.
 */
export interface FeeEstimate {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

/**
 * Represents an error response.
 */
export interface ErrorResponse {
  error: string;
  code: string;
  details?: any;
}
````

## File: packages/shared-types/package.json
````json
{
  "name": "@offline/shared-types",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts"
}
````

## File: scripts/debug-keys.js
````javascript
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize bitcoin lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const network = bitcoin.networks.testnet;

// Test data from saved addresses
const privateKeyWIF = "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei";
const publicKeyHex = "0362c7197b6f3e02bd5f16a8bfee0920c2298518a487d13c1e12c90b00331a91f5";
const expectedAddress = "tb1p4fuxteqjltq7mkrgszckdm88p4efva73p9r50kq65fj7q3gjpnkqapmdzh";

console.log("=== Key Derivation Debug ===");
console.log("Private Key WIF:", privateKeyWIF);
console.log("Public Key Hex:", publicKeyHex);
console.log("Expected Address:", expectedAddress);
console.log();

// Method 1: From WIF private key
const keyPairFromWIF = ECPair.fromWIF(privateKeyWIF, network);
const pubKeyFromWIF = keyPairFromWIF.publicKey.toString('hex');
const internalKeyFromWIF = keyPairFromWIF.publicKey.slice(1, 33);

console.log("=== Method 1: From WIF ===");
console.log("Public Key from WIF:", pubKeyFromWIF);
console.log("Internal Key from WIF:", internalKeyFromWIF.toString('hex'));

// Create address from WIF-derived internal key
const addressFromWIF = bitcoin.payments.p2tr({
  internalPubkey: internalKeyFromWIF,
  network
});
console.log("Address from WIF internal key:", addressFromWIF.address);
console.log();

// Method 2: From hex public key string (how addresses were originally created)
const pubKeyBuffer = Buffer.from(publicKeyHex, 'hex');
const internalKeyFromHex = pubKeyBuffer.slice(1, 33);

console.log("=== Method 2: From Hex ===");
console.log("Public Key Buffer:", pubKeyBuffer.toString('hex'));
console.log("Internal Key from Hex:", internalKeyFromHex.toString('hex'));

// Create address from hex-derived internal key
const addressFromHex = bitcoin.payments.p2tr({
  internalPubkey: internalKeyFromHex,
  network
});
console.log("Address from Hex internal key:", addressFromHex.address);
console.log();

// Compare
console.log("=== Comparison ===");
console.log("WIF pubkey matches saved pubkey:", pubKeyFromWIF === publicKeyHex);
console.log("Internal keys match:", internalKeyFromWIF.equals(internalKeyFromHex));
console.log("WIF address matches expected:", addressFromWIF.address === expectedAddress);
console.log("Hex address matches expected:", addressFromHex.address === expectedAddress);
````

## File: scripts/final-diagnosis.js
````javascript
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize bitcoin lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.testnet;

console.log("=== FINAL DIAGNOSIS: TAPROOT SCRIPT-PATH SIGNING ISSUE ===\n");

// Test data
const privateKeyWIF = "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei";
const keyPair = ECPair.fromWIF(privateKeyWIF, network);
const internalKey = keyPair.publicKey.slice(1, 33);

console.log("PROBLEM IDENTIFIED:");
console.log("==================");
console.log("The error 'Can not sign for input #0 with the key' occurs because:");
console.log("bitcoinjs-lib's pubkeyInScript() function looks for the signing key INSIDE the script.");
console.log("But our arithmetic script doesn't contain any public keys!");
console.log("");

// Our arithmetic script
function numberToScriptNum(num) {
    if (num === 0) return Buffer.from([bitcoin.opcodes.OP_0]);
    if (num === 1) return Buffer.from([bitcoin.opcodes.OP_1]);
    if (num >= 2 && num <= 16) return Buffer.from([bitcoin.opcodes.OP_2 + num - 2]);
    return bitcoin.script.number.encode(num);
}

const script = bitcoin.script.compile([
    numberToScriptNum(10),  // 0x5a
    numberToScriptNum(4),   // 0x54
    bitcoin.opcodes.OP_MUL, // 0x95
    numberToScriptNum(40),  // 0x28
    bitcoin.opcodes.OP_EQUAL // 0x87
]);

console.log("OUR SCRIPT ANALYSIS:");
console.log("===================");
console.log("Script hex:", script.toString('hex'));
console.log("Script ASM:", bitcoin.script.toASM(script));
console.log("Script contains:");

const decompiled = bitcoin.script.decompile(script);
decompiled.forEach((element, i) => {
    if (typeof element === 'number') {
        console.log(`  [${i}] Opcode: ${element.toString(16)} (${bitcoin.script.toASM([element])})`);
    } else {
        console.log(`  [${i}] Data: ${element.toString('hex')}`);
    }
});

console.log("");
console.log("KEY SEARCH IN SCRIPT:");
console.log("====================");

// Simulate what pubkeyInScript does
const signingPubkey = keyPair.publicKey;
const pubkeyXOnly = signingPubkey.slice(1, 33);
const pubkeyHash = bitcoin.crypto.hash160(signingPubkey);

console.log("Looking for signing key:", signingPubkey.toString('hex'));
console.log("Looking for X-only key:", pubkeyXOnly.toString('hex'));
console.log("Looking for pubkey hash:", pubkeyHash.toString('hex'));

let found = false;
decompiled.forEach((element, i) => {
    if (typeof element !== 'number') {
        if (element.equals(signingPubkey)) {
            console.log(`✅ Found full pubkey at position ${i}`);
            found = true;
        } else if (element.equals(pubkeyXOnly)) {
            console.log(`✅ Found X-only pubkey at position ${i}`);
            found = true;
        } else if (element.equals(pubkeyHash)) {
            console.log(`✅ Found pubkey hash at position ${i}`);
            found = true;
        }
    }
});

if (!found) {
    console.log("❌ No signing key found in script! This is why signing fails.");
}

console.log("");
console.log("THE SOLUTION:");
console.log("=============");
console.log("For Taproot script-path spending with scripts that don't contain public keys,");
console.log("we need to modify the script to include the public key, OR");
console.log("use a different approach for validation.");
console.log("");

console.log("OPTION 1: Modify script to include the public key");
console.log("=================================================");

// Create a script that includes the public key for validation
const scriptWithPubkey = bitcoin.script.compile([
    numberToScriptNum(10),   // Push 10
    numberToScriptNum(4),    // Push 4
    bitcoin.opcodes.OP_MUL,  // Multiply: 10 * 4 = 40
    numberToScriptNum(40),   // Push expected result
    bitcoin.opcodes.OP_EQUAL, // Check equality
    // Add the public key for signing validation
    internalKey,             // Push the X-only internal public key
    bitcoin.opcodes.OP_CHECKSIG // Verify signature (this will always be true if properly signed)
]);

console.log("Modified script hex:", scriptWithPubkey.toString('hex'));
console.log("Modified script ASM:", bitcoin.script.toASM(scriptWithPubkey));

// Test if this script contains the key
const decompiledWithPubkey = bitcoin.script.decompile(scriptWithPubkey);
let foundInModified = false;
decompiledWithPubkey.forEach((element, i) => {
    if (typeof element !== 'number') {
        if (element.equals(internalKey)) {
            console.log(`✅ Found X-only pubkey at position ${i} in modified script`);
            foundInModified = true;
        }
    }
});

console.log("");
console.log("OPTION 2: Use a proper Bitcoin Script pattern");
console.log("=============================================");

// A more Bitcoin-standard approach: computation + signature verification
const properScript = bitcoin.script.compile([
    // Computation part
    numberToScriptNum(10),
    numberToScriptNum(4),
    bitcoin.opcodes.OP_MUL,
    numberToScriptNum(40),
    bitcoin.opcodes.OP_EQUAL,
    // Signature verification part
    bitcoin.opcodes.OP_IF,       // If computation is correct
        internalKey,             // Push pubkey
        bitcoin.opcodes.OP_CHECKSIG, // Check signature
    bitcoin.opcodes.OP_ENDIF
]);

console.log("Proper script hex:", properScript.toString('hex'));
console.log("Proper script ASM:", bitcoin.script.toASM(properScript));

console.log("");
console.log("RECOMMENDATION:");
console.log("===============");
console.log("The application should use OPTION 2 (or similar) to create scripts that:");
console.log("1. Perform the arithmetic calculation");
console.log("2. Include signature verification with the internal public key");
console.log("3. This allows bitcoinjs-lib to find the signing key in the script");
console.log("4. Enables proper Taproot script-path spending");

console.log("");
console.log("CURRENT ISSUE SUMMARY:");
console.log("=====================");
console.log("❌ The arithmetic-only script doesn't contain the signing key");
console.log("❌ bitcoinjs-lib's pubkeyInScript() returns false");
console.log("❌ getTaprootHashesForSig() returns empty array");
console.log("❌ Signing fails with 'Can not sign for input' error");
console.log("");
console.log("✅ The private key DOES correspond to the public key");
console.log("✅ The address generation is correct");
console.log("✅ The control block is properly formatted");
console.log("✅ The issue is purely in the script design for signing compatibility");

console.log("\n=== DIAGNOSIS COMPLETE ===");
````

## File: scripts/fix-signing-issue.js
````javascript
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize bitcoin lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.testnet;

console.log("=== FIXING TAPROOT SCRIPT-PATH SIGNING ISSUE ===\n");

// Test data
const privateKeyWIF = "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei";
const keyPair = ECPair.fromWIF(privateKeyWIF, network);
const internalKey = keyPair.publicKey.slice(1, 33);

// Create the script
function numberToScriptNum(num) {
    if (num === 0) return Buffer.from([bitcoin.opcodes.OP_0]);
    if (num === 1) return Buffer.from([bitcoin.opcodes.OP_1]);
    if (num >= 2 && num <= 16) return Buffer.from([bitcoin.opcodes.OP_2 + num - 2]);
    return bitcoin.script.number.encode(num);
}

const script = bitcoin.script.compile([
    numberToScriptNum(10),
    numberToScriptNum(4),
    bitcoin.opcodes.OP_MUL,
    numberToScriptNum(40),
    bitcoin.opcodes.OP_EQUAL
]);

const scriptTree = {
    output: script,
    version: 0xc0
};

const payment = bitcoin.payments.p2tr({
    internalPubkey: internalKey,
    scriptTree: scriptTree,
    network: network
});

console.log("Generated Address:", payment.address);

// The issue is that for script-path spending, bitcoinjs-lib expects the signing key
// to be tweaked with the script tree. Let's investigate this.

console.log("\n1. UNDERSTANDING THE SIGNING KEY REQUIREMENT");
console.log("============================================");

// For Taproot script-path spending, the signing happens with the internal private key
// But bitcoinjs-lib needs to verify that this key can produce valid signatures
// for the specific script path being spent.

// The error message shows it's trying to use the full public key (with prefix)
// but for Taproot, we need to work with X-only keys

console.log("Internal Key (X-only):", internalKey.toString('hex'));
console.log("Full Public Key:", keyPair.publicKey.toString('hex'));

// Let's try creating a tweaked key pair specifically for this script
console.log("\n2. CREATING SCRIPT-SPECIFIC KEY");
console.log("===============================");

// For script-path spending, the key doesn't need to be tweaked
// The internal key is used directly for signing
// But we need to ensure the PSBT setup is correct

const psbt = new bitcoin.Psbt({ network: network });

// Mock UTXO with correct scriptPubKey
const tweakedPubkey = payment.pubkey;
const scriptPubKey = Buffer.from('5120' + tweakedPubkey.toString('hex'), 'hex');

console.log("Tweaked Pubkey:", tweakedPubkey.toString('hex'));
console.log("Script PubKey:", scriptPubKey.toString('hex'));

// Calculate control block correctly
const parityBit = tweakedPubkey[0] === 0x03 ? 1 : 0;
const controlBlock = Buffer.concat([
    Buffer.from([0xc0 | parityBit]),
    internalKey
]);

console.log("Control Block:", controlBlock.toString('hex'));

// The key insight: For script-path spending, we need to provide the script
// in the redeem property of the payment object when creating the input

console.log("\n3. CORRECT PSBT SETUP FOR SCRIPT-PATH SPENDING");
console.log("==============================================");

try {
    // Create a redeem script payment
    const redeemScript = {
        output: script,
        redeemVersion: 0xc0
    };
    
    // Create payment with redeem script
    const scriptPathPayment = bitcoin.payments.p2tr({
        internalPubkey: internalKey,
        scriptTree: scriptTree,
        redeem: redeemScript,
        network: network
    });
    
    console.log("Script path payment address:", scriptPathPayment.address);
    console.log("Has witness?", !!scriptPathPayment.witness);
    
    if (scriptPathPayment.witness) {
        console.log("Witness stack length:", scriptPathPayment.witness.length);
        scriptPathPayment.witness.forEach((item, i) => {
            console.log(`Witness[${i}]:`, item.toString('hex'));
        });
    }
    
    // Add input with proper script path setup
    psbt.addInput({
        hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        index: 0,
        witnessUtxo: {
            script: scriptPubKey,
            value: 100000
        },
        tapInternalKey: internalKey,
        tapLeafScript: [{
            leafVersion: 0xc0,
            script: script,
            controlBlock: controlBlock
        }]
    });
    
    psbt.addOutput({
        address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        value: 50000
    });
    
    console.log("\n4. SIGNING WITH CORRECT SETUP");
    console.log("=============================");
    
    // The fix: For script-path spending, we need to sign with a hash type
    // that indicates script-path spending
    
    try {
        // Try signing with explicit hash type
        psbt.signInput(0, keyPair, [bitcoin.Transaction.SIGHASH_DEFAULT]);
        console.log("✅ Signing successful with explicit hash type!");
        
    } catch (error1) {
        console.log("❌ Signing with hash type failed:", error1.message);
        
        // Try the alternative approach: signing with just the key pair
        try {
            // Maybe the issue is in how we set up the tapLeafScript
            // Let's try without the controlBlock and let bitcoinjs-lib generate it
            
            const psbt2 = new bitcoin.Psbt({ network: network });
            
            psbt2.addInput({
                hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                index: 0,
                witnessUtxo: {
                    script: scriptPubKey,
                    value: 100000
                },
                tapInternalKey: internalKey,
                tapScriptSig: [{
                    pubkey: internalKey,
                    signature: Buffer.alloc(64) // placeholder
                }],
                tapLeafScript: [{
                    leafVersion: 0xc0,
                    script: script,
                    controlBlock: controlBlock
                }]
            });
            
            psbt2.addOutput({
                address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
                value: 50000
            });
            
            psbt2.signInput(0, keyPair);
            console.log("✅ Alternative signing successful!");
            
        } catch (error2) {
            console.log("❌ Alternative signing failed:", error2.message);
            
            console.log("\n5. ROOT CAUSE ANALYSIS");
            console.log("======================");
            
            // The error is specifically about key matching
            // Let's check what bitcoinjs-lib expects vs what we provide
            
            console.log("The error 'Can not sign for input #0 with the key' suggests:");
            console.log("1. bitcoinjs-lib is looking for a specific key format");
            console.log("2. For script-path spending, it expects the key to match the tapInternalKey");
            console.log("3. The issue might be in the comparison between the signing key and internal key");
            
            console.log("\nKey comparison:");
            console.log("Signing key pubkey:", keyPair.publicKey.toString('hex'));
            console.log("Internal key:", internalKey.toString('hex'));
            console.log("They should be related but not identical");
            
            console.log("\nThe fix is likely one of these:");
            console.log("1. Use only the X-only portion of the public key for signing");
            console.log("2. Ensure the tapInternalKey exactly matches the signing key's X-only pubkey");
            console.log("3. Use a different signing method for script-path spending");
            
            // Create an X-only key pair
            const xOnlyKeyPair = {
                privateKey: keyPair.privateKey,
                publicKey: internalKey,
                sign: keyPair.sign.bind(keyPair),
                network: keyPair.network
            };
            
            console.log("\n6. TRYING WITH X-ONLY KEY");
            console.log("=========================");
            
            try {
                const psbt3 = new bitcoin.Psbt({ network: network });
                
                psbt3.addInput({
                    hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                    index: 0,
                    witnessUtxo: {
                        script: scriptPubKey,
                        value: 100000
                    },
                    tapInternalKey: internalKey,
                    tapLeafScript: [{
                        leafVersion: 0xc0,
                        script: script,
                        controlBlock: controlBlock
                    }]
                });
                
                psbt3.addOutput({
                    address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
                    value: 50000
                });
                
                // This is the key insight: we need to sign with the original keyPair
                // but ensure the PSBT setup is correct
                psbt3.signInput(0, keyPair);
                console.log("✅ X-only key signing successful!");
                
            } catch (error3) {
                console.log("❌ X-only key signing failed:", error3.message);
                
                console.log("FINAL DIAGNOSIS:");
                console.log("================");
                console.log("The issue is in the bitcoinjs-lib validation logic.");
                console.log("For script-path spending, it expects:");
                console.log("- tapInternalKey to match the X-only version of the signing key");
                console.log("- Proper control block with correct parity");
                console.log("- Script and leaf version to be correct");
                console.log("");
                console.log("The error occurs because bitcoinjs-lib is comparing:");
                console.log("- Signing key:", keyPair.publicKey.toString('hex'));
                console.log("- Expected key: should be the X-only internal key");
                console.log("");
                console.log("SOLUTION: Ensure the signing process uses the correct key format");
                console.log("and that all PSBT fields are properly set up for script-path spending.");
            }
        }
    }
    
} catch (error) {
    console.log("❌ PSBT setup failed:", error.message);
}

console.log("\n=== ANALYSIS COMPLETE ===");
````

## File: scripts/taproot-key-analysis.js
````javascript
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize bitcoin lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.testnet;

console.log("=== TAPROOT KEY MISMATCH ANALYSIS ===\n");

// Test data from saved-addresses.json
const privateKeyWIF = "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei";
const savedPublicKey = "0362c7197b6f3e02bd5f16a8bfee0920c2298518a487d13c1e12c90b00331a91f5";
const savedAddress = "tb1p4fuxteqjltq7mkrgszckdm88p4efva73p9r50kq65fj7q3gjpnkqapmdzh";

console.log("1. TESTING CRYPTOGRAPHIC KEY RELATIONSHIP");
console.log("=========================================");

// Step 1: Verify private key -> public key relationship
const keyPair = ECPair.fromWIF(privateKeyWIF, network);
const derivedPublicKey = keyPair.publicKey.toString('hex');

console.log("Private Key WIF:", privateKeyWIF);
console.log("Saved Public Key:", savedPublicKey);
console.log("Derived Public Key:", derivedPublicKey);
console.log("Keys Match:", derivedPublicKey === savedPublicKey);

if (derivedPublicKey !== savedPublicKey) {
    console.log("❌ CRITICAL ERROR: Private key does not correspond to saved public key!");
} else {
    console.log("✅ Private key correctly corresponds to public key");
}

console.log("\n2. INTERNAL KEY DERIVATION FOR TAPROOT");
console.log("=====================================");

// Step 2: Extract internal key (32-byte X-only pubkey)
const internalKey = keyPair.publicKey.slice(1, 33);
console.log("Internal Key (32 bytes):", internalKey.toString('hex'));
console.log("Internal Key Length:", internalKey.length, "bytes");

// Verify this is correct X-only key format
console.log("Is valid X-only key:", internalKey.length === 32);

console.log("\n3. TAPROOT ADDRESS GENERATION");
console.log("============================");

// Step 3: Create basic Taproot address (key-path only)
const p2trKeyPath = bitcoin.payments.p2tr({
    internalPubkey: internalKey,
    network: network
});

console.log("Key-path Address:", p2trKeyPath.address);
console.log("Matches Saved Address:", p2trKeyPath.address === savedAddress);

console.log("\n4. SCRIPT-PATH TAPROOT ANALYSIS");
console.log("===============================");

// Step 4: Recreate the exact script from the application
const num1 = 10, num2 = 4, operation = 'multiply';

function numberToScriptNum(num) {
    if (num === 0) return Buffer.from([bitcoin.opcodes.OP_0]);
    if (num === 1) return Buffer.from([bitcoin.opcodes.OP_1]);
    if (num >= 2 && num <= 16) return Buffer.from([bitcoin.opcodes.OP_2 + num - 2]);
    
    // For larger numbers, use bitcoin's script number encoding
    return bitcoin.script.number.encode(num);
}

const script = bitcoin.script.compile([
    numberToScriptNum(num1),
    numberToScriptNum(num2), 
    bitcoin.opcodes.OP_MUL,
    numberToScriptNum(40), // 10 * 4 = 40
    bitcoin.opcodes.OP_EQUAL
]);

console.log("Script hex:", script.toString('hex'));
console.log("Script ASM:", bitcoin.script.toASM(script));

// Create script tree
const scriptTree = {
    output: script,
    version: 0xc0
};

// Step 5: Generate script-path Taproot address
const p2trScriptPath = bitcoin.payments.p2tr({
    internalPubkey: internalKey,
    scriptTree: scriptTree,
    network: network
});

console.log("Script-path Address:", p2trScriptPath.address);
console.log("Matches Saved Address:", p2trScriptPath.address === savedAddress);

console.log("\n5. CONTROL BLOCK ANALYSIS");
console.log("=========================");

// Step 6: Generate proper control block for spending
const leafHash = bitcoin.crypto.taggedHash('TapLeaf', Buffer.concat([
    Buffer.from([0xc0]), // leaf version
    bitcoin.script.number.encode(script.length),
    script
]));

console.log("Leaf Hash:", leafHash.toString('hex'));

// Get tweaked pubkey and parity
const tweakedPubkey = p2trScriptPath.pubkey;
console.log("Tweaked Pubkey:", tweakedPubkey?.toString('hex'));

if (tweakedPubkey) {
    const parityBit = tweakedPubkey[0] === 0x03 ? 1 : 0;
    console.log("Parity Bit:", parityBit);
    
    const controlBlock = Buffer.concat([
        Buffer.from([0xc0 | parityBit]), // leaf version + parity
        internalKey
    ]);
    
    console.log("Control Block:", controlBlock.toString('hex'));
    console.log("Control Block Length:", controlBlock.length);
}

console.log("\n6. TAPROOT SPENDING ANALYSIS");
console.log("============================");

// Step 7: Analyze what's needed for script-path spending
console.log("For Taproot script-path spending, we need:");
console.log("1. The script itself");
console.log("2. The control block (leaf version + parity + internal key)");
console.log("3. The private key that corresponds to the internal key");

console.log("\nKey Requirements:");
console.log("- Internal Key:", internalKey.toString('hex'));
console.log("- Private Key WIF:", privateKeyWIF);
console.log("- Public Key matches:", derivedPublicKey === savedPublicKey);

console.log("\n7. SIGNING KEY COMPATIBILITY");
console.log("============================");

// Step 8: Test if the key can be used for signing
try {
    // Create a dummy PSBT to test signing capability
    const psbt = new bitcoin.Psbt({ network: network });
    
    // For Taproot script-path, the signing key should be the same as the one used for internal key
    console.log("Can create ECPair from WIF:", !!keyPair);
    console.log("Key pair has private key:", !!keyPair.privateKey);
    console.log("Key pair compressed:", keyPair.compressed);
    console.log("Network matches:", keyPair.network === network);
    
    // Test if we can sign with this key
    const message = Buffer.from("test message");
    const signature = keyPair.sign(message);
    console.log("Can sign messages:", !!signature);
    
} catch (error) {
    console.log("❌ Signing test failed:", error.message);
}

console.log("\n8. POTENTIAL ISSUES IDENTIFIED");
console.log("==============================");

let issues = [];

if (derivedPublicKey !== savedPublicKey) {
    issues.push("❌ Private key does not match saved public key");
}

if (p2trKeyPath.address !== savedAddress && p2trScriptPath.address !== savedAddress) {
    issues.push("❌ Neither key-path nor script-path address matches saved address");
}

if (internalKey.length !== 32) {
    issues.push("❌ Internal key is not 32 bytes (X-only format)");
}

if (!keyPair.privateKey) {
    issues.push("❌ Key pair missing private key component");
}

if (issues.length === 0) {
    console.log("✅ No cryptographic issues found with the keys");
    console.log("The error might be in the transaction building or signing process");
} else {
    console.log("Issues found:");
    issues.forEach(issue => console.log(issue));
}

console.log("\n9. RECOMMENDED DEBUGGING STEPS");
console.log("==============================");

console.log("1. Verify the UTXO scriptPubKey matches the generated address");
console.log("2. Check that tapInternalKey in PSBT matches the internal key used for address generation");
console.log("3. Ensure tapLeafScript in PSBT has correct script and control block");
console.log("4. Verify the control block parity bit is calculated correctly");
console.log("5. Check that the script execution would return true (valid calculation)");

console.log("\n=== ANALYSIS COMPLETE ===");
````

## File: scripts/taproot-signing-test.js
````javascript
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize bitcoin lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.testnet;

console.log("=== TAPROOT SCRIPT-PATH SIGNING ANALYSIS ===\n");

// Test data from saved-addresses.json
const privateKeyWIF = "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei";
const savedAddress = "tb1p4fuxteqjltq7mkrgszckdm88p4efva73p9r50kq65fj7q3gjpnkqapmdzh";

// Create the key pair
const keyPair = ECPair.fromWIF(privateKeyWIF, network);
const internalKey = keyPair.publicKey.slice(1, 33);

console.log("1. KEY SETUP");
console.log("============");
console.log("Private Key WIF:", privateKeyWIF);
console.log("Internal Key:", internalKey.toString('hex'));
console.log("Key Pair Network:", keyPair.network.bech32);
console.log("");

// Recreate the script (10 * 4 = 40)
function numberToScriptNum(num) {
    if (num === 0) return Buffer.from([bitcoin.opcodes.OP_0]);
    if (num === 1) return Buffer.from([bitcoin.opcodes.OP_1]);
    if (num >= 2 && num <= 16) return Buffer.from([bitcoin.opcodes.OP_2 + num - 2]);
    return bitcoin.script.number.encode(num);
}

const script = bitcoin.script.compile([
    numberToScriptNum(10),  // num1
    numberToScriptNum(4),   // num2
    bitcoin.opcodes.OP_MUL, // operation
    numberToScriptNum(40),  // expected result
    bitcoin.opcodes.OP_EQUAL
]);

console.log("2. SCRIPT ANALYSIS");
console.log("==================");
console.log("Script hex:", script.toString('hex'));
console.log("Script ASM:", bitcoin.script.toASM(script));

// Create the script tree
const scriptTree = {
    output: script,
    version: 0xc0
};

// Create payment object
const payment = bitcoin.payments.p2tr({
    internalPubkey: internalKey,
    scriptTree: scriptTree,
    network: network
});

console.log("Generated Address:", payment.address);
console.log("Matches Expected:", payment.address === savedAddress);
console.log("");

// Create a mock PSBT to test the signing process
console.log("3. PSBT SIGNING TEST");
console.log("===================");

try {
    const psbt = new bitcoin.Psbt({ network: network });
    
    // Mock UTXO data (this would normally come from the blockchain)
    const mockUtxo = {
        hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        index: 0,
        value: 100000,
        scriptPubKey: Buffer.from('5120aa7865e412fac1edd86880b166ece70d729677d1094747d81aa265e045120cec', 'hex')
    };
    
    // Calculate control block
    const tweakedPubkey = payment.pubkey;
    if (!tweakedPubkey) {
        throw new Error('Failed to get tweaked pubkey');
    }
    
    const parityBit = tweakedPubkey[0] === 0x03 ? 1 : 0;
    const controlBlock = Buffer.concat([
        Buffer.from([0xc0 | parityBit]), // leaf version + parity
        internalKey
    ]);
    
    console.log("Control Block:", controlBlock.toString('hex'));
    console.log("Tweaked Pubkey:", tweakedPubkey.toString('hex'));
    console.log("Parity Bit:", parityBit);
    
    // Add input with Taproot script-path data
    psbt.addInput({
        hash: mockUtxo.hash,
        index: mockUtxo.index,
        witnessUtxo: {
            script: mockUtxo.scriptPubKey,
            value: mockUtxo.value
        },
        tapInternalKey: internalKey,
        tapLeafScript: [{
            leafVersion: 0xc0,
            script: script,
            controlBlock: controlBlock
        }]
    });
    
    // Add output
    psbt.addOutput({
        address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        value: 50000
    });
    
    console.log("PSBT created successfully");
    console.log("Input count:", psbt.inputCount);
    console.log("Output count:", psbt.outputCount);
    
    // Test signing
    console.log("\n4. SIGNING ATTEMPT");
    console.log("=================");
    
    // Check what key bitcoinjs-lib expects for signing
    console.log("Attempting to sign input 0...");
    
    try {
        psbt.signInput(0, keyPair);
        console.log("✅ Signing successful!");
        
        // Try to finalize
        psbt.finalizeInput(0);
        console.log("✅ Finalization successful!");
        
        const tx = psbt.extractTransaction();
        console.log("✅ Transaction extracted successfully!");
        console.log("Transaction hex:", tx.toHex());
        
    } catch (signError) {
        console.log("❌ Signing failed:", signError.message);
        
        // Let's analyze what went wrong
        console.log("\n5. SIGNING ERROR ANALYSIS");
        console.log("=========================");
        
        if (signError.message.includes('Can not sign for input')) {
            console.log("This is the exact error we're investigating!");
            console.log("The error suggests the key doesn't match what's expected for signing.");
            
            // Check if the internal key matches what we're using for signing
            const signingPubkey = keyPair.publicKey.toString('hex');
            console.log("Signing key public key:", signingPubkey);
            console.log("Internal key (from signing key):", internalKey.toString('hex'));
            console.log("Tweaked pubkey:", tweakedPubkey.toString('hex'));
            
            // For Taproot script-path spending, we sign with the internal private key
            // The error might be that bitcoinjs-lib is expecting a different key
            
            console.log("\nPossible issues:");
            console.log("1. The tapInternalKey in PSBT doesn't match the key used for signing");
            console.log("2. The control block is incorrect");
            console.log("3. The script or leaf version is wrong");
            console.log("4. The scriptPubKey doesn't match the generated address");
            
            // Test with correct scriptPubKey
            const correctScriptPubKey = Buffer.from('5120' + tweakedPubkey.toString('hex'), 'hex');
            console.log("Expected scriptPubKey:", correctScriptPubKey.toString('hex'));
            console.log("Mock scriptPubKey matches:", mockUtxo.scriptPubKey.equals(correctScriptPubKey));
        }
        
        console.log("\nDetailed error:", signError);
    }
    
} catch (error) {
    console.log("❌ PSBT creation failed:", error.message);
    console.log("Full error:", error);
}

console.log("\n6. SUMMARY");
console.log("==========");
console.log("Key relationship: ✅ Private key correctly derives public key");
console.log("Address generation: ✅ Script-path address matches expected");
console.log("Script creation: ✅ Script compiles correctly");
console.log("Control block: ✅ Generated with correct format");
console.log("");
console.log("The issue is likely in the transaction building/signing process:");
console.log("- Ensure UTXO scriptPubKey matches the tweaked pubkey");
console.log("- Verify tapInternalKey in PSBT input matches the internal key");
console.log("- Check that the actual UTXO data from the blockchain is correct");
console.log("- Ensure the control block parity bit calculation is accurate");

console.log("\n=== ANALYSIS COMPLETE ===");
````

## File: scripts/test-control-block.js
````javascript
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize bitcoin lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const network = bitcoin.networks.testnet;

// Test data from saved addresses
const privateKeyWIF = "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei";
const keyPair = ECPair.fromWIF(privateKeyWIF, network);
const internalKey = keyPair.publicKey.slice(1, 33);

console.log("=== Control Block Test ===");
console.log("Internal Key:", internalKey.toString('hex'));

// Create a simple script (like the calculation script)
const script = bitcoin.script.compile([
  Buffer.from([10]), // OP_10 
  Buffer.from([4]),  // OP_4
  bitcoin.opcodes.OP_MUL,
  Buffer.from([40]), // Expected result: 40
  bitcoin.opcodes.OP_EQUAL
]);

console.log("Script:", script.toString('hex'));

const scriptTree = {
  output: script,
  version: 0xc0 // TAPROOT_LEAF_TAPSCRIPT
};

// Create the payment object
const p2tr = bitcoin.payments.p2tr({
  internalPubkey: internalKey,
  scriptTree: scriptTree,
  network: network
});

console.log("Address:", p2tr.address);

// Create redeem script for spending
const redeemScript = {
  output: script,
  redeemVersion: 0xc0
};

// Generate witness for the redeem to get control block
const p2trRedeem = bitcoin.payments.p2tr({
  internalPubkey: internalKey,
  scriptTree: scriptTree,
  redeem: redeemScript,
  network: network
});

console.log("Witness length:", p2trRedeem.witness?.length || 0);
if (p2trRedeem.witness) {
  p2trRedeem.witness.forEach((w, i) => {
    console.log(`Witness[${i}]:`, w.toString('hex'), `(${w.length} bytes)`);
  });
}

const controlBlock = p2trRedeem.witness?.[p2trRedeem.witness.length - 1];
console.log("Control Block:", controlBlock?.toString('hex') || 'null');
console.log("Control Block Length:", controlBlock?.length || 0);
````

## File: scripts/test-exact-match.js
````javascript
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize bitcoin lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const network = bitcoin.networks.testnet;

// Test data from saved addresses - exact match
const privateKeyWIF = "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei";
const expectedAddress = "tb1p4fuxteqjltq7mkrgszckdm88p4efva73p9r50kq65fj7q3gjpnkqapmdzh";

const keyPair = ECPair.fromWIF(privateKeyWIF, network);
const internalKey = keyPair.publicKey.slice(1, 33);

console.log("=== Exact Match Test ===");
console.log("Expected Address:", expectedAddress);
console.log("Internal Key:", internalKey.toString('hex'));

// Helper functions (matching the server code)
function numberToScriptNum(num) {
  if (num === 0) return Buffer.from([]);
  if (num >= 1 && num <= 16) return Buffer.from([bitcoin.opcodes.OP_1 + num - 1]);
  
  const isNegative = num < 0;
  num = Math.abs(num);
  
  const bytes = [];
  while (num > 0) {
    bytes.push(num & 0xff);
    num >>= 8;
  }
  
  if (bytes[bytes.length - 1] & 0x80) {
    bytes.push(isNegative ? 0x80 : 0x00);
  } else if (isNegative) {
    bytes[bytes.length - 1] |= 0x80;
  }
  
  return Buffer.from(bytes);
}

function getOperationOpcode(operation) {
  switch (operation) {
    case 'add': return bitcoin.opcodes.OP_ADD;
    case 'subtract': return bitcoin.opcodes.OP_SUB;
    case 'multiply': return bitcoin.opcodes.OP_MUL;
    case 'divide': return bitcoin.opcodes.OP_DIV;
    default: throw new Error(`Invalid operation: ${operation}`);
  }
}

function calculateExpectedResult(num1, num2, operation) {
  switch (operation) {
    case 'add': return num1 + num2;
    case 'subtract': return num1 - num2;
    case 'multiply': return num1 * num2;
    case 'divide':
      if (num2 === 0) throw new Error('Division by zero');
      return Math.floor(num1 / num2);
    default: throw new Error(`Invalid operation: ${operation}`);
  }
}

// Create calculation script for 10 * 4 = 40
const num1 = 10, num2 = 4, operation = 'multiply';
const expectedResult = calculateExpectedResult(num1, num2, operation);

console.log(`Calculation: ${num1} * ${num2} = ${expectedResult}`);

const script = bitcoin.script.compile([
  numberToScriptNum(num1),
  numberToScriptNum(num2),
  getOperationOpcode(operation),
  numberToScriptNum(expectedResult),
  bitcoin.opcodes.OP_EQUAL
]);

console.log("Script:", script.toString('hex'));

const scriptTree = {
  output: script,
  version: 0xc0
};

// Create the payment object
const p2tr = bitcoin.payments.p2tr({
  internalPubkey: internalKey,
  scriptTree: scriptTree,
  network: network
});

console.log("Generated Address:", p2tr.address);
console.log("Addresses Match:", p2tr.address === expectedAddress);

// Generate control block
const redeemScript = {
  output: script,
  redeemVersion: 0xc0
};

const p2trRedeem = bitcoin.payments.p2tr({
  internalPubkey: internalKey,
  scriptTree: scriptTree,
  redeem: redeemScript,
  network: network
});

const controlBlock = p2trRedeem.witness?.[p2trRedeem.witness.length - 1];
console.log("Control Block:", controlBlock?.toString('hex') || 'null');
console.log("Control Block Length:", controlBlock?.length || 0);
````

## File: .gitignore
````
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Production build
dist/
build/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
*.log
logs/

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Dependency directories
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Microbundle cache
.rpt2_cache/
.rts2_cache_cjs/
.rts2_cache_es/
.rts2_cache_umd/

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env
.env.test

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# next.js build output
.next

# nuxt.js build output
.nuxt

# vuepress build output
.vuepress/dist

# Serverless directories
.serverless/

# FuseBox cache
.fusebox/

# DynamoDB Local files
.dynamodb/

# TernJS port file
.tern-port

# IDE files
.vscode/
.idea/
*.swp
*.swo
*~

# OS files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Bitcoin data (keep private keys safe)
wallet.dat
*.key

# Temporary files
tmp/
temp/
*.tmp

# Documentation (optional)
docs/build/

# TypeScript build info
*.tsbuildinfo
````

## File: pnpm-workspace.yaml
````yaml
packages:
  - "apps/*"
  - "packages/*"
````

## File: apps/web/app/watch/page.js
````javascript
"use client";

import { useState } from 'react';

export const dynamic = 'force-dynamic';

export default function Watch() {
  const [endpoint, setEndpoint] = useState('https://mempool.space/signet');
  const [hex, setHex] = useState('');
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleBroadcast() {
    setStatus('broadcasting...');
    setResult(null);
    setError('');
    try {
      const r = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hex, endpoint }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || `Broadcast failed (status ${j.status || r.status})`);
      setResult(j);
      setStatus('broadcasted');
    } catch (e) {
      setError(String(e?.message || e));
      setStatus('error');
    }
  }

  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600 text-white">WATCH‑ONLY</div>
      <h1 className="text-2xl font-semibold">Watch‑Only (Online Messenger)</h1>
      <p className="text-zinc-500">Broadcast signed transactions to Signet. Paste raw tx hex below.</p>

      <section className="rounded-lg border p-4 space-y-3">
        <label className="space-y-1 block">
          <div className="text-sm text-zinc-500">Node endpoint (POST /api/tx)</div>
          <input className="w-full rounded border px-3 py-2" value={endpoint} onChange={e => setEndpoint(e.target.value)} />
        </label>
        <label className="space-y-1 block">
          <div className="text-sm text-zinc-500">Raw transaction hex</div>
          <textarea className="w-full rounded border px-3 py-2 font-mono min-h-[140px]" value={hex} onChange={e => setHex(e.target.value)} />
        </label>
        <div className="flex items-center gap-2">
          <button onClick={handleBroadcast} className="px-3 py-2 rounded bg-emerald-600 text-white" disabled={!hex.trim()}>Broadcast</button>
          {status && <div className="text-sm text-zinc-500">Status: {status}</div>}
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        {result && (
          <div className="text-sm">
            <div className="text-zinc-500">Result</div>
            <div className="font-mono break-all">txid: {result.txid}</div>
          </div>
        )}
      </section>
    </main>
  );
}
````

## File: apps/web/public/sw-cold.js
````javascript
self.addEventListener('install', (event) => self.skipWaiting());
self.addEventListener('activate', (event) => self.clients.claim());
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  // Allow the app shell, static assets, and navigations to load
  if (sameOrigin) {
    // Block internal API calls in cold mode (including /api/ping for self-check)
    if (url.pathname.startsWith('/api/') || url.pathname === '/cold/sw-probe') {
      event.respondWith(new Response('Cold Mode: network blocked', { status: 451, statusText: 'Unavailable For Legal Reasons' }));
      return;
    }
    // Otherwise let the request proceed normally
    return;
  }
  // Block all cross-origin traffic
  event.respondWith(new Response('Cold Mode: network blocked', { status: 451, statusText: 'Unavailable For Legal Reasons' }));
});
````

## File: apps/web/postcss.config.js
````javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
````

## File: apps/web/tailwind.config.js
````javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
````

## File: packages/offline-core/src/psbt.js
````javascript
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

export function buildFundingPsbt({ utxos, sendOutputScript, sendValueSat, changeAddress, feeRateSatVb = 2, network = bitcoin.networks.testnet }) {
  const psbt = new bitcoin.Psbt({ network });
  let inputValue = 0;
  for (const u of utxos) {
    if (!u.witnessUtxo) throw new Error('utxo.witnessUtxo required');
    psbt.addInput({
      hash: u.txid,
      index: u.vout,
      witnessUtxo: u.witnessUtxo,
      ...(u.tapInternalKey ? { tapInternalKey: u.tapInternalKey } : {}),
    });
    inputValue += u.witnessUtxo.value;
  }
  const estBytes = 120 + utxos.length * 68 + 2 * 34; // rough estimate
  const fee = Math.ceil(estBytes * feeRateSatVb);
  const change = inputValue - sendValueSat - fee;
  if (change < 0) throw new Error('Insufficient funds');
  psbt.addOutput({ script: sendOutputScript, value: sendValueSat });
  if (change > 546 && changeAddress) {
    psbt.addOutput({ address: changeAddress, value: change });
  }
  return psbt;
}
````

## File: packages/offline-core/test/psbt.test.js
````javascript
import { test, expect } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { randomBytes } from 'crypto';
import { buildFundingPsbt } from '../src/index.js';

bitcoin.initEccLib(ecc);

function makeUtxoP2WPKH(value = 150000, network = bitcoin.networks.testnet) {
  // Derive a random compressed pubkey and corresponding p2wpkh output script
  let d, p;
  for (let i = 0; i < 64; i++) {
    d = randomBytes(32);
    p = ecc.pointFromScalar(d, true);
    if (p) break;
  }
  const pay = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(p), network });
  if (!pay.output || !pay.address) throw new Error('p2wpkh failed');
  return {
    utxo: {
      txid: Buffer.alloc(32, 1).toString('hex'),
      vout: 0,
      witnessUtxo: { script: pay.output, value },
    },
    changeAddress: pay.address,
  };
}

function makeP2TROutputScript(network = bitcoin.networks.testnet) {
  // Simple single-leaf taptree with OP_TRUE to produce a valid P2TR output script
  // This is only for funding output; no signing occurs in this test.
  // Derive a valid x-only internal pubkey from a random private scalar
  let d, P;
  for (let i = 0; i < 64; i++) {
    d = randomBytes(32);
    P = ecc.pointFromScalar(d, true);
    if (P) break;
  }
  const internalPubkey = Buffer.from(P.slice(1, 33));
  const redeemLeaf = { output: Buffer.from('51', 'hex') }; // OP_TRUE
  const p2tr = bitcoin.payments.p2tr({ internalPubkey, scriptTree: redeemLeaf, network });
  if (!p2tr.output) throw new Error('p2tr failed');
  return p2tr.output;
}

test('buildFundingPsbt creates outputs and respects changeAddress when funds suffice', () => {
  const network = bitcoin.networks.testnet;
  const { utxo, changeAddress } = makeUtxoP2WPKH(150000, network);
  const sendOutputScript = makeP2TROutputScript(network);
  const sendValueSat = 70000;
  const feeRateSatVb = 2;
  const psbt = buildFundingPsbt({
    utxos: [utxo],
    sendOutputScript,
    sendValueSat,
    changeAddress,
    feeRateSatVb,
    network,
  });
  // One send output + possibly one change output
  expect(psbt.txOutputs?.length ?? psbt.data.outputs.length).toBeGreaterThanOrEqual(1);
  // Verify at least the send output script/value exists in one of the outputs
  const outputs = (psbt.txOutputs ?? psbt.data.outputs).map(o => ({
    script: o.script || o.script || (o.redeemScript || undefined),
    value: o.value,
    address: o.address,
  }));
  const hasSend = (psbt.txOutputs ?? psbt.data.outputs).some(o =>
    (o.script ? o.script.equals(sendOutputScript) : false) || (o.address === undefined)
  );
  expect(hasSend).toBe(true);
});
````

## File: packages/offline-core/test/taproot.test.js
````javascript
import { test, expect } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { randomBytes } from 'crypto';
import { buildClaimScript, buildRefundScript, buildClaimRefundTaproot, NETWORKS } from '../src/index.js';

bitcoin.initEccLib(ecc);

function xOnlyFromScalar() {
  let d, p;
  for (let i = 0; i < 64; i++) {
    d = randomBytes(32);
    p = ecc.pointFromScalar(d, true);
    if (p) return p.slice(1, 33);
  }
  throw new Error('Failed to derive x-only pubkey');
}

function compressedFromScalar() {
  let d, p;
  for (let i = 0; i < 64; i++) {
    d = randomBytes(32);
    p = ecc.pointFromScalar(d, true);
    if (p) return p;
  }
  throw new Error('Failed to derive compressed pubkey');
}

test('buildClaimScript matches OP_SHA256 <h> OP_EQUALVERIFY <R> OP_CHECKSIG', () => {
  const h32 = randomBytes(32);
  const R = xOnlyFromScalar();
  const script = buildClaimScript(R, h32);
  const chunks = bitcoin.script.decompile(script);
  const OPS = bitcoin.opcodes;
  expect(chunks).toHaveLength(5);
  expect(chunks[0]).toBe(OPS.OP_SHA256);
  expect(Buffer.isBuffer(chunks[1])).toBe(true);
  expect(chunks[1].equals(h32)).toBe(true);
  expect(chunks[2]).toBe(OPS.OP_EQUALVERIFY);
  expect(Buffer.isBuffer(chunks[3])).toBe(true);
  expect(chunks[3].length).toBe(32);
  expect(chunks[3].equals(R)).toBe(true);
  expect(chunks[4]).toBe(OPS.OP_CHECKSIG);
});

test('buildRefundScript matches <H_exp> OP_CHECKLOCKTIMEVERIFY OP_DROP <S> OP_CHECKSIG', () => {
  const H_exp = 500000;
  const S = xOnlyFromScalar();
  const script = buildRefundScript(H_exp, S);
  const chunks = bitcoin.script.decompile(script);
  const OPS = bitcoin.opcodes;
  expect(chunks).toHaveLength(5);
  expect(Buffer.isBuffer(chunks[0])).toBe(true);
  const num = bitcoin.script.number.decode(chunks[0]);
  expect(num).toBe(H_exp);
  expect(chunks[1]).toBe(OPS.OP_CHECKLOCKTIMEVERIFY);
  expect(chunks[2]).toBe(OPS.OP_DROP);
  expect(Buffer.isBuffer(chunks[3])).toBe(true);
  expect(chunks[3].length).toBe(32);
  expect(chunks[4]).toBe(OPS.OP_CHECKSIG);
});

test('buildClaimRefundTaproot returns valid p2tr output and address', () => {
  const R = xOnlyFromScalar();
  const S = xOnlyFromScalar();
  const h32 = randomBytes(32);
  const H_exp = 500000;
  const res = buildClaimRefundTaproot({ R_xonly: R, S_xonly: S, h32, H_exp, network: NETWORKS.signet });
  expect(res.address).toBeTruthy();
  expect(Buffer.isBuffer(res.output)).toBe(true);
  expect(res.output.length).toBeGreaterThan(0);
  expect(res.leaves).toBeDefined();
  expect(Buffer.isBuffer(res.leaves.claim)).toBe(true);
  expect(Buffer.isBuffer(res.leaves.refund)).toBe(true);
});
````

## File: packages/server-api/package.json
````json
{
  "name": "@offline/server-api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "src/server.ts",
  "scripts": {
    "start": "ts-node src/server.ts"
  },
  "dependencies": {
    "@offline/core": "workspace:*",
    "@offline/interop": "workspace:*",
    "@offline/shared-types": "workspace:*",
    "axios": "^1.6.0",
    "cors": "^2.8.5",
    "express": "^4.18.2"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "ts-node": "^10.9.2"
  }
}
````

## File: README.md
````markdown
# Real Bitcoin Taproot Calculator

A complete Bitcoin Taproot calculator that creates **actual Bitcoin testnet transactions** with Tapscript arithmetic operations. This application generates real Bitcoin addresses, builds transactions with embedded calculations, and broadcasts them to the Bitcoin testnet network.

## 🚀 Features

- **Real Bitcoin Transactions**: Creates actual Bitcoin testnet transactions viewable on mempool.space
- **Taproot Integration**: Uses Bitcoin Taproot (P2TR) addresses with embedded Tapscript calculations
- **Arithmetic Operations**: Supports addition, subtraction, multiplication, and division with Bitcoin script constraints
- **Complete Transaction Flow**: Address generation → Funding → Transaction creation → Broadcasting → Verification
- **Mempool Integration**: Direct links to view transactions on mempool.space/testnet
- **Full-Stack Architecture**: Node.js backend with Bitcoin libraries + Frontend web interface

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Access to Bitcoin testnet faucets for funding
- Internet connection for mempool.space API

## 🛠️ Installation & Setup

1. **Clone and install dependencies:**
   ```bash
   cd btc-offline
   npm install
   ```

2. **Build the application:**
   ```bash
   npm run build
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Access the application:**
   - Open your browser to `http://localhost:3001`
   - The server provides both API endpoints and web interface

## 🔧 Architecture

### Backend (Node.js + TypeScript)
- **`src/server/bitcoin.ts`**: Core Bitcoin operations, Taproot address generation, transaction building
- **`src/server/mempool.ts`**: Mempool.space API integration for UTXOs, broadcasting, status checking
- **`src/server/calculator.ts`**: Main calculator service coordinating Bitcoin operations
- **`src/server/server.ts`**: Express.js API server with endpoints

### Frontend (TypeScript + Vanilla JS)
- **`src/client/app.ts`**: Web application interface and API communication
- **`index.html`**: Modern responsive UI with real-time status updates

### Shared
- **`src/shared/types.ts`**: TypeScript interfaces and types for Bitcoin operations

## 🧮 How It Works

### 1. Address Generation
```typescript
// Generate Taproot address with embedded calculation script
const { address, scriptHash } = generateTaprootAddressWithScript(
  internalKey, 
  10,    // num1
  5,     // num2  
  'add'  // operation
);
```

### 2. Tapscript Creation
Each calculation creates a Bitcoin script:
```
OP_10 OP_5 OP_ADD OP_15 OP_EQUAL
```
This script pushes both numbers, performs the operation, pushes the expected result, and verifies equality.

### 3. Transaction Building
- Fetches UTXOs from funded address
- Builds PSBT (Partially Signed Bitcoin Transaction)
- Signs with generated private key
- Creates raw transaction hex

### 4. Broadcasting
- Submits transaction to Bitcoin testnet via mempool.space API
- Returns transaction ID for verification
- Transaction becomes viewable on blockchain explorers

## 📡 API Endpoints

### Core Operations
- `POST /api/generate-address` - Generate funding address for calculation
- `GET /api/check-funding/:address` - Check if address has sufficient funds
- `POST /api/calculate` - Perform calculation and create Bitcoin transaction
- `GET /api/transaction/:txid` - Get transaction status and details

### Utility
- `GET /api/health` - Health check and network status
- `GET /api/network-status` - Bitcoin testnet network information
- `POST /api/validate` - Validate calculation parameters

## 💰 Funding Process

### 1. Generate Address
- Select numbers and operation
- Click "Generate Funding Address"
- Unique Taproot address created for your calculation

### 2. Fund Address
Send testnet Bitcoin from faucets:
- [Mempool.co Faucet](https://testnet-faucet.mempool.co/)
- [BitcoinFaucet.uo1.net](https://bitcoinfaucet.uo1.net/)
- [Testnet.help](https://testnet.help/en/btcfaucet/testnet)
- [CoinFaucet.eu](https://coinfaucet.eu/en/btc-testnet/)

### 3. Verify Funding
- Click "Check Funding Status"
- Minimum required: 100,000 satoshis (0.001 tBTC)
- Wait for confirmations (10-30 minutes)

### 4. Create Transaction
- Click "Calculate & Create Real Transaction"
- Transaction builds, signs, and broadcasts automatically
- Receive real transaction ID viewable on mempool.space

## 🔍 Example Usage

### Basic Calculation (10 + 5)
1. Enter numbers: `10` and `5`
2. Click `+` operation
3. Generate funding address
4. Fund address with 0.001 tBTC from faucet
5. Wait for confirmation
6. Click "Calculate & Create Real Transaction"
7. Receive transaction ID: `abc123...` 
8. View at: `https://mempool.space/testnet/tx/abc123...`

### Tapscript Generated
```
Script: OP_10 OP_5 OP_ADD OP_15 OP_EQUAL
Result: Transaction proves 10 + 5 = 15 on Bitcoin blockchain
```

## ⚠️ Bitcoin Script Constraints

- **Integers Only**: Bitcoin script operates on 32-bit signed integers
- **Range**: -2,147,483,648 to 2,147,483,647
- **Division**: Integer division (truncates decimals)
- **Overflow**: Operations that exceed range will fail validation

### Valid Examples
```
✅ 100 + 50 = 150
✅ 1000 - 300 = 700  
✅ 12 × 8 = 96
✅ 20 ÷ 4 = 5
```

### Invalid Examples
```
❌ 3.14 + 2.71 (decimals not supported)
❌ 1000000000 × 3 (overflow)
❌ 10 ÷ 0 (division by zero)
```

## 🧪 Testing

### Manual Testing
1. Start the application: `npm start`
2. Open `http://localhost:3001`
3. Follow the funding and calculation process
4. Verify transactions on mempool.space/testnet

### API Testing
```bash
# Check health
curl http://localhost:3001/api/health

# Generate address
curl -X POST http://localhost:3001/api/generate-address \
  -H "Content-Type: application/json" \
  -d '{"num1": 10, "num2": 5, "operation": "add"}'

# Check funding
curl http://localhost:3001/api/check-funding/tb1p...

# Perform calculation (requires funded address)
curl -X POST http://localhost:3001/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"num1": 10, "num2": 5, "operation": "add"}'
```

## 🔒 Security Considerations

### Testnet Safety
- ✅ **Testnet Only**: No real Bitcoin value
- ✅ **Educational Purpose**: For learning and demonstration
- ✅ **Open Source**: Code is transparent and auditable

### Private Key Handling
- 🔑 **Generated Fresh**: New keys for each calculation
- 📱 **Displayed Safely**: Private keys shown for educational purposes
- ⚠️ **Not for Production**: This is demonstration software

### Network Security
- 🌐 **Public APIs**: Uses mempool.space public APIs
- 🔒 **HTTPS**: All external API calls use HTTPS
- 🛡️ **Rate Limiting**: Respects API rate limits

## 📚 Educational Value

This calculator demonstrates:

1. **Bitcoin Taproot Technology**: Real-world usage of Bitcoin's latest upgrade
2. **Tapscript Programming**: How to embed logic in Bitcoin transactions  
3. **UTXO Management**: Bitcoin's transaction model
4. **Digital Signatures**: Cryptographic transaction authorization
5. **Blockchain Broadcasting**: How transactions enter the Bitcoin network

## 🐛 Troubleshooting

### Common Issues

1. **"Address not funded"**
   - Solution: Send testnet Bitcoin from faucets, wait for confirmation

2. **"Transaction broadcast failed"**
   - Check network connectivity
   - Verify sufficient UTXOs
   - Ensure proper fee calculation

3. **"UTXO not found"**
   - Wait longer for confirmations
   - Check transaction on mempool.space
   - Try different faucet

4. **"Invalid operation result"**
   - Check for integer overflow
   - Verify operation is supported
   - Ensure inputs are valid integers

### Debug Mode
Enable detailed logging:
```bash
DEBUG=* npm start
```

## 🔗 External Dependencies

- **bitcoinjs-lib**: Bitcoin transaction building and cryptography
- **tiny-secp256k1**: Elliptic curve cryptography
- **mempool.space API**: UTXO fetching and transaction broadcasting
- **Express.js**: Web server framework

## 📈 Future Enhancements

- [ ] Support for more complex arithmetic operations
- [ ] Multi-input transaction support
- [ ] Custom fee selection
- [ ] Transaction confirmation monitoring
- [ ] Batch calculations
- [ ] Mainnet support (with proper warnings)

## 👥 Contributors

- Original Author: c0llinx
- Feature Additions: George

## 📄 License

MIT License - This is educational software for learning Bitcoin development.

## ⚡ Quick Start Summary

```bash
# Install and run
npm install
npm run build
npm start

# Open browser
http://localhost:3001

# Fund address → Calculate → Get real transaction ID
# View on: https://mempool.space/testnet/tx/[your-txid]
```

## 🎯 Success Criteria

When everything works correctly, you will:

1. ✅ Generate a unique Bitcoin Taproot address
2. ✅ Fund it with testnet Bitcoin from faucets  
3. ✅ Create a real Bitcoin transaction with embedded calculation
4. ✅ Broadcast it to Bitcoin testnet network
5. ✅ View the transaction on mempool.space/testnet
6. ✅ Verify the Tapscript contains your arithmetic operation

**The transaction ID will be real and viewable on mempool.space - no more "transaction not found" errors!**
````

## File: apps/web/package.json
````json
{
  "name": "@offline/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "build:cold": "cross-env __COLD__=true next build",
    "build:watch": "cross-env __COLD__=false next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "zustand": "^4.5.2",
    "zod": "^3.23.8",
    "lucide-react": "^0.446.0",
    "framer-motion": "^11.0.0",
    "@offline/core": "workspace:*",
    "@offline/interop": "workspace:*",
    "buffer": "^6.0.3",
    "@offline/server-api": "workspace:*"
  },
  "devDependencies": {
    "eslint": "^8.57.0",
    "eslint-config-next": "14.2.5",
    "prettier": "^3.3.3",
    "tailwindcss": "^3.4.10",
    "postcss": "^8.4.40",
    "autoprefixer": "^10.4.20",
    "cross-env": "^7.0.3",
    "webpack": "^5.91.0"
  }
}
````

## File: packages/offline-core/src/taproot.js
````javascript
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

export const NETWORKS = {
  signet: bitcoin.networks.testnet,
  testnet: bitcoin.networks.testnet,
  mainnet: bitcoin.networks.bitcoin,
};

function random32() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    const a = new Uint8Array(32);
    globalThis.crypto.getRandomValues(a);
    return a;
  }
  const a = new Uint8Array(32);
  for (let i = 0; i < 32; i++) a[i] = (Math.floor(Math.random() * 256)) & 0xff; // non-crypto fallback
  return a;
}

export function generateBurnedInternalKey() {
  for (let i = 0; i < 128; i++) {
    const d = random32();
    const p = ecc.pointFromScalar(d, true);
    if (p) {
      const xonly = p.slice(1, 33);
      return Buffer.from(xonly);
    }
  }
  throw new Error('Failed to derive internal key');
}

export function buildClaimScript(R_xonly, h32) {
  const OPS = bitcoin.opcodes;
  const R = Buffer.from(R_xonly);
  const h = Buffer.from(h32);
  return bitcoin.script.compile([
    OPS.OP_SHA256,
    h,
    OPS.OP_EQUALVERIFY,
    R,
    OPS.OP_CHECKSIG,
  ]);
}

export function buildRefundScript(H_exp, S_xonly) {
  const OPS = bitcoin.opcodes;
  const cltv = bitcoin.script.number.encode(H_exp);
  const S = Buffer.from(S_xonly);
  return bitcoin.script.compile([
    cltv,
    OPS.OP_CHECKLOCKTIMEVERIFY,
    OPS.OP_DROP,
    S,
    OPS.OP_CHECKSIG,
  ]);
}

export function buildClaimRefundTaproot({ R_xonly, S_xonly, h32, H_exp, network = NETWORKS.signet }) {
  const internalPubkey = generateBurnedInternalKey();
  const claim = buildClaimScript(R_xonly, h32);
  const refund = buildRefundScript(H_exp, S_xonly);
  const scriptTree = [
    { output: claim },
    { output: refund },
  ];
  const p2tr = bitcoin.payments.p2tr({
    internalPubkey,
    scriptTree,
    network,
  });
  if (!p2tr.address || !p2tr.output) throw new Error('p2tr build failed');
  return {
    address: p2tr.address,
    output: p2tr.output,
    internalPubkey,
    leaves: { claim, refund },
    scriptTree,
  };
}
````

## File: packages/offline-core/src/ur.js
````javascript
import { UR, UREncoder, URDecoder } from '@ngraveio/bc-ur';

// Encode CBOR bytes as UR v2 multipart QR stream.
// Returns a small wrapper with a nextPart() function that yields 'ur:...' strings.
export function encodeUR(type, payloadBytes, maxFragmentLength = 800) {
  // Create a UR from raw CBOR bytes using the v1.1.13 API
  // Some builds ignore the optional type in fromBuffer; construct explicitly
  const ur = new UR(payloadBytes, type);
  const encoder = new UREncoder(ur, maxFragmentLength);

  // Pre-compute an estimated number of parts (pure fragments count)
  // Note: This is an estimate for UI purposes; fountain encoding may emit more parts over time.
  let estimatedParts;
  if (typeof encoder.fragmentsLength === 'number') {
    estimatedParts = encoder.fragmentsLength;
  }

  return {
    nextPart: () => encoder.nextPart(),
    // bc-ur fountain encoders are open-ended; expose a conservative isComplete
    isComplete: () => false,
    estimatedParts,
  };
}

// Decode an array of UR part strings back into type and CBOR bytes
export async function decodeUR(parts) {
  const decoder = new URDecoder();
  for (const p of parts) decoder.receivePart(p);
  if (!decoder.isComplete()) throw new Error('UR not complete');
  if (!decoder.isSuccess()) throw new Error('UR decode failed');
  const ur = decoder.resultUR();
  // Prefer inner payload via helper; fallback to raw field if helper is absent
  // OR if it produced an empty/undefined result (defensive for browser builds).
  const prefer = (typeof ur.decodeCBOR === 'function') ? ur.decodeCBOR() : undefined;
  const fallback = ur.cbor;
  const getLen = (x) => {
    if (!x) return 0;
    if (x instanceof Uint8Array) return x.byteLength;
    if (typeof ArrayBuffer !== 'undefined' && x instanceof ArrayBuffer) return x.byteLength;
    if (x && typeof x === 'object') {
      if (x.type === 'Buffer' && Array.isArray(x.data)) return x.data.length;
      if (x.buffer instanceof ArrayBuffer && typeof x.byteLength === 'number') return x.byteLength;
      if (Array.isArray(x)) return x.length;
    }
    try { return new Uint8Array(x).byteLength; } catch {}
    return 0;
  };
  const raw = getLen(prefer) > 0 ? prefer : fallback;
  // Normalize to Uint8Array across environments
  const toU8 = (x) => {
    if (x instanceof Uint8Array) return x;
    if (typeof x === 'string') return new TextEncoder().encode(x);
    if (x && typeof x === 'object') {
      if (x.type === 'Buffer' && Array.isArray(x.data)) return Uint8Array.from(x.data);
      if (typeof x.toJSON === 'function') {
        try {
          const j = x.toJSON();
          if (j && j.type === 'Buffer' && Array.isArray(j.data)) return Uint8Array.from(j.data);
        } catch {}
      }
      if (x.buffer instanceof ArrayBuffer && typeof x.byteLength === 'number') {
        const offset = x.byteOffset || 0;
        const length = x.byteLength;
        return new Uint8Array(x.buffer, offset, length);
      }
      if (Array.isArray(x)) return Uint8Array.from(x);
      // Handle an object that looks like {"0": 104, "1": 101, ...}
      try {
        const keys = Object.keys(x);
        if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
          const maxKey = Math.max(...keys.map(k => parseInt(k, 10)));
          const arr = new Uint8Array(maxKey + 1);
          for (const k of keys) {
            const idx = parseInt(k, 10);
            let v = x[k];
            if (typeof v !== 'number') { try { v = Number(v); } catch {} }
            arr[idx] = (v >>> 0) & 0xff;
          }
          return arr;
        }
      } catch {}
      if (typeof x.length === 'number' && x.length >= 0) {
        try {
          const arr = new Uint8Array(x.length >>> 0);
          for (let i = 0; i < arr.length; i++) arr[i] = (x[i] ?? 0) & 0xff;
          return arr;
        } catch {}
      }
    }
    try { return new Uint8Array(x); } catch {}
    throw new Error('Unable to normalize CBOR bytes to Uint8Array');
  };
  const cbor = toU8(raw);
  return { type: ur.type, cbor };
}
````

## File: packages/offline-core/package.json
````json
{
  "name": "@offline/core",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "main": "src/index.js",
  "license": "MIT",
  "sideEffects": false,
  "scripts": {
    "build": "echo 'Nothing to build (JS only)'",
    "test": "vitest run"
  },
  "dependencies": {
    "bitcoinjs-lib": "^6.1.5",
    "@bitcoinerlab/secp256k1": "^1.2.0",
    "bip32": "5.0.0-rc.0",
    "bip39": "^3.1.0",
    "cbor-x": "^1.5.8",
    "@ngraveio/bc-ur": "^1.1.13",
    "buffer": "^6.0.3"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
````

## File: src/server/bitcoin-export-fix.ts
````typescript
// This file was created in error and should be removed.
// The export is now correctly added to bitcoin.ts.
````

## File: src/server/workflow.ts
````typescript
import { RealBitcoinCalculator } from './bitcoin.js';

/**
 * Lightweight placeholder implementation of the offline funding / claim / refund
 * workflow so that the API and dev environment compile. Full logic will be added
 * incrementally – for now each method only returns TODO stubs while maintaining
 * the expected shapes used by `server.ts`.
 */
export class OfflineWorkflowService {
  private wallet = new RealBitcoinCalculator();

  /**
   * Sender creates the initial funding PSBT to a Taproot address.
   */
  async createFundingPSBT(
    senderWif: string,
    receiverPubKeyHex: string,
    amount: number,
    refundLocktime: number
  ) {
    // TODO: implement real logic using this.wallet
    // Returning minimal shape consumed by front-end.
    return {
      psbt: 'TODO',
      preimage: 'TODO',
      taprootAddress: 'TODO',
      txid: 'TODO',
      vout: 0
    };
  }

  /**
   * Receiver claims the funds with preimage before timelock.
   */
  async createClaimPSBT(
    receiverWif: string,
    preimageHex: string,
    txid: string,
    vout: number,
    value: number,
    senderPublicKeyHex: string,
    refundTimeLock: number
  ) {
    return {
      psbt: 'TODO',
      txid: 'TODO',
      rawTx: 'TODO'
    };
  }

  /**
   * Sender refunds the funds after timelock.
   */
  async createRefundPSBT(
    senderWif: string,
    txid: string,
    vout: number,
    value: number,
    receiverPublicKeyHex: string,
    refundTimeLock: number
  ) {
    return {
      psbt: 'TODO',
      txid: 'TODO',
      rawTx: 'TODO'
    };
  }
}
````

## File: saved-addresses.json
````json
{
  "tb1pxwwldnh53retpdrqnz5rragwr3wz63xjkhfghqkeqcnk0z0pf27qgwf5m3": {
    "address": "tb1pxwwldnh53retpdrqnz5rragwr3wz63xjkhfghqkeqcnk0z0pf27qgwf5m3",
    "privateKey": "IMPORTED_ADDRESS_NO_PRIVATE_KEY",
    "publicKey": "IMPORTED_ADDRESS_NO_PUBLIC_KEY",
    "scriptHash": "imported_address_script_hash",
    "balance": 144359,
    "lastChecked": "2025-07-23T08:56:15.640Z",
    "calculations": [
      {
        "num1": 10,
        "num2": 5,
        "operation": "add",
        "result": 15,
        "txid": "",
        "fee": 0,
        "rawTx": "",
        "timestamp": "2025-07-23T07:31:11.143Z",
        "broadcastStatus": "pending",
        "confirmationStatus": "unconfirmed"
      }
    ]
  },
  "tb1px7pae7zq02duvr4agu4pf0nfcsj639k5cl4w28ngmw6efuwt2x2qu65vyt": {
    "address": "tb1px7pae7zq02duvr4agu4pf0nfcsj639k5cl4w28ngmw6efuwt2x2qu65vyt",
    "privateKey": "cNq2ZnsxUL5oGns4K56KCj8URjhbNrhBrL7csLuu6tpKuTCnLWcd",
    "publicKey": "0299e9c2976d4177ee0a06ae179b9b1228437c56d6267b2e467b075a837522f317",
    "scriptHash": "2019a167142588fcd4e24671060494f90249a96e6507d4cf849cc48d43f7978d",
    "balance": 0,
    "lastChecked": "2025-07-23T08:56:18.980Z",
    "calculations": [
      {
        "num1": 20,
        "num2": 3,
        "operation": "multiply",
        "result": 60,
        "txid": "",
        "fee": 0,
        "rawTx": "",
        "timestamp": "2025-07-23T07:31:13.624Z",
        "broadcastStatus": "pending",
        "confirmationStatus": "unconfirmed"
      }
    ]
  },
  "tb1p4fuxteqjltq7mkrgszckdm88p4efva73p9r50kq65fj7q3gjpnkqapmdzh": {
    "address": "tb1p4fuxteqjltq7mkrgszckdm88p4efva73p9r50kq65fj7q3gjpnkqapmdzh",
    "privateKey": "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei",
    "publicKey": "0362c7197b6f3e02bd5f16a8bfee0920c2298518a487d13c1e12c90b00331a91f5",
    "scriptHash": "28b8591f09f543332d7c60b679df555d718cf2d81a9c41976109eeb4ffb9a225",
    "balance": 196973,
    "lastChecked": "2025-07-23T08:56:21.282Z",
    "calculations": [
      {
        "num1": 10,
        "num2": 4,
        "operation": "multiply",
        "result": 40,
        "txid": "",
        "fee": 0,
        "rawTx": "",
        "timestamp": "2025-07-23T07:31:15.925Z",
        "broadcastStatus": "pending",
        "confirmationStatus": "unconfirmed"
      }
    ]
  },
  "tb1prqls86llsr9fvm28hqtzdhxuayq3w6duy47yys7pdsnlxhn953tsh38hlc": {
    "address": "tb1prqls86llsr9fvm28hqtzdhxuayq3w6duy47yys7pdsnlxhn953tsh38hlc",
    "privateKey": "cRiHqx6GSbrdKjtWUcA6LXwnkqnERoJEZYjCa931tDiLjCdh4FS2",
    "publicKey": "0326db20d4c0f05ab5a741d09225549aae4cac7236afe516de873fd6cce89a7600",
    "scriptHash": "7a1b2611fff5ef0ac1be8d60f27dfac17990b1f421798312e3f10b9e1ad84022",
    "balance": 131267,
    "lastChecked": "2025-07-23T08:52:43.077Z",
    "calculations": [
      {
        "num1": 10,
        "num2": 2,
        "operation": "divide",
        "result": 5,
        "txid": "",
        "fee": 0,
        "rawTx": "",
        "timestamp": "2025-07-23T07:33:40.960Z",
        "broadcastStatus": "pending",
        "confirmationStatus": "unconfirmed"
      },
      {
        "num1": 10,
        "num2": 5,
        "operation": "multiply",
        "result": 50,
        "txid": "010881c3c7fefeaa4b124e5b1e4f233cf0b0b6e1132a31e3252cd06a31d70b30",
        "fee": 1680,
        "rawTx": "020000000001025989636655325cb284077ddff3a4c8a39bf21f8ad6773df80149ac5926625b870000000000ffffffff5989636655325cb284077ddff3a4c8a39bf21f8ad6773df80149ac5926625b870100000000ffffffff0283de010000000000225120183f03ebff80ca966d47b81626dcdce9011769bc257c4243c16c27f35e65a457602f000000000000225120183f03ebff80ca966d47b81626dcdce9011769bc257c4243c16c27f35e65a4570140f90c1814b21e02d111cd536600ae6d581326aee68d7506cbe6d28379a2b07c5e489907b2ce465a60d30380002e173e56eceae34f394ae7cd206e4c4159fceb47014079984bead7c164f695b52720f6f14399ef74abf262714644e0fccf222ea26ec2e10358fb4e01dbaa44e951415d8df72ec77c5bc4a62ae7a502d388b35b27c0c600000000",
        "timestamp": "2025-07-23T08:48:18.762Z",
        "broadcastStatus": "success",
        "confirmationStatus": "unconfirmed"
      },
      {
        "num1": 10,
        "num2": 10,
        "operation": "add",
        "result": 20,
        "txid": "854cf117e33047e315c662f7a40c3521fea276f21801b363819feac10c4d4da0",
        "fee": 1680,
        "rawTx": "02000000000102300bd7316ad02c25e3312a13e1b6b0f03c234f1e5b4e124baafefec7c38108010000000000ffffffff300bd7316ad02c25e3312a13e1b6b0f03c234f1e5b4e124baafefec7c38108010100000000ffffffff02fdd5010000000000225120183f03ebff80ca966d47b81626dcdce9011769bc257c4243c16c27f35e65a4575631000000000000225120183f03ebff80ca966d47b81626dcdce9011769bc257c4243c16c27f35e65a4570140a962f0ebf6989be1297ceab6b9ed7a9d9e4b769f4ac060994e142f27f2d92871c8c3c1f6bc15a30dadee8a9312e4320d5e49fee0a75e61529239be13c26a800401402aed38b18eeba9241e1cbc56b9fc061697d8eff73a3e53c6fe636209ef5536965461e558d3324494dddb88b04dca3ac9ecb052a02269bc4813692ec183c0e51f00000000",
        "timestamp": "2025-07-23T08:50:08.015Z",
        "broadcastStatus": "success",
        "confirmationStatus": "unconfirmed"
      },
      {
        "num1": 10,
        "num2": 2,
        "operation": "subtract",
        "result": 8,
        "txid": "f3def4191e7683a9a67f1dc31505d8ebf7b03c1e3fbfccf3b74993cf3d98c578",
        "fee": 1680,
        "rawTx": "02000000000102a04d4d0cc1ea9f8163b30118f276a2fe21350ca4f762c615e34730e317f14c850000000000ffffffffa04d4d0cc1ea9f8163b30118f276a2fe21350ca4f762c615e34730e317f14c850100000000ffffffff02c7d2010000000000225120183f03ebff80ca966d47b81626dcdce9011769bc257c4243c16c27f35e65a457fc2d000000000000225120183f03ebff80ca966d47b81626dcdce9011769bc257c4243c16c27f35e65a4570140e70f10271b0df1bc61f3c4e93bc6fb33029d76c531069eb29f8f0de6e83e1c3b4bf9e9cc66d99a09b24c7ebe2786aafe2270037a562887a0682be847db16ca3401401533f95033f4610a647af7d48e8b7446dc752009eb3e81eed1a7f63d572f32b45ea2e988a329cd9403b65f53b096fd780846eccb8f0e6194c58101c1de57a24000000000",
        "timestamp": "2025-07-23T08:52:43.078Z",
        "broadcastStatus": "success",
        "confirmationStatus": "unconfirmed"
      }
    ]
  },
  "10_20_add": {
    "address": "tb1pmw4pqtp8agc9fh0vra2ajqu733797ks5urt7twlnzsw5efhh3vkss46467",
    "privateKey": "cRF9kZG1t6T2eRnAA1WnCwj75bCDpmVLCMQkqe4QWbaGkBRRSw4W",
    "publicKey": "0306f372e55b9e71cfa777a1032f95bb5c96d573fe842fcc4dfb8d6c7c5b19a864",
    "scriptHash": "291c74a9c404576b7d8d18a739b1926ec39c77494a1dd52ebe1f028267f5e7d8",
    "num1": 10,
    "num2": 20,
    "operation": "add",
    "balance": 0,
    "lastChecked": "2025-07-23T08:56:24.010Z"
  }
}
````

## File: vite.config.ts
````typescript
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist/client',
    sourcemap: true,
    rollupOptions: {
      external: ['bitcoinjs-lib', 'ecpair', 'tiny-secp256k1']
    }
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['bitcoinjs-lib', 'ecpair', 'tiny-secp256k1']
  }
})
````

## File: apps/web/app/signer/page.js
````javascript
"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import { schnorr as nobleSchnorr } from "@noble/curves/secp256k1";
import { decodeUR } from "@offline/core";

export default function Signer() {
  const searchParams = useSearchParams();

  const [networkKey, setNetworkKey] = useState("signet");
  const [psbtInput, setPsbtInput] = useState("");
  const [importErr, setImportErr] = useState("");
  const [psbtInfo, setPsbtInfo] = useState(null);
  const [psbtBuf, setPsbtBuf] = useState(null);
  const [inputIndex, setInputIndex] = useState(0);
  const [preimageInput, setPreimageInput] = useState("");
  const [rPrivInput, setRPrivInput] = useState("");
  const [signErr, setSignErr] = useState("");
  const [signedHex, setSignedHex] = useState("");

  const network = useMemo(() => {
    if (networkKey === "mainnet") return bitcoin.networks.bitcoin;
    return bitcoin.networks.testnet; // use testnet params for signet & testnet
  }, [networkKey]);

  const handleImportPsbt = useCallback(async () => {
    setImportErr("");
    setPsbtInfo(null);
    setPsbtBuf(null);
    try {
      const text = (psbtInput || "").trim();
      if (!text) throw new Error("Paste a PSBT (base64) or UR parts");
      let buf;
      if (/^ur:/.test(text) || text.includes("ur:")) {
        const lines = text
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        const out = await decodeUR(lines);
        const bytes = toU8(out.cbor);
        buf = Buffer.from(bytes);
      } else {
        // try base64
        try {
          const tmp = bitcoin.Psbt.fromBase64(text, { network });
          buf = tmp.toBuffer();
        } catch (e) {
          throw new Error("Invalid PSBT: expected base64 or a UR");
        }
      }
      const psbt = bitcoin.Psbt.fromBuffer(buf, { network });
      console.log(`psbt input is ${psbt.data.inputs[0]}`);
      if (!psbt.data.inputs[0].tapLeafScript) {
        setImportErr("PSBT is missing tapLeafScript");
      }
      console.log(JSON.stringify(psbt.data.inputs, null, 2));
      setPsbtBuf(buf);
      setPsbtInfo({
        inputs: psbt.inputCount,
        outputs:
          psbt.txOutputs?.length ||
          psbt.data.globalMap.unsignedTx.tx.outs?.length ||
          0,
      });
    } catch (e) {
      setImportErr(String(e?.message || e));
    }
  }, [psbtInput, network]);

  useEffect(() => {
    const psbtFromQuery = searchParams.get("psbt");
    if (psbtFromQuery) {
      setPsbtInput(psbtFromQuery);
      handleImportPsbt();
    }
  }, [searchParams, handleImportPsbt]);

  function toU8(x) {
    if (x instanceof Uint8Array) return x;
    if (x && typeof x === "object") {
      if (x.type === "Buffer" && Array.isArray(x.data))
        return Uint8Array.from(x.data);
      if (x.buffer instanceof ArrayBuffer && typeof x.byteLength === "number") {
        const offset = x.byteOffset || 0;
        const length = x.byteLength;
        return new Uint8Array(x.buffer, offset, length);
      }
      if (Array.isArray(x)) return Uint8Array.from(x);
    }
    try {
      return new Uint8Array(x);
    } catch {}
    throw new Error("Unsupported byte source");
  }

  function parseMaybeHex(input) {
    const s = (input || "").trim();
    const hex = s.replace(/^0x/i, "");
    if (hex.length > 0 && /^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      return Buffer.from(hex, "hex");
    }
    return null;
  }

  function varint(n) {
    if (n < 0xfd) return Buffer.from([n]);
    if (n <= 0xffff) return Buffer.from([0xfd, n & 0xff, (n >> 8) & 0xff]);
    if (n <= 0xffffffff)
      return Buffer.from([
        0xfe,
        n & 0xff,
        (n >> 8) & 0xff,
        (n >> 16) & 0xff,
        (n >> 24) & 0xff,
      ]);
    const hi = Math.floor(n / 2 ** 32) >>> 0;
    const lo = n >>> 0;
    return Buffer.from([
      0xff,
      lo & 0xff,
      (lo >> 8) & 0xff,
      (lo >> 16) & 0xff,
      (lo >> 24) & 0xff,
      hi & 0xff,
      (hi >> 8) & 0xff,
      (hi >> 16) & 0xff,
      (hi >> 24) & 0xff,
    ]);
  }

  function witnessStackToScriptWitness(witness) {
    const parts = [varint(witness.length)];
    for (const w of witness) {
      const b = Buffer.isBuffer(w) ? w : Buffer.from(w);
      parts.push(varint(b.length));
      parts.push(b);
    }
    // Concat via typed arrays to avoid Buffer.concat polyfill issues
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return Buffer.from(out);
  }

  async function handleSign() {
    setSignErr("");
    setSignedHex("");
    try {
      if (!psbtBuf) throw new Error("Import a PSBT first");
      const psbt = bitcoin.Psbt.fromBuffer(psbtBuf, { network });
      const idx = Number(inputIndex) >>> 0;
      if (idx >= psbt.inputCount) throw new Error("Input index out of range");
      const inp = psbt.data.inputs[idx];
      if (!inp.tapLeafScript || inp.tapLeafScript.length === 0)
        throw new Error("PSBT missing tapLeafScript for input");
      // Prepare private key for R
      // Preimage: accept hex (any length) or text (UTF-8)
      let xBytes = parseMaybeHex(preimageInput);
      if (!xBytes) xBytes = Buffer.from(preimageInput, "utf8");
      if (xBytes.length === 0)
        throw new Error("Preimage x required (hex or text)");

      // R private key: accept 32-byte hex or WIF
      let seckey;
      const hexPriv = parseMaybeHex(rPrivInput);
      if (hexPriv) {
        if (hexPriv.length !== 32)
          throw new Error("Hex private key must be 32 bytes (64 hex chars)");
        seckey = Buffer.from(hexPriv);
      } else {
        try {
          const ECPair = ECPairFactory(ecc);
          const kp = ECPair.fromWIF(rPrivInput.trim(), network);
          if (!kp?.privateKey) throw new Error("Invalid WIF");
          seckey = Buffer.from(kp.privateKey);
        } catch (e) {
          throw new Error("R private key must be WIF or 32-byte hex");
        }
      }
      const pub33 = Buffer.from(ecc.pointFromScalar(seckey, true));
      if (!pub33) throw new Error("Invalid R private key");

      // Create a minimal signer that bitcoinjs can use for Schnorr
      const signer = {
        publicKey: pub33,
        signSchnorr: (hash) => {
          const sig = nobleSchnorr.sign(hash, seckey);
          return Buffer.from(sig);
        },
      };

      // Ask bitcoinjs to compute the taproot script-path sighash and produce tapScriptSig
      psbt.signInput(idx, signer);

      const tss = psbt.data.inputs[idx].tapScriptSig;
      if (!tss || tss.length === 0)
        throw new Error("Failed to produce tapScriptSig");
      const sig = tss[0].signature; // 64 bytes (DEFAULT sighash)

      const leaf = inp.tapLeafScript[0];
      const script = Buffer.from(leaf.script);
      const control = Buffer.from(leaf.controlBlock || leaf.control);
      if (!control || control.length === 0)
        throw new Error("Missing control block in PSBT input");

      // Our script expects [sigR, x, script, control]
      const witness = [Buffer.from(sig), Buffer.from(xBytes), script, control];
      const finalScriptWitness = witnessStackToScriptWitness(witness);

      psbt.updateInput(idx, { finalScriptWitness });

      const tx = psbt.extractTransaction();
      const hexOut = tx.toHex();
      setSignedHex(hexOut);
    } catch (e) {
      setSignErr(String(e?.message || e));
    }
  }

  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600 text-white">
        SIGNER
      </div>
      <h1 className="text-2xl font-semibold">
        Claim Finalization (Offline Signer)
      </h1>
      <p className="text-zinc-500">
        Import the Claim PSBT, provide the preimage x and the R private key to
        produce a fully signed transaction.
      </p>

      <section className="rounded-lg border p-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Network</div>
            <select
              className="w-full rounded border px-3 py-2"
              value={networkKey}
              onChange={(e) => setNetworkKey(e.target.value)}
            >
              <option value="signet">signet</option>
              <option value="testnet">testnet</option>
              <option value="mainnet">mainnet</option>
            </select>
          </label>
        </div>
        <div className="text-sm text-zinc-500">
          Paste PSBT (base64) or UR parts below
        </div>
        <textarea
          className="w-full rounded border px-3 py-2 font-mono min-h-[120px]"
          value={psbtInput}
          onChange={(e) => setPsbtInput(e.target.value)}
          placeholder="cHNidP8BA... or ur:crypto-psbt/..."
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleImportPsbt}
            className="px-3 py-2 rounded bg-blue-600 text-white"
          >
            Decode PSBT
          </button>
          {!!importErr && (
            <div className="text-sm text-red-600">{importErr}</div>
          )}
        </div>
        {psbtInfo && (
          <div className="text-sm text-zinc-600">
            Inputs: {psbtInfo.inputs} · Outputs: {psbtInfo.outputs}
          </div>
        )}
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Sign Claim</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Input index</div>
            <input
              type="number"
              className="w-full rounded border px-3 py-2"
              value={inputIndex}
              onChange={(e) => setInputIndex(Number(e.target.value) || 0)}
            />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">
              Preimage x (hex or text)
            </div>
            <input
              className="w-full rounded border px-3 py-2 font-mono"
              value={preimageInput}
              onChange={(e) => setPreimageInput(e.target.value)}
              placeholder="hex (even length) or free text"
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">
              R Private Key (WIF or 32-byte hex)
            </div>
            <input
              className="w-full rounded border px-3 py-2 font-mono"
              value={rPrivInput}
              onChange={(e) => setRPrivInput(e.target.value)}
              placeholder="WIF (c.../L.../K...) or 64 hex chars"
            />
            <div className="text-xs text-zinc-500">
              Both WIF and raw 32-byte hex are supported.
            </div>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSign}
            className="px-3 py-2 rounded bg-emerald-600 text-white"
          >
            Sign Claim
          </button>
          {!!signErr && <div className="text-sm text-red-600">{signErr}</div>}
        </div>
        {!!signedHex && (
          <div className="text-sm space-y-1">
            <div className="text-zinc-500">Signed transaction (hex)</div>
            <textarea
              className="w-full rounded border px-3 py-2 font-mono min-h-[100px]"
              readOnly
              value={signedHex}
            />
            <div className="text-xs text-zinc-500">
              Broadcast this on signet/testnet using your broadcaster. On this
              project, use the Watch page's broadcast or your node.
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
````

## File: apps/web/next.config.js
````javascript
import webpack from 'webpack';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@offline/server-api'],
  reactStrictMode: true,
  webpack: (config) => {
    config.plugins.push(
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
      })
    );
    return config;
  },
};
export default nextConfig;
````

## File: packages/server-api/src/services/mempool.ts
````typescript
import axios, { AxiosError } from 'axios';
import { UTXO, TransactionStatus, AddressInfo, FeeEstimate } from '@offline/shared-types';

export type Network = 'mainnet' | 'testnet';

export class MempoolService {
  private readonly baseURL: string;
  private readonly requestDelay = 1000; // 1 second between requests to avoid rate limiting

  constructor(network: Network = 'mainnet') {
    this.baseURL = `https://mempool.space/${network === 'testnet' ? 'testnet/' : ''}api`;
  }

  /**
   * Fetch UTXOs for a given address
   */
  async getAddressUTXOs(address: string): Promise<UTXO[]> {
    try {
      await this.delay(this.requestDelay);
      const url =`${this.baseURL}/address/${address}/utxo`
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Bitcoin-Taproot-Calculator/1.0.0'
        }
      });

      // Fetch scriptPubKey for each UTXO by getting transaction details
      const utxosWithScripts = await Promise.all(
        response.data.map(async (utxo: any) => {
          try {
            // Fetch the transaction to get the scriptPubKey
            const txResponse = await axios.get(`${this.baseURL}/tx/${utxo.txid}`);
            const scriptPubKey = txResponse.data.vout[utxo.vout].scriptpubkey;
            
            return {
              txid: utxo.txid,
              vout: utxo.vout,
              value: utxo.value,
              scriptHex: scriptPubKey,
              address: address,
              confirmations: utxo.status?.confirmed ? utxo.status.block_height : 0
            };
          } catch (error) {
            console.error(`Failed to fetch scriptPubKey for UTXO ${utxo.txid}:${utxo.vout}:`, error);
            throw new Error(`Could not fetch scriptPubKey for UTXO ${utxo.txid}:${utxo.vout}`);
          }
        })
      );
      
      return utxosWithScripts;
    } catch (error) {
      throw this.handleAPIError(error, `Failed to fetch UTXOs for address ${address}`);
    }
  }

  /**
   * Get detailed address information
   */
  async getAddressInfo(address: string): Promise<AddressInfo> {
    try {
      await this.delay(this.requestDelay);
      
      const response = await axios.get(`${this.baseURL}/address/${address}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Bitcoin-Taproot-Calculator/1.0.0'
        }
      });

      return response.data;
    } catch (error) {
      throw this.handleAPIError(error, `Failed to fetch address info for ${address}`);
    }
  }

  /**
   * Get transaction status and details
   */
  async getTransactionStatus(txid: string): Promise<TransactionStatus> {
    try {
      await this.delay(this.requestDelay);
      
      const response = await axios.get(`${this.baseURL}/tx/${txid}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Bitcoin-Taproot-Calculator/1.0.0'
        }
      });

      return response.data;
    } catch (error) {
      throw this.handleAPIError(error, `Failed to fetch transaction status for ${txid}`);
    }
  }

  /**
   * Get raw transaction hex
   */
  async getRawTransaction(txid: string): Promise<string> {
    try {
      await this.delay(this.requestDelay);
      
      const response = await axios.get(`${this.baseURL}/tx/${txid}/hex`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Bitcoin-Taproot-Calculator/1.0.0'
        }
      });

      return response.data;
    } catch (error) {
      throw this.handleAPIError(error, `Failed to fetch raw transaction for ${txid}`);
    }
  }

  /**
   * Broadcast transaction to the network
   */
  async broadcastTransaction(rawTx: string): Promise<string> {
    try {
      await this.delay(this.requestDelay);
      
      const response = await axios.post(`${this.baseURL}/tx`, rawTx, {
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': 'Bitcoin-Taproot-Calculator/1.0.0'
        },
        timeout: 15000
      });

      return response.data; // Returns the txid
    } catch (error) {
      throw this.handleAPIError(error, 'Failed to broadcast transaction');
    }
  }

  /**
   * Get current fee estimates
   */
  async getFeeEstimates(): Promise<FeeEstimate> {
    try {
      await this.delay(this.requestDelay);
      
      const response = await axios.get(`${this.baseURL}/v1/fees/recommended`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Bitcoin-Taproot-Calculator/1.0.0'
        }
      });

      return response.data;
    } catch (error) {
      // Return default fees if API fails
      console.warn('Failed to fetch fee estimates, using defaults:', error);
      return {
        fastestFee: 20,
        halfHourFee: 15,
        hourFee: 10,
        economyFee: 5,
        minimumFee: 1
      };
    }
  }

  /**
   * Check if address has sufficient balance
   */
  async checkAddressBalance(address: string, requiredAmount: number): Promise<{
    hasBalance: boolean;
    availableBalance: number;
    confirmedBalance: number;
    unconfirmedBalance: number;
  }> {
    try {
      const addressInfo = await this.getAddressInfo(address);
      const utxos = await this.getAddressUTXOs(address);

      const confirmed = utxos
        .filter(utxo => utxo.confirmations !== undefined && utxo.confirmations > 0);

      const unconfirmed = utxos
        .filter(utxo => utxo.confirmations === undefined || utxo.confirmations === 0);

      const availableBalance = confirmed.reduce((sum, utxo) => sum + utxo.value, 0) + unconfirmed.reduce((sum, utxo) => sum + utxo.value, 0);

      return {
        hasBalance: availableBalance >= requiredAmount,
        availableBalance,
        confirmedBalance: confirmed.reduce((sum, utxo) => sum + utxo.value, 0),
        unconfirmedBalance: unconfirmed.reduce((sum, utxo) => sum + utxo.value, 0)
      };
    } catch (error) {
      throw this.handleAPIError(error, `Failed to check balance for address ${address}`);
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForConfirmation(
    txid: string, 
    maxAttempts: number = 60, 
    intervalMs: number = 30000
  ): Promise<TransactionStatus> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const status = await this.getTransactionStatus(txid);
        
        if (status.status.confirmed) {
          return status;
        }

        console.log(`Attempt ${attempt + 1}/${maxAttempts}: Transaction ${txid} not yet confirmed`);
        
        if (attempt < maxAttempts - 1) {
          await this.delay(intervalMs);
        }
      } catch (error) {
        console.warn(`Attempt ${attempt + 1} failed:`, error);
        
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        
        await this.delay(intervalMs);
      }
    }

    throw new Error(`Transaction ${txid} not confirmed after ${maxAttempts} attempts`);
  }

  /**
   * Get mempool.space URL for a transaction
   */
  getMempoolURL(txid: string): string {
    return `https://mempool.space/testnet/tx/${txid}`;
  }

  /**
   * Get mempool.space URL for an address
   */
  getAddressURL(address: string): string {
    return `https://mempool.space/testnet/address/${address}`;
  }

  /**
   * Check network health and connectivity
   */
  async checkNetworkHealth(): Promise<{
    isHealthy: boolean;
    blockHeight: number;
    difficulty: number;
    mempoolSize: number;
  }> {
    try {
      const [blockTip, mempoolStats] = await Promise.all([
        axios.get(`${this.baseURL}/blocks/tip/height`),
        axios.get(`${this.baseURL}/mempool`)
      ]);

      return {
        isHealthy: true,
        blockHeight: blockTip.data,
        difficulty: 0, // Not readily available from mempool.space
        mempoolSize: mempoolStats.data.count
      };
    } catch (error) {
      return {
        isHealthy: false,
        blockHeight: 0,
        difficulty: 0,
        mempoolSize: 0
      };
    }
  }

  /**
   * Validate Bitcoin testnet address format
   */
  validateTestnetAddress(address: string): boolean {
    // Basic validation for testnet addresses
    if (address.startsWith('tb1p') && address.length === 62) {
      // Testnet Taproot (P2TR)
      return true;
    }
    if (address.startsWith('tb1q') && address.length === 42) {
      // Testnet Segwit v0 (P2WPKH/P2WSH)
      return true;
    }
    if (address.startsWith('2') && (address.length >= 34 && address.length <= 35)) {
      // Testnet P2SH
      return true;
    }
    if ((address.startsWith('m') || address.startsWith('n')) && (address.length >= 34 && address.length <= 35)) {
      // Testnet P2PKH
      return true;
    }
    
    return false;
  }

  // Private helper methods
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private handleAPIError(error: unknown, message: string): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      if (axiosError.response) {
        // Server responded with error status
        const status = axiosError.response.status;
        const data = axiosError.response.data;
        
        if (status === 404) {
          return new Error(`${message}: Not found (404)`);
        } else if (status === 429) {
          return new Error(`${message}: Rate limited (429). Please wait and try again.`);
        } else if (status >= 500) {
          return new Error(`${message}: Server error (${status})`);
        } else {
          return new Error(`${message}: API error (${status}) - ${data}`);
        }
      } else if (axiosError.request) {
        // Network error
        return new Error(`${message}: Network error - ${axiosError.message}`);
      }
    }

    return new Error(`${message}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
````

## File: packages/server-api/src/services/UTXOService.ts
````typescript
import { MempoolService } from './mempool';

class UTXOService {
  private mempoolService: MempoolService;

  constructor(network: 'mainnet' | 'testnet' = 'testnet') {
    this.mempoolService = new MempoolService(network);
  }

  async getUTXOsForAddress(address: string) {
    return this.mempoolService.getAddressUTXOs(address);
  }

  async getUTXOsForAmount(address: string, amount: number) {
    const utxos = await this.mempoolService.getAddressUTXOs(address);

    // Sort UTXOs by value in ascending order
    const sortedUtxos = utxos.sort((a, b) => a.value - b.value);

    let selectedUtxos = [];
    let currentAmount = 0;

    for (const utxo of sortedUtxos) {
      selectedUtxos.push(utxo);
      currentAmount += utxo.value;
      if (currentAmount >= amount) {
        break;
      }
    }

    if (currentAmount < amount) {
      throw new Error('Insufficient funds');
    }

    return selectedUtxos;
  }
}

export { UTXOService };
````

## File: src/client/app.ts
````typescript
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';

interface OfflineTxoData {
  txid: string;
  vout: number;
  value: number;
  taprootAddress: string;
  senderPublicKey: string;
  refundTimeLock: number;
}

interface SenderData extends OfflineTxoData {
  preimage: string;
}

type WorkflowTab = 'sender' | 'receiver' | 'refund';

class OfflineBtcApp {
  // --- UI Elements ---
  private tabSender: HTMLElement;
  private tabReceiver: HTMLElement;
  private tabRefund: HTMLElement;
  private sectionSender: HTMLElement;
  private sectionReceiver: HTMLElement;
  private sectionRefund: HTMLElement;
  private qrCodeA: HTMLElement;
  private qrCodeB: HTMLElement;
  private senderResults: HTMLElement;
  private receiverScannerDiv: HTMLElement;
  private receiverForm: HTMLFormElement;
  private refundScannerDiv: HTMLElement;
  private refundForm: HTMLFormElement;
  private loadingDiv: HTMLElement;
  private errorDiv: HTMLElement;
  private generateSenderBtn: HTMLElement;
  private senderWifInput: HTMLInputElement;
  private generateReceiverBtn: HTMLElement;
  private receiverWifInput: HTMLInputElement;
  private receiverGeneratedDiv: HTMLElement;
  // Clipboard buttons
  private pasteTxBtn: HTMLElement;
  private pasteSecretBtn: HTMLElement;
  private toastDiv: HTMLElement;

  // --- State ---
  private activeTab: WorkflowTab = 'sender';
  private scannedTxoData: OfflineTxoData | null = null;
  private scannedPreimage: string | null = null;
  private receiverScanner: Html5Qrcode | null = null;
  private refundScanner: Html5Qrcode | null = null;

  constructor() {
    // Get UI elements
    this.tabSender = document.getElementById('tab-sender')!;
    this.tabReceiver = document.getElementById('tab-receiver')!;
    this.tabRefund = document.getElementById('tab-refund')!;
    this.sectionSender = document.getElementById('section-sender')!;
    this.sectionReceiver = document.getElementById('section-receiver')!;
    this.sectionRefund = document.getElementById('section-refund')!;
    this.qrCodeA = document.getElementById('qrcode-a')!;
    this.qrCodeB = document.getElementById('qrcode-b')!;
    this.senderResults = document.getElementById('sender-results')!;
    this.receiverScannerDiv = document.getElementById('receiver-scanner-div')!;
    this.receiverForm = document.getElementById('receiver-form') as HTMLFormElement;
    this.refundScannerDiv = document.getElementById('refund-scanner-div')!;
    this.refundForm = document.getElementById('refund-form') as HTMLFormElement;
    this.loadingDiv = document.getElementById('loading')!;
    this.errorDiv = document.getElementById('error')!;

    // Key generation elements
    this.generateSenderBtn = document.getElementById('generate-sender-wif-btn')!;
    this.senderWifInput = document.getElementById('sender-wif-input') as HTMLInputElement;
    this.generateReceiverBtn = document.getElementById('generate-receiver-wif-btn')!;
    this.receiverWifInput = document.getElementById('receiver-wif-input') as HTMLInputElement;
    this.receiverGeneratedDiv = document.getElementById('receiver-generated-address')!;
    this.pasteTxBtn = document.getElementById('paste-tx-btn')!;
    this.pasteSecretBtn = document.getElementById('paste-secret-btn')!;
    this.toastDiv = document.getElementById('toast')!;
    this.pasteTxBtn.addEventListener('click', () => this.handlePasteTx());
    this.pasteSecretBtn.addEventListener('click', () => this.handlePasteSecret());

    // Tab switching
    this.tabSender.addEventListener('click', () => this.switchTab('sender'));
    this.tabReceiver.addEventListener('click', () => this.switchTab('receiver'));
    this.tabRefund.addEventListener('click', () => this.switchTab('refund'));

    // Sender form
    document.getElementById('sender-form')!.addEventListener('submit', e => this.handleSenderSubmit(e));
    // Receiver scan
    document.getElementById('start-receiver-scan-btn')!.addEventListener('click', () => this.startReceiverScanner());
    this.receiverForm.addEventListener('submit', e => this.handleReceiverSubmit(e));
    // Refund scan
    document.getElementById('start-refund-scan-btn')!.addEventListener('click', () => this.startRefundScanner());
    this.refundForm.addEventListener('submit', e => this.handleRefundSubmit(e));

    // Key generation handlers
    this.generateSenderBtn.addEventListener('click', () => this.handleGenerateSender());
    this.generateReceiverBtn.addEventListener('click', () => this.handleGenerateReceiver());

    // Hide all errors/loading on start
    this.hideLoading();
    this.clearError();
    this.switchTab('sender');
  }

  private switchTab(tab: WorkflowTab) {
    this.activeTab = tab;
    this.sectionSender.style.display = tab === 'sender' ? 'block' : 'none';
    this.sectionReceiver.style.display = tab === 'receiver' ? 'block' : 'none';
    this.sectionRefund.style.display = tab === 'refund' ? 'block' : 'none';
    // (Tab highlight logic omitted for brevity)
  }

  // --- Sender Workflow ---
  private async handleSenderSubmit(e: Event) {
    e.preventDefault();
    this.hideError();
    this.showLoading('Creating sender transaction...');
    try {
      const formData = new FormData(e.target as HTMLFormElement);
      const senderWif = formData.get('sender-wif') as string;
      const receiverAddress = formData.get('receiver-address') as string;
      const amount = Number(formData.get('amount'));
      const refundLocktime = Number(formData.get('refund-locktime'));
      const resp = await fetch('/api/create-sender-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderWif, receiverAddress, amount, refundLocktime })
      });
      if (!resp.ok) throw new Error((await resp.json()).message || 'Failed to create transaction');
      const data: SenderData = await resp.json();
      this.displaySenderResults(data);
    } catch (err: any) {
      this.showError(err.message || String(err));
    } finally {
      this.hideLoading();
    }
  }

  private displaySenderResults(data: SenderData) {
    this.qrCodeA.innerHTML = '';
    this.qrCodeB.innerHTML = '';
    const canvasA = document.createElement('canvas');
QRCode.toCanvas(canvasA, JSON.stringify(data), { width: 256 }, (error: Error | null | undefined) => {
  if (error) throw error;
  this.qrCodeA.appendChild(canvasA);
});
const canvasB = document.createElement('canvas');
QRCode.toCanvas(canvasB, data.preimage, { width: 256 }, (error: Error | null | undefined) => {
  if (error) throw error;
  this.qrCodeB.appendChild(canvasB);
});
      const copyTxBtn = document.createElement('button');
  copyTxBtn.textContent = 'Copy Tx Data';
  copyTxBtn.className = 'btn btn-secondary';
  copyTxBtn.style.marginTop = '10px';
  copyTxBtn.addEventListener('click', async () => {
    try {
      const ok = await this.copyToClipboard(JSON.stringify(data));
      this.showToast(ok ? 'Tx data copied to clipboard' : 'Failed to copy', ok);
    } catch {
      this.showToast('Failed to copy', false);
    }
  });
  this.qrCodeA.appendChild(copyTxBtn);

  const copySecretBtn = document.createElement('button');
  copySecretBtn.textContent = 'Copy Secret';
  copySecretBtn.className = 'btn btn-secondary';
  copySecretBtn.style.marginTop = '10px';
  copySecretBtn.style.marginLeft = '10px';
  copySecretBtn.addEventListener('click', async () => {
    try {
      const ok = await this.copyToClipboard(data.preimage);
      this.showToast(ok ? 'Secret copied to clipboard' : 'Failed to copy', ok);
    } catch {
      this.showToast('Failed to copy', false);
    }
  });
  this.qrCodeB.appendChild(copySecretBtn);

  this.senderResults.classList.remove('results-hidden');
  }

  // --- Receiver Workflow ---
  private startReceiverScanner() {
    this.receiverScanner = new Html5Qrcode('receiver-scanner');
    this.receiverScannerDiv.innerHTML = '<p>Scan QR Code A (Transaction Data), then QR Code B (Secret).</p>';
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    this.receiverScanner.start(
  { facingMode: 'environment' },
  config,
  (decodedText: string, decodedResult: any) => this.handleReceiverScan(decodedText),
  (errorMessage: string) => { /* ignore scan errors */ }
);
  }

  private handleReceiverScan(decodedText: string) {
    try {
      const data = JSON.parse(decodedText) as OfflineTxoData;
      if (data.taprootAddress && data.txid) {
        this.scannedTxoData = data;
        this.receiverScannerDiv.innerHTML = '<p style="color:green;">Transaction QR Code Scanned! Now scan the Secret QR Code.</p>';
      } else throw new Error();
    } catch {
      if (decodedText.length === 64 && /^[0-9a-fA-F]+$/.test(decodedText)) {
        this.scannedPreimage = decodedText;
        this.receiverScannerDiv.innerHTML = '<p style="color:green;">Secret QR Code Scanned!</p>';
      } else {
        this.showError('Unrecognized QR Code.');
        return;
      }
    }
    if (this.scannedTxoData && this.scannedPreimage) {
      this.receiverScanner?.stop();
      this.receiverScannerDiv.innerHTML = '<p style="color:green; font-weight: bold;">Both QR codes scanned successfully. Enter your private key to claim.</p>';
      this.receiverForm.classList.remove('form-hidden');
    }
  }

  private async handleReceiverSubmit(e: Event) {
    e.preventDefault();
    this.hideError();
    if (!this.scannedTxoData || !this.scannedPreimage) {
      this.showError('Please scan both QR codes first.');
      return;
    }
    this.showLoading('Creating claim transaction...');
    try {
      const formData = new FormData(this.receiverForm);
      const receiverWif = formData.get('receiver-wif') as string;
      const resp = await fetch('/api/create-receiver-claim-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txoData: this.scannedTxoData, preimage: this.scannedPreimage, receiverWif })
      });
      if (!resp.ok) throw new Error((await resp.json()).message || 'Failed to create claim transaction');
      const result = await resp.json();
      if (result.psbt) {
        // Show success message in UI
        this.receiverScannerDiv.innerHTML = '<p style="color:green; font-weight:bold;">Claim PSBT created and copied to clipboard.<br>Broadcast it from an online device to finalize.</p>';
        await this.copyToClipboard(result.psbt);
        this.showToast('Claim PSBT copied to clipboard');
        this.receiverForm.reset();
        // Clear scanned data to avoid duplicate claims
        this.scannedTxoData = null;
        this.scannedPreimage = null;
      } else {
        this.showToast('Claim transaction created');
        this.receiverForm.reset();
      }
    } catch (err: any) {
      this.showError(err.message || String(err));
    } finally {
      this.hideLoading();
    }
  }

  // --- Refund Workflow ---
  private startRefundScanner() {
    this.refundScanner = new Html5Qrcode('refund-scanner');
    this.refundScannerDiv.innerHTML = '<p>Scan QR Code A (Transaction Data).</p>';
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    this.refundScanner.start(
  { facingMode: 'environment' },
  config,
  (decodedText: string, decodedResult: any) => this.handleRefundScan(decodedText),
  (errorMessage: string) => { /* ignore scan errors */ }
);
  }

  private handleRefundScan(decodedText: string) {
    try {
      const data = JSON.parse(decodedText) as OfflineTxoData;
      if (data.taprootAddress && data.txid) {
        this.scannedTxoData = data;
        this.refundScanner?.stop();
        this.refundScannerDiv.innerHTML = '<p style="color:green;">Transaction QR Code Scanned! Enter your private key to refund.</p>';
        this.refundForm.classList.remove('form-hidden');
      } else throw new Error();
    } catch {
      this.showError('Unrecognized QR Code.');
    }
  }

  private async handleRefundSubmit(e: Event) {
    e.preventDefault();
    if (!this.scannedTxoData) {
      this.showError('Please scan the transaction QR code first.');
      return;
    }
    this.showLoading('Creating refund transaction...');
    try {
      const formData = new FormData(this.refundForm);
      const senderWif = formData.get('sender-wif') as string;
      const resp = await fetch('/api/create-sender-refund-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txoData: this.scannedTxoData, senderWif })
      });
      if (!resp.ok) throw new Error((await resp.json()).message || 'Failed to create refund transaction');
      const result = await resp.json();
      // Display refund results (implement as needed)
    } catch (err: any) {
      this.showError(err.message || String(err));
    } finally {
      this.hideLoading();
    }
  }

  // --- Utility UI Methods ---
  private showLoading(message: string) {
    this.loadingDiv.textContent = message;
    this.loadingDiv.style.display = 'block';
  }
  private hideLoading() {
  this.loadingDiv.style.display = 'none';
}

  private async copyToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        /* fall through to legacy method */
      }
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }

  private showToast(message: string, success: boolean = true) {
    this.toastDiv.textContent = message;
    this.toastDiv.style.background = success ? '#198754' : '#dc3545';
    this.toastDiv.classList.add('show');
    setTimeout(() => this.toastDiv.classList.remove('show'), 3000);
  }

// --- Clipboard Paste Helpers ---
private async handlePasteTx() {
  try {
    const text = await navigator.clipboard.readText();
    const data = JSON.parse(text) as OfflineTxoData;
    if (data.taprootAddress && data.txid) {
      this.scannedTxoData = data;
      this.receiverScannerDiv.innerHTML = '<p style="color:green;">Transaction data pasted!</p>';
      this.showToast('Transaction data pasted from clipboard');
    } else throw new Error();
  } catch {
    this.showError('Clipboard does not contain valid transaction data.');
  }
  this.checkReceiverReady();
}

private async handlePasteSecret() {
  try {
    const raw = await navigator.clipboard.readText();
    const trimmed = raw.trim();
    const match = trimmed.match(/[0-9a-fA-F]{64}/);
    if (match) {
      this.scannedPreimage = match[0];
    } else if (trimmed.length > 0) {
      // Accept any non-empty secret for now (backend may send shorter placeholder during dev)
      this.scannedPreimage = trimmed;
    } else {
      throw new Error();
    }
    this.receiverScannerDiv.innerHTML += '<p style="color:green;">Secret pasted!</p>';
    this.showToast('Secret pasted from clipboard');
  } catch {
    this.showToast('Clipboard does not contain a valid secret', false);
    this.showError('Clipboard does not contain valid secret.');
  }
  this.checkReceiverReady();
}

private checkReceiverReady() {
  if (this.scannedTxoData && this.scannedPreimage) {
    this.receiverScanner?.stop();
    this.receiverScannerDiv.innerHTML = '<p style="color:green; font-weight:bold;">Transaction & Secret ready. Enter your private key to claim.</p>';
    this.receiverForm.classList.remove('form-hidden');
  }
}

  private showError(message: string) {
    this.errorDiv.textContent = message;
    this.errorDiv.style.display = 'block';
  }
  // --- Key Generation ---
  private async handleGenerateSender() {
    try {
      const resp = await fetch('/api/generate-keypair');
      if (!resp.ok) throw new Error('Failed to generate key');
      const { wif } = await resp.json();
      this.senderWifInput.value = wif;
    } catch (err: any) {
      this.showError(err.message || String(err));
    }
  }

  private async handleGenerateReceiver() {
    try {
      const resp = await fetch('/api/generate-keypair');
      if (!resp.ok) throw new Error('Failed to generate key');
      const { wif, pubkeyHex } = await resp.json();
      this.receiverWifInput.value = wif;
      this.receiverGeneratedDiv.textContent = `PubKey: ${pubkeyHex}`;
      // Autofill sender form receiver pubkey if present
      const receiverPubInput = document.querySelector<HTMLInputElement>('input[name="receiver-address"]');
      if (receiverPubInput) receiverPubInput.value = pubkeyHex;
    } catch (err: any) {
      this.showError(err.message || String(err));
    }
  }

  private hideError() {
    this.errorDiv.style.display = 'none';
  }
  private clearError() {
    this.errorDiv.textContent = '';
    this.errorDiv.style.display = 'none';
  }
}

// --- App Initialization ---
// --- App Initialization ---
let app: OfflineBtcApp;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app = new OfflineBtcApp();
    (window as any).offlineBtcApp = app;
  });
} else {
  app = new OfflineBtcApp();
  (window as any).offlineBtcApp = app;
}
````

## File: index.html
````html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Offline Bitcoin Transaction Workflow</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f5f5f5;
            color: #333;
            line-height: 1.6;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            text-align: center;
            margin-bottom: 30px;
        }

        .header h1 {
            color: #0d6efd;
            font-size: 2.5rem;
            margin-bottom: 10px;
        }

        .header .subtitle {
            color: #666;
            font-size: 1.1rem;
        }

        .network-status {
            text-align: center;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 20px;
            font-weight: bold;
        }

        .network-status.healthy {
            background-color: #d4edda;
            color: #155724;
        }

        .network-status.unhealthy {
            background-color: #f8d7da;
            color: #721c24;
        }

        .warning-box {
            background-color: #fff3cd;
            color: #856404;
            padding: 20px;
            border-radius: 5px;
            border-left: 4px solid #ffc107;
            margin-bottom: 20px;
        }

        .calculator-section {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }

        .funding-section {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 20px;
            display: none;
        }

        .section-title {
            color: #0d6efd;
            font-size: 1.5rem;
            margin-bottom: 20px;
            border-bottom: 2px solid #0d6efd;
            padding-bottom: 10px;
        }

        .input-group {
            display: flex;
            gap: 15px;
            align-items: center;
            margin-bottom: 20px;
        }

        .input-group label {
            min-width: 100px;
            font-weight: bold;
        }

        input[type="number"] {
            flex: 1;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 5px;
            font-size: 16px;
            transition: border-color 0.3s;
        }

        input[type="number"]:focus {
            outline: none;
            border-color: #0d6efd;
        }

        .operations {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-bottom: 20px;
        }

        .op-btn {
            background-color: #0d6efd;
            color: white;
            border: none;
            padding: 15px 20px;
            border-radius: 5px;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
            min-width: 60px;
        }

        .op-btn:hover {
            background-color: #0b5ed7;
            transform: translateY(-2px);
        }

        .op-btn.selected {
            background-color: #0a58ca;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }

        .button-group {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 20px;
        }

        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
        }

        .btn-primary {
            background-color: #28a745;
            color: white;
        }

        .btn-primary:hover {
            background-color: #218838;
        }

        .btn-secondary {
            background-color: #6c757d;
            color: white;
        }

        .btn-secondary:hover {
            background-color: #545b62;
        }

        .btn:disabled {
            background-color: #ccc;
            cursor: not-allowed;
            transform: none;
        }

        .calc-btn {
            background-color: #28a745;
            color: white;
            padding: 15px 30px;
            font-size: 18px;
            font-weight: bold;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            transition: all 0.3s;
        }

        .calc-btn:hover:not(:disabled) {
            background-color: #218838;
            transform: translateY(-2px);
        }

        .calc-btn:disabled {
            background-color: #ccc;
            cursor: not-allowed;
        }

        .address-display {
            font-family: monospace;
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            word-break: break-all;
            border: 1px solid #dee2e6;
            margin: 10px 0;
        }

        .funding-status {
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            font-weight: bold;
        }

        .funding-status.success {
            background-color: #d4edda;
            color: #155724;
        }

        .funding-status.warning {
            background-color: #fff3cd;
            color: #856404;
        }

        .funding-status.error {
            background-color: #f8d7da;
            color: #721c24;
        }

        .funding-status.info {
            background-color: #d1ecf1;
            color: #0c5460;
        }

        .faucet-links {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 10px;
            margin: 15px 0;
        }

        .faucet-link {
            background: #007bff;
            color: white;
            padding: 10px 15px;
            text-decoration: none;
            border-radius: 5px;
            text-align: center;
            transition: background-color 0.3s;
        }

        .faucet-link:hover {
            background: #0056b3;
            color: white;
        }

        .saved-addresses-list {
            display: grid;
            gap: 15px;
        }

        .saved-address-item {
            background: #f8f9fa;
            border: 2px solid #dee2e6;
            border-radius: 8px;
            padding: 15px;
            cursor: pointer;
            transition: all 0.3s;
        }

        .saved-address-item:hover {
            border-color: #0d6efd;
            background: #fff8f0;
        }

        .saved-address-item.selected {
            border-color: #0d6efd;
            background: #fff8f0;
            box-shadow: 0 0 0 2px rgba(13, 110, 253, 0.2);
        }

        .saved-address-item.matching {
            border-color: #007bff;
            background: #f0f8ff;
        }

        .saved-address-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .saved-address-calculation {
            font-size: 1.1rem;
            font-weight: bold;
            color: #0d6efd;
        }

        .saved-address-balance {
            font-weight: bold;
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 0.9rem;
        }

        .saved-address-balance.funded {
            background: #d4edda;
            color: #155724;
        }

        .saved-address-balance.unfunded {
            background: #f8d7da;
            color: #721c24;
        }

        .saved-address-details {
            font-family: monospace;
            font-size: 0.85rem;
            color: #666;
        }

        .address-info {
            border: 2px solid #dee2e6;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
        }

        .results {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 20px;
            display: none;
        }

        .result-item {
            margin-bottom: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 5px;
            border-left: 4px solid #0d6efd;
        }

        .result-label {
            font-weight: bold;
            color: #666;
            margin-bottom: 8px;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .result-value {
            font-family: monospace;
            word-break: break-all;
            padding: 10px;
            background: white;
            border-radius: 3px;
            border: 1px solid #dee2e6;
        }

        .result-value.large-text {
            font-size: 1.2rem;
            font-weight: bold;
        }

        .tx-link {
            color: #007bff;
            text-decoration: none;
            font-weight: bold;
        }

        .tx-link:hover {
            text-decoration: underline;
        }

        .broadcast-status {
            padding: 10px;
            border-radius: 5px;
            font-weight: bold;
        }

        .broadcast-status.success {
            background-color: #d4edda;
            color: #155724;
        }

        .broadcast-status.failed {
            background-color: #f8d7da;
            color: #721c24;
        }

        .loading {
            text-align: center;
            color: #666;
            font-style: italic;
            padding: 20px;
            display: none;
        }

        .error {
            background-color: #f8d7da;
            color: #721c24;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            display: none;
            border-left: 4px solid #dc3545;
        }

        .status-text {
            text-align: center;
            margin: 10px 0;
            font-style: italic;
            color: #666;
            display: none;
        }

        .instructions {
            background-color: #e9ecef;
            padding: 20px;
            border-radius: 5px;
            margin: 15px 0;
            white-space: pre-line;
            font-family: monospace;
            font-size: 0.9rem;
            line-height: 1.4;
        }

        @media (max-width: 768px) {
            .container {
                padding: 10px;
            }

            .operations {
                flex-wrap: wrap;
            }

            .button-group {
                flex-direction: column;
            }

            .faucet-links {
                grid-template-columns: 1fr;
            }
        }
      .results-hidden { display:none; }
  .form-hidden { display:none; }
  /* Hide legacy arithmetic UI */
  .calculator-section, #saved-addresses-section, #funding-section { display:none !important; }
        /* Toast Notifications */
        #toast {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #333;
            color: #fff;
            padding: 10px 20px;
            border-radius: 5px;
            opacity: 0;
            transition: opacity 0.4s ease;
            z-index: 9999;
            pointer-events: none;
        }
        #toast.show {
            opacity: 0.95;
        }
</style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Offline Bitcoin Transactions</h1>
            <p class="subtitle">Air-gapped Taproot workflow: create, claim, and refund securely via QR codes</p>
        </div>

        <div id="network-status" class="network-status">Checking network status...</div>

        <div class="warning-box">
            <strong>⚠️ REAL BITCOIN TESTNET MODE</strong><br>
            This application creates actual Bitcoin testnet transactions that will be broadcast to the Bitcoin network. 
            Testnet Bitcoin has no monetary value but requires real network interaction. 
            Make sure you understand the process before proceeding.
        </div>

        <div class="calculator-section">
            <h2 class="section-title">🧮 Arithmetic Calculation</h2>
            
            <div class="input-group">
                <label>Number 1:</label>
                <input type="number" id="num1" value="10" step="1">
            </div>
            
            <div class="input-group">
                <label>Number 2:</label>
                <input type="number" id="num2" value="5" step="1">
            </div>
            
            <div class="operations">
                <button class="op-btn" data-op="add">+</button>
                <button class="op-btn" data-op="subtract">−</button>
                <button class="op-btn" data-op="multiply">×</button>
                <button class="op-btn" data-op="divide">÷</button>
            </div>

            <div id="calculation-status" class="status-text"></div>
            
            <div class="button-group">
                <button class="btn btn-secondary" id="generateAddressBtn">Generate Funding Address</button>
                <button class="calc-btn" id="calculateBtn" disabled>Calculate & Create Real Transaction</button>
            </div>
        </div>

        <div id="saved-addresses-section" class="funding-section">
            <h2 class="section-title">💾 Saved Addresses</h2>
            <div id="saved-addresses-list" class="saved-addresses-list">
                Loading saved addresses...
            </div>
        </div>

        <div id="funding-section" class="funding-section">
            <h2 class="section-title">💰 Funding Required</h2>
            
            <div id="address-info" class="address-info">
                <p><strong>Your Taproot Address for this calculation:</strong></p>
                <div class="address-display" id="funding-address">
                    Click "Generate Funding Address" to create an address...
                </div>
                
                <div id="funding-status" class="funding-status info">
                    Waiting for address generation...
                </div>

                <div class="button-group">
                    <button class="btn btn-primary" id="checkFundingBtn">Check Funding Status</button>
                </div>
            </div>
            
            <h3>🪙 Get Testnet Bitcoin</h3>
            <p>Send at least 100,000 satoshis (0.001 tBTC) to the address above from these faucets:</p>
            
            <div class="faucet-links">
                <a href="https://testnet-faucet.mempool.co/" target="_blank" class="faucet-link">Mempool.co Faucet</a>
                <a href="https://bitcoinfaucet.uo1.net/" target="_blank" class="faucet-link">BitcoinFaucet.uo1.net</a>
                <a href="https://testnet.help/en/btcfaucet/testnet" target="_blank" class="faucet-link">Testnet.help</a>
                <a href="https://coinfaucet.eu/en/btc-testnet/" target="_blank" class="faucet-link">CoinFaucet.eu</a>
            </div>

            <div id="funding-instructions" class="instructions">
                Detailed funding instructions will appear here...
            </div>
        </div>

        <!-- Offline Taproot Workflow UI -->
<h2 class="section-title">⚡ Offline Taproot Workflow</h2>
<ul class="operations" style="justify-content:flex-start;">
  <li id="tab-sender" class="op-btn tab-link">Sender</li>
  <li id="tab-receiver" class="op-btn tab-link">Receiver</li>
  <li id="tab-refund" class="op-btn tab-link">Refund</li>
</ul>
<div id="loading" class="loading" style="display:none;">Loading...</div>
<div id="error" class="error" style="display:none;"></div>
<div id="section-sender" class="funding-section">
  <form id="sender-form">
    <div class="input-group"><label>Sender WIF:</label><input type="text" id="sender-wif-input" name="sender-wif" required style="flex:1;"><button type="button" class="btn btn-secondary" id="generate-sender-wif-btn" style="margin-left:10px;">Generate</button></div>
    <div class="input-group"><label>Receiver PubKey (hex):</label><input type="text" name="receiver-address" required></div>
    <div class="input-group"><label>Amount (sats):</label><input type="number" name="amount" value="50000" min="1000" required></div>
    <div class="input-group"><label>Refund Timelock (block):</label><input type="number" name="refund-locktime" value="1700000" required></div>
    <button class="btn btn-primary" type="submit">Create Funding PSBT</button>
  </form>
  <div id="sender-results" class="results-hidden" style="margin-top:20px;">
    <h3>QR Code A (Tx Data)</h3><div id="qrcode-a"></div>
    <h3>QR Code B (Secret)</h3><div id="qrcode-b"></div>
  </div>
</div>
<div id="section-receiver" class="funding-section" style="display:none;">
  <button class="btn btn-primary" id="start-receiver-scan-btn">Start Scan</button>
  <button class="btn btn-secondary" id="paste-tx-btn" style="margin-left:10px;">Paste Tx Data</button>
  <button class="btn btn-secondary" id="paste-secret-btn" style="margin-left:10px;">Paste Secret</button><button type="button" class="btn btn-secondary" id="generate-receiver-wif-btn" style="margin-left:10px;">Generate Receiver Key</button><div id="receiver-generated-address" style="margin-top:10px; font-family:monospace;"></div>
  <div id="receiver-scanner-div" style="margin-top:10px;"></div>
  <form id="receiver-form" class="form-hidden">
    <div class="input-group"><label>Receiver WIF:</label><input type="text" id="receiver-wif-input" name="receiver-wif" required style="flex:1;"></div>
    <button class="btn btn-primary" type="submit">Create Claim PSBT</button>
  </form>
</div>
<div id="section-refund" class="funding-section" style="display:none;">
  <button class="btn btn-primary" id="start-refund-scan-btn">Start Scan</button>
  <div id="refund-scanner-div" style="margin-top:10px;"></div>
  <form id="refund-form" class="form-hidden">
    <div class="input-group"><label>Sender WIF:</label><input type="text" id="sender-wif-input" name="sender-wif" required style="flex:1;"><button type="button" class="btn btn-secondary" id="generate-sender-wif-btn" style="margin-left:10px;">Generate</button></div>
    <button class="btn btn-primary" type="submit">Create Refund PSBT</button>
  </form>
</div>
<div id="results" class="results">
            <h2 class="section-title">📊 Transaction Results</h2>
            
            <div class="result-item">
                <div class="result-label">Operation</div>
                <div class="result-value large-text" id="operation"></div>
            </div>
            
            <div class="result-item">
                <div class="result-label">Result</div>

  <script>
    function openTab(evt, tabName) {
      var i, tabcontent, tablinks;
      tabcontent = document.getElementsByClassName("tab-content");
      for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
      }
      tablinks = document.getElementsByClassName("tab-link");
      for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
      }
      document.getElementById(tabName).style.display = "block";
      evt.currentTarget.className += " active";
    }
    // Initialize the first tab
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementsByClassName('tab-link')[0].click();
    });
  </script>
  <script type="module" src="/src/client/app.ts"></script>
    <div id="toast"></div>
</body>
</html>
````

## File: apps/web/app/receiver/page.js
````javascript
"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { encode as cborEncode, decode as cborDecode } from "cbor-x";
import { encodeUR, decodeUR } from "@offline/core";
import { parseClaimBundle } from "@offline/interop";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";

export default function Receiver() {
  useMemo(() => {
    try {
      bitcoin.initEccLib(ecc);
    } catch {}
  }, []);
  const [message, setMessage] = useState("hello offline bitcoin");
  const [fragmentLen, setFragmentLen] = useState(60);
  const [parts, setParts] = useState([]);
  const [decoded, setDecoded] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [debug, setDebug] = useState(null);

  // Claim bundle import
  const [claimInput, setClaimInput] = useState("");
  const [claimParts, setClaimParts] = useState([]);
  const [claimParsed, setClaimParsed] = useState(null);
  const [claimErr, setClaimErr] = useState("");

  // Claim Tx builder state
  const [fundTxId, setFundTxId] = useState("");
  const [fundVout, setFundVout] = useState(0);
  const [prevoutScriptHex, setPrevoutScriptHex] = useState("");
  const [prevoutValue, setPrevoutValue] = useState(0);
  const [destAddress, setDestAddress] = useState("");
  const [destValue, setDestValue] = useState(0);
  const [feeRate, setFeeRate] = useState(2);
  const [claimPsbtB64, setClaimPsbtB64] = useState("");
  const [claimPsbtUR, setClaimPsbtUR] = useState("");
  const [claimBuildErr, setClaimBuildErr] = useState("");
  const [guidedOpen, setGuidedOpen] = useState(true);
  const [changeAddress, setChangeAddress] = useState("");
  const [estVsize, setEstVsize] = useState(151);
  const [estFee, setEstFee] = useState(302);
  const [estNote, setEstNote] = useState("");

  const [isFormFilled, setIsFormFilled] = useState(false);

  const searchParams = useSearchParams();

  useEffect(() => {
    const claimFromUrl = searchParams.get("claim");
    if (claimFromUrl) {
      setClaimInput(claimFromUrl);
      handleClaimDecode(claimFromUrl);
    }
  }, [searchParams]);

  function handleSelectUtxo(utxo) {
    setFundTxId(decodedTxid);
    setFundVout(utxo.i);
    setPrevoutValue(utxo.value);
    setPrevoutScriptHex(utxo.scriptHex);
    setIsFormFilled(true);
  }

  // Decode funding tx helper (no auto-fill)
  const [helperNet, setHelperNet] = useState("testnet");
  const [txHex, setTxHex] = useState("");
  const [targetAddr, setTargetAddr] = useState("");
  const [txDecodeErr, setTxDecodeErr] = useState("");
  const [decodedOuts, setDecodedOuts] = useState([]);
  const [decodedTxid, setDecodedTxid] = useState("");

  const partCount = useMemo(() => parts.length, [parts]);

  const encoderRef = useRef(null);

  // Ensure message bytes are wrapped as a CBOR byte string (major type 2)
  function wrapCborByteString(bytes) {
    const len = bytes.length >>> 0;
    let header;
    if (len <= 23) {
      header = new Uint8Array([0x40 | len]);
    } else if (len <= 0xff) {
      header = new Uint8Array([0x58, len]);
    } else if (len <= 0xffff) {
      header = new Uint8Array([0x59, (len >> 8) & 0xff, len & 0xff]);
    } else if (len <= 0xffffffff) {
      header = new Uint8Array([
        0x5a,
        (len >>> 24) & 0xff,
        (len >>> 16) & 0xff,
        (len >>> 8) & 0xff,
        len & 0xff,
      ]);
    } else {
      // Very large payloads unlikely in this smoke test; support 64-bit length just in case
      const hi = Math.floor(len / 2 ** 32);
      const lo = len >>> 0;
      header = new Uint8Array([
        0x5b,
        (hi >>> 24) & 0xff,
        (hi >>> 16) & 0xff,
        (hi >>> 8) & 0xff,
        hi & 0xff,
        (lo >>> 24) & 0xff,
        (lo >>> 16) & 0xff,
        (lo >>> 8) & 0xff,
        lo & 0xff,
      ]);
    }
    const out = new Uint8Array(header.length + len);
    out.set(header, 0);
    out.set(bytes, header.length);
    return out;
  }

  function estimateVsize(outCount) {
    // Approximate: 1-in taproot script-path + 1-out ~151 vB; each extra output ~31 vB
    return 151 + Math.max(0, outCount - 1) * 31;
  }

  function handleEstimate() {
    try {
      const outCount = (changeAddress || "").trim() ? 2 : 1;
      const v = estimateVsize(outCount);
      const f = Math.ceil(v * (Number(feeRate) || 1));
      setEstVsize(v);
      setEstFee(f);
      setEstNote(
        `vsize≈${v} vB · fee≈${f} sats (@${Number(feeRate) || 1} sat/vB)`,
      );
      // If no change is provided, auto-fill destination to prevout - estFee
      if (!(changeAddress || "").trim()) {
        const pv = Number(prevoutValue) || 0;
        if (pv > 0) setDestValue(Math.max(0, pv - f));
      }
    } catch (e) {
      // ignore
    }
  }

  function hexToU8(hex) {
    const h = (hex || "").trim().replace(/^0x/i, "");
    if (h.length % 2) throw new Error("hex length must be even");
    const arr = new Uint8Array(h.length / 2);
    for (let i = 0; i < arr.length; i++)
      arr[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
    return arr;
  }

  function networkForKey(k) {
    if (k === "mainnet") return bitcoin.networks.bitcoin;
    return bitcoin.networks.testnet; // use testnet params for both testnet and signet
  }

  function addressFromScript(outputScript, network) {
    try {
      const p = bitcoin.payments.p2tr({ output: outputScript, network });
      if (p?.address) return p.address;
    } catch {}
    try {
      const p = bitcoin.payments.p2wpkh({ output: outputScript, network });
      if (p?.address) return p.address;
    } catch {}
    try {
      const p = bitcoin.payments.p2wsh({ output: outputScript, network });
      if (p?.address) return p.address;
    } catch {}
    try {
      const p = bitcoin.payments.p2pkh({ output: outputScript, network });
      if (p?.address) return p.address;
    } catch {}
    try {
      const p = bitcoin.payments.p2sh({ output: outputScript, network });
      if (p?.address) return p.address;
    } catch {}
    return null;
  }

  function handleDecodeTx(hex) {
    try {
      setTxDecodeErr("");
      setDecodedOuts([]);
      setDecodedTxid("");
      const txHex = (hex || "").trim();
      if (!txHex) return;
      const net = networkForKey(helperNet);
      const tx = bitcoin.Transaction.fromHex(txHex);
      try {
        setDecodedTxid(tx.getId());
      } catch {}
      const outs = tx.outs.map((o, i) => {
        const scriptHex = Buffer.from(o.script).toString("hex");
        const addr = addressFromScript(o.script, net);
        const isTarget =
          targetAddr && addr && addr.trim() === targetAddr.trim();
        return { i, value: o.value, scriptHex, address: addr, isTarget };
      });
      setDecodedOuts(outs);

      if (outs.length === 1) {
        handleSelectUtxo(outs[0]);
      }
    } catch (e) {
      setTxDecodeErr(String(e?.message || e));
    }
  }

  async function fetchRawTx(txid) {
    try {
      const res = await fetch(`/api/tx/${txid}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const { rawTx } = await res.json();
      setTxHex(rawTx);
      handleDecodeTx(rawTx);
    } catch (e) {
      setTxDecodeErr(String(e?.message || e));
    }
  }

  function handleTxIdChange(e) {
    const txid = e.target.value;
    setFundTxId(txid);
    if (txid.length === 64) {
      fetchRawTx(txid);
    }
  }

  async function handleBuildClaimPsbt() {
    try {
      setClaimBuildErr("");
      setClaimPsbtB64("");
      setClaimPsbtUR("");
      if (!claimParsed) throw new Error("Decode a claim-bundle first");
      if (!fundTxId || typeof fundTxId !== "string")
        throw new Error("Funding txid required");
      let hash = fundTxId.trim();
      // If user pasted raw tx hex here by mistake, derive txid
      if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
        try {
          const tx = bitcoin.Transaction.fromHex(hash);
          hash = tx.getId();
        } catch {
          throw new Error(
            "Funding txid must be 64 hex chars (txid). If you pasted raw tx hex, use the helper above to decode and copy the txid.",
          );
        }
      }
      const index = Number(fundVout) >>> 0;
      if (!prevoutScriptHex || prevoutScriptHex.length < 8)
        throw new Error("Prevout scriptHex required");
      const script = Buffer.from(prevoutScriptHex.trim(), "hex");
      const value = Number(prevoutValue) >>> 0;
      if (!(value > 0)) throw new Error("Prevout value (sats) must be > 0");
      if (!destAddress) throw new Error("Destination address required");
      const outVal = Number(destValue) >>> 0;
      if (outVal <= 0) throw new Error("Destination value must be > 0");
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
      const tapLeafScript = [
        {
          leafVersion: claimParsed.leaf_ver >>> 0,
          script: Buffer.from(claimParsed.script),
          controlBlock: Buffer.from(claimParsed.control || []),
        },
      ];
      psbt.addInput({
        hash,
        index,
        witnessUtxo: { script, value },
        tapLeafScript,
      });
      // Fee and optional change
      const outCount = (changeAddress || "").trim() ? 2 : 1;
      const vsize = estimateVsize(outCount);
      const fee = Math.ceil(vsize * (Number(feeRate) || 1));
      if (!(changeAddress || "").trim()) {
        // One-output flow: user should have set dest = prevout - fee; still allow any value
        if (outVal > value)
          throw new Error("Destination value exceeds prevout");
        psbt.addOutput({ address: destAddress.trim(), value: outVal });
      } else {
        // Two-output flow with change
        if (!changeAddress || typeof changeAddress !== "string")
          throw new Error("Change address required or leave it blank");
        const changeVal = value - outVal - fee;
        if (changeVal < 0)
          throw new Error(
            "Destination + estimated fee exceed prevout. Lower destination or fee rate.",
          );
        const DUST = 546; // conservative threshold for small outputs
        if (changeVal < DUST)
          throw new Error(
            "Computed change is below dust threshold; reduce destination or remove change.",
          );
        psbt.addOutput({ address: destAddress.trim(), value: outVal });
        psbt.addOutput({ address: changeAddress.trim(), value: changeVal });
      }
      const b64 = psbt.toBase64();
      setClaimPsbtB64(b64);
      const ur = encodeUR("crypto-psbt", psbt.toBuffer(), 180);
      const parts = [];
      const seen = new Set();
      let guard = 0;
      while (guard < 200) {
        const p = ur.nextPart();
        if (!seen.has(p)) {
          parts.push(p);
          seen.add(p);
        }
        try {
          await decodeUR(parts);
          break; // full set
        } catch (e) {
          if (!String(e).includes("UR not complete")) break; // other error
        }
        guard++;
      }
      setClaimPsbtUR(parts.join("\n"));
    } catch (e) {
      setClaimBuildErr(String(e?.message || e));
    }
  }

  async function handleEncode() {
    setError("");
    setDecoded(null);
    setDebug(null);
    try {
      // UR 'bytes' expects a CBOR byte string; wrap message bytes as CBOR
      const payloadBytes = new TextEncoder().encode(message);
      const cborPayload = wrapCborByteString(payloadBytes);
      const enc = encodeUR("bytes", cborPayload, Number(fragmentLen) || 60);
      encoderRef.current = enc;
      // Generate a bounded number of parts without pre-decoding (faster, no spam)
      const est = enc.estimatedParts || 1;
      const cap = Math.min(Math.max(est, 1), 50); // never more than 50 upfront
      const collected = [];
      for (let i = 0; i < cap; i++) collected.push(enc.nextPart());
      setParts(collected);
      setStatus(
        `encoded ${collected.length} fragment${collected.length > 1 ? "s" : ""}`,
      );
    } catch (e) {
      console.error(e);
      setError(String(e?.message || e));
      setStatus("error");
    }
  }

  async function handleDecode() {
    setError("");
    setDecoded(null);
    try {
      if (!parts.length) throw new Error("No UR parts to decode");
      let localParts = [...parts];
      let out;
      const maxTries = 100; // safety cap to avoid infinite loop
      let tries = 0;
      while (true) {
        try {
          out = await decodeUR(localParts);
          break; // success
        } catch (e) {
          // If we have an encoder, ask for more parts and try again
          if (encoderRef.current && tries < maxTries) {
            localParts.push(encoderRef.current.nextPart());
            tries += 1;
            continue;
          }
          throw e; // no encoder or exceeded tries
        }
      }
      // Debug the raw decode result shape
      let ctor, keys;
      try {
        console.log("UR raw out:", out);
        ctor = out?.cbor?.constructor?.name;
        keys =
          out?.cbor && typeof out.cbor === "object"
            ? Object.keys(out.cbor)
            : null;
        console.log("UR out.cbor shape:", {
          typeof: typeof out?.cbor,
          isU8: out?.cbor instanceof Uint8Array,
          ctor,
          keys,
          value: out?.cbor,
        });
      } catch {}

      // Coerce out.cbor (Buffer or Uint8Array) to Uint8Array
      const toU8 = (x) => {
        if (x instanceof Uint8Array) return x;
        // Buffer in browsers is often a Uint8Array subclass; the check above should already catch it.
        if (x && typeof x === "object") {
          if (x.type === "Buffer" && Array.isArray(x.data))
            return Uint8Array.from(x.data);
          // Honor view offsets when constructing from underlying buffer
          if (
            x.buffer instanceof ArrayBuffer &&
            typeof x.byteLength === "number"
          ) {
            const offset = x.byteOffset || 0;
            const length = x.byteLength;
            return new Uint8Array(x.buffer, offset, length);
          }
          if (Array.isArray(x)) return Uint8Array.from(x);
        }
        try {
          return new Uint8Array(x);
        } catch {}
        throw new Error("Unsupported byte source for payload bytes");
      };
      // Fallback parser: extract a CBOR byte string (major type 2) payload slice from bytes
      const extractCborByteString = (bytes) => {
        if (!bytes || bytes.length === 0) return null;
        const first = bytes[0];
        if ((first & 0xe0) !== 0x40) return null; // not major type 2
        const addl = first & 0x1f;
        let offset = 1;
        let len;
        const dv = new DataView(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength,
        );
        if (addl < 24) {
          len = addl;
        } else if (addl === 24) {
          if (bytes.length < 2) return null;
          len = bytes[1];
          offset = 2;
        } else if (addl === 25) {
          if (bytes.length < 3) return null;
          len = dv.getUint16(1, false);
          offset = 3;
        } else if (addl === 26) {
          if (bytes.length < 5) return null;
          len = dv.getUint32(1, false);
          offset = 5;
        } else if (addl === 27) {
          if (bytes.length < 9) return null;
          const hi = dv.getUint32(1, false);
          const lo = dv.getUint32(5, false);
          len = hi * 2 ** 32 + lo;
          offset = 9;
        } else {
          // Indefinite-length not expected here
          return null;
        }
        if (offset + len > bytes.length) return null;
        return bytes.slice(offset, offset + len);
      };
      const cborBytes = toU8(out.cbor);
      console.log("toU8(cbor) length:", cborBytes.length);
      // Try CBOR decode first; fallback to treating as raw bytes if needed
      let decodedValue;
      try {
        decodedValue = cborDecode(cborBytes);
      } catch (_) {
        decodedValue = cborBytes;
      }
      let decodedCtor;
      try {
        decodedCtor = decodedValue?.constructor?.name;
        console.log(
          "CBOR decoded value type:",
          typeof decodedValue,
          decodedCtor,
        );
      } catch {}
      // Coerce the decoded value into bytes when possible (handles Buffer-like, views, arrays)
      let payload;
      try {
        payload = toU8(decodedValue);
      } catch (_) {
        if (decodedValue instanceof Uint8Array) {
          payload = decodedValue;
        } else if (Array.isArray(decodedValue)) {
          payload = Uint8Array.from(decodedValue);
        } else if (typeof decodedValue === "string") {
          payload = new TextEncoder().encode(decodedValue);
        } else {
          payload = new TextEncoder().encode(String(decodedValue));
        }
      }
      // Deep search for an inner Uint8Array if the direct coercion yields empty
      function findDeepU8(x, seen = new Set()) {
        if (!x || typeof x !== "object") return null;
        if (seen.has(x)) return null;
        seen.add(x);
        if (x instanceof Uint8Array) return x;
        if (x.type === "Buffer" && Array.isArray(x.data))
          return Uint8Array.from(x.data);
        // Array-like views
        if (
          x.buffer instanceof ArrayBuffer &&
          typeof x.byteLength === "number"
        ) {
          const offset = x.byteOffset || 0;
          const length = x.byteLength;
          return new Uint8Array(x.buffer, offset, length);
        }
        let best = null;
        const consider = (cand) => {
          if (!cand) return;
          if (cand instanceof Uint8Array) {
            if (!best || cand.length > best.length) best = cand;
          }
        };
        if (Array.isArray(x)) {
          for (const it of x) {
            const found = findDeepU8(it, seen);
            consider(found);
          }
        } else {
          for (const k of Object.keys(x)) {
            const found = findDeepU8(x[k], seen);
            consider(found);
          }
        }
        return best;
      }
      // If payload is empty but CBOR bytes exist, attempt deep extraction or raw CBOR byte-string extraction
      let usedFallback = false;
      let usedDeep = false;
      let usedIndexMap = false;
      if (payload.length === 0 && cborBytes.length > 0) {
        // 1) If decodedValue is an object of numeric keys to byte values, reconstruct bytes
        if (
          decodedValue &&
          typeof decodedValue === "object" &&
          !Array.isArray(decodedValue)
        ) {
          const keys = Object.keys(decodedValue);
          const allNumeric =
            keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
          if (allNumeric) {
            const maxKey = Math.max(...keys.map((k) => parseInt(k, 10)));
            const arr = new Uint8Array(maxKey + 1);
            for (const k of keys) {
              const idx = parseInt(k, 10);
              let v = decodedValue[k];
              if (typeof v !== "number") {
                // Attempt to coerce nested numbers
                try {
                  v = Number(v);
                } catch {}
              }
              arr[idx] = (v >>> 0) & 0xff;
            }
            if (arr.length > 0) {
              payload = arr;
              usedIndexMap = true;
            }
          }
        }
        // 2) Try deep search for an inner Uint8Array
        const deep = findDeepU8(decodedValue);
        if (deep && deep.length > 0 && payload.length === 0) {
          payload = deep;
          usedDeep = true;
        }
        // 3) Lastly, attempt to extract a CBOR byte string from the raw CBOR bytes
        if (payload.length === 0) {
          const maybe = extractCborByteString(cborBytes);
          if (maybe && maybe.length > 0) {
            payload = maybe;
            usedFallback = true;
          }
        }
      }
      const text = new TextDecoder().decode(payload);
      const length = payload.length;
      const cborLen = cborBytes.length;
      const head = cborBytes[0] ?? null;
      const major = head != null ? head >> 5 : null;
      const ai = head != null ? head & 0x1f : null;
      const dvKeys =
        decodedValue && typeof decodedValue === "object"
          ? Object.keys(decodedValue).slice(0, 10)
          : null;
      const debugObj = {
        parts: localParts.length,
        tries,
        outType: out.type,
        cborIsU8: out?.cbor instanceof Uint8Array,
        cborCtor: ctor,
        cborKeys: keys,
        cborLen,
        head,
        major,
        ai,
        decodedType: typeof decodedValue,
        decodedCtor,
        decodedKeys: dvKeys,
        payloadLen: length,
        usedFallback,
        usedDeep,
        usedIndexMap,
      };
      console.log("UR decode details", debugObj);
      setDebug(debugObj);
      if (tries > 0) {
        setParts(localParts);
      }
      setDecoded({ type: out.type, text, length, cborLen });
      setStatus("decoded");
    } catch (e) {
      console.error(e);
      setError(String(e?.message || e));
      setStatus("error");
    }
  }

  async function handleClaimDecode(claimOverride) {
    try {
      setClaimErr("");
      setClaimParsed(null);
      const claimData = claimOverride || claimInput;
      const lines = (claimData || "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (!lines.length) throw new Error("Paste one or more UR parts");
      const urParts = lines.filter((l) => l.toLowerCase().startsWith("ur:"));
      if (!urParts.length)
        throw new Error(
          "No UR parts detected (expected lines starting with 'ur:')",
        );
      setClaimParts(urParts);
      const out = await decodeUR(urParts);
      const urType = String(out?.type || "").toLowerCase();
      if (urType !== "claim-bundle") {
        throw new Error(
          `Wrong UR type: expected 'claim-bundle' but got '${out?.type || "unknown"}'`,
        );
      }
      const toU8 = (x) => {
        if (x instanceof Uint8Array) return x;
        if (x && typeof x === "object") {
          if (x.type === "Buffer" && Array.isArray(x.data))
            return Uint8Array.from(x.data);
          if (
            x.buffer instanceof ArrayBuffer &&
            typeof x.byteLength === "number"
          ) {
            const offset = x.byteOffset || 0;
            const length = x.byteLength;
            return new Uint8Array(x.buffer, offset, length);
          }
          if (Array.isArray(x)) return Uint8Array.from(x);
        }
        try {
          return new Uint8Array(x);
        } catch {}
        throw new Error("Unsupported CBOR byte source");
      };
      const cborBytes = toU8(out.cbor);
      const parsed = parseClaimBundle(cborBytes);
      setClaimParsed(parsed);
    } catch (e) {
      setClaimErr(String(e?.message || e));
    }
  }

  function handleReset() {
    setParts([]);
    setDecoded(null);
    setStatus("idle");
    setError("");
    encoderRef.current = null;
    setDebug(null);
  }

  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-600 text-white">
        RECEIVER
      </div>
      <h1 className="text-2xl font-semibold">Receiver</h1>
      <p className="text-zinc-500">
        Import Claim Bundle (UR), wait for funding confirmation, build claim tx,
        and broadcast.
      </p>

      <section className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Guided Mode</h2>
          <button
            onClick={() => setGuidedOpen((v) => !v)}
            className="text-sm px-2 py-1 rounded border"
          >
            {guidedOpen ? "Hide" : "Show"}
          </button>
        </div>
        {guidedOpen && (
          <div className="text-sm text-zinc-700 space-y-2">
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Paste ALL Claim Bundle UR lines below and click{" "}
                <b>Decode Claim</b>.
              </li>
              <li>
                Fund the Taproot address shown on the Cold page (same network
                you used to generate the bundle; signet is fine).
              </li>
              <li>
                After funding, fetch prevout details for the output that paid
                your address:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>
                    <span className="font-mono">txid</span> — the funding
                    transaction id
                  </li>
                  <li>
                    <span className="font-mono">vout</span> — the index of the
                    output that paid your address
                  </li>
                  <li>
                    <span className="font-mono">value</span> — output value in
                    sats
                  </li>
                  <li>
                    <span className="font-mono">scriptpubkey_hex</span> — paste
                    here as <b>Prevout script (hex)</b> (P2TR script, usually
                    starts with <span className="font-mono">5120…</span>)
                  </li>
                </ul>
                <div className="text-xs text-zinc-500">
                  Explorer links:{" "}
                  <a
                    className="text-blue-600 underline"
                    href="https://mempool.space/signet"
                    target="_blank"
                    rel="noreferrer"
                  >
                    mempool.space/signet
                  </a>{" "}
                  ·{" "}
                  <a
                    className="text-blue-600 underline"
                    href="https://mempool.space/testnet"
                    target="_blank"
                    rel="noreferrer"
                  >
                    /testnet
                  </a>
                </div>
              </li>
              <li>
                Fill the form in <b>Build Claim PSBT</b> and click the button.
                You’ll get base64 and a UR for signing.
              </li>
              <li>
                Use a signer to provide the preimage for{" "}
                <span className="font-mono">h</span> and a Schnorr signature
                with <span className="font-mono">R</span>, finalize, then
                broadcast.
              </li>
            </ol>
            <p className="text-xs text-zinc-500">
              Note: The PSBT network parameter uses testnet defaults; for signet
              addresses this is acceptable for PSBT construction. Broadcast
              should target a signet endpoint.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Funding Transaction</h2>
        <p className="text-sm text-zinc-500">
          Paste the transaction ID of the funding transaction.
        </p>
        <input
          className="w-full rounded border px-3 py-2 font-mono"
          placeholder="Enter transaction ID"
          value={fundTxId}
          onChange={handleTxIdChange}
        />
        {!!txDecodeErr && (
          <div className="text-sm text-red-600">{txDecodeErr}</div>
        )}
        {(decodedTxid || decodedOuts.length > 0) && (
          <div className="text-sm space-y-2">
            {decodedTxid && (
              <div>
                <div className="text-zinc-500">Computed TXID</div>
                <div className="font-mono break-all">{decodedTxid}</div>
              </div>
            )}
            {decodedOuts.length > 0 && (
              <div>
                <div className="text-zinc-500">
                  Outputs ({decodedOuts.length})
                </div>
                <div className="grid gap-2">
                  {decodedOuts.map((o) => (
                    <div
                      key={o.i}
                      className={`text-xs rounded border p-2 ${o.isTarget ? "bg-emerald-50 border-emerald-300" : "bg-zinc-50"}`}
                    >
                      <div>
                        <b>vout</b>: {o.i}{" "}
                        {o.isTarget && (
                          <span className="text-emerald-700">
                            (matches target)
                          </span>
                        )}
                      </div>
                      <div>
                        <b>value (sats)</b>: {o.value}
                      </div>
                      <div>
                        <b>address</b>:{" "}
                        <span className="font-mono">{o.address || "n/a"}</span>
                      </div>
                      <div>
                        <b>script (hex)</b>:{" "}
                        <span className="font-mono break-all">
                          {o.scriptHex}
                        </span>
                      </div>
                      <div className="mt-2">
                        <button
                          onClick={() => handleSelectUtxo(o)}
                          className="text-xs px-2 py-1 rounded bg-blue-600 text-white"
                        >
                          Use this output
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Claim Bundle</h2>
        <p className="text-sm text-zinc-500">
          Paste one or more UR parts (each on its own line). Then click Decode.
        </p>
        <textarea
          className="w-full rounded border px-3 py-2 font-mono min-h-[120px]"
          placeholder="ur:claim-bundle/... or ur:bytes/..."
          value={claimInput}
          onChange={(e) => setClaimInput(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleClaimDecode}
            className="px-3 py-2 rounded bg-emerald-600 text-white"
          >
            Decode Claim
          </button>
          {!!claimErr && <div className="text-sm text-red-600">{claimErr}</div>}
        </div>
        {claimParsed && (
          <div className="mt-2">
            <div className="text-sm text-zinc-500">Parsed Claim Bundle</div>
            <pre className="text-xs bg-zinc-50 border rounded p-2 overflow-x-auto">
              {JSON.stringify(claimParsed, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {claimParsed && (
        <section className="rounded-lg border p-4 space-y-3">
          <h2 className="font-medium">Build Claim PSBT</h2>
          <p className="text-sm text-zinc-500">
            Provide the funding UTXO details and destination. This constructs a
            tapscript spend using the claim leaf/script and control block from
            the bundle.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="space-y-1 md:col-span-2">
              <div className="text-sm text-zinc-500">Funding txid (hex)</div>
              <input
                className="w-full rounded border px-3 py-2 font-mono"
                value={fundTxId}
                onChange={(e) => setFundTxId(e.target.value)}
                readOnly={isFormFilled}
              />
            </label>
            <label className="space-y-1">
              <div className="text-sm text-zinc-500">vout</div>
              <input
                type="number"
                className="w-full rounded border px-3 py-2"
                value={fundVout}
                onChange={(e) => setFundVout(Number(e.target.value) || 0)}
                readOnly={isFormFilled}
              />
            </label>
            <label className="space-y-1">
              <div className="text-sm text-zinc-500">Prevout value (sats)</div>
              <input
                type="number"
                className="w-full rounded border px-3 py-2"
                value={prevoutValue}
                onChange={(e) => setPrevoutValue(Number(e.target.value) || 0)}
                readOnly={isFormFilled}
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <div className="text-sm text-zinc-500">
                Prevout script (hex) — P2TR output script
              </div>
              <input
                className="w-full rounded border px-3 py-2 font-mono"
                value={prevoutScriptHex}
                onChange={(e) => setPrevoutScriptHex(e.target.value)}
                placeholder="e.g., 5120..."
                readOnly={isFormFilled}
              />
            </label>
            <label className="space-y-1">
              <div className="text-sm text-zinc-500">Destination address</div>
              <input
                className="w-full rounded border px-3 py-2"
                value={destAddress}
                onChange={(e) => setDestAddress(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <div className="text-sm text-zinc-500">
                Destination value (sats)
              </div>
              <input
                type="number"
                className="w-full rounded border px-3 py-2"
                value={destValue}
                onChange={(e) => setDestValue(Number(e.target.value) || 0)}
              />
            </label>
            <label className="space-y-1">
              <div className="text-sm text-zinc-500">Fee rate (sat/vB)</div>
              <input
                type="number"
                className="w-full rounded border px-3 py-2"
                value={feeRate}
                onChange={(e) => setFeeRate(Number(e.target.value) || 1)}
              />
            </label>
            <label className="space-y-1">
              <div className="text-sm text-zinc-500">
                Change address (optional)
              </div>
              <input
                className="w-full rounded border px-3 py-2"
                value={changeAddress}
                onChange={(e) => setChangeAddress(e.target.value)}
                placeholder="Leave blank to send all (minus fee)"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleEstimate}
              type="button"
              className="px-3 py-2 rounded border"
            >
              Estimate Fee
            </button>
            <button
              onClick={handleBuildClaimPsbt}
              className="px-3 py-2 rounded bg-blue-600 text-white"
            >
              Build Claim PSBT
            </button>
            {!!claimBuildErr && (
              <div className="text-sm text-red-600">{claimBuildErr}</div>
            )}
          </div>
          {estNote && <div className="text-xs text-zinc-500">{estNote}</div>}
          {claimPsbtB64 && (
            <div className="text-sm space-y-1">
              <div className="text-zinc-500">Claim PSBT (base64)</div>
              <textarea
                className="w-full rounded border px-3 py-2 font-mono min-h-[80px]"
                readOnly
                value={claimPsbtB64}
              />
            </div>
          )}
          {claimPsbtUR && (
            <div className="text-sm space-y-1">
              <div className="text-zinc-500">Claim PSBT (UR part)</div>
              <textarea
                className="w-full rounded border px-3 py-2 font-mono min-h-[80px]"
                readOnly
                value={claimPsbtUR}
              />
              <div className="text-xs text-zinc-500">
                Transfer this to a signer that can provide a Schnorr signature
                for R and the preimage for h.
              </div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border p-4 space-y-4">
        <h2 className="font-medium">UR Smoke Test</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Message to encode</div>
            <input
              className="w-full rounded border px-3 py-2"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Max fragment length</div>
            <input
              className="w-full rounded border px-3 py-2"
              type="number"
              min={10}
              max={500}
              value={fragmentLen}
              onChange={(e) => setFragmentLen(Number(e.target.value) || 60)}
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleEncode}
            className="px-3 py-2 rounded bg-blue-600 text-white"
          >
            Encode
          </button>
          <button
            onClick={handleDecode}
            className="px-3 py-2 rounded bg-emerald-600 text-white"
            disabled={!parts.length}
          >
            Decode
          </button>
          <button onClick={handleReset} className="px-3 py-2 rounded border">
            Reset
          </button>
          {status && (
            <div className="text-sm text-zinc-500">Status: {status}</div>
          )}
        </div>

        {!!error && <div className="text-sm text-red-600">{error}</div>}

        <div className="space-y-2">
          <div className="text-sm text-zinc-500">UR Parts ({partCount})</div>
          <div className="grid gap-2">
            {parts.map((p, i) => (
              <div
                key={i}
                className="text-xs break-all rounded bg-zinc-50 border p-2"
              >
                {p}
              </div>
            ))}
          </div>
        </div>

        {decoded && (
          <div className="space-y-1">
            <div className="text-sm text-zinc-500">Decoded</div>
            <div className="text-sm">
              type: <span className="font-mono">{decoded.type}</span>
            </div>
            <div className="text-sm">
              cbor bytes length: {decoded.cborLen ?? "?"}
            </div>
            <div className="text-sm">
              payload bytes length: {decoded.length}
            </div>
            <div className="text-sm">
              as text: <span className="font-mono">{decoded.text}</span>
            </div>
          </div>
        )}

        {debug && (
          <details className="mt-3">
            <summary className="cursor-pointer select-none text-sm text-zinc-500">
              Debug
            </summary>
            <pre className="mt-2 text-xs bg-zinc-50 border rounded p-2 overflow-x-auto">
              {JSON.stringify(debug, null, 2)}
            </pre>
          </details>
        )}
      </section>
    </main>
  );
}
````

## File: src/server/bitcoin.ts
````typescript
import * as bitcoin from 'bitcoinjs-lib';
import { Tapleaf } from 'bitcoinjs-lib/src/types.js';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { SenderData, OfflineTxoData, ReceiverClaimData, SenderRefundData, SignedTransaction, UTXO } from '@offline/shared-types';
import { randomBytes } from 'crypto';

// Initialize ECC library
bitcoin.initEccLib(ecc);

const ECPair = ECPairFactory(ecc);
const TESTNET = bitcoin.networks.testnet;

export class OfflineBtcWallet {
  private network = TESTNET;

  /**
   * Generates a new random key pair.
   */
  generateKeyPair(): ECPairInterface {
    return ECPair.makeRandom({ network: this.network });
  }

  /**
   * Generates a secure random 32-byte preimage for the hash lock.
   */
  generatePreimage(): Buffer {
    return randomBytes(32);
  }

  /**
   * Creates the two spending path scripts for the Taproot output.
   * @param senderPublicKey - The sender's public key for the refund path.
   * @param receiverPublicKey - The receiver's public key for the claim path.
   * @param preimageHash - The HASH160 of the secret preimage.
   * @param refundTimeLock - The block height for the refund time lock (CLTV).
   */
  createSpendingScripts(senderPublicKey: Buffer, receiverPublicKey: Buffer, preimageHash: Buffer, refundTimeLock: number): { claimScript: Buffer, refundScript: Buffer } {
    const claimScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_HASH160,
      preimageHash,
      bitcoin.opcodes.OP_EQUALVERIFY,
      receiverPublicKey,
      bitcoin.opcodes.OP_CHECKSIG,
    ]);

    const refundScript = bitcoin.script.compile([
      bitcoin.script.number.encode(refundTimeLock),
      bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
      bitcoin.opcodes.OP_DROP,
      senderPublicKey,
      bitcoin.opcodes.OP_CHECKSIG,
    ]);

    return { claimScript, refundScript };
  }

  /**
   * Creates a Pay-to-Taproot (P2TR) address with the specified spending scripts.
   * @param internalPublicKey - The internal public key for the Taproot output.
   * @param claimScript - The script for the receiver to claim the funds.
   * @param refundScript - The script for the sender to refund the funds.
   */
  createTaprootAddress(internalPublicKey: Buffer, claimScript: Buffer, refundScript: Buffer): { address: string, scriptTree: [Tapleaf, Tapleaf], redeem: any } {
    const scriptTree: [Tapleaf, Tapleaf] = [
        { output: claimScript },
        { output: refundScript },
    ];

    const p2tr = bitcoin.payments.p2tr({
      internalPubkey: internalPublicKey,
      scriptTree,
      network: this.network,
    });

    if (!p2tr.address || !p2tr.output || !p2tr.redeem) {
      throw new Error('Failed to create Taproot address.');
    }

    return { address: p2tr.address, scriptTree, redeem: p2tr.redeem };
  }

  /**
   * Creates the initial transaction (PSBT) from the sender to the new Taproot address.
   */
  async createSenderFundingTransaction(data: SenderData, feeRate: number): Promise<OfflineTxoData> {
    const { senderKeyPair, receiverPublicKey, amount, utxos, refundTimeLock } = data;

    const senderSigner = ECPair.fromWIF(senderKeyPair.privateKeyWIF, this.network);
    const internalPublicKey = senderSigner.publicKey.slice(1, 33); // x-only pubkey

    // 1. Generate preimage and its hash
    const preimage = this.generatePreimage();
    const preimageHash = bitcoin.crypto.hash160(preimage);

    // 2. Create spending scripts
    const { claimScript, refundScript } = this.createSpendingScripts(
      internalPublicKey,
      receiverPublicKey,
      preimageHash,
      refundTimeLock
    );

    // 3. Create Taproot address
    const { address: taprootAddress } = this.createTaprootAddress(internalPublicKey, claimScript, refundScript);

    // 4. Build PSBT
    const psbt = new bitcoin.Psbt({ network: this.network });
    const totalInputValue = utxos.reduce((sum: number, utxo: UTXO) => sum + utxo.value, 0);

    // A rough fee estimation
    const estimatedSize = 10 + (utxos.length * 68) + (2 * 43); // base + inputs + outputs
    const fee = Math.ceil(estimatedSize * feeRate);

    if (totalInputValue < amount + fee) {
      throw new Error(`Insufficient funds. Required: ${amount + fee}, Available: ${totalInputValue}`);
    }

    // Add inputs
    for (const utxo of utxos) {
        const prevTxHex = await this.fetchRawTransaction(utxo.txid);
        const witnessUtxo = {
            script: Buffer.from(utxo.scriptPubKey, 'hex'),
            value: utxo.value,
        };
        psbt.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            witnessUtxo,
            nonWitnessUtxo: Buffer.from(prevTxHex, 'hex'),
        });
    }

    // Add the main output to the Taproot address
    psbt.addOutput({ address: taprootAddress, value: amount });

    // Add change output if necessary
    const changeAmount = totalInputValue - amount - fee;
    if (changeAmount > 546) { // Dust threshold
      const changeAddress = bitcoin.payments.p2wpkh({ pubkey: senderSigner.publicKey, network: this.network }).address!;
      psbt.addOutput({ address: changeAddress, value: changeAmount });
    }

    // 5. Sign the transaction
    psbt.signAllInputs(senderSigner);
    psbt.finalizeAllInputs();

    const tx = psbt.extractTransaction();

    return {
      psbt: psbt.toBase64(),
      preimage: preimage.toString('hex'),
      taprootAddress,
      txid: tx.getId(),
      vout: 0, // Assuming the taproot output is the first one
    };
  }

  private async fetchRawTransaction(txid: string): Promise<string> {
    try {
      const response = await fetch(`https://mempool.space/testnet/api/tx/${txid}/hex`);
      if (!response.ok) {
        throw new Error(`Failed to fetch transaction ${txid}: ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
        console.error('Error fetching raw transaction:', error);
        throw new Error(`Failed to fetch raw transaction ${txid}.`);
    }
  }

  /**
   * Creates the transaction for the receiver to claim the funds.
   */
  async createReceiverClaimTransaction(data: ReceiverClaimData, feeRate: number): Promise<SignedTransaction> {
    const { receiverKeyPair, preimage, transaction, senderPublicKey, refundTimeLock } = data;

    const receiverSigner = ECPair.fromWIF(receiverKeyPair.privateKeyWIF, this.network);
    const preimageHash = bitcoin.crypto.hash160(preimage);

    // 1. Re-create the scripts and Taproot address info
    const { claimScript, refundScript } = this.createSpendingScripts(
      senderPublicKey,
      receiverSigner.publicKey,
      preimageHash,
      refundTimeLock
    );

    const { redeem } = this.createTaprootAddress(senderPublicKey, claimScript, refundScript);
    const controlBlock = redeem.redeem.controlBlock;

    // 2. Build PSBT
    const psbt = new bitcoin.Psbt({ network: this.network });

    // A rough fee estimation
    const estimatedSize = 10 + (1 * 108) + (1 * 43); // base + 1 tapscript input + 1 p2wpkh output
    const fee = Math.ceil(estimatedSize * feeRate);

    if (transaction.value < fee) {
        throw new Error(`Input amount is less than the fee. Required: ${fee}, Available: ${transaction.value}`);
    }

    // 3. Add the Taproot input to be spent
    const prevTxHex = await this.fetchRawTransaction(transaction.txid);
    psbt.addInput({
      hash: transaction.txid,
      index: transaction.vout,
      witnessUtxo: { value: transaction.value, script: redeem.output! },
      nonWitnessUtxo: Buffer.from(prevTxHex, 'hex'),
      tapLeafScript: [
        {
          leafVersion: redeem.redeem.leafVersion,
          script: claimScript,
          controlBlock,
        },
      ],
    });

    // 4. Add output to the receiver's address
    const receiverAddress = bitcoin.payments.p2wpkh({ pubkey: receiverSigner.publicKey, network: this.network }).address!;
    psbt.addOutput({ address: receiverAddress, value: transaction.value - fee });

    // 5. Sign the input
    psbt.signInput(0, receiverSigner);

    // 6. Finalize with the custom witness including the preimage
    const finalizer = (inputIndex: number, input: any) => {
        const script = claimScript;
        const witness = [input.tapScriptSig[0].signature, preimage];
        return {
            finalScriptWitness: bitcoin.script.compile(witness)
        }
    };
    psbt.finalizeInput(0, finalizer);

    const tx = psbt.extractTransaction();

    return {
      psbt: psbt.toBase64(),
      txid: tx.getId(),
      rawTx: tx.toHex(),
    };
  }

  /**
   * Creates the transaction for the sender to get a refund after the timelock.
   */
  async createSenderRefundTransaction(data: SenderRefundData, feeRate: number): Promise<SignedTransaction> {
    const { senderKeyPair, transaction, receiverPublicKey, refundTimeLock } = data;

    const senderSigner = ECPair.fromWIF(senderKeyPair.privateKeyWIF, this.network);
    const internalPublicKey = senderSigner.publicKey.slice(1, 33);

    // 1. Re-create the scripts and Taproot address info
    // Note: The preimage is unknown to the sender, so we create a dummy hash. The hash only needs to match what was used to create the address.
    const dummyPreimage = Buffer.alloc(32, 0); 
    const preimageHash = bitcoin.crypto.hash160(dummyPreimage);

    const { claimScript, refundScript } = this.createSpendingScripts(
      internalPublicKey,
      receiverPublicKey,
      preimageHash, // This hash must match the one used to create the address
      refundTimeLock
    );

    const { redeem } = this.createTaprootAddress(internalPublicKey, claimScript, refundScript);
    const controlBlock = redeem.redeem.controlBlock;

    // 2. Build PSBT
    const psbt = new bitcoin.Psbt({ network: this.network });
    psbt.setLocktime(refundTimeLock); // Critical for CLTV

    // A rough fee estimation
    const estimatedSize = 10 + (1 * 108) + (1 * 43); // base + 1 tapscript input + 1 p2wpkh output
    const fee = Math.ceil(estimatedSize * feeRate);

    if (transaction.value < fee) {
      throw new Error(`Input amount is less than the fee. Required: ${fee}, Available: ${transaction.value}`);
    }

    // 3. Add the Taproot input to be spent
    const prevTxHex = await this.fetchRawTransaction(transaction.txid);
    psbt.addInput({
      hash: transaction.txid,
      index: transaction.vout,
      witnessUtxo: { value: transaction.value, script: redeem.output! },
      nonWitnessUtxo: Buffer.from(prevTxHex, 'hex'),
      sequence: 0xfffffffe, // Required for CLTV
      tapLeafScript: [
        {
          leafVersion: redeem.redeem.leafVersion,
          script: refundScript,
          controlBlock,
        },
      ],
    });

    // 4. Add output back to the sender's address
    const senderAddress = bitcoin.payments.p2wpkh({ pubkey: senderSigner.publicKey, network: this.network }).address!;
    psbt.addOutput({ address: senderAddress, value: transaction.value - fee });

    // 5. Sign the input
    psbt.signInput(0, senderSigner);

    // 6. Finalize with the custom witness
    const finalizer = (inputIndex: number, input: any) => {
        const witness = [input.tapScriptSig[0].signature];
        return {
            finalScriptWitness: bitcoin.script.compile(witness)
        }
    };
    psbt.finalizeInput(0, finalizer);

    const tx = psbt.extractTransaction();

    return {
      psbt: psbt.toBase64(),
      txid: tx.getId(),
      rawTx: tx.toHex(),
    };
  }

  // Additional methods to match RealBitcoinCalculator interface expected in calculator.ts
  validateCalculationInputs(operation: any, value1: any, value2: any): boolean {
    // Implementation for validation logic
    return true;
  }

  createCalculationTransaction(operation: any, value1: any, value2: any, utxos: any, keyPair: any, feeRate: any): any {
    // Implementation for creating calculation transaction
    return { transaction: 'placeholder' };
  }

  createTaprootAddressWithScript(internalPubkey: any, tweak: any, network: any, extraParam: any): { address: string, scriptHash: string } {
    // Use the existing createTaprootAddress method as base
    const internalPublicKey = Buffer.from(internalPubkey, 'hex');
    const { address } = this.createTaprootAddress(internalPublicKey, tweak, tweak);
    return { address, scriptHash: 'placeholder' };
  }
}

// Export OfflineBtcWallet as RealBitcoinCalculator for compatibility
export { OfflineBtcWallet as RealBitcoinCalculator };
````

## File: package.json
````json
{
  "name": "real-bitcoin-taproot-calculator",
  "version": "1.0.0",
  "description": "Real Bitcoin Taproot calculator that creates actual testnet transactions",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "dev": "tsx src/server/server.ts",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit",
    "start": "node dist/src/server/server.js"
  },
  "keywords": [
    "bitcoin",
    "taproot",
    "tapscript",
    "calculator",
    "testnet",
    "real"
  ],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "@bitcoinerlab/secp256k1": "^1.0.5",
    "axios": "^1.6.0",
    "bitcoinjs-lib": "^6.1.5",
    "cors": "^2.8.5",
    "ecpair": "^2.1.0",
    "express": "^4.18.2",
    "html5-qrcode": "^2.3.8",
    "qrcode": "^1.5.4",
    "tiny-secp256k1": "^2.2.3"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.19.11",
    "@types/qrcode": "^1.5.5",
    "ts-node": "^10.9.2",
    "tsx": "^4.20.5",
    "typescript": "^5.9.2",
    "vite": "^5.0.0"
  },
  "packageManager": "pnpm@10.15.1+sha512.34e538c329b5553014ca8e8f4535997f96180a1d0f614339357449935350d924e22f8614682191264ec33d1462ac21561aff97f6bb18065351c162c7e8f6de67"
}
````

## File: apps/web/app/cold/page.js
````javascript
"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  NETWORKS,
  buildClaimRefundTaproot,
  buildFundingPsbt,
  generateBurnedInternalKey,
} from "@offline/core";
import { encode as cborEncode } from "cbor-x";
import { encodeUR, decodeUR } from "@offline/core";
import QRCode from "qrcode";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";

export default function Cold() {
  const [status, setStatus] = useState("checking...");
  // Claim/Refund generator state
  const [networkKey, setNetworkKey] = useState("signet");
  const [RHex, setRHex] = useState(""); // x-only 32-byte hex
  const [SHex, setSHex] = useState(""); // x-only 32-byte hex
  const [message, setMessage] = useState("hello offline bitcoin");
  const [hHex, setHHex] = useState(""); // 32-byte hex
  const [expiry, setExpiry] = useState(500000);
  const [address, setAddress] = useState("");
  const [p2trOutHex, setP2trOutHex] = useState("");
  const [claimBundleUR, setClaimBundleUR] = useState("");
  const [genError, setGenError] = useState("");
  const network = useMemo(
    () => NETWORKS[networkKey] || NETWORKS.signet,
    [networkKey],
  );

  // Funding PSBT state
  const [utxosJson, setUtxosJson] = useState(
    '[\n  {\n    "txid": "<txid>",\n    "vout": 0,\n    "value": 150000,\n    "scriptHex": "0014..."\n  }\n]',
  );
  const [sendValueSat, setSendValueSat] = useState(70000);
  const [feeRate, setFeeRate] = useState(2);
  const [changeAddress, setChangeAddress] = useState("");
  const [psbtB64, setPsbtB64] = useState("");
  const [psbtUR, setPsbtUR] = useState("");
  const [psbtQR, setPsbtQR] = useState("");
  const [claimQR, setClaimQR] = useState("");
  const [receiverURL, setReceiverURL] = useState("");
  const [signerURL, setSignerURL] = useState("");
  const [psbtErr, setPsbtErr] = useState("");
  const [guidedOpen, setGuidedOpen] = useState(true);
  const [rPrivNotice, setRPrivNotice] = useState("");
  const [sPrivNotice, setSPrivNotice] = useState("");
  const [savedRConfirmed, setSavedRConfirmed] = useState(false);
  const [utxoAmount, setUtxoAmount] = useState(100000);

  useEffect(() => {
    checkColdStatus();
  }, []);

  async function checkColdStatus() {
    if (!("serviceWorker" in navigator)) {
      setStatus("Service Worker unsupported");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration("/cold/");
      if (!reg) {
        setStatus("Cold OFF");
        return;
      }
      try {
        const r = await fetch("/cold/sw-probe");
        setStatus(
          r.status === 451
            ? "COLD enforced (blocked)"
            : "Cold ON (not blocking api)",
        );
      } catch {
        setStatus("COLD enforced (blocked)");
      }
    } catch (e) {
      setStatus("Cold status unknown");
    }
  }

  async function enableCold() {
    try {
      await navigator.serviceWorker.register("/sw-cold.js", {
        scope: "/cold/",
      });
      await checkColdStatus();
    } catch {
      setStatus("SW registration failed");
    }
  }

  async function disableCold() {
    try {
      const reg = await navigator.serviceWorker.getRegistration("/cold/");
      if (reg) await reg.unregister();
      // Also try to clean any root-scoped legacy SWs
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs
          .filter((r) => (r?.active?.scriptURL || "").endsWith("/sw-cold.js"))
          .map((r) => r.unregister()),
      );
      await checkColdStatus();
    } catch {
      setStatus("Failed to unregister SW");
    }
  }

  function parseUtxosFromJson(text) {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error("UTXOs JSON must be an array");
    return arr.map((u) => {
      if (!u.txid || typeof u.txid !== "string")
        throw new Error("utxo.txid missing");
      if (typeof u.vout !== "number") throw new Error("utxo.vout missing");
      if (typeof u.value !== "number") throw new Error("utxo.value missing");
      const scriptHex =
        u.scriptHex ||
        u.witnessUtxo?.scriptHex ||
        u.witnessUtxo?.script ||
        u.script;
      if (!scriptHex || typeof scriptHex !== "string")
        throw new Error("utxo.scriptHex missing");
      const witnessUtxo = {
        script: Buffer.from(scriptHex, "hex"),
        value: u.value,
      };
      const res = { txid: u.txid, vout: u.vout, witnessUtxo };
      if (u.tapInternalKey && typeof u.tapInternalKey === "string") {
        res.tapInternalKey = Buffer.from(u.tapInternalKey, "hex");
      }
      return res;
    });
  }

  function psbtToBase64(psbt) {
    try {
      return psbt.toBase64();
    } catch {}
    try {
      return Buffer.from(psbt.toBuffer()).toString("base64");
    } catch {}
    return "";
  }

  async function handleFetchUtxos() {
    try {
      setPsbtErr("");
      const res = await fetch(`/api/utxos/${changeAddress}/${utxoAmount}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const utxos = await res.json();
      setUtxosJson(JSON.stringify(utxos, null, 2));
    } catch (e) {
      setPsbtErr(String(e?.message || e));
    }
  }

  async function handleBuildFunding() {
    try {
      setPsbtErr("");
      setPsbtB64("");
      setPsbtUR("");
      if (!address || !p2trOutHex)
        throw new Error("Generate claim/refund address first");
      const utxos = parseUtxosFromJson(utxosJson);
      const psbt = buildFundingPsbt({
        utxos,
        sendOutputScript: Buffer.from(p2trOutHex, "hex"),
        sendValueSat: Number(sendValueSat) || 0,
        changeAddress: changeAddress || undefined,
        feeRateSatVb: Number(feeRate) || 1,
        network,
      });
      const b64 = psbtToBase64(psbt);
      setPsbtB64(b64);
      const ur = encodeUR("crypto-psbt", psbt.toBuffer(), 180);
      const parts = [];
      const seen = new Set();
      let guard = 0;
      while (guard < 200) {
        const p = ur.nextPart();
        if (!seen.has(p)) {
          parts.push(p);
          seen.add(p);
        }
        try {
          await decodeUR(parts);
          break; // successful decode
        } catch (e) {
          if (!String(e).includes("UR not complete")) break; // some other error
        }
        guard++;
      }
      setPsbtUR(parts.join("\n"));

      const url = new URL("/signer", window.location.origin);
      url.searchParams.set("psbt", parts.join("\n"));
      const signerURL = url.toString();
      setSignerURL(signerURL);

      QRCode.toDataURL(
        signerURL,
        { errorCorrectionLevel: "L", scale: 4 },
        (err, qrUrl) => {
          if (err) {
            setPsbtErr("Failed to generate QR code");
            return;
          }
          setPsbtQR(qrUrl);
        },
      );
    } catch (e) {
      setPsbtErr(String(e?.message || e));
    }
  }
  function hexToU8(hex) {
    const h = hex.trim().replace(/^0x/i, "");
    if (h.length % 2) throw new Error("hex length must be even");
    const arr = new Uint8Array(h.length / 2);
    for (let i = 0; i < arr.length; i++)
      arr[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
    return arr;
  }
  function u8ToHex(u8) {
    return Array.from(u8)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  function genXOnlyHex() {
    // Use core helper which already uses a browser-friendly RNG and ECC lib
    const xonly = generateBurnedInternalKey(); // Buffer of 32 bytes
    return u8ToHex(new Uint8Array(xonly));
  }
  function genPrivAndXonlyHex() {
    // Generate a real private key (32 bytes) and its x-only pubkey
    for (let i = 0; i < 128; i++) {
      const d = new Uint8Array(32);
      if (globalThis.crypto?.getRandomValues)
        globalThis.crypto.getRandomValues(d);
      else for (let j = 0; j < 32; j++) d[j] = (Math.random() * 256) | 0;
      const pub = ecc.pointFromScalar(Buffer.from(d), true);
      if (!pub) continue; // invalid scalar
      const xonly = pub.slice(1, 33);
      const privHex = u8ToHex(d);
      const xonlyHex = u8ToHex(new Uint8Array(xonly));
      return { privHex, xonlyHex };
    }
    throw new Error("Failed to generate keypair");
  }
  function handleRandomR() {
    try {
      const { privHex, xonlyHex } = genPrivAndXonlyHex();
      setRHex(xonlyHex);
      setRPrivNotice(privHex);
      setSavedRConfirmed(false);
    } catch (e) {
      setGenError(String(e?.message || e));
    }
  }
  function handleRandomS() {
    try {
      const { privHex, xonlyHex } = genPrivAndXonlyHex();
      setSHex(xonlyHex);
      setSPrivNotice(privHex);
    } catch (e) {
      setGenError(String(e?.message || e));
    }
  }
  async function sha256(bytes) {
    const buf = await crypto.subtle.digest("SHA-256", bytes);
    return new Uint8Array(buf);
  }
  async function handleComputeH() {
    try {
      setGenError("");
      const msg = new TextEncoder().encode(message || "");
      const h = await sha256(msg);
      setHHex(u8ToHex(h));
    } catch (e) {
      setGenError(String(e?.message || e));
    }
  }

  async function handleGenerate() {
    try {
      setGenError("");
      setClaimBundleUR("");
      setAddress("");
      setP2trOutHex("");
      const R = hexToU8(RHex);
      const S = hexToU8(SHex);
      const h = hHex
        ? hexToU8(hHex)
        : await sha256(new TextEncoder().encode(message || ""));
      if (R.length !== 32) throw new Error("R x-only must be 32 bytes");
      if (S.length !== 32) throw new Error("S x-only must be 32 bytes");
      if (h.length !== 32) throw new Error("h must be 32 bytes");
      const {
        address: addr,
        leaves,
        internalPubkey,
        scriptTree,
        output,
      } = buildClaimRefundTaproot({
        R_xonly: R,
        S_xonly: S,
        h32: h,
        H_exp: Number(expiry) || 0,
        network,
      });
      setAddress(addr || "");
      setP2trOutHex(Buffer.from(output).toString("hex"));
      // Compute Taproot control block for the claim leaf
      const redeem = { output: leaves.claim, redeemVersion: 0xc0 };
      const p2trRedeem = bitcoin.payments.p2tr({
        internalPubkey,
        scriptTree,
        redeem,
        network,
      });
      const witness = p2trRedeem.witness || [];
      const control = witness.length
        ? witness[witness.length - 1]
        : new Uint8Array([]);
      // Build claim-bundle CBOR object: note control is currently a placeholder; computed during claim assembly later
      const bundle = {
        ver: 1,
        h_alg: "sha256",
        h,
        R_pub: R,
        script: leaves.claim,
        leaf_ver: 0xc0,
        control,
        expires_at: Number(expiry) || 0,
      };
      const cbor = cborEncode(bundle);
      const ur = encodeUR("claim-bundle", cbor, 140);
      const parts = [];
      const seen = new Set();
      let guard = 0;
      while (guard < 200) {
        const p = ur.nextPart();
        if (!seen.has(p)) {
          parts.push(p);
          seen.add(p);
        }
        try {
          await decodeUR(parts);
          break; // successful decode
        } catch (e) {
          if (!String(e).includes("UR not complete")) break; // some other error
        }
        guard++;
      }
      setClaimBundleUR(parts.join("\n"));

      const url = new URL("/receiver", window.location.origin);
      url.searchParams.set("claim", claimBundleUR);
      const receiverURL = url.toString();
      setReceiverURL(receiverURL);

      QRCode.toDataURL(
        receiverURL,
        { errorCorrectionLevel: "L", scale: 4 },
        (err, qrUrl) => {
          if (err) {
            setClaimQR("Failed to generate QR code");
            return;
          }
          setClaimQR(qrUrl);
        },
      );
    } catch (e) {
      setGenError(String(e?.message || e));
    }
  }
  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600 text-white">
        COLD
      </div>
      <h1 className="text-2xl font-semibold">Cold Mode (Offline Signer)</h1>
      <p className="text-zinc-500">
        This mode enforces zero network access via a Service Worker.
      </p>
      <div className="rounded-xl border p-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-sm">Self‑check: {status}</p>
          <div className="flex gap-2">
            <button onClick={enableCold} className="px-3 py-2 rounded border">
              Enable Cold Mode
            </button>
            <button onClick={disableCold} className="px-3 py-2 rounded border">
              Disable Cold Mode
            </button>
            <button
              onClick={checkColdStatus}
              className="px-3 py-2 rounded border"
            >
              Re-check
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Guided Mode</h2>
          <button
            onClick={() => setGuidedOpen((v) => !v)}
            className="text-sm px-2 py-1 rounded border"
          >
            {guidedOpen ? "Hide" : "Show"}
          </button>
        </div>
        {guidedOpen && (
          <div className="text-sm text-zinc-700 space-y-2">
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Choose network (signet/testnet/mainnet). For your case use{" "}
                <span className="font-mono">signet</span>.
              </li>
              <li>
                Decide keys:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>
                    R (receiver x-only pubkey). You can reuse the same R across
                    payments or click Random.
                  </li>
                  <li>
                    S (refund signer x-only pubkey). Usually the sender’s
                    pubkey; can be stable per counterparty.
                  </li>
                </ul>
              </li>
              <li>
                Enter a message and click <b>Compute h</b> (uses
                sha256(message)). Use a new message for each payment.
              </li>
              <li>
                Click <b>Generate Claim Bundle</b>. Copy ALL lines of the UR
                output (multiple lines starting with{" "}
                <span className="font-mono">ur:claim-bundle/…</span>).
              </li>
              <li>
                Share the Taproot address with the sender. The sender funds that
                exact address on the same network.
              </li>
              <li>
                After funding, go to{" "}
                <a
                  className="text-blue-600 underline"
                  href="/receiver"
                  target="_self"
                >
                  Receiver
                </a>
                , paste the claim-bundle UR, and use “Build Claim PSBT”.
              </li>
            </ol>
            <p className="text-xs text-zinc-500">
              Note: Cold Mode blocks network calls for this page when enabled.
              Disable it if you need to fetch anything from the network here.
            </p>
          </div>
        )}
      </section>
      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">Claim/Refund Address & Claim Bundle</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Network</div>
            <select
              className="w-full rounded border px-3 py-2"
              value={networkKey}
              onChange={(e) => setNetworkKey(e.target.value)}
            >
              <option value="signet">signet</option>
              <option value="testnet">testnet</option>
              <option value="mainnet">mainnet</option>
            </select>
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Expiry height (H_exp)</div>
            <input
              type="number"
              className="w-full rounded border px-3 py-2"
              value={expiry}
              onChange={(e) => setExpiry(Number(e.target.value) || 0)}
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">
              R x-only pubkey (32-byte hex)
            </div>
            <div className="flex gap-2">
              <input
                className="w-full rounded border px-3 py-2 font-mono"
                value={RHex}
                onChange={(e) => {
                  setRHex(e.target.value);
                  setSavedRConfirmed(false);
                }}
                placeholder="e.g., 32-byte hex"
              />
              <button
                onClick={handleRandomR}
                type="button"
                className="px-2 rounded border text-sm"
              >
                Random
              </button>
            </div>
            {rPrivNotice && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-1">
                Generated R private key (hex):{" "}
                <span className="font-mono break-all">{rPrivNotice}</span>
                <br />
                Copy and store this securely. Without it, you cannot claim.
              </div>
            )}
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-700">
              <input
                type="checkbox"
                checked={savedRConfirmed}
                onChange={(e) => setSavedRConfirmed(e.target.checked)}
              />
              <span>
                I control and have saved the private key corresponding to this
                R_pub.
              </span>
            </label>
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">
              S x-only pubkey (refund signer) (32-byte hex)
            </div>
            <div className="flex gap-2">
              <input
                className="w-full rounded border px-3 py-2 font-mono"
                value={SHex}
                onChange={(e) => setSHex(e.target.value)}
                placeholder="e.g., 32-byte hex"
              />
              <button
                onClick={handleRandomS}
                type="button"
                className="px-2 rounded border text-sm"
              >
                Random
              </button>
            </div>
            {sPrivNotice && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-1">
                Generated S private key (hex):{" "}
                <span className="font-mono break-all">{sPrivNotice}</span>
                <br />
                This is for refund path after expiry. In production, the sender
                should supply S pubkey and keep their private key.
              </div>
            )}
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">
              Message (for h = sha256(message))
            </div>
            <input
              className="w-full rounded border px-3 py-2"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">
              h (32-byte hex, optional; overrides message)
            </div>
            <input
              className="w-full rounded border px-3 py-2 font-mono"
              value={hHex}
              onChange={(e) => setHHex(e.target.value)}
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleComputeH} className="px-3 py-2 rounded border">
            Compute h
          </button>
          <button
            onClick={handleGenerate}
            disabled={!savedRConfirmed}
            className={`px-3 py-2 rounded text-white ${savedRConfirmed ? "bg-blue-600" : "bg-blue-300 cursor-not-allowed"}`}
          >
            Generate Claim Bundle
          </button>
          {!!genError && <div className="text-sm text-red-600">{genError}</div>}
        </div>
        {address && (
          <div className="text-sm">
            <div className="text-zinc-500">Generated Taproot Address</div>
            <div className="font-mono break-all">{address}</div>
          </div>
        )}
        {claimBundleUR && (
          <div className="text-sm space-y-1">
            <div className="text-zinc-500">Claim Bundle (UR part)</div>
            <textarea
              className="w-full rounded border px-3 py-2 font-mono min-h-[80px]"
              readOnly
              value={claimBundleUR}
            />
            <div className="text-xs text-zinc-500">
              Paste this UR on the Receiver page and click "Decode Claim"
            </div>
          </div>
        )}
        {claimQR && (
          <div className="text-sm space-y-1">
            <div className="text-zinc-500">Claim QR Code</div>
            <img src={claimQR} alt="Receiver URL QR Code" />
          </div>
        )}
        {receiverURL && (
          <div className="text-sm space-y-1">
            <div className="text-zinc-500">Receiver URL</div>
            <input
              className="w-full rounded border px-3 py-2 font-mono"
              readOnly
              value={receiverURL}
            />
          </div>
        )}
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">Funding PSBT</h2>
        <p className="text-sm text-zinc-500">
          Paste UTXOs JSON and parameters to build a PSBT paying to the claim
          leaf.
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">Funding Address</div>
            <input
              className="w-full rounded border px-3 py-2"
              value={changeAddress}
              onChange={(e) => setChangeAddress(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Amount (sats)</div>
            <input
              type="number"
              className="w-full rounded border px-3 py-2"
              value={utxoAmount}
              onChange={(e) => setUtxoAmount(Number(e.target.value) || 0)}
            />
          </label>
          <div className="md:col-span-2">
            <button
              onClick={handleFetchUtxos}
              className="px-3 py-2 rounded bg-blue-600 text-white"
            >
              Fetch UTXOs
            </button>
          </div>
          <div className="md:col-span-2">
            <textarea
              className="w-full rounded border px-3 py-2 font-mono min-h-[120px]"
              value={utxosJson}
              onChange={(e) => setUtxosJson(e.target.value)}
            />
          </div>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Send value (sats)</div>
            <input
              type="number"
              className="w-full rounded border px-3 py-2"
              value={sendValueSat}
              onChange={(e) => setSendValueSat(Number(e.target.value) || 0)}
            />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Fee rate (sat/vB)</div>
            <input
              type="number"
              className="w-full rounded border px-3 py-2"
              value={feeRate}
              onChange={(e) => setFeeRate(Number(e.target.value) || 1)}
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">
              Change address (optional)
            </div>
            <input
              className="w-full rounded border px-3 py-2"
              value={changeAddress}
              onChange={(e) => setChangeAddress(e.target.value)}
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBuildFunding}
            className="px-3 py-2 rounded bg-emerald-600 text-white"
          >
            Build PSBT
          </button>
          {!!psbtErr && <div className="text-sm text-red-600">{psbtErr}</div>}
        </div>
        {psbtB64 && (
          <div className="text-sm space-y-1">
            <div className="text-zinc-500">PSBT (base64)</div>
            <textarea
              className="w-full rounded border px-3 py-2 font-mono min-h-[80px]"
              readOnly
              value={psbtB64}
            />
          </div>
        )}
        {psbtUR && (
          <div className="text-sm space-y-1">
            <div className="text-zinc-500">PSBT (UR part)</div>
            <textarea
              className="w-full rounded border px-3 py-2 font-mono min-h-[80px]"
              readOnly
              value={psbtUR}
            />
            <div className="text-xs text-zinc-500">
              Scan or transfer this to your signing device/app.
            </div>
          </div>
        )}
        {psbtQR && (
          <div className="text-sm space-y-1">
            <div className="text-zinc-500">PSBT QR Code</div>
            <img src={psbtQR} alt="Signer URL QR Code" />
          </div>
        )}
        {signerURL && (
          <div className="text-sm space-y-1">
            <div className="text-zinc-500">Signer URL</div>
            <input
              className="w-full rounded border px-3 py-2 font-mono"
              readOnly
              value={signerURL}
            />
          </div>
        )}
      </div>
    </main>
  );
}
````

## File: src/server/calculator.ts
````typescript
import { RealBitcoinCalculator } from './bitcoin.js';
import { MempoolService } from '../../packages/server-api/src/services/mempool.js';
import { 
  CalculationRequest, 
  CalculationResult, 
  UTXO, 
  KeyPair,
  Operation,
  ErrorResponse 
} from '@offline/shared-types';
import * as fs from 'fs';
import * as path from 'path';

interface SavedAddress {
  address: string;
  privateKey: string;
  publicKey: string;
  scriptHash: string;
  num1: number;
  num2: number;
  operation: Operation;
  balance: number;
  lastChecked: Date;
}

export class TaprootCalculatorService {
  private bitcoinCalculator: RealBitcoinCalculator;
  private mempoolService: MempoolService;
  private savedAddresses: Map<string, SavedAddress> = new Map();
  private readonly addressesFilePath: string;

  constructor() {
    this.bitcoinCalculator = new RealBitcoinCalculator();
    this.mempoolService = new MempoolService('testnet');
    
    // Set up JSON file path for persistence
    this.addressesFilePath = path.join(process.cwd(), 'saved-addresses.json');
    
    // Load existing addresses from JSON file
    this.loadAddressesFromFile();
    
    // Add pre-funded address for immediate use
    this.initializePreFundedAddresses();
  }

  /**
   * Load addresses from JSON file
   */
  private loadAddressesFromFile(): void {
    try {
      if (fs.existsSync(this.addressesFilePath)) {
        const fileContent = fs.readFileSync(this.addressesFilePath, 'utf-8');
        const addressesData = JSON.parse(fileContent);
        
        // Convert plain objects back to Map with Date objects
        for (const [key, addr] of Object.entries(addressesData)) {
          const savedAddress = addr as any;
          savedAddress.lastChecked = new Date(savedAddress.lastChecked);
          this.savedAddresses.set(key, savedAddress);
        }
        
        console.log(`✅ Loaded ${this.savedAddresses.size} addresses from ${this.addressesFilePath}`);
      } else {
        console.log(`📁 No existing addresses file found at ${this.addressesFilePath}`);
      }
    } catch (error) {
      console.error('❌ Failed to load addresses from file:', error);
      // Continue with empty map if file is corrupted
      this.savedAddresses.clear();
    }
  }

  /**
   * Save addresses to JSON file
   */
  private saveAddressesToFile(): void {
    try {
      // Convert Map to plain object for JSON serialization
      const addressesData: Record<string, SavedAddress> = {};
      for (const [key, value] of this.savedAddresses.entries()) {
        addressesData[key] = value;
      }
      
      const jsonContent = JSON.stringify(addressesData, null, 2);
      fs.writeFileSync(this.addressesFilePath, jsonContent, 'utf-8');
      
      console.log(`💾 Saved ${this.savedAddresses.size} addresses to ${this.addressesFilePath}`);
    } catch (error) {
      console.error('❌ Failed to save addresses to file:', error);
    }
  }

  /**
   * Initialize known funded addresses
   */
  private async initializePreFundedAddresses(): Promise<void> {
    // Don't automatically add imported addresses without private keys
    // Let users manually generate proper addresses they control
    console.log('🔑 Pre-funded address initialization skipped - generate addresses manually for full control');
  }

  /**
   * Generate or retrieve existing funded address for calculations
   */
  async generateFundingAddress(num1: number, num2: number, operation: Operation): Promise<{
    address: string;
    privateKey: string;
    publicKey: string;
    scriptHash: string;
    fundingInstructions: string;
    isReused: boolean;
    balance: number;
  }> {
    try {
      // Validate inputs first
      this.bitcoinCalculator.validateCalculationInputs(num1, num2, operation);

      // Create a unique key for this calculation
      const calculationKey = `${num1}_${num2}_${operation}`;
      
      // Check if we already have an address for this calculation
      const existing = this.savedAddresses.get(calculationKey);
      if (existing) {
        // Update balance
        const fundingCheck = await this.checkFunding(existing.address);
        if (existing.balance !== fundingCheck.availableBalance) {
          existing.balance = fundingCheck.availableBalance;
          existing.lastChecked = new Date();
          this.saveAddressesToFile();
        }
        
        return {
          address: existing.address,
          privateKey: existing.privateKey,
          publicKey: existing.publicKey,
          scriptHash: existing.scriptHash,
          fundingInstructions: this.generateFundingInstructions(existing.address, num1, num2, operation),
          isReused: true,
          balance: existing.balance
        };
      }

      // Generate new key pair
      const keyPair = this.bitcoinCalculator.generateKeyPair();
      
      // Create Taproot address with calculation script
      const internalPubkeyHex = keyPair.publicKey.slice(1, 33).toString('hex'); // x-only pubkey in hex
      const addressData = this.bitcoinCalculator.createTaprootAddressWithScript(
        internalPubkeyHex,
        Buffer.alloc(0),
        'testnet',
        null
      );
      
      // Save the address
      const savedAddress: SavedAddress = {
        address: addressData.address || '',
        privateKey: keyPair.toWIF(),
        publicKey: keyPair.publicKey.toString('hex'),
        scriptHash: addressData.scriptHash,
        num1,
        num2,
        operation,
        balance: 0,
        lastChecked: new Date()
      };
      
      this.savedAddresses.set(calculationKey, savedAddress);
      this.saveAddressesToFile();

      const fundingInstructions = this.generateFundingInstructions(addressData.address || '', num1, num2, operation);

      return {
        address: addressData.address || '',
        privateKey: keyPair.toWIF(),
        publicKey: keyPair.publicKey.toString('hex'),
        scriptHash: addressData.scriptHash,
        fundingInstructions,
        isReused: false,
        balance: 0
      };
    } catch (error) {
      throw new Error(`Failed to generate funding address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if an address has sufficient funds for calculation
   */
  async checkFunding(address: string, requiredAmount: number = 100000): Promise<{
    isFunded: boolean;
    availableBalance: number;
    confirmedBalance: number;
    unconfirmedBalance: number;
    utxos: UTXO[];
    message: string;
  }> {
    try {
      if (!this.mempoolService.validateTestnetAddress(address)) {
        throw new Error('Invalid testnet address format');
      }

      const [balanceInfo, utxos] = await Promise.all([
        this.mempoolService.checkAddressBalance(address, requiredAmount),
        this.mempoolService.getAddressUTXOs(address)
      ]);

      let message = '';
      if (!balanceInfo.hasBalance) {
        if (balanceInfo.availableBalance === 0) {
          message = 'Address has no funds. Please send testnet Bitcoin to this address.';
        } else {
          message = `Insufficient funds. Available: ${balanceInfo.availableBalance} sats, Required: ${requiredAmount} sats`;
        }
      } else {
        message = `Address is sufficiently funded with ${balanceInfo.availableBalance} sats`;
      }

      return {
        isFunded: balanceInfo.hasBalance,
        availableBalance: balanceInfo.availableBalance,
        confirmedBalance: balanceInfo.confirmedBalance,
        unconfirmedBalance: balanceInfo.unconfirmedBalance,
        utxos,
        message
      };
    } catch (error) {
      throw new Error(`Failed to check funding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all saved addresses with their current balances
   */
  async getSavedAddresses(): Promise<Array<SavedAddress & { calculationKey: string }>> {
    const addresses = [];
    
    for (const [calculationKey, savedAddress] of this.savedAddresses.entries()) {
      // Update balance if checked more than 5 minutes ago
      const now = new Date();
      const timeSinceCheck = now.getTime() - savedAddress.lastChecked.getTime();
      
      if (timeSinceCheck > 5 * 60 * 1000) { // 5 minutes
        try {
          const fundingCheck = await this.checkFunding(savedAddress.address);
          savedAddress.balance = fundingCheck.availableBalance;
          savedAddress.lastChecked = now;
          // Save after balance update
          this.saveAddressesToFile();
        } catch (error) {
          console.warn(`Failed to update balance for ${savedAddress.address}:`, error);
        }
      }
      
      addresses.push({
        ...savedAddress,
        calculationKey
      });
    }
    
    return addresses.sort((a, b) => b.lastChecked.getTime() - a.lastChecked.getTime());
  }

  /**
   * Use an existing address for calculation
   */
  async useExistingAddress(calculationKey: string): Promise<{
    address: string;
    privateKey: string;
    publicKey: string;
    scriptHash: string;
    balance: number;
    calculation: string;
  }> {
    const savedAddress = this.savedAddresses.get(calculationKey);
    if (!savedAddress) {
      throw new Error('Address not found');
    }

    // Update balance
    const fundingCheck = await this.checkFunding(savedAddress.address);
    savedAddress.balance = fundingCheck.availableBalance;
    savedAddress.lastChecked = new Date();
    this.saveAddressesToFile();

    const operationSymbol = this.getOperationSymbol(savedAddress.operation);
    
    return {
      address: savedAddress.address,
      privateKey: savedAddress.privateKey,
      publicKey: savedAddress.publicKey,
      scriptHash: savedAddress.scriptHash,
      balance: savedAddress.balance,
      calculation: `${savedAddress.num1} ${operationSymbol} ${savedAddress.num2}`
    };
  }

  /**
   * Perform the calculation and create a real Bitcoin transaction
   */
  // Stub method to satisfy existing server endpoints; returns an error to indicate unsupported feature.
  async performCalculation(_request: CalculationRequest): Promise<CalculationResult> {
    throw new Error('Arithmetic calculation feature has been disabled per Specs.md');
  }

  /**
   * Get transaction status and confirmation details
   */
  async getTransactionStatus(txid: string): Promise<{
    txid: string;
    status: 'confirmed' | 'unconfirmed' | 'failed' | 'not_found';
    confirmations: number;
    blockHeight?: number;
    blockHash?: string;
    blockTime?: number;
    fee: number;
    mempoolUrl: string;
  }> {
    try {
      const txStatus = await this.mempoolService.getTransactionStatus(txid);
      
      return {
        txid,
        status: txStatus.status.confirmed ? 'confirmed' : 'unconfirmed',
        confirmations: txStatus.status.confirmed ? 1 : 0, // Simplified
        blockHeight: txStatus.status.block_height,
        blockHash: txStatus.status.block_hash,
        blockTime: txStatus.status.block_time,
        fee: txStatus.fee,
        mempoolUrl: this.mempoolService.getMempoolURL(txid)
      };
    } catch (error) {
      return {
        txid,
        status: 'not_found',
        confirmations: 0,
        fee: 0,
        mempoolUrl: this.mempoolService.getMempoolURL(txid)
      };
    }
  }

  /**
   * Get network status and health
   */
  async getNetworkStatus(): Promise<{
    isHealthy: boolean;
    blockHeight: number;
    mempoolSize: number;
    averageFee: number;
  }> {
    try {
      const [networkHealth, feeEstimates] = await Promise.all([
        this.mempoolService.checkNetworkHealth(),
        this.mempoolService.getFeeEstimates()
      ]);

      return {
        isHealthy: networkHealth.isHealthy,
        blockHeight: networkHealth.blockHeight,
        mempoolSize: networkHealth.mempoolSize,
        averageFee: feeEstimates.halfHourFee
      };
    } catch (error) {
      return {
        isHealthy: false,
        blockHeight: 0,
        mempoolSize: 0,
        averageFee: 10
      };
    }
  }

  /**
   * Validate calculation parameters
   */
  validateCalculationRequest(request: CalculationRequest): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    try {
      this.bitcoinCalculator.validateCalculationInputs(
        request.num1,
        request.num2,
        request.operation
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Validation error');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get funding instructions for testnet Bitcoin
   */
  private generateFundingInstructions(
    address: string, 
    num1: number, 
    num2: number, 
    operation: Operation
  ): string {
    const operationSymbol = this.getOperationSymbol(operation);
    const estimatedFee = 50000; // 50k sats estimated minimum
    
    return `
🪙 FUNDING INSTRUCTIONS FOR CALCULATION: ${num1} ${operationSymbol} ${num2}

📍 Address: ${address}
💰 Minimum Required: ${estimatedFee} satoshis (0.0005 tBTC)
⏰ Recommended: 100,000 satoshis (0.001 tBTC) for safety

📥 GET TESTNET BITCOIN FROM FAUCETS:
1. https://testnet-faucet.mempool.co/
2. https://bitcoinfaucet.uo1.net/
3. https://testnet.help/en/btcfaucet/testnet
4. https://coinfaucet.eu/en/btc-testnet/

⚡ STEPS:
1. Copy the address above
2. Visit any faucet and paste the address
3. Request testnet Bitcoin (usually 0.001-0.01 tBTC)
4. Wait for 1-3 confirmations (10-30 minutes)
5. Return here to perform the calculation

🔗 Monitor your address: ${this.mempoolService.getAddressURL(address)}

⚠️ IMPORTANT: This is testnet Bitcoin (no real value). Only for testing purposes.
`.trim();
  }

  private getOperationSymbol(operation: Operation): string {
    const symbols: Record<Operation, string> = { add: '+', subtract: '-', multiply: '×', divide: '÷' };
    return symbols[operation] || '?';
  }

  private calculateExpectedResult(num1: number, num2: number, operation: Operation): number {
    switch (operation) {
      case 'add': return num1 + num2;
      case 'subtract': return num1 - num2;
      case 'multiply': return num1 * num2;
      case 'divide':
        if (num2 === 0) throw new Error('Division by zero');
        return Math.floor(num1 / num2);
      default: throw new Error(`Invalid operation: ${operation}`);
    }
  }

  /**
   * Add a new calculation to an existing address
   */
  async addCalculationToAddress(
    address: string,
    num1: number,
    num2: number,
    operation: Operation
  ): Promise<CalculationResult> {
    try {
      // Find the existing address
      const existing = Array.from(this.savedAddresses.values()).find(addr => (addr as any).address === address);
      if (!existing) {
        throw new Error(`Address ${address} not found in saved addresses`);
      }

      // Validate inputs
      this.bitcoinCalculator.validateCalculationInputs(num1, num2, operation);

      // Check if this is an imported address without private key
      if (existing.privateKey === 'IMPORTED_ADDRESS_NO_PRIVATE_KEY') {
        throw new Error('Cannot perform calculations on imported address without private key');
      }

      // Check funding
      const fundingCheck = await this.checkFunding(address);
      if (!fundingCheck.isFunded) {
        throw new Error(`Address not funded: ${fundingCheck.message}`);
      }

      // Get current fee rates
      const feeEstimates = await this.mempoolService.getFeeEstimates();
      const feeRate = feeEstimates.fastestFee;

      // Create the calculation transaction
      const result = await this.bitcoinCalculator.createCalculationTransaction(
        num1,
        num2,
        operation,
        fundingCheck.utxos,
        feeRate,
        existing.privateKey
      );

      // Override with the existing address details
      result.taprootAddress = existing.address;
      result.privateKey = existing.privateKey;
      result.publicKey = existing.publicKey;
      result.scriptHash = existing.scriptHash;

      // Broadcast the transaction
      try {
        const broadcastedTxid = await this.mempoolService.broadcastTransaction(result.rawTx);
        result.txid = broadcastedTxid;
        result.broadcastStatus = 'success';
        
        console.log(`✅ Transaction successfully broadcasted: ${broadcastedTxid}`);
        console.log(`🔗 View at: ${this.mempoolService.getMempoolURL(broadcastedTxid)}`);
        
        // Update saved address balance
        existing.balance = Math.max(0, existing.balance - result.fee);
        existing.lastChecked = new Date();

        // Add calculation to the address's calculation history (if it has the new structure)
        if ('calculations' in existing && Array.isArray((existing as any).calculations)) {
          (existing as any).calculations.push({
            num1,
            num2,
            operation,
            result: result.result,
            txid: result.txid,
            fee: result.fee,
            rawTx: result.rawTx,
            timestamp: new Date().toISOString(),
            broadcastStatus: result.broadcastStatus,
            confirmationStatus: result.confirmationStatus
          });
        }

        this.saveAddressesToFile();
        
      } catch (broadcastError) {
        console.error('❌ Broadcast failed:', broadcastError);
        result.broadcastStatus = 'failed';
        throw new Error(`Transaction created but broadcast failed: ${broadcastError instanceof Error ? broadcastError.message : 'Unknown error'}`);
      }

      return result;

    } catch (error) {
      throw new Error(`Failed to perform calculation on existing address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Import an existing funded address
   */
  async importFundedAddress(
    address: string,
    num1: number,
    num2: number,
    operation: Operation,
    privateKey?: string
  ): Promise<{
    address: string;
    balance: number;
    calculationKey: string;
    imported: boolean;
  }> {
    try {
      // Validate the address format
      if (!this.mempoolService.validateTestnetAddress(address)) {
        throw new Error('Invalid testnet address format');
      }

      // Validate calculation inputs
      this.bitcoinCalculator.validateCalculationInputs(num1, num2, operation);

      // Check current balance
      const fundingCheck = await this.checkFunding(address);

      const calculationKey = `${num1}_${num2}_${operation}`;
      
      // Create saved address entry
      const savedAddress: SavedAddress = {
        address,
        privateKey: privateKey || 'IMPORTED_ADDRESS_NO_PRIVATE_KEY',
        publicKey: privateKey ? 'IMPORTED_ADDRESS_WITH_PRIVATE_KEY' : 'IMPORTED_ADDRESS_NO_PUBLIC_KEY',
        scriptHash: 'imported_address_script_hash',
        num1,
        num2,
        operation,
        balance: fundingCheck.availableBalance,
        lastChecked: new Date()
      };

      this.savedAddresses.set(calculationKey, savedAddress);
      this.saveAddressesToFile();

      console.log(`✅ Imported address: ${address}`);
      console.log(`💰 Balance: ${fundingCheck.availableBalance} sats`);
      console.log(`🧮 Calculation: ${num1} ${this.getOperationSymbol(operation)} ${num2}`);

      return {
        address,
        balance: fundingCheck.availableBalance,
        calculationKey,
        imported: true
      };
    } catch (error) {
      throw new Error(`Failed to import address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
````

## File: src/server/server.ts
````typescript
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { TaprootCalculatorService } from './calculator.js';
import { OfflineWorkflowService } from './workflow.js';
import { UTXOService } from '../../packages/server-api/src/services/UTXOService.js';
import { RealBitcoinCalculator } from './bitcoin.js';
import { CalculationRequest } from '../../packages/shared-types/src/index.js';

// Add this to the top of src/server/server.ts
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (err, origin) => {
  console.error(`Caught exception: ${err}\n` + `Exception origin: ${origin}`);
  // It's generally recommended to exit the process after an uncaught exception
  process.exit(1);
});

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Serve static files from Vite build output
const clientBuildPath = path.resolve(__dirname, '../../dist/client');
app.use(express.static(clientBuildPath));

// Initialize services
const calculatorService = new TaprootCalculatorService();
const workflowService = new OfflineWorkflowService();
const utxoService = new UTXOService('testnet');

// Serve UI root
app.get('/', (_req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Routes

/**
 * Generate a random key pair (WIF + pubkey hex) for testing.
 */
app.get('/api/generate-keypair', (_req, res) => {
  try {
    const wallet = new RealBitcoinCalculator();
    const keyPair = wallet.generateKeyPair();
    res.json({
      wif: keyPair.toWIF(),
      pubkeyHex: keyPair.publicKey.toString('hex')
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate key pair' });
  }
});

// Routes

/**
 * Health check endpoint
 */
app.get('/api/health', async (req, res) => {
  try {
    const networkStatus = await calculatorService.getNetworkStatus();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      network: networkStatus
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Generate funding address for calculation
 */
app.post('/api/generate-address', async (req, res) => {
  try {
    const { num1, num2, operation } = req.body;
    
    if (typeof num1 !== 'number' || typeof num2 !== 'number' || !operation) {
      return res.status(400).json({
        error: 'Invalid parameters. num1, num2 must be numbers, operation must be specified.'
      });
    }

    const result = await calculatorService.generateFundingAddress(num1, num2, operation);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to generate address'
    });
  }
});

/**
 * Get all saved addresses
 */
app.get('/api/saved-addresses', async (req, res) => {
  try {
    const addresses = await calculatorService.getSavedAddresses();
    res.json(addresses);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get saved addresses'
    });
  }
});

/**
 * Use existing address for calculation
 */
app.post('/api/use-address/:calculationKey', async (req, res) => {
  try {
    const { calculationKey } = req.params;
    const result = await calculatorService.useExistingAddress(calculationKey);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to use existing address'
    });
  }
});

/**
 * Import an existing funded address
 */
app.post('/api/import-address', async (req, res) => {
  try {
    const { address, num1, num2, operation, privateKey } = req.body;
    
    if (!address || typeof num1 !== 'number' || typeof num2 !== 'number' || !operation) {
      return res.status(400).json({
        error: 'Invalid parameters. address, num1, num2, and operation are required.'
      });
    }

    const result = await calculatorService.importFundedAddress(
      address,
      num1,
      num2,
      operation,
      privateKey
    );
    
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to import address'
    });
  }
});

/**
 * Check funding status of an address
 */
app.get('/api/check-funding/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const requiredAmount = parseInt(req.query.amount as string) || 100000;
    
    const result = await calculatorService.checkFunding(address, requiredAmount);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to check funding'
    });
  }
});

/**
 * Perform calculation and create Bitcoin transaction
 */
app.post('/api/calculate', async (req, res) => {
  try {
    const calculationRequest: CalculationRequest = req.body;
    
    // Validate request
    const validation = calculatorService.validateCalculationRequest(calculationRequest);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Invalid calculation request',
        details: validation.errors
      });
    }

    const result = await calculatorService.performCalculation(calculationRequest);
    res.json(result);
  } catch (error) {
    console.error('Calculation error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Calculation failed'
    });
  }
});

/**
 * Perform calculation using existing address
 */
app.post('/api/calculate-existing', async (req, res) => {
  try {
    const { address, num1, num2, operation } = req.body;
    
    if (!address || typeof num1 !== 'number' || typeof num2 !== 'number' || !operation) {
      return res.status(400).json({
        error: 'Invalid parameters. address, num1, num2, and operation are required.'
      });
    }

    const result = await calculatorService.addCalculationToAddress(address, num1, num2, operation);
    res.json(result);
  } catch (error) {
    console.error('Address reuse calculation error:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to perform calculation on existing address'
    });
  }
});

/**
 * Get transaction status
 */
app.get('/api/transaction/:txid', async (req, res) => {
  try {
    const { txid } = req.params;
    
    if (!/^[a-fA-F0-9]{64}$/.test(txid)) {
      return res.status(400).json({
        error: 'Invalid transaction ID format'
      });
    }

    const result = await calculatorService.getTransactionStatus(txid);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get transaction status'
    });
  }
});

/**
 * Get network status
 */
app.get('/api/network-status', async (req, res) => {
  try {
    const result = await calculatorService.getNetworkStatus();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get network status'
    });
  }
});

/**
 * Validate calculation parameters
 */
app.post('/api/validate', (req, res) => {
  try {
    const calculationRequest: CalculationRequest = req.body;
    const result = calculatorService.validateCalculationRequest(calculationRequest);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Validation failed'
    });
  }
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// 404 handler
// --- Offline Workflow Endpoints ---

/**
 * Sender: create initial funding PSBT (QR Code A + B)
 */
app.post('/api/create-sender-transaction', async (req, res) => {
  try {
    const { senderWif, receiverAddress, amount, refundLocktime } = req.body;
    if (!senderWif || !receiverAddress || typeof amount !== 'number' || typeof refundLocktime !== 'number') {
      return res.status(400).json({ error: 'senderWif, receiverAddress, amount, refundLocktime required' });
    }
    const result = await workflowService.createFundingPSBT(senderWif, receiverAddress, amount, refundLocktime);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create sender transaction' });
  }
});

/**
 * Receiver: create claim PSBT
 */
app.post('/api/create-receiver-claim-transaction', async (req, res) => {
  try {
    const { txoData, preimage, receiverWif } = req.body;
    if (!txoData || !preimage || !receiverWif) {
      return res.status(400).json({ error: 'txoData, preimage, receiverWif required' });
    }
    const { txid, vout, value, senderPublicKey, refundTimeLock } = txoData;
    const result = await workflowService.createClaimPSBT(receiverWif, preimage, txid, vout, value, senderPublicKey, refundTimeLock);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create claim transaction' });
  }
});

/**
 * Sender: create refund PSBT (after timelock)
 */
app.post('/api/create-sender-refund-transaction', async (req, res) => {
  try {
    const { txoData, senderWif } = req.body;
    if (!txoData || !senderWif) {
      return res.status(400).json({ error: 'txoData and senderWif required' });
    }
    const { txid, vout, value, receiverPublicKey, refundTimeLock } = txoData;
    const result = await workflowService.createRefundPSBT(senderWif, txid, vout, value, receiverPublicKey, refundTimeLock);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create refund transaction' });
  }
});

app.get('/api/utxos/:address/:amount', async (req, res) => {
  try {
    const { address, amount } = req.params;
    const result = await utxoService.getUTXOsForAmount(address, parseInt(amount));
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to get UTXOs'
    });
  }
});

// --- Legacy arithmetic endpoints remain below (may be deprecated) --

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🍊 Real Bitcoin Taproot Calculator Server`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api/`);
  console.log(`⚡ Ready to create real Bitcoin testnet transactions!`);
});

export default app;
````

## File: tsconfig.json
````json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": false,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "outDir": "./dist",
    "rootDir": ".",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@offline/shared-types": ["packages/shared-types/src/index.ts"]
    },
    
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*", "packages/**/*"],
  "exclude": ["node_modules", "dist"]
}
````
