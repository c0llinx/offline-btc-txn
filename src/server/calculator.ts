import { RealBitcoinCalculator } from './bitcoin.js';
import { MempoolService } from '../../packages/server-api/src/services/mempool.js';
import { 
  CalculationRequest, 
  CalculationResult, 
  UTXO, 
  KeyPair,
  Operation,
  ErrorResponse 
} from '@offline/shared-types';
import * as fs from 'fs';
import * as path from 'path';

interface SavedAddress {
  address: string;
  privateKey: string;
  publicKey: string;
  scriptHash: string;
  num1: number;
  num2: number;
  operation: Operation;
  balance: number;
  lastChecked: Date;
}

export class TaprootCalculatorService {
  private bitcoinCalculator: RealBitcoinCalculator;
  private mempoolService: MempoolService;
  private savedAddresses: Map<string, SavedAddress> = new Map();
  private readonly addressesFilePath: string;

  constructor() {
    this.bitcoinCalculator = new RealBitcoinCalculator();
    this.mempoolService = new MempoolService('testnet');
    
    // Set up JSON file path for persistence
    this.addressesFilePath = path.join(process.cwd(), 'saved-addresses.json');
    
    // Load existing addresses from JSON file
    this.loadAddressesFromFile();
    
    // Add pre-funded address for immediate use
    this.initializePreFundedAddresses();
  }

  /**
   * Load addresses from JSON file
   */
  private loadAddressesFromFile(): void {
    try {
      if (fs.existsSync(this.addressesFilePath)) {
        const fileContent = fs.readFileSync(this.addressesFilePath, 'utf-8');
        const addressesData = JSON.parse(fileContent);
        
        // Convert plain objects back to Map with Date objects
        for (const [key, addr] of Object.entries(addressesData)) {
          const savedAddress = addr as any;
          savedAddress.lastChecked = new Date(savedAddress.lastChecked);
          this.savedAddresses.set(key, savedAddress);
        }
        
        console.log(`✅ Loaded ${this.savedAddresses.size} addresses from ${this.addressesFilePath}`);
      } else {
        console.log(`📁 No existing addresses file found at ${this.addressesFilePath}`);
      }
    } catch (error) {
      console.error('❌ Failed to load addresses from file:', error);
      // Continue with empty map if file is corrupted
      this.savedAddresses.clear();
    }
  }

  /**
   * Save addresses to JSON file
   */
  private saveAddressesToFile(): void {
    try {
      // Convert Map to plain object for JSON serialization
      const addressesData: Record<string, SavedAddress> = {};
      for (const [key, value] of this.savedAddresses.entries()) {
        addressesData[key] = value;
      }
      
      const jsonContent = JSON.stringify(addressesData, null, 2);
      fs.writeFileSync(this.addressesFilePath, jsonContent, 'utf-8');
      
      console.log(`💾 Saved ${this.savedAddresses.size} addresses to ${this.addressesFilePath}`);
    } catch (error) {
      console.error('❌ Failed to save addresses to file:', error);
    }
  }

  /**
   * Initialize known funded addresses
   */
  private async initializePreFundedAddresses(): Promise<void> {
    // Don't automatically add imported addresses without private keys
    // Let users manually generate proper addresses they control
    console.log('🔑 Pre-funded address initialization skipped - generate addresses manually for full control');
  }

