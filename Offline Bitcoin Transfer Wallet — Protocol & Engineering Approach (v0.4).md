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