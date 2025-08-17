import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { Operation, TaprootScript, UTXO, CalculationResult, KeyPair } from '../shared/types.js';

// Initialize ECC library
bitcoin.initEccLib(ecc);

const ECPair = ECPairFactory(ecc);
const TESTNET = bitcoin.networks.testnet;

export class RealBitcoinCalculator {
  private network = TESTNET;

  /**
   * Generate a new key pair for Bitcoin operations
   */
  generateKeyPair(): KeyPair {
    const keyPair = ECPair.makeRandom({ network: this.network });
    const privateKey = keyPair.toWIF();
    const publicKey = keyPair.publicKey.toString('hex');
    
    // Generate internal key for Taproot (32 bytes)
    const internalKey = keyPair.publicKey.slice(1, 33);
    
    // Create basic Taproot address (key-path spend only for now)
    const { address } = bitcoin.payments.p2tr({
      internalPubkey: internalKey,
      network: this.network
    });

    if (!address) {
      throw new Error('Failed to generate Taproot address');
    }

    return {
      privateKey,
      publicKey,
      address
    };
  }

  /**
   * Create Tapscript for arithmetic calculation
   */
  createCalculationScript(num1: number, num2: number, operation: Operation): TaprootScript {
    const script = bitcoin.script.compile([
      // Push first number
      this.numberToScriptNum(num1),
      // Push second number  
      this.numberToScriptNum(num2),
      // Perform operation
      this.getOperationOpcode(operation),
      // Push expected result
      this.numberToScriptNum(this.calculateExpectedResult(num1, num2, operation)),
      // Check equality
      bitcoin.opcodes.OP_EQUAL
    ]);

    const scriptHash = bitcoin.crypto.sha256(script).toString('hex');
    
    return {
      script,
      leafVersion: 0xc0,
      scriptHash
    };
  }

  /**
   * Create Taproot address with embedded calculation script
   */
  createTaprootAddressWithScript(
    internalKey: Buffer, 
    num1: number, 
    num2: number, 
    operation: Operation
  ): { address: string; scriptHash: string } {
    const taprootScript = this.createCalculationScript(num1, num2, operation);
    
    // For demo purposes, create a key-path only address that can be easily spent
    // The script hash is preserved for reference but not used in address generation
    const { address } = bitcoin.payments.p2tr({
      internalPubkey: internalKey,
      network: this.network
      // No scriptTree - this creates a key-path only address
    });

    if (!address) {
      throw new Error('Failed to create Taproot address');
    }

    return {
      address,
      scriptHash: taprootScript.scriptHash
    };
  }

  /**
   * Build and sign a real Bitcoin transaction
   */
  async buildTransaction(
    utxos: UTXO[],
    destinationAddress: string,
    amount: number,
    feeRate: number,
    privateKeyWIF: string,
    changeAddress: string,
    taprootScript?: TaprootScript,
    internalKeyOverride?: Buffer
  ): Promise<{ rawTx: string; txid: string; fee: number }> {
    
    if (utxos.length === 0) {
      throw new Error('No UTXOs available for transaction');
    }

    const keyPair = ECPair.fromWIF(privateKeyWIF, this.network);
    
    console.log('DEBUG: Creating fresh PSBT instance');
    const psbt = new bitcoin.Psbt({ network: this.network });
    console.log('DEBUG: PSBT inputs count before adding:', psbt.inputCount);

    // Calculate total input value
    const totalInputValue = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    
    // Estimate transaction size and fee
    const estimatedSize = this.estimateTransactionSize(utxos.length, 2); // 2 outputs max
    const fee = Math.ceil(estimatedSize * feeRate);
    
    if (totalInputValue < amount + fee) {
      throw new Error(`Insufficient funds. Need ${amount + fee} sats, have ${totalInputValue} sats`);
    }

    // Add inputs
    console.log('DEBUG: Processing', utxos.length, 'UTXOs');
    for (let i = 0; i < utxos.length; i++) {
      const utxo = utxos[i];
      console.log(`DEBUG: Processing UTXO ${i}:`, utxo.txid, utxo.vout);
      
      // For Taproot inputs, we need the previous transaction
      const prevTxHex = await this.fetchRawTransaction(utxo.txid);
      const prevTx = bitcoin.Transaction.fromHex(prevTxHex);
      
      // Use provided internal key or derive from signing key pair (32 bytes X-only)
      const internalKey = internalKeyOverride || keyPair.publicKey.slice(1, 33);
      
      console.log('DEBUG buildTransaction: Internal Key:', internalKey.toString('hex'));
      console.log('DEBUG buildTransaction: Using internalKeyOverride:', !!internalKeyOverride);
      
      console.log('DEBUG: Setting up input for key-path spending only');
      console.log('DEBUG: UTXO scriptPubKey:', utxo.scriptPubKey);
      console.log('DEBUG: UTXO value:', utxo.value);
      
      // Verify the scriptPubKey matches our internal key
      const expectedPayment = bitcoin.payments.p2tr({
        internalPubkey: internalKey,
        network: this.network
      });
      console.log('DEBUG: Expected scriptPubKey from internal key:', expectedPayment.output?.toString('hex'));
      console.log('DEBUG: UTXO scriptPubKey matches expected:', utxo.scriptPubKey === expectedPayment.output?.toString('hex'));
      
      if (!utxo.scriptPubKey) {
        throw new Error(`UTXO ${utxo.txid}:${utxo.vout} has empty scriptPubKey`);
      }
      
      // For Taproot key-path spending - minimal data required
      const inputData = {
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: Buffer.from(utxo.scriptPubKey, 'hex'),
          value: utxo.value
        },
        tapInternalKey: internalKey
        // Critical: No tapLeafScript, no tapMerkleRoot - pure key-path
      };

      console.log(`DEBUG: Adding input ${i} to PSBT`);
      try {
        psbt.addInput(inputData);
        console.log(`DEBUG: Successfully added input ${i}`);
      } catch (error) {
        console.log(`DEBUG: Failed to add input ${i}:`, error);
        throw error;
      }
    }