  /**
   * Generate or retrieve existing funded address for calculations
   */
  async generateFundingAddress(num1: number, num2: number, operation: Operation): Promise<{
    address: string;
    privateKey: string;
    publicKey: string;
    scriptHash: string;
    fundingInstructions: string;
    isReused: boolean;
    balance: number;
  }> {
    try {
      // Validate inputs first
      this.bitcoinCalculator.validateCalculationInputs(num1, num2, operation);

      // Create a unique key for this calculation
      const calculationKey = `${num1}_${num2}_${operation}`;
      
      // Check if we already have an address for this calculation
      const existing = this.savedAddresses.get(calculationKey);
      if (existing) {
        // Update balance
        const fundingCheck = await this.checkFunding(existing.address);
        if (existing.balance !== fundingCheck.availableBalance) {
          existing.balance = fundingCheck.availableBalance;
          existing.lastChecked = new Date();
          this.saveAddressesToFile();
        }
        
        return {
          address: existing.address,
          privateKey: existing.privateKey,
          publicKey: existing.publicKey,
          scriptHash: existing.scriptHash,
          fundingInstructions: this.generateFundingInstructions(existing.address, num1, num2, operation),
          isReused: true,
          balance: existing.balance
        };
      }

      // Generate new key pair
      const keyPair = this.bitcoinCalculator.generateKeyPair();
      
      // Create Taproot address with calculation script
      const internalPubkeyHex = keyPair.publicKey.slice(1, 33).toString('hex'); // x-only pubkey in hex
      const addressData = this.bitcoinCalculator.createTaprootAddressWithScript(
        internalPubkeyHex,
        Buffer.alloc(0),
        'testnet',
        null
      );
      
      // Save the address
      const savedAddress: SavedAddress = {
        address: addressData.address || '',
        privateKey: keyPair.toWIF(),
        publicKey: keyPair.publicKey.toString('hex'),
        scriptHash: addressData.scriptHash,
        num1,
        num2,
        operation,
        balance: 0,
        lastChecked: new Date()
      };
      
      this.savedAddresses.set(calculationKey, savedAddress);
      this.saveAddressesToFile();

      const fundingInstructions = this.generateFundingInstructions(addressData.address || '', num1, num2, operation);

      return {
        address: addressData.address || '',
        privateKey: keyPair.toWIF(),
        publicKey: keyPair.publicKey.toString('hex'),
        scriptHash: addressData.scriptHash,
        fundingInstructions,
        isReused: false,
        balance: 0
      };
    } catch (error) {
      throw new Error(`Failed to generate funding address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if an address has sufficient funds for calculation
   */
  async checkFunding(address: string, requiredAmount: number = 100000): Promise<{
    isFunded: boolean;
    availableBalance: number;
    confirmedBalance: number;
    unconfirmedBalance: number;
    utxos: UTXO[];
    message: string;
  }> {
    try {
      if (!this.mempoolService.validateTestnetAddress(address)) {
        throw new Error('Invalid testnet address format');
      }

      const [balanceInfo, utxos] = await Promise.all([
        this.mempoolService.checkAddressBalance(address, requiredAmount),
        this.mempoolService.getAddressUTXOs(address)
      ]);

      let message = '';
      if (!balanceInfo.hasBalance) {
        if (balanceInfo.availableBalance === 0) {
          message = 'Address has no funds. Please send testnet Bitcoin to this address.';
        } else {
          message = `Insufficient funds. Available: ${balanceInfo.availableBalance} sats, Required: ${requiredAmount} sats`;
        }
      } else {
        message = `Address is sufficiently funded with ${balanceInfo.availableBalance} sats`;
      }

      return {
        isFunded: balanceInfo.hasBalance,
        availableBalance: balanceInfo.availableBalance,
        confirmedBalance: balanceInfo.confirmedBalance,
        unconfirmedBalance: balanceInfo.unconfirmedBalance,
        utxos,
        message
      };
    } catch (error) {
      throw new Error(`Failed to check funding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all saved addresses with their current balances
   */
  async getSavedAddresses(): Promise<Array<SavedAddress & { calculationKey: string }>> {
    const addresses = [];
    
    for (const [calculationKey, savedAddress] of this.savedAddresses.entries()) {
      // Update balance if checked more than 5 minutes ago
      const now = new Date();
      const timeSinceCheck = now.getTime() - savedAddress.lastChecked.getTime();
      
      if (timeSinceCheck > 5 * 60 * 1000) { // 5 minutes
        try {
          const fundingCheck = await this.checkFunding(savedAddress.address);
          savedAddress.balance = fundingCheck.availableBalance;
          savedAddress.lastChecked = now;
          // Save after balance update
          this.saveAddressesToFile();
        } catch (error) {
          console.warn(`Failed to update balance for ${savedAddress.address}:`, error);
        }
      }
      
      addresses.push({
        ...savedAddress,
        calculationKey
      });
    }
    
    return addresses.sort((a, b) => b.lastChecked.getTime() - a.lastChecked.getTime());
  }

  /**
   * Use an existing address for calculation
   */
  async useExistingAddress(calculationKey: string): Promise<{
    address: string;
    privateKey: string;
    publicKey: string;
    scriptHash: string;
    balance: number;
    calculation: string;
  }> {
    const savedAddress = this.savedAddresses.get(calculationKey);
    if (!savedAddress) {
      throw new Error('Address not found');
    }

    // Update balance
    const fundingCheck = await this.checkFunding(savedAddress.address);
    savedAddress.balance = fundingCheck.availableBalance;
    savedAddress.lastChecked = new Date();
    this.saveAddressesToFile();

    const operationSymbol = this.getOperationSymbol(savedAddress.operation);
    
    return {
      address: savedAddress.address,
      privateKey: savedAddress.privateKey,
      publicKey: savedAddress.publicKey,
      scriptHash: savedAddress.scriptHash,
      balance: savedAddress.balance,
      calculation: `${savedAddress.num1} ${operationSymbol} ${savedAddress.num2}`
    };
  }

  /**
   * Perform the calculation and create a real Bitcoin transaction
   */
  // Stub method to satisfy existing server endpoints; returns an error to indicate unsupported feature.
  async performCalculation(_request: CalculationRequest): Promise<CalculationResult> {
    throw new Error('Arithmetic calculation feature has been disabled per Specs.md');
  }

  /**
   * Get transaction status and confirmation details
   */
  async getTransactionStatus(txid: string): Promise<{
    txid: string;
    status: 'confirmed' | 'unconfirmed' | 'failed' | 'not_found';
    confirmations: number;
    blockHeight?: number;
    blockHash?: string;
    blockTime?: number;
    fee: number;
    mempoolUrl: string;
  }> {
    try {
      const txStatus = await this.mempoolService.getTransactionStatus(txid);
      
      return {
        txid,
        status: txStatus.status.confirmed ? 'confirmed' : 'unconfirmed',
        confirmations: txStatus.status.confirmed ? 1 : 0, // Simplified
        blockHeight: txStatus.status.block_height,
        blockHash: txStatus.status.block_hash,
        blockTime: txStatus.status.block_time,
        fee: txStatus.fee,
        mempoolUrl: this.mempoolService.getMempoolURL(txid)
      };
    } catch (error) {
      return {
        txid,
        status: 'not_found',
        confirmations: 0,
        fee: 0,
        mempoolUrl: this.mempoolService.getMempoolURL(txid)
      };
    }
  }

  /**
   * Get network status and health
   */
  async getNetworkStatus(): Promise<{
    isHealthy: boolean;
    blockHeight: number;
    mempoolSize: number;
    averageFee: number;
  }> {
    try {
      const [networkHealth, feeEstimates] = await Promise.all([
        this.mempoolService.checkNetworkHealth(),
        this.mempoolService.getFeeEstimates()
      ]);

      return {
        isHealthy: networkHealth.isHealthy,
        blockHeight: networkHealth.blockHeight,
        mempoolSize: networkHealth.mempoolSize,
        averageFee: feeEstimates.halfHourFee
      };
    } catch (error) {
      return {
        isHealthy: false,
        blockHeight: 0,
        mempoolSize: 0,
        averageFee: 10
      };
    }
  }

  /**
   * Validate calculation parameters
   */
  validateCalculationRequest(request: CalculationRequest): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    try {
      this.bitcoinCalculator.validateCalculationInputs(
        request.num1,
        request.num2,
        request.operation
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Validation error');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get funding instructions for testnet Bitcoin
   */
  private generateFundingInstructions(
    address: string, 
    num1: number, 
    num2: number, 
    operation: Operation
  ): string {
    const operationSymbol = this.getOperationSymbol(operation);
    const estimatedFee = 50000; // 50k sats estimated minimum
    
    return `
🪙 FUNDING INSTRUCTIONS FOR CALCULATION: ${num1} ${operationSymbol} ${num2}

📍 Address: ${address}
💰 Minimum Required: ${estimatedFee} satoshis (0.0005 tBTC)
⏰ Recommended: 100,000 satoshis (0.001 tBTC) for safety

📥 GET TESTNET BITCOIN FROM FAUCETS:
1. https://testnet-faucet.mempool.co/
2. https://bitcoinfaucet.uo1.net/
3. https://testnet.help/en/btcfaucet/testnet
4. https://coinfaucet.eu/en/btc-testnet/

⚡ STEPS:
1. Copy the address above
2. Visit any faucet and paste the address
3. Request testnet Bitcoin (usually 0.001-0.01 tBTC)
4. Wait for 1-3 confirmations (10-30 minutes)
5. Return here to perform the calculation

🔗 Monitor your address: ${this.mempoolService.getAddressURL(address)}

⚠️ IMPORTANT: This is testnet Bitcoin (no real value). Only for testing purposes.
`.trim();
  }

  private getOperationSymbol(operation: Operation): string {
    const symbols: Record<Operation, string> = { add: '+', subtract: '-', multiply: '×', divide: '÷' };
    return symbols[operation] || '?';
  }

  private calculateExpectedResult(num1: number, num2: number, operation: Operation): number {
    switch (operation) {
      case 'add': return num1 + num2;
      case 'subtract': return num1 - num2;
      case 'multiply': return num1 * num2;
      case 'divide':
        if (num2 === 0) throw new Error('Division by zero');
        return Math.floor(num1 / num2);
      default: throw new Error(`Invalid operation: ${operation}`);
    }
  }

  /**
   * Add a new calculation to an existing address
   */
  async addCalculationToAddress(
    address: string,
    num1: number,
    num2: number,
    operation: Operation
  ): Promise<CalculationResult> {
    try {
      // Find the existing address
      const existing = Array.from(this.savedAddresses.values()).find(addr => (addr as any).address === address);
      if (!existing) {
        throw new Error(`Address ${address} not found in saved addresses`);
      }

      // Validate inputs
      this.bitcoinCalculator.validateCalculationInputs(num1, num2, operation);

      // Check if this is an imported address without private key
      if (existing.privateKey === 'IMPORTED_ADDRESS_NO_PRIVATE_KEY') {
        throw new Error('Cannot perform calculations on imported address without private key');
      }

      // Check funding
      const fundingCheck = await this.checkFunding(address);
      if (!fundingCheck.isFunded) {
        throw new Error(`Address not funded: ${fundingCheck.message}`);
      }

      // Get current fee rates
      const feeEstimates = await this.mempoolService.getFeeEstimates();
      const feeRate = feeEstimates.fastestFee;

      // Create the calculation transaction
      const result = await this.bitcoinCalculator.createCalculationTransaction(
        num1,
        num2,
        operation,
        fundingCheck.utxos,
        feeRate,
        existing.privateKey
      );

      // Override with the existing address details
      result.taprootAddress = existing.address;
      result.privateKey = existing.privateKey;
      result.publicKey = existing.publicKey;
      result.scriptHash = existing.scriptHash;

      // Broadcast the transaction
      try {
        const broadcastedTxid = await this.mempoolService.broadcastTransaction(result.rawTx);
        result.txid = broadcastedTxid;
        result.broadcastStatus = 'success';
        
        console.log(`✅ Transaction successfully broadcasted: ${broadcastedTxid}`);
        console.log(`🔗 View at: ${this.mempoolService.getMempoolURL(broadcastedTxid)}`);
        
        // Update saved address balance
        existing.balance = Math.max(0, existing.balance - result.fee);
        existing.lastChecked = new Date();

        // Add calculation to the address's calculation history (if it has the new structure)
        if ('calculations' in existing && Array.isArray((existing as any).calculations)) {
          (existing as any).calculations.push({
            num1,
            num2,
            operation,
            result: result.result,
            txid: result.txid,
            fee: result.fee,
            rawTx: result.rawTx,
            timestamp: new Date().toISOString(),
            broadcastStatus: result.broadcastStatus,
            confirmationStatus: result.confirmationStatus
          });
        }

        this.saveAddressesToFile();
        
      } catch (broadcastError) {
        console.error('❌ Broadcast failed:', broadcastError);
        result.broadcastStatus = 'failed';
        throw new Error(`Transaction created but broadcast failed: ${broadcastError instanceof Error ? broadcastError.message : 'Unknown error'}`);
      }

      return result;

    } catch (error) {
      throw new Error(`Failed to perform calculation on existing address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Import an existing funded address
   */
  async importFundedAddress(
    address: string,
    num1: number,
    num2: number,
    operation: Operation,
    privateKey?: string
  ): Promise<{
    address: string;
    balance: number;
    calculationKey: string;
    imported: boolean;
  }> {
    try {
      // Validate the address format
      if (!this.mempoolService.validateTestnetAddress(address)) {
        throw new Error('Invalid testnet address format');
      }

      // Validate calculation inputs
      this.bitcoinCalculator.validateCalculationInputs(num1, num2, operation);

      // Check current balance
      const fundingCheck = await this.checkFunding(address);

      const calculationKey = `${num1}_${num2}_${operation}`;
      
      // Create saved address entry
      const savedAddress: SavedAddress = {
        address,
        privateKey: privateKey || 'IMPORTED_ADDRESS_NO_PRIVATE_KEY',
        publicKey: privateKey ? 'IMPORTED_ADDRESS_WITH_PRIVATE_KEY' : 'IMPORTED_ADDRESS_NO_PUBLIC_KEY',
        scriptHash: 'imported_address_script_hash',
        num1,
        num2,
        operation,
        balance: fundingCheck.availableBalance,
        lastChecked: new Date()
      };

      this.savedAddresses.set(calculationKey, savedAddress);
      this.saveAddressesToFile();

      console.log(`✅ Imported address: ${address}`);
      console.log(`💰 Balance: ${fundingCheck.availableBalance} sats`);
      console.log(`🧮 Calculation: ${num1} ${this.getOperationSymbol(operation)} ${num2}`);

      return {
        address,
        balance: fundingCheck.availableBalance,
        calculationKey,
        imported: true
      };
    } catch (error) {
      throw new Error(`Failed to import address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}