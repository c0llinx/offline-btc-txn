# Offline Bitcoin Transfer Wallet: A Secure Air-Gapped Protocol for Trustless Bitcoin Transactions

**Version 1.0**

**Authors:** George Akor, Collins Okafor, Josiah Isong, Saviour Igboanusi  
**Affiliation:** Networked Systems Laboratory Blockchain Project Group  
**Location:** Gumi-si, Gyeongsangbuk-do, South Korea  
**Date:** December 2025

---

## Abstract

We present a protocol and reference implementation for conducting Bitcoin transactions from air-gapped devices without requiring real-time network connectivity. The system leverages Bitcoin's Taproot upgrade (BIP-341) to construct conditional payment outputs with two spending paths: a hash-locked claim path for receivers and a time-locked refund path for senders. Data transfer between offline and online environments is accomplished through QR codes using the Uniform Resource (UR) encoding standard. Our implementation demonstrates that secure, non-custodial Bitcoin transfers can be achieved with commodity hardware while maintaining strong security guarantees. The protocol ensures that private keys never leave the offline environment, receivers can claim funds by revealing a preimage, and senders can recover funds after a configurable timeout if claims are not executed.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Problem Statement](#2-problem-statement)
3. [Technical Background](#3-technical-background)
4. [System Architecture](#4-system-architecture)
5. [Protocol Specification](#5-protocol-specification)
6. [Security Analysis](#6-security-analysis)
7. [Implementation](#7-implementation)
8. [Use Cases](#8-use-cases)
9. [Comparison with Alternatives](#9-comparison-with-alternatives)
10. [Future Work](#10-future-work)
11. [Conclusion](#11-conclusion)
12. [References](#12-references)

---

## 1. Introduction

### 1.1 Motivation

Bitcoin's security model fundamentally relies on the protection of private keys. The compromise of a private key results in irreversible loss of funds. While hardware wallets and multi-signature schemes provide enhanced security, they often require network connectivity during transaction signing, creating potential attack vectors through malware, phishing, or network-based exploits.

Air-gapped computing—where a device is physically isolated from all networks—represents the gold standard for protecting cryptographic secrets. However, traditional air-gapped Bitcoin workflows suffer from significant usability challenges:

1. **Complex PSBT workflows** requiring multiple QR code scans
2. **No support for conditional payments** without online coordination
3. **Limited receiver flexibility** in claiming funds
4. **No automatic refund mechanism** if receivers fail to act

### 1.2 Contribution

This paper presents a complete protocol for offline Bitcoin transactions that addresses these limitations:

- **Single-bundle handoff:** Senders create a complete claim bundle in one operation
- **Conditional payments:** Hash-locked outputs enable trustless transfers
- **Automatic refunds:** Time-locked recovery ensures sender funds are never permanently lost
- **Taproot privacy:** Successful claims and refunds appear as standard single-signature transactions on-chain
- **QR-based transfer:** All data exchange uses scannable UR-encoded payloads

### 1.3 Scope

This protocol covers on-chain Bitcoin payments only. Lightning Network integration, cross-chain swaps, and custodial solutions are explicitly out of scope for the current version.

---

## 2. Problem Statement

### 2.1 The Security-Usability Tradeoff

Bitcoin holders who prioritize security face a fundamental dilemma:

**Maximum Security (Air-Gapped):**
- Private keys stored on offline devices
- No exposure to network-based attacks
- Complex, multi-step transaction workflows
- Requires technical expertise

**Maximum Usability (Hot Wallets):**
- Keys accessible on internet-connected devices
- Simple, one-click transactions
- Vulnerable to malware, phishing, and remote attacks
- Unsuitable for significant holdings

### 2.2 Limitations of Existing Solutions

**Hardware Wallets:**
- Require USB/Bluetooth connection to online devices
- Firmware vulnerabilities can compromise keys
- No native support for conditional payments
- Single point of failure

**Multi-Signature Schemes:**
- Complex setup and coordination
- Key management overhead
- No offline-first design
- Requires online co-signers

**Traditional Air-Gapped Workflows:**
- Multiple round-trips between devices
- No receiver-side flexibility
- No automatic timeout/refund
- Poor user experience

### 2.3 Requirements

An ideal solution must satisfy:

1. **Security:** Private keys never leave the offline environment
2. **Liveness:** Either the receiver claims funds, or the sender recovers them
3. **Privacy:** Minimize on-chain fingerprinting and metadata leakage
4. **Practicality:** Work with commodity devices and standard QR codes
5. **Interoperability:** Use established Bitcoin standards (PSBT, Taproot, UR)

---

## 3. Technical Background

### 3.1 Bitcoin Taproot (BIP-341)

Taproot, activated in November 2021, introduces Pay-to-Taproot (P2TR) outputs that combine:

- **Key path:** Spendable with a single Schnorr signature
- **Script path:** Spendable by satisfying one of multiple script conditions

A P2TR output commits to an internal public key and a Merkle root of script leaves:

```
output_key = internal_key + H(internal_key || merkle_root) * G
```

When spending via the script path, the spender reveals:
- The script being executed
- A control block proving the script's inclusion in the tree
- Witness data satisfying the script

**Privacy benefit:** If the key path is used, no scripts are revealed. If the script path is used, only the executed script is revealed—other leaves remain hidden.

### 3.2 Hash Time-Locked Contracts (HTLCs)

HTLCs enable conditional payments using two primitives:

**Hash Lock:** Funds are spendable by revealing a preimage `x` such that `H(x) = h`

```
OP_SHA256 <h> OP_EQUAL
```

**Time Lock:** Funds are spendable only after a specified block height

```
<height> OP_CHECKLOCKTIMEVERIFY OP_DROP
```

Combining these creates a payment that:
- Can be claimed by the receiver with knowledge of `x`
- Can be refunded by the sender after timeout

### 3.3 Partially Signed Bitcoin Transactions (BIP-174)

PSBTs provide a standard format for incomplete transactions, enabling:

- Separation of transaction construction and signing
- Multi-party signing workflows
- Hardware wallet compatibility

BIP-371 extends PSBT for Taproot, adding fields for:
- Taproot key paths and script paths
- Control blocks and leaf scripts
- Schnorr signatures

### 3.4 Uniform Resources (UR)

The UR encoding standard (developed by Blockchain Commons) enables:

- Binary data transmission via QR codes
- Animated multi-part QR sequences for large payloads
- Type-tagged payloads for unambiguous parsing

Format: `ur:<type>/<base64url-encoded-cbor>`

---

## 4. System Architecture

### 4.1 Design Principles

1. **Client-Side Cryptography:** All private key operations execute in the browser
2. **Offline-First:** Core functionality works without network connectivity
3. **Modular Architecture:** Separation of concerns (UI, crypto, network)
4. **Zero Backend Dependencies:** No server-side state or key storage
5. **Progressive Enhancement:** Graceful degradation for limited environments

### 4.2 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     OFFLINE ENVIRONMENT                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    Cold Mode                          │  │
│  │  • Private key storage                               │  │
│  │  • Taproot script construction                       │  │
│  │  • PSBT signing                                      │  │
│  │  • Claim bundle generation                           │  │
│  │  • QR code display                                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ QR Code / UR String
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     ONLINE ENVIRONMENT                       │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Watch-Only  │  │   Receiver   │  │    Refund    │     │
│  │    Mode      │  │    Mode      │  │    Mode      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                 │
│  ┌─────────────────────────▼──────────────────────────┐    │
│  │              Network Layer (API Routes)             │    │
│  │  • UTXO fetching                                   │    │
│  │  • Transaction broadcast                           │    │
│  │  • Balance queries                                 │    │
│  └─────────────────────────┬──────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    BITCOIN NETWORK                           │
│  • mempool.space API                                        │
│  • Bitcoin nodes                                            │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Operational Modes

**Cold Mode (Offline Signer):**
- Generates and stores private keys
- Constructs Taproot commitment addresses
- Signs funding transactions
- Creates claim bundles for receivers
- Operates without network access

**Watch-Only Mode (Online Broadcaster):**
- Broadcasts pre-signed transactions
- Monitors transaction confirmations
- No access to private keys

**Receiver Mode:**
- Imports claim bundles via QR scan or text
- Constructs and signs claim transactions
- Broadcasts claims to the network

**Refund Mode:**
- Signs refund transactions after timeout
- Recovers funds from unclaimed commitments

### 4.4 Data Flow

```
Sender (Cold Mode)                    Receiver
       │                                  │
       │ 1. Generate preimage x           │
       │ 2. Compute h = SHA256(x)         │
       │ 3. Build Taproot scripts         │
       │ 4. Create funding PSBT           │
       │ 5. Sign funding transaction      │
       │                                  │
       ├──── Claim Bundle (QR/UR) ───────>│
       │     • h (hash)                   │
       │     • claim script               │
       │     • control block              │
       │     • funding details            │
       │                                  │
       │                    6. Verify bundle
       │                    7. Wait for funding confirmation
       │                    8. Build claim transaction
       │                    9. Provide preimage x
       │                   10. Sign (if required)
       │                   11. Broadcast claim
       │                                  │
       │ [If no claim by H_exp]           │
       │                                  │
       │ 12. Build refund transaction     │
       │ 13. Sign with sender key         │
       │ 14. Broadcast refund             │
       │                                  │
```

---

## 5. Protocol Specification

### 5.1 Cryptographic Primitives

**Key Generation:**
- ECDSA/Schnorr keys on secp256k1 curve
- 32-byte random scalars from cryptographically secure RNG
- X-only public keys (32 bytes) for Taproot

**Hash Function:**
- SHA-256 for preimage commitments
- Tagged hashes per BIP-340/341 for Taproot operations

**Signature Scheme:**
- Schnorr signatures (BIP-340) for Taproot spends
- 64-byte signatures without sighash byte for script path

### 5.2 Script Construction

**Internal Key (Unspendable):**

To force script-path-only spending, we generate an unspendable internal key:

```javascript
function generateBurnedInternalKey() {
  // Generate random scalar and derive point
  // Return x-only coordinate
  // Key path is effectively disabled
}
```

**Claim Script:**

Two variants based on security requirements:

*Hash-Only (No Signature Required):*
```
OP_SHA256 <h> OP_EQUAL
```
- Anyone with preimage can claim
- Suitable for trusted receiver scenarios

*Hash + Signature:*
```
OP_SHA256 <h> OP_EQUALVERIFY <R_xonly> OP_CHECKSIG
```
- Requires both preimage and receiver's signature
- Prevents front-running by third parties

**Refund Script:**
```
<H_exp> OP_CHECKLOCKTIMEVERIFY OP_DROP <S_xonly> OP_CHECKSIG
```
- Spendable only after block height H_exp
- Requires sender's signature

**Taproot Tree:**
```
        [Internal Key: Unspendable]
                    │
            ┌───────┴───────┐
            │               │
       [Claim Leaf]    [Refund Leaf]
```

### 5.3 Claim Bundle Format

The claim bundle is CBOR-encoded with the following schema:

```javascript
{
  ver: 1,                        // Protocol version
  h_alg: "sha256",              // Hash algorithm
  h: Uint8Array(32),            // Hash commitment
  R_pub: Uint8Array(32) | null, // Receiver's x-only pubkey
  script: Uint8Array,           // Claim script bytecode
  leaf_ver: 0xc0,               // Tapscript leaf version
  control: Uint8Array,          // Control block
  expires_at: number,           // Refund height (H_exp)
  
  // Optional funding details
  internal_pubkey: Uint8Array(32),
  address: string,              // P2TR address
  send_value_sat: number,       // Commitment amount
  fund_txid: Uint8Array(32),    // Funding transaction ID
  vout: number,                 // Output index
  value: number,                // UTXO value
  funding_script: Uint8Array,   // Output script
  fund_tx: Uint8Array,          // Raw funding transaction
  
  // Metadata
  broadcast_endpoint: string,   // API endpoint
  network: string,              // mainnet/testnet4/etc
  requires_signature: boolean,  // Claim requires R signature
  meta: object                  // Application-specific data
}
```

**UR Encoding:**
```
ur:claim-bundle/<base64url-cbor>
```

### 5.4 Witness Construction

**Claim Witness (Hash-Only):**
```
[preimage, script, control_block]
```

**Claim Witness (Hash + Signature):**
```
[signature, preimage, script, control_block]
```

**Refund Witness:**
```
[signature, script, control_block]
```

### 5.5 Transaction Structure

**Funding Transaction:**
- Inputs: Sender's Taproot UTXOs
- Outputs:
  - Commitment output (P2TR with claim/refund tree)
  - Change output (sender's address)

**Claim Transaction:**
- Input: Commitment UTXO (script path spend)
- Output: Receiver's destination address
- nLockTime: 0 (no time constraint)

**Refund Transaction:**
- Input: Commitment UTXO (script path spend)
- Output: Sender's recovery address
- nLockTime: ≥ H_exp (enforced by CLTV)

---

## 6. Security Analysis

### 6.1 Threat Model

**Assumptions:**
- Adversary can observe all network traffic and blockchain data
- Adversary cannot break standard cryptographic primitives
- Cold Mode device is physically secure and malware-free
- Online devices may be compromised (watch-only security)

**Out of Scope:**
- Physical attacks on offline devices
- Side-channel attacks
- Supply chain attacks on hardware
- Social engineering

### 6.2 Security Properties

**Property 1: Key Isolation**

*Claim:* Private keys never leave the Cold Mode environment.

*Proof:* 
- Cold Mode generates keys locally using browser crypto APIs
- Keys are stored in localStorage (browser-encrypted)
- Claim bundles contain only public keys and scripts
- No network stack is active in Cold Mode (service worker enforcement)

**Property 2: Claim Authenticity**

*Claim:* Only the intended receiver can claim funds (when signature required).

*Proof:*
- Claim script requires `OP_CHECKSIG` with receiver's public key
- Schnorr signatures are unforgeable under the discrete log assumption
- Preimage alone is insufficient without the corresponding private key

**Property 3: Refund Guarantee**

*Claim:* Sender can always recover funds after H_exp if unclaimed.

*Proof:*
- Refund script uses `OP_CHECKLOCKTIMEVERIFY` with H_exp
- After H_exp, sender's signature satisfies the script
- No other party can spend via refund path (requires sender's key)

**Property 4: Atomicity**

*Claim:* Either claim or refund succeeds, never both.

*Proof:*
- Both paths spend the same UTXO
- Bitcoin's UTXO model prevents double-spending
- First valid transaction to confirm wins

### 6.3 Attack Vectors and Mitigations

**Attack: Preimage Front-Running**

*Description:* Attacker observes preimage in mempool and submits competing claim.

*Mitigation:* 
- Use hash + signature variant (requires receiver's key)
- Hash-only variant should only be used with trusted receivers

**Attack: Fee Manipulation**

*Description:* Attacker floods mempool to delay claim/refund confirmation.

*Mitigation:*
- Support Replace-By-Fee (RBF) for funding transactions
- Support Child-Pays-For-Parent (CPFP) for claims
- Set appropriate H_exp buffer (e.g., 144 blocks = ~1 day)

**Attack: Race Condition at H_exp**

*Description:* Receiver and sender both attempt to spend near timeout.

*Mitigation:*
- Receiver should claim well before H_exp
- First valid transaction to confirm wins
- Recommend 6+ block buffer before H_exp

**Attack: Malicious Claim Bundle**

*Description:* Attacker provides crafted bundle to steal receiver's funds.

*Mitigation:*
- Strict CBOR schema validation
- Verify script matches expected format
- Confirm address derivation from provided data
- Never sign without verifying bundle contents

### 6.4 Trust Assumptions

| Component | Trust Level | Justification |
|-----------|-------------|---------------|
| Cold Mode Device | Full | Holds private keys |
| Online Device | Minimal | Watch-only, no keys |
| mempool.space API | Partial | UTXO/broadcast relay |
| Bitcoin Network | Consensus | Proof-of-work security |
| Browser Crypto | Standard | WebCrypto API |

---

## 7. Implementation

### 7.1 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 14, React 18 | Application framework |
| Styling | TailwindCSS | UI styling |
| Bitcoin | bitcoinjs-lib 6.1.5 | Transaction construction |
| Crypto | @bitcoinerlab/secp256k1 | Elliptic curve operations |
| Encoding | cbor-x | CBOR serialization |
| QR | qrcode | QR code generation |
| Storage | localStorage | Wallet persistence |

### 7.2 Core Modules

**`lib/offline-core/taproot.js`**
- `generateBurnedInternalKey()` - Creates unspendable internal key
- `buildClaimScript(R_xonly, h32)` - Constructs claim script
- `buildRefundScript(H_exp, S_xonly)` - Constructs refund script
- `buildClaimRefundTaproot(params)` - Builds complete Taproot output

**`lib/offline-core/psbt.js`**
- `buildFundingPsbt(params)` - Creates funding PSBT

**`lib/offline-core/ur.js`**
- `encodeUR(type, data)` - Encodes data to UR format
- `decodeUR(urString)` - Decodes UR string to data

**`lib/wallets.js`**
- Wallet generation, import, and storage
- Balance tracking and history
- CRUD operations

**`lib/server/utxo-service.js`**
- UTXO fetching from mempool.space
- Coin selection algorithms

### 7.3 API Routes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/broadcast` | POST | Broadcast signed transaction |
| `/api/utxos` | GET | Fetch UTXOs for address |
| `/api/balance/[network]/[address]` | GET | Get address balance |
| `/api/tx/[txid]` | GET | Get transaction details |

### 7.4 Security Enforcement

**Service Worker (Cold Mode):**
```javascript
// sw-cold.js
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/')) {
    event.respondWith(new Response('Blocked in Cold Mode', { 
      status: 451 
    }));
  }
});
```

**Input Validation:**
- Zod schemas for all user inputs
- Address format verification
- Amount range validation
- Script structure verification

---

## 8. Use Cases

### 8.1 Cold Storage Spending

**Scenario:** Alice holds significant Bitcoin in cold storage and wants to pay Bob.

**Workflow:**
1. Alice's offline device generates a claim bundle
2. Alice shows QR code to Bob (or sends via secure channel)
3. Alice's watch-only device broadcasts the funding transaction
4. Bob scans the bundle and claims funds using the preimage
5. If Bob doesn't claim within 7 days, Alice refunds automatically

**Benefits:**
- Alice's keys never touch the internet
- Bob receives funds without Alice being online
- Automatic refund prevents permanent loss

### 8.2 Field Agent Payments

**Scenario:** A dispatcher needs to pay field agents who have intermittent connectivity.

**Workflow:**
1. Dispatcher creates claim bundles for each agent offline
2. Bundles are distributed via printed QR codes or USB
3. Agents claim funds when they reach connectivity
4. Unclaimed payments refund to dispatcher after timeout

**Benefits:**
- Works in low-connectivity environments
- No real-time coordination required
- Automatic reconciliation via refunds

### 8.3 Inheritance Planning

**Scenario:** A Bitcoin holder wants to pass funds to heirs without revealing keys.

**Workflow:**
1. Holder creates claim bundles with long timeouts (e.g., 1 year)
2. Bundles and preimages are stored in separate secure locations
3. Heirs can claim by combining bundle + preimage
4. Holder can refund if circumstances change

**Benefits:**
- Keys remain with original holder
- Heirs don't need technical expertise
- Revocable until claimed

### 8.4 Escrow-Free Trades

**Scenario:** Two parties want to trade goods for Bitcoin without an escrow service.

**Workflow:**
1. Buyer creates claim bundle, shares with seller
2. Buyer broadcasts funding transaction
3. Seller ships goods and receives preimage
4. Seller claims funds using preimage
5. If seller doesn't ship, buyer refunds after timeout

**Benefits:**
- No trusted third party
- Atomic exchange (goods for preimage)
- Timeout protects buyer

---

## 9. Comparison with Alternatives

### 9.1 Hardware Wallets

| Aspect | Hardware Wallets | This Protocol |
|--------|------------------|---------------|
| Key Storage | Dedicated device | Any offline device |
| Connectivity | USB/Bluetooth required | QR codes only |
| Conditional Payments | Not supported | Native support |
| Automatic Refunds | Not supported | Built-in |
| Cost | $50-200 per device | Free (software) |
| Vendor Lock-in | Device-specific | Open standard |

### 9.2 Lightning Network

| Aspect | Lightning | This Protocol |
|--------|-----------|---------------|
| Latency | Instant | On-chain (10+ min) |
| Capacity | Channel-limited | UTXO-limited |
| Offline Receive | Requires online node | Fully supported |
| Complexity | High (channels, routing) | Low (single transaction) |
| Privacy | Good (onion routing) | Good (Taproot) |

### 9.3 Multi-Signature Wallets

| Aspect | Multi-Sig | This Protocol |
|--------|-----------|---------------|
| Setup | Complex (key ceremony) | Simple (single key) |
| Coordination | All signers needed | Sender-only signing |
| Conditional Logic | Limited | Hash/time locks |
| Recovery | Requires threshold | Automatic refund |

### 9.4 Custodial Solutions

| Aspect | Custodial | This Protocol |
|--------|-----------|---------------|
| Trust | Full trust in custodian | Trustless |
| Key Control | Custodian holds keys | User holds keys |
| Censorship | Possible | Impossible |
| Counterparty Risk | High | None |

---

## 10. Future Work

### 10.1 Short-Term Roadmap

**Hardware Wallet Integration:**
- Ledger/Trezor support for Cold Mode signing
- USB and Bluetooth communication protocols
- Maintain air-gap security model

**BIP-39 Seed Phrases:**
- Mnemonic generation and recovery
- HD wallet derivation (BIP-32/44/84/86)
- Standardized backup format

**Enhanced Fee Management:**
- Dynamic fee estimation
- RBF support for funding transactions
- CPFP automation for claims

### 10.2 Medium-Term Roadmap

**Multi-Signature Support:**
- N-of-M Taproot scripts
- Coordinator workflow for multi-party signing
- Threshold signatures (FROST)

**Batch Operations:**
- Multiple claims in single transaction
- UTXO consolidation
- Payment batching for efficiency

**Scriptless Claim Variant:**
- MuSig2 adaptor signatures
- Key-path claims for improved privacy
- Reduced on-chain footprint

### 10.3 Long-Term Vision

**Mobile Applications:**
- Native iOS/Android apps
- Secure enclave integration
- NFC-based bundle transfer

**Lightning Integration:**
- Submarine swaps (on-chain ↔ Lightning)
- Offline Lightning receives
- Channel management

**Decentralized Infrastructure:**
- IPFS-hosted application
- BIP-157/158 light client support
- Reduced reliance on third-party APIs

---

## 11. Conclusion

We have presented a complete protocol for conducting Bitcoin transactions from air-gapped devices. By leveraging Taproot's script-path spending, hash-locked claims, and time-locked refunds, our system achieves:

1. **Maximum Security:** Private keys never leave the offline environment
2. **Guaranteed Liveness:** Either receivers claim or senders refund
3. **Strong Privacy:** Taproot hides unused script paths
4. **Practical Usability:** QR codes enable seamless data transfer
5. **Standards Compliance:** Built on BIP-174, BIP-341, and UR specifications

The reference implementation demonstrates that secure, non-custodial Bitcoin transfers are achievable with commodity hardware and open-source software. As Bitcoin adoption grows, protocols that prioritize self-custody without sacrificing usability will become increasingly important.

Our work contributes to the broader goal of making Bitcoin accessible to users who demand the highest security standards while maintaining practical, everyday usability.

---

## 12. References

### Bitcoin Improvement Proposals

1. **BIP-174:** Partially Signed Bitcoin Transaction Format  
   https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki

2. **BIP-340:** Schnorr Signatures for secp256k1  
   https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki

3. **BIP-341:** Taproot: SegWit version 1 spending rules  
   https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki

4. **BIP-342:** Validation of Taproot Scripts  
   https://github.com/bitcoin/bips/blob/master/bip-0342.mediawiki

5. **BIP-371:** Taproot Fields for PSBT  
   https://github.com/bitcoin/bips/blob/master/bip-0371.mediawiki

### Standards and Specifications

6. **Uniform Resources (UR):** Blockchain Commons Research  
   https://github.com/BlockchainCommons/Research/blob/master/papers/bcr-2020-005-ur.md

7. **CBOR (RFC 8949):** Concise Binary Object Representation  
   https://www.rfc-editor.org/rfc/rfc8949.html

### Libraries and Tools

8. **bitcoinjs-lib:** Bitcoin library for JavaScript  
   https://github.com/bitcoinjs/bitcoinjs-lib

9. **mempool.space:** Open-source Bitcoin explorer and API  
   https://mempool.space

### Related Work

10. **Hash Time-Locked Contracts:** Lightning Network BOLT specifications  
    https://github.com/lightning/bolts

11. **Miniscript:** A structured representation of Bitcoin Scripts  
    https://bitcoin.sipa.be/miniscript/

12. **MuSig2:** Simple Two-Round Schnorr Multi-Signatures  
    https://eprint.iacr.org/2020/1261

---

## Appendix A: Script Examples

### A.1 Claim Script (Hash + Signature)

```
OP_SHA256
<32-byte hash>
OP_EQUALVERIFY
<32-byte x-only pubkey>
OP_CHECKSIG
```

**Hex Example:**
```
a820[h]88[R]ac
```

### A.2 Refund Script

```
<encoded block height>
OP_CHECKLOCKTIMEVERIFY
OP_DROP
<32-byte x-only pubkey>
OP_CHECKSIG
```

**Hex Example:**
```
[height]b175[S]ac
```

---

## Appendix B: Claim Bundle Example

```json
{
  "ver": 1,
  "h_alg": "sha256",
  "h": "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a",
  "R_pub": "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  "script": "a820a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a880279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ac",
  "leaf_ver": 192,
  "control": "c1...",
  "expires_at": 500000,
  "address": "tb1p...",
  "send_value_sat": 100000,
  "network": "testnet4",
  "requires_signature": true
}
```

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **Air-Gap** | Physical isolation of a device from all networks |
| **CLTV** | CheckLockTimeVerify - Bitcoin opcode for absolute timelocks |
| **Cold Mode** | Application mode with network access disabled |
| **Control Block** | Taproot data proving script inclusion in tree |
| **Hash Lock** | Spending condition requiring preimage revelation |
| **P2TR** | Pay-to-Taproot output type |
| **Preimage** | Secret value that hashes to a known commitment |
| **PSBT** | Partially Signed Bitcoin Transaction |
| **Schnorr** | Signature scheme used in Taproot |
| **Taproot** | Bitcoin upgrade enabling script trees and Schnorr |
| **UR** | Uniform Resource encoding for QR transmission |
| **UTXO** | Unspent Transaction Output |
| **WIF** | Wallet Import Format for private keys |
| **X-Only** | 32-byte public key without y-coordinate prefix |

---

**Document Version:** 1.0  
**Last Updated:** December 2025  
**License:** MIT

