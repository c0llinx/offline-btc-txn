import { RealBitcoinCalculator } from './bitcoin.js';
import { MempoolAPI } from './mempool.js';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

/**
 * Production implementation of the offline funding / claim / refund workflow
 */
export class OfflineWorkflowService {
  private wallet = new RealBitcoinCalculator();
  private mempoolAPI = new MempoolAPI();

  /**
   * Sender creates the initial funding PSBT with proper HTLC using P2WSH.
   */
  async createFundingPSBT(
    senderWif: string,
    receiverPubKeyHex: string,
    amount: number,
    refundLocktime: number
  ) {
    const senderKeyPair = ECPair.fromWIF(senderWif, bitcoin.networks.testnet);
    
    // Handle hex public key format
    let receiverPublicKey: Buffer;
    if (receiverPubKeyHex.length === 66) {
      receiverPublicKey = Buffer.from(receiverPubKeyHex, 'hex');
    } else {
      throw new Error('Invalid receiver public key format. Expected 66-character hex string.');
    }
    
    // Generate preimage and hash for HTLC
    const preimage = Buffer.from('abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab', 'hex');
    const preimageHash = bitcoin.crypto.sha256(preimage);
    
    // Create HTLC script: "If receiver provides preimage OR sender waits for timelock"
    const htlcScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_IF,
        // Claim path: receiver provides preimage
        bitcoin.opcodes.OP_SHA256,
        preimageHash,
        bitcoin.opcodes.OP_EQUALVERIFY,
        receiverPublicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_ELSE,
        // Refund path: sender waits for timelock
        bitcoin.script.number.encode(refundLocktime),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        bitcoin.opcodes.OP_DROP,
        senderKeyPair.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_ENDIF,
    ]);
    
    // Create P2WSH address from HTLC script
    const htlcP2WSH = bitcoin.payments.p2wsh({
      redeem: { output: htlcScript },
      network: bitcoin.networks.testnet
    });
    
    const htlcAddress = htlcP2WSH.address!;
    console.log('HTLC P2WSH Address:', htlcAddress);
    
    // Get sender's P2WPKH address for funding
    const senderP2WPKH = bitcoin.payments.p2wpkh({ 
      pubkey: senderKeyPair.publicKey,
      network: bitcoin.networks.testnet 
    });
    const senderAddress = senderP2WPKH.address!;
    
    // Get UTXOs from sender's address
    let utxos;
    try {
      utxos = await this.mempoolAPI.getAddressUTXOs(senderAddress);
    } catch (error) {
      console.error('Failed to get UTXOs:', error);
      throw new Error('Failed to fetch UTXOs from mempool API');
    }
    
    if (utxos.length === 0) {
      throw new Error('No UTXOs found for sender address. Please fund the sender address first.');
    }
    
    // Build PSBT to send funds to HTLC address
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
    const inputUtxo = utxos[0];
    const totalInput = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    
    // Add sender's UTXO as input
    psbt.addInput({
      hash: inputUtxo.txid,
      index: inputUtxo.vout,
      witnessUtxo: {
        script: Buffer.from(inputUtxo.scriptPubKey, 'hex'),
        value: inputUtxo.value,
      },
    });

    // Output to HTLC address
    psbt.addOutput({ 
      address: htlcAddress, 
      value: amount 
    });

    // Change output back to sender if needed
    const fee = 1000;
    const changeAmount = totalInput - amount - fee;
    if (changeAmount > 546) {
      psbt.addOutput({ 
        address: senderAddress, 
        value: changeAmount 
      });
    }

    // Sign and finalize
    psbt.signAllInputs(senderKeyPair);
    psbt.finalizeAllInputs();
    
    const tx = psbt.extractTransaction();
    
    return {
      psbt: tx.toHex(),
      preimage: preimage.toString('hex'),
      taprootAddress: htlcAddress, // Actually P2WSH HTLC address
      txid: tx.getId(),
      vout: 0,
      senderPublicKey: senderKeyPair.publicKey.toString('hex'),
      refundTimeLock: refundLocktime,
      value: amount,
      htlcScript: htlcScript.toString('hex'), // Include script for claim/refund
      receiverPublicKey: receiverPublicKey.toString('hex')
    };
  }

  /**
   * Receiver claims the funds with preimage before timelock using P2WSH HTLC.
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
    const receiverKeyPair = ECPair.fromWIF(receiverWif, bitcoin.networks.testnet);
    const preimage = Buffer.from(preimageHex, 'hex');
    const senderPublicKey = Buffer.from(senderPublicKeyHex, 'hex');
    const preimageHash = bitcoin.crypto.sha256(preimage);
    
    // Recreate the same HTLC script that was used in funding
    const htlcScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_IF,
        bitcoin.opcodes.OP_SHA256,
        preimageHash,
        bitcoin.opcodes.OP_EQUALVERIFY,
        receiverKeyPair.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_ELSE,
        bitcoin.script.number.encode(refundTimeLock),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        bitcoin.opcodes.OP_DROP,
        senderPublicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_ENDIF,
    ]);
    
    // Create P2WSH payment to get the correct scriptPubKey
    const htlcP2WSH = bitcoin.payments.p2wsh({
      redeem: { output: htlcScript },
      network: bitcoin.networks.testnet
    });
    
    // Build claim transaction
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
    
    // Add HTLC UTXO as input
    psbt.addInput({
      hash: txid,
      index: vout,
      witnessUtxo: {
        script: htlcP2WSH.output!,
        value: value,
      },
      witnessScript: htlcScript,
    });
    
    // Output to receiver's P2WPKH address
    const receiverP2WPKH = bitcoin.payments.p2wpkh({ 
      pubkey: receiverKeyPair.publicKey,
      network: bitcoin.networks.testnet 
    });
    
    const fee = 500; // Lower fee for claim
    const claimAmount = value - fee;
    
    psbt.addOutput({ 
      address: receiverP2WPKH.address!, 
      value: claimAmount 
    });
    
    // Sign input with receiver's key (claim path)
    psbt.signInput(0, receiverKeyPair);
    
    // Finalize with claim witness (IF path = true)
    psbt.finalizeInput(0, (inputIndex: number, input: any) => {
      const signature = input.partialSig[0].signature;
      const witness = [
        signature,      // Receiver's signature
        preimage,       // Preimage that hashes to the required value
        Buffer.from([1]), // TRUE for IF path (claim)
        htlcScript      // The witness script
      ];
      return {
        finalScriptWitness: bitcoin.script.compile(witness)
      };
    });
    
    const tx = psbt.extractTransaction();
    
    return {
      psbt: tx.toHex(),
      txid: tx.getId(),
      rawTx: tx.toHex(),
    };
  }

  /**
   * Sender refunds the funds after timelock using P2WSH HTLC.
   */
  async createRefundPSBT(
    senderWif: string,
    txid: string,
    vout: number,
    value: number,
    receiverPublicKeyHex: string,
    refundTimeLock: number
  ) {
    const senderKeyPair = ECPair.fromWIF(senderWif, bitcoin.networks.testnet);
    const receiverPublicKey = Buffer.from(receiverPublicKeyHex, 'hex');
    const preimage = Buffer.from('abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab', 'hex');
    const preimageHash = bitcoin.crypto.sha256(preimage);
    
    // Recreate the same HTLC script
    const htlcScript = bitcoin.script.compile([
      bitcoin.opcodes.OP_IF,
        bitcoin.opcodes.OP_SHA256,
        preimageHash,
        bitcoin.opcodes.OP_EQUALVERIFY,
        receiverPublicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_ELSE,
        bitcoin.script.number.encode(refundTimeLock),
        bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
        bitcoin.opcodes.OP_DROP,
        senderKeyPair.publicKey,
        bitcoin.opcodes.OP_CHECKSIG,
      bitcoin.opcodes.OP_ENDIF,
    ]);
    
    const htlcP2WSH = bitcoin.payments.p2wsh({
      redeem: { output: htlcScript },
      network: bitcoin.networks.testnet
    });
    
    // Build refund transaction
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
    psbt.setLocktime(refundTimeLock); // Required for CHECKLOCKTIMEVERIFY
    
    // Add HTLC UTXO as input
    psbt.addInput({
      hash: txid,
      index: vout,
      witnessUtxo: {
        script: htlcP2WSH.output!,
        value: value,
      },
      witnessScript: htlcScript,
      sequence: 0xfffffffe, // Required for CHECKLOCKTIMEVERIFY
    });
    
    // Output to sender's P2WPKH address
    const senderP2WPKH = bitcoin.payments.p2wpkh({ 
      pubkey: senderKeyPair.publicKey,
      network: bitcoin.networks.testnet 
    });
    
    const fee = 500;
    const refundAmount = value - fee;
    
    psbt.addOutput({ 
      address: senderP2WPKH.address!, 
      value: refundAmount 
    });
    
    // Sign input with sender's key (refund path)
    psbt.signInput(0, senderKeyPair);
    
    // Finalize with refund witness (ELSE path = false)
    psbt.finalizeInput(0, (inputIndex: number, input: any) => {
      const signature = input.partialSig[0].signature;
      const witness = [
        signature,        // Sender's signature
        Buffer.from([0]), // FALSE for ELSE path (refund)
        htlcScript        // The witness script
      ];
      return {
        finalScriptWitness: bitcoin.script.compile(witness)
      };
    });
    
    const tx = psbt.extractTransaction();
    
    return {
      psbt: tx.toHex(),
      txid: tx.getId(),
      rawTx: tx.toHex(),
    };
  }
}
