# Refund Path Test Plan

This document provides a comprehensive testing guide for the refund path implementation in the Offline Bitcoin Transaction application.

## Prerequisites

- Bitcoin Core installed (for regtest)
- Node.js and npm installed
- Application running locally

## Test Environment Setup

### Option 1: Bitcoin Core Regtest (Recommended)

#### 1. Start Bitcoin Core in Regtest Mode

```bash
# Start bitcoind in regtest mode
bitcoind -regtest -daemon -fallbackfee=0.00001

# Or with bitcoin-qt GUI
bitcoin-qt -regtest
```

#### 2. Create a Test Wallet

```bash
bitcoin-cli -regtest createwallet "testwallet"
```

#### 3. Generate Initial Blocks

```bash
# Generate 101 blocks to make coinbase outputs spendable
# (Coinbase maturity requires 100 confirmations)
bitcoin-cli -regtest -generate 101

# Verify current height
bitcoin-cli -regtest getblockcount
# Should return: 101
```

#### 4. Get a Receiving Address

```bash
# Get a new address for receiving test coins
ADDR=$(bitcoin-cli -regtest getnewaddress)
echo $ADDR

# Mine some blocks to this address for funding
bitcoin-cli -regtest generatetoaddress 10 $ADDR

# Check balance
bitcoin-cli -regtest getbalance
# Should show ~50 BTC (from the first matured coinbase)
```

### Option 2: Nigiri (Docker-based)

```bash
# Install Nigiri
npm install -g nigiri

# Start regtest environment
nigiri start

# Get coins
nigiri faucet <your-taproot-address>

# Check height
nigiri rpc getblockcount
```

## Test Cases

### Test Case 1: Happy Path - Successful Refund After Expiry

**Objective:** Verify that a refund transaction can be created and broadcast successfully after the timelock expires.

**Steps:**

1. **Setup Wallet (Cold Mode)**
   - Navigate to `/wallets` in the application
   - Create a new wallet or import existing Taproot wallet
   - Fund the wallet with at least 10,000 sats from regtest

2. **Create Claim Bundle (Cold Mode)**
   - Navigate to `/cold`
   - Current block height: Check with `bitcoin-cli -regtest getblockcount` (e.g., 111)
   - Set expiry height: `120` (9 blocks in the future)
   - Set commitment amount: `5000` sats
   - Set commitment message: `test refund path`
   - Optional: Set custom refund address (or leave blank for default)
   - Click "Create Claim Bundle"

3. **Verify Outputs**
   - ✓ Claim Bundle UR displayed
   - ✓ Refund PSBT section appears (amber background)
   - ✓ Preimage displayed (should match commitment message)
   - ✓ Refund PSBT Base64 displayed
   - ✓ Refund PSBT UR displayed
   - **Save the Refund PSBT Base64 and Preimage**

4. **Broadcast Funding Transaction (Watch-Only Mode)**
   - Navigate to `/watch`
   - Select network: `regtest` (or use testnet4 if testing on testnet)
   - The funding transaction should be auto-generated
   - Copy funding tx hex from Cold Mode
   - Broadcast the funding transaction
   - Note the txid

5. **Confirm Funding Transaction**
   ```bash
   # Mine 1 block to confirm funding
   bitcoin-cli -regtest -generate 1

   # Current height should now be 112
   bitcoin-cli -regtest getblockcount
   ```

6. **Attempt Early Refund (Should Fail)**
   - Navigate to `/refund`
   - Select network: Same as funding
   - Paste the Refund PSBT (Base64)
   - Click "Decode PSBT"
   - **Verify Timelock Status:**
     - Expiry Height: `120`
     - Current Height: `112` (or current)
     - Status: "⚠ Timelock NOT reached - wait X more blocks"
   - Enter input index: `0`
   - Enter preimage: `test refund path`
   - Enter funding private key: (from wallet WIF)
   - Set fee rate: `2` sat/vB
   - Click "Sign Refund"
   - **Expected:** Error message about timelock not reached

7. **Advance Blockchain to Expiry**
   ```bash
   # Mine blocks to reach expiry (need to reach height 120)
   # Currently at 112, need 8 more blocks
   bitcoin-cli -regtest -generate 8

   # Verify height
   bitcoin-cli -regtest getblockcount
   # Should return: 120
   ```

8. **Re-import PSBT and Verify Timelock**
   - In `/refund` mode, click "Decode PSBT" again to refresh height
   - **Verify Timelock Status:**
     - Expiry Height: `120`
     - Current Height: `120`
     - Status: "✓ Timelock reached - ready to sign"

9. **Sign Refund Transaction**
   - Enter input index: `0`
   - Enter preimage: `test refund path`
   - Enter funding private key: (wallet WIF or 32-byte hex)
   - Set fee rate: `2` sat/vB
   - Click "Sign Refund"
   - **Expected:**
     - ✓ Fee adjustment info displayed (original value, adjusted value, fee)
     - ✓ Signed transaction hex displayed