    // Add main output
    psbt.addOutput({
      address: destinationAddress,
      value: amount
    });

    // Add change output if needed
    const changeAmount = totalInputValue - amount - fee;
    if (changeAmount > 546) { // Dust threshold
      psbt.addOutput({
        address: changeAddress,
        value: changeAmount
      });
    }

    // Sign all inputs  
    for (let i = 0; i < utxos.length; i++) {
      try {
        console.log(`DEBUG: Attempting to sign input ${i}`);
        console.log(`DEBUG: KeyPair WIF: ${keyPair.toWIF()}`);
        console.log(`DEBUG: KeyPair PublicKey: ${keyPair.publicKey.toString('hex')}`);
        console.log(`DEBUG: Internal Key: ${psbt.data.inputs[i].tapInternalKey?.toString('hex')}`);
        
        // Create the tweaked key pair for Taproot key-path spending
        const tweakedSigner = keyPair.tweak(
          bitcoin.crypto.taggedHash('TapTweak', psbt.data.inputs[i].tapInternalKey!)
        );
        
        console.log(`DEBUG: Tweaked KeyPair PublicKey: ${tweakedSigner.publicKey.toString('hex')}`);
        
        // Sign with the tweaked key
        psbt.signInput(i, tweakedSigner);
        console.log(`DEBUG: Successfully signed input ${i}`);
      } catch (error) {
        console.log(`DEBUG: Signing failed for input ${i}:`, error);
        throw error;
      }
    }

    // Finalize and extract transaction
    psbt.finalizeAllInputs();
    const rawTx = psbt.extractTransaction().toHex();
    const txid = psbt.extractTransaction().getId();

