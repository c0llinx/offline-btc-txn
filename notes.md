## TxData and Secret meaning

Tx Data (QR Code A)

  Function: Contains the transaction metadata needed to spend the UTXO
  Contents: Complete OfflineTxoData object with:
  - txid: Transaction ID of the funding transaction
  - vout: Output index in the transaction
  - value: Amount in satoshis
  - taprootAddress: The created Taproot address
  - senderPublicKey: Sender's public key
  - refundTimeLock: Block height for refund timelock

  Secret (QR Code B)

  Function: Contains the cryptographic secret (preimage) needed to unlock the funds
  Contents: The 32-byte random preimage (line 93-94 in src/server/bitcoin.ts:93-94)

  Receiver Requirements

  The receiver needs BOTH:
  1. Tx Data - to know which UTXO to spend and its constraints
  2. Secret - to satisfy the hash lock condition in the claim script (line 39-44 in
  src/server/bitcoin.ts:39-44)

  The claim script requires: OP_HASH160 <preimage_hash> OP_EQUALVERIFY <receiver_pubkey> OP_CHECKSIG
  - so the receiver must provide both the preimage and their signature to claim the funds before the
  timelock expires.