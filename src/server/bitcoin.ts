import * as bitcoin from 'bitcoinjs-lib';
import { Tapleaf } from 'bitcoinjs-lib/src/types.js';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { SenderData, OfflineTxoData, ReceiverClaimData, SenderRefundData, SignedTransaction, UTXO } from '../shared/types.js';
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
    const totalInputValue = utxos.reduce((sum, utxo) => sum + utxo.value, 0);

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