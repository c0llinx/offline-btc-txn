# User Guide: Offline Bitcoin Transaction Application

## Table of Contents
1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Application Modes](#application-modes)
4. [Wallet Management](#wallet-management)
5. [Cold Mode Workflow](#cold-mode-workflow)
6. [Receiver Workflow](#receiver-workflow)
7. [Refund Workflow](#refund-workflow)
8. [Watch-Only Mode](#watch-only-mode)
9. [Security Best Practices](#security-best-practices)

---

## Introduction

The Offline Bitcoin Transaction Application is a Next.js-based web application designed for creating and managing offline-friendly Bitcoin Taproot transactions. It enables secure, air-gapped Bitcoin operations using UR-encoded PSBT handoffs, claim/refund script generation, and testnet UTXO management.

**Key Features:**
- **Air-gapped transaction signing** for maximum security
- **Taproot-based claim/refund scripts** with time-locked refunds
- **UR (Uniform Resource) encoding** for QR code transmission
- **Local wallet management** with browser storage
- **Testnet4 support** via mempool.space API
- **No backend required** - all operations run client-side or through API routes

**Target Network:** Testnet4 (configurable for mainnet, testnet, signet)

---

## Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/c0llinx/offline-btc-txn.git
cd offline-btc-txn

# Install dependencies
npm install

# Run development server
npm run dev
```

The application will be available at `http://localhost:3000`.

### Initial Setup

1. **Create Your First Wallet**
   - Navigate to the "Wallet Manager" page
   - Click "Generate New Wallet"
   - Choose your network (Testnet4 recommended for testing)
   - Save the WIF (Wallet Import Format) key securely

2. **Fund Your Wallet**
   - Copy your Taproot address (starts with `tb1p` for testnet)
   - Use a testnet faucet to receive test bitcoins
   - Wait for confirmation (1-6 blocks)
   - Click "Refresh Balance" to sync

3. **Set Active Wallet**
   - Click "Set Active" on your funded wallet
   - The active wallet will be used automatically in Cold Mode

---

## Application Modes

The application operates in five distinct modes, each serving a specific purpose in the offline transaction workflow:

### 1. Wallet Manager
**Purpose:** Create, import, and manage Bitcoin wallets locally.

**Use Cases:**
- Generate new Taproot wallets
- Import existing wallets via WIF
- View balances and transaction history
- Manage multiple wallets across networks

### 2. Cold Mode (Offline Signer)
**Purpose:** Create claim bundles on an air-gapped device without internet access.

**Use Cases:**
- Generate commitment transactions offline
- Create claim bundles with hash-locked outputs
- Prepare funding transactions with manual UTXOs
- Generate QR codes for offline transmission

### 3. Receiver Mode
**Purpose:** Claim funds from a claim bundle using the preimage.

**Use Cases:**
- Scan or paste claim bundle URs
- Provide the secret preimage to unlock funds
- Sign and broadcast claim transactions
- Receive funds to your wallet

### 4. Refund Mode
**Purpose:** Recover funds after the timelock expires if the receiver never claimed.

**Use Cases:**
- Import refund PSBTs
- Sign with the funding wallet's private key
- Broadcast refund transactions after expiry

### 5. Watch-Only Mode
**Purpose:** Broadcast pre-signed transactions to the network.

**Use Cases:**
- Submit signed transactions from offline devices
- Monitor transaction status
- Bridge between cold and hot environments

---

## Wallet Management

### Creating a New Wallet

1. Navigate to **Wallets** page
2. Select network (Testnet4, Testnet, Signet, or Mainnet)
3. Click **"Generate New Wallet"**
4. The wallet is created with:
   - Unique ID
   - WIF private key
   - Public key (compressed and x-only)
   - Taproot address (P2TR)
   - Initial balance of 0 sats

**Important:** Export and backup your WIF immediately. It cannot be recovered if lost.

### Importing an Existing Wallet

1. Click **"Import Wallet"**
2. Paste your WIF key (starts with `c`, `L`, or `K`)
3. Optionally provide a label
4. The wallet is imported with all key material derived from the WIF

### Wallet Operations

#### Viewing Wallet Details
- **Label:** Custom name for identification
- **Network:** Bitcoin network (testnet4, mainnet, etc.)
- **Taproot Address:** Your P2TR receiving address
- **Balance:** Current confirmed balance in satoshis
- **Public Key:** Compressed 33-byte public key (hex)
- **X-Only Key:** 32-byte Schnorr public key (hex)

#### Refreshing Balance
1. Click **"Refresh"** next to a wallet
2. The app queries mempool.space for all Taproot addresses
3. Confirmed and pending balances are updated
4. Last refresh timestamp is recorded

#### Recording Manual Transactions
- **Receive:** Manually add incoming funds
- **Send:** Manually deduct outgoing funds
- **Set Balance:** Override current balance (use cautiously)

#### Managing Wallets
- **Rename:** Change the wallet label
- **Note:** Add metadata (seed location, device info)
- **Delete:** Permanently remove wallet (requires confirmation)
- **Set Active:** Mark as default for Cold Mode

### Transaction History

Each wallet maintains a history of up to 50 events:
- **Type:** receive, send, or adjust
- **Amount:** Value in satoshis
- **Description:** User-provided note
- **Timestamp:** ISO 8601 format
- **Related Address:** Associated Bitcoin address
- **Source:** manual, sync, or workflow

---

## Cold Mode Workflow

Cold Mode enables you to create commitment transactions on an offline device, ensuring private keys never touch the internet.

### Prerequisites
- At least one funded wallet with Taproot UTXOs
- The commitment message (preimage)
- Expiry block height for refund timelock
- Commitment amount in satoshis

### Step-by-Step Process

#### 1. Configure Funding Wallet
- Select the wallet that will fund the commitment
- Verify it has sufficient Taproot balance
- Note: This wallet retains the refund path

#### 2. Set Commitment Parameters

**Expiry Height (H_exp):**
- Block height after which refund becomes valid
- Example: Current height + 144 blocks (≈1 day)
- Must be in the future

**Commitment Amount:**
- Value to lock in the claim output (in satoshis)
- Must not exceed wallet balance
- Consider network fees (~500-1000 sats)

**Commitment Message:**
- The secret text that hashes to the claim condition
- Can be any UTF-8 string
- Receiver must know this exact value to claim
- Example: "hello offline bitcoin"

#### 3. Manual UTXOs (Optional)

If the device cannot reach mempool.space, manually provide UTXOs:

1. Click **"+ Add UTXO"**
2. Enter for each UTXO:
   - **Funding txid:** 64-character hex transaction ID
   - **vout:** Output index (usually 0 or 1)
   - **Value:** Amount in satoshis

To find UTXOs:
- Visit `https://mempool.space/testnet4/address/YOUR_ADDRESS`
- Look for confirmed outputs
- Copy txid, vout, and value

#### 4. Generate Claim Bundle

1. Click **"Create Claim Bundle"**
2. The app performs the following:
   - Derives claim and refund scripts
   - Builds Taproot address with script tree
   - Creates funding transaction (auto or manual)
   - Encodes bundle as UR format
   - Generates QR code

**Outputs:**
- **Claim Bundle UR:** Text string starting with `ur:claim-bundle/`
- **QR Code:** Scannable image for offline transmission
- **Receiver URL:** Direct link with embedded bundle

#### 5. Transmit to Receiver

Choose one method:
- **QR Code:** Display on screen, scan with receiver device
- **Copy UR:** Paste into secure channel (USB, local network)
- **URL:** Share via link (if both devices online)

### Understanding the Claim Bundle

The bundle contains:
- **h (hash):** SHA-256 hash of the commitment message
- **R_pub:** Receiver's public key (if signature required)
- **script:** Claim script bytecode
- **control:** Taproot control block
- **internal_pubkey:** Burned internal key
- **address:** Taproot commitment address
- **send_value_sat:** Locked amount
- **expires_at:** Refund timelock height
- **fund_txid:** Funding transaction ID
- **vout:** Output index
- **funding_script:** Output script
- **fund_tx:** Raw funding transaction (optional)
- **broadcast_endpoint:** Mempool.space API URL
- **network:** Bitcoin network identifier

### Cold Mode Service Worker

Cold Mode can optionally block all network requests to enforce air-gap security:

1. Navigate to `/cold/` with service worker installed
2. Status shows "COLD enforced (blocked)"
3. All API calls to `/api/*` return 451 (Unavailable For Legal Reasons)
4. Manual UTXO entry becomes mandatory

---

## Receiver Workflow

The Receiver workflow allows you to claim funds from a commitment by providing the preimage.

### Prerequisites
- A claim bundle (UR or URL)
- The exact preimage (commitment message)
- A wallet to receive funds
- Internet connection (to broadcast)

### Step-by-Step Process

#### 1. Import Claim Bundle

**Method A: Paste UR**
1. Copy the `ur:claim-bundle/...` string
2. Paste into the text area
3. Click **"Decode Bundle"**

**Method B: Scan QR Code**
1. Click camera icon
2. Allow camera permissions
3. Point at QR code
4. Bundle auto-decodes on scan

**Method C: URL Parameter**
- Visit `/receiver?claim=ur:claim-bundle/...`
- Bundle auto-loads from query string

#### 2. Verify Bundle Details

After decoding, review:
- **Taproot output:** Commitment address
- **Amount committed:** Locked satoshis
- **Claim pubkey:** Required signer (if any)
- **Signature required:** Yes/No
- **Network:** testnet4, mainnet, etc.
- **Expires after block:** Refund timelock
- **Funding txid:** Transaction ID (if embedded)
- **Memo:** Optional message from sender

**Funding Transaction:**
- If embedded, automatically broadcasts
- If missing, manually enter txid/vout/value after sender broadcasts

#### 3. Configure Claim Parameters

**Wallet Selection:**
- Auto-selects if your key matches claim_pubkey
- Otherwise, choose any wallet
- Must have WIF for signing (if signature required)

**Preimage / Secret:**
- Enter the exact commitment message
- Can be UTF-8 text or hex
- Must hash to the `h` value in bundle
- Example: "hello offline bitcoin"

**Destination Address:**
- Defaults to selected wallet's Taproot address
- Can choose from wallet's address list
- Or paste custom Taproot address (bc1p/tb1p)

**Destination Amount:**
- Auto-filled from bundle
- Reduced automatically if fees exceed prevout value
- Must be > 0 and ≤ prevout value minus fees

**Funding Details (if not embedded):**
- **Funding txid:** 64-hex transaction ID
- **Funding vout:** Output index
- **Funding value:** Amount in satoshis
- **Funding script:** Output script hex (auto-filled)

#### 4. Build & Sign Claim

1. Click **"Build & Sign Claim"**
2. The app performs:
   - Validates preimage hash
   - Creates PSBT with tapLeafScript
   - Signs with wallet key (if required)
   - Constructs witness stack: `[sig, preimage, script, control]`
   - Finalizes transaction
   - Broadcasts to network

**Success:**
- Signed hex displayed
- Transaction broadcasted
- Wallet balance updated (pending)
- Event recorded in history

**Errors:**
- Invalid preimage (hash mismatch)
- Insufficient funds (prevout < payout + fee)
- Missing funding transaction
- Network broadcast failure

#### 5. Verify Claim

- Copy txid from success message
- Visit `https://mempool.space/testnet4/tx/TXID`
- Confirm transaction in mempool
- Wait for confirmation (1-6 blocks)
- Refresh wallet balance

### Signature Requirements

**No Signature (Hash-Only):**
- Claim script: `OP_SHA256 <h> OP_EQUAL`
- Witness: `[preimage, script, control]`
- Anyone with preimage can claim

**Signature Required:**
- Claim script: `OP_SHA256 <h> OP_EQUALVERIFY <R> OP_CHECKSIG`
- Witness: `[sig, preimage, script, control]`
- Only holder of R's private key can claim

---

## Refund Workflow

If the receiver never claims, the sender can refund after the timelock expires.

### Prerequisites
- Refund PSBT (base64 or UR)
- Original preimage (commitment message)
- Funding wallet's private key (WIF or hex)
- Current block height > expiry height

### Step-by-Step Process

#### 1. Import Refund PSBT

**Method A: Paste Base64**
```
cHNidP8BA...
```

**Method B: Paste UR**
```
ur:crypto-psbt/...
```

1. Select network (must match commitment)
2. Paste PSBT into text area
3. Click **"Decode PSBT"**

#### 2. Configure Signing Parameters

**Input Index:**
- Usually 0 (first input)
- Increment if PSBT has multiple inputs

**Preimage (x):**
- Original commitment message
- Can be hex or UTF-8 text
- Must match the hash in claim script

**Funding Private Key:**
- WIF format: `cV...`, `L...`, or `K...`
- Or 32-byte hex: `64 hex characters`
- Must correspond to S (sender's key)

#### 3. Sign Refund

1. Click **"Sign Refund"**
2. The app performs:
   - Validates PSBT structure
   - Derives public key from private key
   - Creates Schnorr signature
   - Constructs witness: `[sig, preimage, script, control]`
   - Finalizes transaction

**Output:**
- Signed transaction hex
- Ready for broadcast

#### 4. Broadcast Refund

**Method A: Watch-Only Mode**
1. Copy signed hex
2. Navigate to `/watch`
3. Paste hex
4. Click **"Broadcast"**

**Method B: External Broadcaster**
- Use mempool.space broadcast tool
- Or submit via Bitcoin Core RPC
- Or use any transaction broadcaster

### Refund Script Structure

```
<H_exp> OP_CHECKLOCKTIMEVERIFY OP_DROP <S> OP_CHECKSIG
```

- **H_exp:** Expiry block height (encoded as script number)
- **S:** Sender's x-only public key (32 bytes)
- **Witness:** `[sig, preimage, script, control]`

**Timelock Enforcement:**
- Transaction nLockTime must be ≥ H_exp
- Current block height must be ≥ H_exp
- Signature must be valid for S

---

## Watch-Only Mode

Watch-Only Mode acts as a broadcast relay for signed transactions.

### Use Cases
- Broadcasting transactions from air-gapped devices
- Submitting pre-signed PSBTs
- Testing transaction validity
- Monitoring broadcast status

### Broadcasting a Transaction

1. Navigate to **Watch-Only** page
2. Select network (testnet4, testnet, signet, mainnet)
3. Paste raw transaction hex
4. Click **"Broadcast"**

**Success:**
- Returns transaction ID (txid)
- Status: "broadcasted"
- View on mempool.space

**Errors:**
- Invalid hex format
- Transaction already in mempool
- Insufficient fees
- Invalid signatures
- Network errors

### Network Endpoints

The app uses mempool.space APIs:
- **Testnet4:** `https://mempool.space/testnet4/api/tx`
- **Testnet:** `https://mempool.space/testnet/api/tx`
- **Signet:** `https://mempool.space/signet/api/tx`
- **Mainnet:** `https://mempool.space/api/tx`

---

## Security Best Practices

### Private Key Management

1. **Never share WIF keys**
   - WIF contains full spending authority
   - Store in encrypted password manager
   - Consider hardware wallet integration

2. **Backup strategies**
   - Export WIF immediately after generation
   - Store in multiple secure locations
   - Use BIP39 seed phrases for recovery (future feature)

3. **Air-gapped operations**
   - Use Cold Mode on offline device
   - Transfer bundles via QR codes only
   - Never connect cold device to internet

### Transaction Security

1. **Verify all parameters**
   - Double-check addresses before sending
   - Confirm amounts in satoshis
   - Validate expiry heights

2. **Test on testnet first**
   - Always test workflows on testnet4
   - Verify claim/refund paths work
   - Only use mainnet after thorough testing

3. **Fee management**
   - Set appropriate fee rates (2-10 sat/vB)
   - Ensure sufficient funds for fees
   - Monitor mempool congestion

### Operational Security

1. **Browser storage**
   - Wallets stored in localStorage
   - Cleared on browser data wipe
   - Not encrypted at rest

2. **Network exposure**
   - API calls to mempool.space
   - No data sent to third parties
   - Consider running local mempool instance

3. **Service worker isolation**
   - Cold Mode can enforce network blocks
   - Prevents accidental API calls
   - Requires manual UTXO entry

### Recommended Setup

**For Maximum Security:**
1. **Cold Device:** Offline laptop/phone with Cold Mode
2. **Hot Device:** Online device with Receiver/Watch Mode
3. **Transfer:** QR codes or USB (one-way)
4. **Verification:** Always verify on blockchain explorer

**For Convenience:**
1. **Single Device:** All modes on one device
2. **Testnet Only:** Never use for mainnet
3. **Small Amounts:** Limit exposure
4. **Regular Backups:** Export wallets frequently

---

## Troubleshooting

### Common Issues

**Wallet not showing balance:**
- Click "Refresh" to sync with mempool.space
- Ensure address has confirmed UTXOs
- Check network selection matches funding network

**Claim bundle generation fails:**
- Verify wallet has Taproot UTXOs
- Check commitment amount ≤ balance
- Ensure expiry height is in future
- Try manual UTXO entry if offline

**Claim transaction fails:**
- Verify preimage exactly matches original
- Check funding transaction is confirmed
- Ensure destination is valid Taproot address
- Confirm sufficient funds for fees

**Refund transaction fails:**
- Verify current height > expiry height
- Check private key matches funding wallet
- Ensure PSBT has tapLeafScript
- Confirm preimage is correct

**Broadcast errors:**
- "Already in mempool" - Transaction already submitted
- "Insufficient fee" - Increase fee rate
- "Invalid signature" - Re-sign transaction
- "Network error" - Check internet connection

### Getting Help

- **GitHub Issues:** Report bugs and feature requests
- **Documentation:** Review architecture and API docs
- **Testnet Faucets:** Get test bitcoins for experimentation
- **Bitcoin Stack Exchange:** Ask technical questions

---

## Appendix

### Glossary

- **PSBT:** Partially Signed Bitcoin Transaction
- **UR:** Uniform Resource (encoding standard)
- **Taproot:** Bitcoin upgrade enabling script trees
- **P2TR:** Pay-to-Taproot address format
- **WIF:** Wallet Import Format (private key encoding)
- **UTXO:** Unspent Transaction Output
- **Satoshi:** Smallest Bitcoin unit (0.00000001 BTC)
- **X-Only:** 32-byte Schnorr public key (no y-coordinate)
- **CLTV:** CheckLockTimeVerify (timelock opcode)

### Network Prefixes

- **Mainnet P2TR:** `bc1p...` (62 chars)
- **Testnet P2TR:** `tb1p...` (62 chars)
- **Mainnet WIF:** `L...`, `K...` (compressed)
- **Testnet WIF:** `c...` (compressed)

### Useful Links

- **Mempool.space:** https://mempool.space
- **Bitcoin Testnet4:** https://mempool.space/testnet4
- **Testnet Faucet:** https://testnet4.anyone.eu.org
- **BIP341 (Taproot):** https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki
- **UR Specification:** https://github.com/BlockchainCommons/Research/blob/master/papers/bcr-2020-005-ur.md
