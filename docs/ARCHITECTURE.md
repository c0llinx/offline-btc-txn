# Architecture Overview: Offline Bitcoin Transaction Application

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Core Modules](#core-modules)
5. [Data Flow](#data-flow)
6. [Security Architecture](#security-architecture)
7. [Network Communication](#network-communication)
8. [State Management](#state-management)

---

## System Architecture

### High-Level Overview

The application follows a **client-side-first architecture** with minimal server dependencies. All cryptographic operations, wallet management, and transaction construction occur in the browser, ensuring maximum security and offline capability.

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser Client                        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Cold Mode   │  │   Receiver   │  │    Refund    │     │
│  │   (Offline)  │  │   (Online)   │  │   (Offline)  │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                 │
│  ┌─────────────────────────▼──────────────────────────┐    │
│  │         Wallet Manager (localStorage)              │    │
│  └─────────────────────────┬──────────────────────────┘    │
│                            │                                 │
│  ┌─────────────────────────▼──────────────────────────┐    │
│  │      Offline Core Library (Taproot/PSBT/UR)       │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ API Routes (Next.js)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Server Layer                            │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Broadcast   │  │  UTXO Fetch  │  │   Balance    │     │
│  │     API      │  │     API      │  │     API      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                 │
│                            ▼                                 │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Mempool Service (API Client)               │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  External Services                           │
├─────────────────────────────────────────────────────────────┤
│  • mempool.space/testnet4/api (UTXO, Balance, Broadcast)   │
│  • mempool.space/testnet/api (Fallback)                     │
│  • mempool.space/api (Mainnet)                              │
└─────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Client-Side Cryptography**
   - All private key operations in browser
   - No server-side key storage or signing
   - Leverages WebCrypto API and bitcoinjs-lib

2. **Offline-First**
   - Core functionality works without internet
   - Manual UTXO entry for air-gapped devices
   - Service worker for network isolation

3. **Modular Architecture**
   - Separation of concerns (UI, crypto, network)
   - Reusable library components
   - Independent mode implementations

4. **Zero Backend Dependencies**
   - No database required
   - No authentication system
   - No server-side state

5. **Progressive Enhancement**
   - Works with JavaScript enabled
   - Camera scanning optional
   - QR code generation client-side

---

## Technology Stack

### Frontend Framework
- **Next.js 14.2.5** - React framework with App Router
- **React 18.2.0** - UI library
- **TailwindCSS 3.4.10** - Utility-first CSS

### Bitcoin Libraries
- **bitcoinjs-lib 6.1.5** - Bitcoin transaction construction
- **ecpair 2.0.0** - Elliptic curve key pairs
- **@bitcoinerlab/secp256k1 1.0.5** - secp256k1 cryptography
- **@noble/curves** - Schnorr signatures

### Encoding & Data
- **cbor-x 1.5.9** - CBOR encoding for UR bundles
- **qrcode 1.5.4** - QR code generation
- **buffer 6.0.3** - Node.js Buffer polyfill

### State Management
- **zustand 4.5.2** - Lightweight state management (if used)
- **localStorage** - Persistent wallet storage

### Validation
- **zod 3.23.8** - Schema validation

### UI Components
- **lucide-react 0.446.0** - Icon library
- **framer-motion 11.0.0** - Animation library

### Development Tools
- **ESLint** - Code linting
- **Prettier** - Code formatting
- **TypeScript** - Type checking (via JSDoc)

---

## Project Structure

```
offline-btc-txn/
├── app/                          # Next.js App Router pages
│   ├── api/                      # Server-side API routes
│   │   ├── balance/[network]/[address]/route.js
│   │   ├── broadcast/route.js
│   │   ├── node/[...path]/route.js
│   │   ├── ping/route.js
│   │   ├── tx/[txid]/route.js
│   │   └── utxos/
│   │       ├── [address]/[amount]/route.js
│   │       └── route.js
│   ├── cold/page.js              # Cold Mode (offline signer)
│   ├── receiver/page.js          # Receiver Mode (claim funds)
│   ├── refund/page.js            # Refund Mode (recover funds)
│   ├── wallets/page.js           # Wallet Manager
│   ├── watch/page.js             # Watch-Only Mode (broadcaster)
│   ├── tools/address/page.js     # Address utilities
│   ├── about/page.js             # About page
│   ├── layout.js                 # Root layout
│   ├── page.js                   # Home page
│   └── globals.css               # Global styles
│
├── components/                   # React components
│   ├── ActiveWalletBadge.jsx     # Active wallet indicator
│   ├── CameraScanner.jsx         # QR code camera scanner
│   ├── ModeBadge.jsx             # Mode indicator badge
│   ├── QRScanner.jsx             # QR scanner wrapper
│   └── WalletManager.jsx         # Wallet management UI
│
├── lib/                          # Core libraries
│   ├── offline-core/             # Bitcoin cryptography
│   │   ├── index.js              # Public API exports
│   │   ├── taproot.js            # Taproot script construction
│   │   ├── psbt.js               # PSBT building
│   │   └── ur.js                 # UR encoding/decoding
│   ├── offline-interop/          # Data parsing
│   │   ├── index.js              # Public API exports
│   │   └── parse-claim-bundle.js # Claim bundle parser
│   ├── server/                   # Server-side utilities
│   │   ├── mempool.js            # Mempool.space API client
│   │   └── utxo-service.js       # UTXO fetching service
│   ├── wallets.js                # Wallet management
│   └── clipboard.js              # Clipboard utilities
│
├── public/                       # Static assets
│   ├── sw-cold.js                # Service worker for Cold Mode
│   └── ...
│
├── docs/                         # Documentation
│   ├── USER_GUIDE.md             # User documentation
│   ├── ARCHITECTURE.md           # This file
│   └── API_REFERENCE.md          # API documentation
│
├── next.config.js                # Next.js configuration
├── tailwind.config.js            # TailwindCSS configuration
├── postcss.config.js             # PostCSS configuration
├── jsconfig.json                 # JavaScript configuration
├── package.json                  # Dependencies
└── README.md                     # Project overview
```

### Directory Responsibilities

#### `/app`
Contains all Next.js pages and API routes. Each page represents a distinct mode or feature of the application.

#### `/components`
Reusable React components shared across multiple pages. Focuses on UI presentation and user interaction.

#### `/lib`
Core business logic and utilities. Divided into:
- **offline-core:** Pure Bitcoin cryptography (no network calls)
- **offline-interop:** Data format parsing and validation
- **server:** Network communication (API clients)
- **wallets.js:** Wallet CRUD operations and localStorage management
- **clipboard.js:** Browser clipboard API wrapper

#### `/public`
Static assets served directly by Next.js. Includes service workers for offline functionality.

---

## Core Modules

### 1. Offline Core (`lib/offline-core`)

**Purpose:** Pure cryptographic operations for Bitcoin transactions.

**Key Components:**

#### `taproot.js`
- **Responsibility:** Taproot script construction and address derivation
- **Key Functions:**
  - `generateBurnedInternalKey()` - Creates unspendable internal key
  - `buildClaimScript()` - Constructs hash-locked claim script
  - `buildRefundScript()` - Constructs time-locked refund script
  - `buildClaimRefundTaproot()` - Combines scripts into Taproot tree
- **Dependencies:** bitcoinjs-lib, @bitcoinerlab/secp256k1

#### `psbt.js`
- **Responsibility:** PSBT construction for funding transactions
- **Key Functions:**
  - `buildFundingPsbt()` - Creates PSBT with inputs/outputs
- **Dependencies:** bitcoinjs-lib

#### `ur.js`
- **Responsibility:** UR (Uniform Resource) encoding/decoding
- **Key Functions:**
  - `encodeUR()` - Encodes binary data to UR format
  - `decodeUR()` - Decodes UR strings to binary
- **Format:** `ur:<type>/<base64url-data>`
- **Dependencies:** Buffer (polyfill)

### 2. Offline Interop (`lib/offline-interop`)

**Purpose:** Parse and validate claim bundle data structures.

#### `parse-claim-bundle.js`
- **Responsibility:** CBOR claim bundle deserialization
- **Key Functions:**
  - `parseClaimBundle()` - Validates and extracts bundle fields
- **Required Fields:** h_alg, h, R_pub, script, leaf_ver, control, expires_at
- **Dependencies:** cbor-x

### 3. Server Layer (`lib/server`)

**Purpose:** Network communication with external Bitcoin APIs.

#### `mempool.js` - MempoolService Class
- **Responsibility:** Interact with mempool.space APIs
- **Key Methods:**
  - `getAddressUTXOs(address)` - Fetch UTXOs for address
  - `getRawTransaction(txid)` - Fetch raw transaction hex
  - `getMempoolURL(txid)` - Generate mempool.space URL
  - `validateTestnetAddress(address)` - Validate address format
- **Features:**
  - Multi-network fallback (testnet4 → testnet)
  - Rate limiting (1000ms delay between requests)
  - Error handling with retry logic
- **Dependencies:** axios

#### `utxo-service.js` - UTXOService Class
- **Responsibility:** High-level UTXO fetching and selection
- **Key Methods:**
  - `getUTXOsForAddress(address)` - Fetch all UTXOs
  - `getUTXOsForAmount(address, amount)` - Select UTXOs for amount
- **Algorithm:** Greedy coin selection (smallest first)
- **Dependencies:** MempoolService

### 4. Wallet Management (`lib/wallets.js`)

**Purpose:** Local wallet storage and management.

**Key Functions:**

#### Storage Operations
- `loadWallets()` - Load wallets from localStorage
- `saveWallets(wallets)` - Persist wallets to localStorage
- `getActiveWalletId()` - Get active wallet ID
- `setActiveWalletId(id)` - Set active wallet

#### Wallet Creation
- `generateWallet(networkKey)` - Generate new random wallet
- `walletFromWIF(wif, label)` - Import wallet from WIF
- `upsertWallet(wallet)` - Create or update wallet

#### Wallet Operations
- `deleteWallet(id)` - Remove wallet
- `renameWallet(id, label)` - Update wallet label
- `markWalletNote(id, note)` - Add metadata

#### Balance Management
- `recordWalletEvent(params)` - Record transaction event
- `setWalletBalance(walletId, balance, description, source, options)` - Update balance

**Data Structure:**
```javascript
{
  id: string,              // Unique identifier
  label: string,           // User-friendly name
  network: string,         // testnet4, mainnet, etc.
  wif: string,             // Private key (WIF format)
  publicKeyHex: string,    // 33-byte compressed pubkey
  xOnlyHex: string,        // 32-byte x-only pubkey
  p2tr: string,            // Taproot address
  taprootAddresses: [],    // Array of Taproot addresses
  balanceSats: number,     // Current balance
  availableTaprootSats: number,  // Spendable Taproot balance
  history: [],             // Transaction events
  lastRefreshedAt: string, // ISO timestamp
  pendingDelta: number,    // Unconfirmed balance
  createdAt: string,       // ISO timestamp
  updatedAt: string,       // ISO timestamp
  note: string             // User notes
}
```

**Storage Key:** `offline-wallets-v1`

### 5. UI Components

#### `WalletManager.jsx`
- **Responsibility:** Wallet CRUD interface
- **Features:**
  - Generate/import wallets
  - View balances and history
  - Refresh from network
  - Export WIF keys
  - Manual transaction recording

#### `CameraScanner.jsx`
- **Responsibility:** QR code scanning via camera
- **Dependencies:** Browser MediaDevices API
- **Features:**
  - Real-time video preview
  - QR code detection
  - Error handling

#### `ActiveWalletBadge.jsx`
- **Responsibility:** Display active wallet indicator
- **Features:**
  - Shows label and network
  - Updates on wallet changes
  - Links to wallet manager

---

## Data Flow

### Cold Mode Flow

```
User Input (Message, Amount, Expiry)
         ↓
Select Funding Wallet (from localStorage)
         ↓
Derive Keys (xOnlyHex from WIF)
         ↓
Hash Message (SHA-256)
         ↓
Build Taproot Scripts
  ├─ Claim: OP_SHA256 <h> OP_EQUAL
  └─ Refund: <H_exp> CLTV DROP <S> CHECKSIG
         ↓
Generate Taproot Address (P2TR)
         ↓
Fetch UTXOs (API or Manual)
         ↓
Build Funding PSBT
         ↓
Sign PSBT (with wallet WIF)
         ↓
Extract Transaction Hex
         ↓
Create Claim Bundle (CBOR)
  ├─ h, R_pub, script, control
  ├─ internal_pubkey, address
  ├─ send_value_sat, expires_at
  ├─ fund_txid, vout, value
  └─ funding_script, fund_tx
         ↓
Encode as UR (ur:claim-bundle/...)
         ↓
Generate QR Code
         ↓
Display to User
```

### Receiver Mode Flow

```
Claim Bundle Input (UR or URL)
         ↓
Decode UR → CBOR
         ↓
Parse Claim Bundle
         ↓
Validate Required Fields
         ↓
Broadcast Funding Tx (if embedded)
         ↓
User Provides Preimage
         ↓
Verify Hash (SHA-256(preimage) == h)
         ↓
Select Destination Wallet
         ↓
Build Claim PSBT
  ├─ Input: funding UTXO
  ├─ tapLeafScript: claim script
  └─ Output: destination address
         ↓
Sign PSBT (if signature required)
  └─ Schnorr signature with wallet key
         ↓
Construct Witness Stack
  ├─ [sig] (if required)
  ├─ preimage
  ├─ script
  └─ control
         ↓
Finalize Transaction
         ↓
Broadcast to Network (via API)
         ↓
Update Wallet Balance (pending)
         ↓
Record Event in History
         ↓
Display Success (txid)
```

### Refund Mode Flow

```
Refund PSBT Input (Base64 or UR)
         ↓
Decode PSBT
         ↓
Validate tapLeafScript Present
         ↓
User Provides:
  ├─ Preimage (original message)
  └─ Private Key (WIF or hex)
         ↓
Derive Public Key from Private Key
         ↓
Sign PSBT Input (Schnorr)
         ↓
Construct Witness Stack
  ├─ sig
  ├─ preimage
  ├─ script
  └─ control
         ↓
Finalize Transaction
         ↓
Extract Signed Hex
         ↓
Display to User (for broadcast)
```

---

## Security Architecture

### Threat Model

**Assumptions:**
- User's device may be compromised
- Network traffic may be monitored
- External APIs may be malicious

**Mitigations:**

1. **Private Key Isolation**
   - Keys never leave browser
   - No server-side key storage
   - localStorage encrypted by browser

2. **Air-Gap Support**
   - Cold Mode works offline
   - Manual UTXO entry
   - QR code transmission

3. **Service Worker Enforcement**
   - Blocks network requests in Cold Mode
   - Returns 451 for /api/* routes
   - Ensures offline operation

4. **Input Validation**
   - Zod schema validation
   - Address format checks
   - Amount range validation

5. **HTTPS Only**
   - All external API calls over HTTPS
   - No mixed content
   - Certificate pinning (browser default)

### Cryptographic Operations

**Key Derivation:**
```
Private Key (32 bytes)
     ↓ secp256k1
Public Key (33 bytes compressed)
     ↓ slice(1, 33)
X-Only Key (32 bytes)
     ↓ tapTweakHash
Tweaked Key (32 bytes)
     ↓ p2tr
Taproot Address (62 chars)
```

**Signature Generation:**
```
Message Hash (32 bytes)
     ↓ Schnorr.sign(hash, privkey)
Signature (64 bytes)
     ↓ append sighash byte (0x00)
Taproot Signature (64 bytes)
```

**Hash Commitment:**
```
Preimage (UTF-8 or hex)
     ↓ SHA-256
Hash (32 bytes)
     ↓ OP_SHA256 <h> OP_EQUAL
Claim Script
```

### Storage Security

**localStorage:**
- Unencrypted (browser responsibility)
- Cleared on browser data wipe
- Accessible to all scripts on origin

**Recommendations:**
- Use browser profiles for isolation
- Enable disk encryption
- Regular backups to secure location

---

## Network Communication

### API Routes

All API routes are Next.js server-side handlers that proxy requests to external services.

#### `/api/broadcast` (POST)
**Purpose:** Broadcast signed transactions to Bitcoin network

**Request:**
```json
{
  "hex": "020000000001...",
  "network": "testnet4"
}
```

**Response:**
```json
{
  "ok": true,
  "txid": "abc123...",
  "network": "testnet4"
}
```

**Endpoint:** `mempool.space/<network>/api/tx`

#### `/api/utxos` (GET)
**Purpose:** Fetch UTXOs for an address

**Query Parameters:**
- `address` - Bitcoin address
- `network` - Network identifier

**Response:**
```json
{
  "ok": true,
  "utxos": [
    {
      "txid": "abc123...",
      "vout": 0,
      "value": 100000,
      "scriptHex": "5120...",
      "address": "tb1p...",
      "confirmations": 6,
      "network": "testnet4"
    }
  ]
}
```

#### `/api/balance/[network]/[address]` (GET)
**Purpose:** Get address balance

**Response:**
```json
{
  "ok": true,
  "balance": 100000
}
```

**Calculation:**
```
balance = (funded_txo_sum - spent_txo_sum) + (mempool_funded - mempool_spent)
```

### External APIs

**Mempool.space:**
- **Base URLs:**
  - Testnet4: `https://mempool.space/testnet4/api`
  - Testnet: `https://mempool.space/testnet/api`
  - Mainnet: `https://mempool.space/api`
  - Signet: `https://mempool.space/signet/api`

- **Endpoints Used:**
  - `GET /address/{address}/utxo` - List UTXOs
  - `GET /tx/{txid}` - Transaction details
  - `GET /tx/{txid}/hex` - Raw transaction
  - `POST /tx` - Broadcast transaction
  - `GET /address/{address}` - Address stats

- **Rate Limits:**
  - 1 request per second (self-imposed)
  - No authentication required
  - Public API (best effort)

---

## State Management

### Client-Side State

**React State:**
- Component-local state (useState)
- Form inputs and UI state
- Temporary data (not persisted)

**localStorage:**
- Wallet data (persistent)
- Active wallet ID
- User preferences (future)

**Event System:**
- `offline-wallets-change` - Wallet data updated
- `storage` - localStorage changed (cross-tab)

### State Synchronization

**Wallet Updates:**
```javascript
// Update wallet
saveWallets(updatedWallets);

// Trigger event
window.dispatchEvent(new Event('offline-wallets-change'));

// Listeners refresh
useEffect(() => {
  const handler = () => refreshFromStorage();
  window.addEventListener('offline-wallets-change', handler);
  return () => window.removeEventListener('offline-wallets-change', handler);
}, []);
```

**Cross-Tab Sync:**
- `storage` event fires when localStorage changes in another tab
- All components listen and refresh
- Ensures consistency across windows

### Data Persistence

**Wallet Storage:**
- **Key:** `offline-wallets-v1`
- **Format:** JSON array
- **Max Size:** ~5-10 MB (browser limit)
- **Versioning:** Key includes version number

**Active Wallet:**
- **Key:** `offline-wallets-active`
- **Format:** String (wallet ID)
- **Fallback:** First wallet in list

---

## Extension Points

### Adding New Networks

1. Update `NETWORKS` in `lib/offline-core/taproot.js`
2. Add endpoint in `lib/server/mempool.js`
3. Update UI dropdowns in components

### Adding New Script Types

1. Create script builder in `lib/offline-core/taproot.js`
2. Update `buildClaimRefundTaproot()` to include new script
3. Add parsing logic in `lib/offline-interop/parse-claim-bundle.js`

### Adding New Storage Backends

1. Create adapter in `lib/wallets.js`
2. Implement `load()`, `save()`, `delete()` methods
3. Update `getStorage()` to return adapter

### Adding New Broadcast Providers

1. Create service class in `lib/server/`
2. Implement `broadcast(hex)` method
3. Update `/api/broadcast/route.js` to use new service

---

## Performance Considerations

### Optimization Strategies

1. **Lazy Loading:**
   - Camera scanner loaded dynamically
   - Heavy crypto operations deferred

2. **Memoization:**
   - `useMemo` for derived state
   - Prevents unnecessary recalculations

3. **Debouncing:**
   - Input validation debounced
   - Network requests throttled

4. **Code Splitting:**
   - Next.js automatic code splitting
   - Route-based chunks

### Bottlenecks

1. **UTXO Fetching:**
   - Multiple API calls for multi-address wallets
   - Mitigated by 1s delay between requests

2. **PSBT Signing:**
   - Synchronous crypto operations
   - Blocks UI during signing

3. **QR Code Generation:**
   - Large bundles create big QR codes
   - Mitigated by UR encoding

---

## Future Enhancements

### Planned Features

1. **Hardware Wallet Support:**
   - Ledger/Trezor integration
   - USB/Bluetooth communication

2. **Multi-Sig Support:**
   - N-of-M Taproot scripts
   - Coordinator workflow

3. **BIP39 Seed Phrases:**
   - Mnemonic generation
   - HD wallet derivation

4. **Batch Operations:**
   - Multiple claims in one transaction
   - UTXO consolidation

5. **Fee Estimation:**
   - Dynamic fee rate suggestions
   - RBF (Replace-By-Fee) support

6. **Local Mempool:**
   - Run own mempool instance
   - Reduced API dependency

### Technical Debt

1. **Type Safety:**
   - Migrate to TypeScript
   - Add comprehensive type definitions

2. **Testing:**
   - Unit tests for crypto functions
   - Integration tests for workflows
   - E2E tests with Playwright

3. **Error Handling:**
   - Standardized error types
   - Better error messages
   - Retry logic

4. **Accessibility:**
   - ARIA labels
   - Keyboard navigation
   - Screen reader support

---

## Deployment

### Build Process

```bash
# Development
npm run dev

# Production build
npm run build

# Start production server
npm start

# Cold build (with service worker)
npm run build:cold
```

### Environment Variables

None required. All configuration is hardcoded or user-provided.

### Hosting Options

1. **Vercel:** Automatic deployment from GitHub
2. **Netlify:** Static site hosting
3. **Self-Hosted:** Node.js server
4. **IPFS:** Decentralized hosting (static export)

### Security Checklist

- [ ] HTTPS enabled
- [ ] CSP headers configured
- [ ] No API keys in client code
- [ ] localStorage encryption (browser-level)
- [ ] Regular dependency updates
- [ ] Security audit of crypto code

---

## Conclusion

This architecture prioritizes **security**, **offline capability**, and **user sovereignty**. By keeping all sensitive operations client-side and supporting air-gapped workflows, the application enables trustless Bitcoin transactions without relying on third-party custody or servers.

The modular design allows for easy extension and customization, while the Next.js framework provides a solid foundation for both development and production deployment.