10. **Broadcast Refund Transaction**
    - Copy signed transaction hex
    - Navigate to `/watch` or use bitcoin-cli:
    ```bash
    bitcoin-cli -regtest sendrawtransaction <signed_tx_hex>
    ```
    - **Expected:** Transaction broadcast successfully, txid returned

11. **Confirm Refund Transaction**
    ```bash
    # Mine 1 block to confirm
    bitcoin-cli -regtest -generate 1

    # Check transaction status
    bitcoin-cli -regtest gettransaction <refund_txid>
    ```

12. **Verify Refund Received**
    - Check the refund address balance
    - **Expected:** Balance increased by (commitment_amount - fee)

**Expected Results:**
- ✓ Funding transaction confirmed
- ✓ Refund attempt before expiry fails with clear error
- ✓ Refund succeeds after expiry
- ✓ Fees deducted correctly
- ✓ Funds received at refund address

---

### Test Case 2: Race Condition - Receiver Claims Before Refund

**Objective:** Verify that if the receiver claims before expiry, the refund cannot be executed.

**Steps:**

1. **Create and Fund Claim Bundle** (same as Test Case 1, steps 1-5)
   - Expiry height: `current + 20`
   - Amount: `5000` sats

2. **Receiver Claims the Funds** (before expiry)
   - Navigate to `/receiver`
   - Import the claim bundle
   - Enter the preimage
   - Sign and broadcast claim transaction
   - Mine block to confirm claim

3. **Attempt Refund After Expiry**
   - Mine blocks to pass expiry height
   - Navigate to `/refund`
   - Import refund PSBT
   - Sign refund transaction
   - Attempt to broadcast

**Expected Results:**
- ✓ Claim transaction succeeds
- ✓ Refund transaction broadcast fails (input already spent)
- ✓ Error: "missing inputs" or "bad-txns-inputs-missingorspent"

---

### Test Case 3: Custom Refund Address

**Objective:** Verify that refunds can be sent to a different address than the funding wallet.

**Steps:**

1. **Setup Two Wallets**
   - Wallet A: Funding wallet
   - Wallet B: Refund destination wallet

2. **Create Claim Bundle**
   - Use Wallet A for funding
   - Set custom refund address: Wallet B's Taproot address
   - Set expiry: `current + 10`

3. **Wait for Expiry and Execute Refund**
   - Mine blocks to pass expiry
   - Sign refund with Wallet A's private key
   - Broadcast refund

4. **Verify Refund Destination**
   - Check Wallet B's balance
   - **Expected:** Wallet B receives the refund

**Expected Results:**
- ✓ Refund successfully sent to custom address
- ✓ Wallet B balance increased

---

### Test Case 4: Fee Rate Adjustment

**Objective:** Verify that different fee rates correctly adjust the refund output value.

**Test Scenarios:**

| Fee Rate (sat/vB) | Input Value | Estimated Fee | Expected Output |
|-------------------|-------------|---------------|-----------------|
| 1                 | 5000        | ~140          | ~4860           |
| 2                 | 5000        | ~280          | ~4720           |
| 10                | 5000        | ~1400         | ~3600           |
| 50                | 5000        | ~7000         | Error (below dust) |

**Steps:**

1. Create refund PSBT with 5000 sats
2. For each fee rate:
   - Set fee rate in Refund Mode
   - Sign transaction
   - Verify fee adjustment info
   - Check output value in signed tx

**Expected Results:**
- ✓ Output value = Input value - Fee
- ✓ Fee = vsize * feeRate
- ✓ Error if output below dust limit (546 sats)

---

### Test Case 5: Invalid/Missing Data Handling

**Objective:** Verify proper error handling for invalid inputs.

**Scenarios:**

1. **Missing Preimage**
   - Sign without entering preimage
   - **Expected:** Error: "Preimage x required"

2. **Wrong Preimage**
   - Sign with incorrect preimage
   - Broadcast transaction
   - **Expected:** Transaction rejected (script validation failure)

3. **Wrong Private Key**
   - Sign with different wallet's private key
   - **Expected:** Error or invalid signature

4. **PSBT Without tapLeafScript**
   - Import regular PSBT (not a refund PSBT)
   - **Expected:** Error: "PSBT is missing tapLeafScript"

5. **Malformed PSBT**
   - Import invalid base64 string
   - **Expected:** Error: "Invalid PSBT"

**Expected Results:**
- ✓ All invalid inputs caught with clear error messages
- ✓ No crashes or undefined behavior

---

### Test Case 6: Network Mismatch

**Objective:** Verify handling of network mismatches.

**Steps:**

1. Create refund PSBT on testnet4
2. Import PSBT in Refund Mode with mainnet selected
3. Attempt to sign

**Expected Results:**
- ✓ Warning or error about network mismatch
- ✓ Transaction fails if broadcast to wrong network

---

### Test Case 7: Different Input Formats

**Objective:** Verify all supported input formats work correctly.

**Preimage Formats:**
- Text: `hello world`
- Hex: `68656c6c6f20776f726c64`
- Empty string (if allowed)

**Private Key Formats:**
- WIF: `cT1X...` (testnet)
- 32-byte hex: `1234567890abcdef...`

