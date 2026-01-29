# Current Behaviors - Offline BTC Transaction System

This document describes the current behavior of the offline Bitcoin transaction system, including the claim and refund logic.

## Transaction Status Flow

```
PENDING → CLAIMED (receiver claimed before expiry)
PENDING → REFUNDABLE (expiry height reached, tx on-chain)
PENDING → REFUNDABLE → CANCELLED (expiry reached, tx never broadcast)
PENDING → REFUNDABLE → REFUNDED (expiry reached, sender reclaimed funds)
```

## Receiver Page Behavior

The receiver can only claim funds **before** the expiry block height is reached.

| Condition | Receiver Can Claim? | UI Shows |
|-----------|---------------------|----------|
| Before expiry | Yes | "Build & Sign Claim" button enabled |
| After expiry | No | "Expired - Cannot Claim" button disabled + warning |

### Claim Process
1. Receiver loads the claim bundle (JSON file from sender)
2. System checks if current block height < expiry height
3. If valid, receiver can build and sign the claim transaction
4. Claim transaction is broadcast to the network

## Refund Page Behavior

The sender can only take action **after** the expiry block height is reached.

| Condition | Sender Can Refund? | Sender Can Cancel? |
|-----------|-------------------|-------------------|
| Before expiry (PENDING) | No | No |
| After expiry (REFUNDABLE) | Yes (if tx on-chain) | Yes (if tx NOT on-chain) |
| UTXO already spent (CLAIMED) | No | No |

### Refund vs Cancel

- **Refund**: Used when the funding transaction was broadcast but the receiver never claimed. The sender creates a time-locked refund transaction to reclaim their funds.

- **Cancel**: Used when the funding transaction was never broadcast. Since the funds never left the sender's wallet, this simply marks the transaction as cancelled in local storage.

### Refund Process
1. System verifies expiry height has been reached
2. System checks if UTXO exists on-chain (funding tx was broadcast)
3. If UTXO exists and is unspent, sender can sign and broadcast refund transaction
4. Refund transaction uses the CLTV (CheckLockTimeVerify) timelock path

### Cancel Process
1. System verifies expiry height has been reached
2. System checks if UTXO does NOT exist on-chain (funding tx was never broadcast)
3. If UTXO doesn't exist, transaction is marked as CANCELLED
4. No on-chain transaction is needed

## Cold Page (Create Claim Bundle)

When the sender creates a claim bundle:

1. Sender selects UTXOs and specifies amount, receiver address, and expiry height
2. System creates the funding transaction and claim bundle
3. **Funding transaction is automatically broadcast** to the network
4. Claim bundle JSON is downloaded for the receiver

This ensures the funds are locked on-chain immediately when the sender creates the bundle.

## Key Technical Details

### Taproot (P2TR) Transactions
- All transactions use Taproot addresses (starting with `tb1p` on testnet)
- Schnorr signatures (BIP-340) are used for signing
- Key tweaking follows BIP-341 specification

### BIP-340 Schnorr Signing
The system handles the y-coordinate parity requirement:
- If the internal public key has an odd y-coordinate, the private key is negated
- This ensures valid Schnorr signatures for Taproot spending

### Network Separation
- Testnet4 and Testnet UTXOs are kept separate
- The system does not mix UTXOs from different networks
- Each network queries only its own mempool.space API endpoint

### UTXO Management
- UTXOs are fetched from mempool.space API
- Each UTXO includes: txid, vout, value, scriptPubKey
- UTXOs are validated before use in transactions

## Status Definitions

| Status | Description |
|--------|-------------|
| PENDING | Transaction created, waiting for receiver to claim or expiry |
| CLAIMED | Receiver successfully claimed the funds |
| REFUNDABLE | Expiry reached, sender can refund or cancel |
| REFUNDED | Sender reclaimed funds via on-chain refund transaction |
| CANCELLED | Transaction cancelled (was never broadcast) |

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `bad-txns-inputs-missingorspent` | UTXO doesn't exist or already spent | Check if funding tx was broadcast; check if receiver already claimed |
| `Invalid Schnorr signature` | Signing issue | System handles BIP-340 parity automatically |
| `No spendable Taproot UTXOs` | No available UTXOs | Wait for previous transaction to confirm |
| `Insufficient funds` | Not enough balance | Add more funds to wallet |

## UI Features

### Refund Page
- **Refund Now**: Available when UTXO exists on-chain after expiry
- **Cancel**: Available when UTXO does NOT exist on-chain after expiry
- **Clear All**: Removes all tracked transactions from local storage

### Receiver Page
- **Build & Sign Claim**: Available only before expiry
- Shows warning message when transaction has expired