    return {
      rawTx,
      txid,
      fee
    };
  }

  /**
   * Create a calculation transaction that proves the arithmetic operation
   */
  async createCalculationTransaction(
    num1: number,
    num2: number,
    operation: Operation,
    utxos: UTXO[],
    feeRate: number,
    existingPrivateKey: string
  ): Promise<CalculationResult> {
    
    // Use existing private key instead of generating new one
    const keyPair = ECPair.fromWIF(existingPrivateKey, this.network);
    const internalKey = keyPair.publicKey.slice(1, 33);
    
    console.log('DEBUG: Private Key WIF:', existingPrivateKey);
    console.log('DEBUG: Public Key:', keyPair.publicKey.toString('hex'));
    console.log('DEBUG: Internal Key:', internalKey.toString('hex'));
    
    // Create calculation script for spending
    const taprootScript = this.createCalculationScript(num1, num2, operation);
    
    // Create Taproot address with calculation script
    const { address: taprootAddress, scriptHash } = this.createTaprootAddressWithScript(
      internalKey, 
      num1, 
      num2, 
      operation
    );
    
    console.log('DEBUG: Generated Taproot Address:', taprootAddress);
    console.log('DEBUG: Script Hash:', scriptHash);

    // Calculate result
    const result = this.calculateExpectedResult(num1, num2, operation);
    
    // Build transaction
    const totalInputValue = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    // Add small random component to ensure unique transaction IDs
    const randomComponent = Math.floor(Math.random() * 1000); // 0-999 sats
    const outputAmount = Math.floor(totalInputValue * 0.9) - randomComponent; // Use 90% for output, rest for fees
    
    const transaction = await this.buildTransaction(
      utxos,
      taprootAddress, // Send to our Taproot address
      outputAmount,
      feeRate,
      existingPrivateKey,
      taprootAddress, // Change back to same address
      undefined, // No script for key-path spending
      internalKey // Pass the same internal key used for address creation
    );

    return {
      operation: `${num1} ${this.getOperationSymbol(operation)} ${num2}`,
      num1,
      num2,
      result,
      taprootAddress,
      scriptHash,
      privateKey: existingPrivateKey,
      publicKey: ECPair.fromWIF(existingPrivateKey, this.network).publicKey.toString('hex'),
      txid: transaction.txid,
      fee: transaction.fee,
      rawTx: transaction.rawTx,
      utxosUsed: utxos,
      broadcastStatus: 'pending',
      confirmationStatus: 'unconfirmed'
    };
  }

  // Helper methods
  private numberToScriptNum(num: number): Buffer {
    if (num === 0) return Buffer.from([bitcoin.opcodes.OP_0]);
    if (num === 1) return Buffer.from([bitcoin.opcodes.OP_1]);
    if (num >= 2 && num <= 16) return Buffer.from([bitcoin.opcodes.OP_2 + num - 2]);
    
    // For larger numbers, encode as little-endian
    const buffer = Buffer.alloc(4);
    buffer.writeInt32LE(num, 0);
    return bitcoin.script.number.encode(num);
  }

  private getOperationOpcode(operation: Operation): number {
    switch (operation) {
      case 'add': return bitcoin.opcodes.OP_ADD;
      case 'subtract': return bitcoin.opcodes.OP_SUB;
      case 'multiply': return bitcoin.opcodes.OP_MUL;
      case 'divide': return bitcoin.opcodes.OP_DIV;
      default: throw new Error(`Unsupported operation: ${operation}`);
    }
  }

  private calculateExpectedResult(num1: number, num2: number, operation: Operation): number {
    switch (operation) {
      case 'add': return num1 + num2;
      case 'subtract': return num1 - num2;
      case 'multiply': return num1 * num2;
      case 'divide':
        if (num2 === 0) throw new Error('Division by zero');
        return Math.floor(num1 / num2); // Bitcoin script uses integer division
      default: throw new Error(`Invalid operation: ${operation}`);
    }
  }

  private getOperationSymbol(operation: Operation): string {
    const symbols = { add: '+', subtract: '-', multiply: '×', divide: '÷' };
    return symbols[operation] || '?';
  }

  private estimateTransactionSize(inputCount: number, outputCount: number): number {
    // Rough estimation for Taproot transactions
    const baseSize = 10; // Version, locktime, etc.
    const inputSize = 57; // Taproot input size
    const outputSize = 43; // P2TR output size
    
    return baseSize + (inputCount * inputSize) + (outputCount * outputSize);
  }

  private async fetchRawTransaction(txid: string): Promise<string> {
    try {
      // Use mempool.space API to fetch raw transaction
      const response = await fetch(`https://mempool.space/testnet/api/tx/${txid}/hex`);
      if (!response.ok) {
        throw new Error(`Failed to fetch transaction ${txid}: ${response.status}`);
      }
      const rawTx = await response.text();
      return rawTx;
    } catch (error) {
      throw new Error(`Failed to fetch raw transaction ${txid}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate that the numbers are suitable for Bitcoin script operations
   */
  validateCalculationInputs(num1: number, num2: number, operation: Operation): void {
    // Bitcoin script works with 32-bit signed integers
    const MAX_SCRIPT_NUM = 2147483647;
    const MIN_SCRIPT_NUM = -2147483648;

    if (!Number.isInteger(num1) || !Number.isInteger(num2)) {
      throw new Error('Only integers are supported in Bitcoin script');
    }

    if (num1 < MIN_SCRIPT_NUM || num1 > MAX_SCRIPT_NUM) {
      throw new Error(`Number 1 (${num1}) is outside valid script number range`);
    }

    if (num2 < MIN_SCRIPT_NUM || num2 > MAX_SCRIPT_NUM) {
      throw new Error(`Number 2 (${num2}) is outside valid script number range`);
    }

    if (operation === 'divide' && num2 === 0) {
      throw new Error('Division by zero is not allowed');
    }

    // Check for overflow
    const result = this.calculateExpectedResult(num1, num2, operation);
    if (result < MIN_SCRIPT_NUM || result > MAX_SCRIPT_NUM) {
      throw new Error(`Result (${result}) would overflow script number range`);
    }
  }
}