**PSBT Formats:**
- Base64: `cHNidP8BA...`
- UR: `ur:crypto-psbt/...`

**Expected Results:**
- ✓ All valid formats accepted and processed correctly
- ✓ Invalid formats rejected with clear errors

---

## Cleanup

After testing, clean up the regtest environment:

```bash
# Stop Bitcoin Core
bitcoin-cli -regtest stop

# Or if using Nigiri
nigiri stop

# Optional: Remove regtest data directory
rm -rf ~/Library/Application\ Support/Bitcoin/regtest  # macOS
rm -rf ~/.bitcoin/regtest  # Linux
```

## Automated Test Script

Here's a bash script to automate basic testing:

```bash
#!/bin/bash

# refund-test.sh - Automated refund path testing

set -e

# Configuration
NETWORK="regtest"
CLI="bitcoin-cli -regtest"

echo "=== Refund Path Automated Test ==="

# 1. Setup
echo "Step 1: Setting up regtest environment..."
$CLI createwallet "refund_test" 2>/dev/null || true
ADDR=$($CLI getnewaddress)
echo "Test address: $ADDR"

# 2. Generate blocks
echo "Step 2: Generating initial blocks..."
$CLI generatetoaddress 101 $ADDR > /dev/null
CURRENT_HEIGHT=$($CLI getblockcount)
echo "Current height: $CURRENT_HEIGHT"

# 3. Set expiry
EXPIRY=$((CURRENT_HEIGHT + 10))
echo "Setting expiry to: $EXPIRY"

# 4. Manual steps
echo ""
echo "=== Manual Steps Required ==="
echo "1. Navigate to http://localhost:3000/cold"
echo "2. Set expiry height: $EXPIRY"
echo "3. Set amount: 5000 sats"
echo "4. Set message: 'automated test'"
echo "5. Create claim bundle and save refund PSBT"
echo "6. Broadcast funding transaction"
echo ""
read -p "Press Enter when funding tx is broadcast..."

# 5. Confirm funding
echo "Step 5: Confirming funding transaction..."
$CLI -generate 1 > /dev/null
CURRENT_HEIGHT=$($CLI getblockcount)
echo "Current height: $CURRENT_HEIGHT"

# 6. Test early refund
echo "Step 6: Testing early refund (should fail)..."
echo "Try signing in /refund mode now - it should fail"
read -p "Press Enter to continue..."

# 7. Advance to expiry
BLOCKS_NEEDED=$((EXPIRY - CURRENT_HEIGHT))
echo "Step 7: Mining $BLOCKS_NEEDED blocks to reach expiry..."
$CLI -generate $BLOCKS_NEEDED > /dev/null
CURRENT_HEIGHT=$($CLI getblockcount)
echo "Current height: $CURRENT_HEIGHT (expiry: $EXPIRY)"

# 8. Sign refund
echo "Step 8: Sign and broadcast refund transaction..."
echo "Navigate to /refund and sign the transaction"
read -p "Paste signed transaction hex: " SIGNED_TX

# 9. Broadcast
echo "Step 9: Broadcasting refund transaction..."
REFUND_TXID=$($CLI sendrawtransaction $SIGNED_TX)
echo "Refund txid: $REFUND_TXID"

# 10. Confirm
echo "Step 10: Confirming refund transaction..."
$CLI -generate 1 > /dev/null
echo "Refund confirmed!"

# 11. Verify
echo "Step 11: Verifying refund..."
$CLI gettransaction $REFUND_TXID

echo ""
echo "=== Test Complete ==="
```

## Success Criteria

A successful test run should demonstrate:

- ✅ Refund PSBT generated correctly in Cold Mode
- ✅ Preimage bundled and displayed prominently
- ✅ Refund address customization works
- ✅ Timelock validation prevents early signing
- ✅ Timelock validation allows signing after expiry
- ✅ Fee calculation and adjustment works correctly
- ✅ Signed refund transaction broadcasts successfully
- ✅ Funds received at refund address
- ✅ All error cases handled gracefully
- ✅ UI provides clear feedback at each step

## Troubleshooting

### Common Issues

**"missing inputs" error when broadcasting refund:**
- Cause: Receiver already claimed, or funding tx not confirmed
- Solution: Verify funding tx confirmed and not spent

**"non-final transaction" error:**
- Cause: Attempting to broadcast before locktime expiry
- Solution: Mine more blocks to reach expiry height

**"dust output" error:**
- Cause: Fee too high, output below 546 sats
- Solution: Reduce fee rate or increase input amount

**"tapLeafScript missing" error:**
- Cause: Wrong PSBT imported (not a refund PSBT)
- Solution: Use the refund PSBT from Cold Mode

**Height check fails:**
- Cause: Unable to fetch current block height from API
- Solution: Manually verify height with `bitcoin-cli getblockcount`

## Notes

- Regtest blocks are instant, real networks have ~10 min block times
- Always save the refund PSBT and preimage immediately
- Test on regtest/testnet before using on mainnet
- Monitor fee rates on mainnet to avoid stuck transactions
