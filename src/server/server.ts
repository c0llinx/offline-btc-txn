import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { TaprootCalculatorService } from './calculator.js';
import { OfflineWorkflowService } from './workflow.js';
import { RealBitcoinCalculator } from './bitcoin.js';
import { MempoolAPI } from './mempool.js';
import { CalculationRequest } from '../shared/types.js';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize services
const mempoolAPI = new MempoolAPI();

// Middleware
app.use(cors());
app.use(express.json());
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Serve static files from Vite build output
const clientBuildPath = path.resolve(__dirname, '../../dist/client');
app.use(express.static(clientBuildPath));

// Initialize services
const calculatorService = new TaprootCalculatorService();
const workflowService = new OfflineWorkflowService();

// Serve HTML files from root directory
const rootPath = path.resolve(__dirname, '../../');
app.get('/', (_req, res) => {
  res.sendFile(path.join(rootPath, 'index.html'));
});

app.get('/wallet.html', (_req, res) => {
  res.sendFile(path.join(rootPath, 'wallet.html'));
});

app.get('/test-wallet.html', (_req, res) => {
  res.sendFile(path.join(rootPath, 'test-wallet.html'));
});

app.get('/index.html', (_req, res) => {
  res.sendFile(path.join(rootPath, 'index.html'));
});

app.get('/simple-wallet.html', (_req, res) => {
  res.sendFile(path.join(rootPath, 'simple-wallet.html'));
});

// Routes

/**
 * Generate a random key pair (WIF + pubkey hex) for testing.
 */
app.get('/api/generate-keypair', (_req, res) => {
  try {
    const wallet = new RealBitcoinCalculator();
    const keyPair = wallet.generateKeyPair();
    res.json({
      wif: keyPair.toWIF(),
      pubkeyHex: keyPair.publicKey.toString('hex')
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate key pair' });
  }
});

// Routes

/**
 * Health check endpoint
 */
app.get('/api/health', async (req, res) => {
  try {
    const networkStatus = await calculatorService.getNetworkStatus();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      network: networkStatus
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Generate funding address for calculation
 */
app.post('/api/generate-address', async (req, res) => {
  try {
    const { num1, num2, operation } = req.body;
    
    if (typeof num1 !== 'number' || typeof num2 !== 'number' || !operation) {
      return res.status(400).json({
        error: 'Invalid parameters. num1, num2 must be numbers, operation must be specified.'
      });
    }

    const result = await calculatorService.generateFundingAddress(num1, num2, operation);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to generate address'
    });
  }
});

/**
 * Get all saved addresses
 */
app.get('/api/saved-addresses', async (req, res) => {
  try {
    const addresses = await calculatorService.getSavedAddresses();
    res.json(addresses);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get saved addresses'
    });
  }
});

/**
 * Use existing address for calculation
 */
app.post('/api/use-address/:calculationKey', async (req, res) => {
  try {
    const { calculationKey } = req.params;
    const result = await calculatorService.useExistingAddress(calculationKey);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to use existing address'
    });
  }
});

/**
 * Import an existing funded address
 */
app.post('/api/import-address', async (req, res) => {
  try {
    const { address, num1, num2, operation, privateKey } = req.body;
    
    if (!address || typeof num1 !== 'number' || typeof num2 !== 'number' || !operation) {
      return res.status(400).json({
        error: 'Invalid parameters. address, num1, num2, and operation are required.'
      });
    }

    const result = await calculatorService.importFundedAddress(
      address,
      num1,
      num2,
      operation,
      privateKey
    );
    
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to import address'
    });
  }
});

/**
 * Check funding status of an address
 */
app.get('/api/check-funding/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const requiredAmount = parseInt(req.query.amount as string) || 100000;
    
    const result = await calculatorService.checkFunding(address, requiredAmount);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to check funding'
    });
  }
});

/**
 * Perform calculation and create Bitcoin transaction
 */
app.post('/api/calculate', async (req, res) => {
  try {
    const calculationRequest: CalculationRequest = req.body;
    
    // Validate request
    const validation = calculatorService.validateCalculationRequest(calculationRequest);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Invalid calculation request',
        details: validation.errors
      });
    }

    const result = await calculatorService.performCalculation(calculationRequest);
    res.json(result);
  } catch (error) {
    console.error('Calculation error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Calculation failed'
    });
  }
});

/**
 * Perform calculation using existing address
 */
app.post('/api/calculate-existing', async (req, res) => {
  try {
    const { address, num1, num2, operation } = req.body;
    
    if (!address || typeof num1 !== 'number' || typeof num2 !== 'number' || !operation) {
      return res.status(400).json({
        error: 'Invalid parameters. address, num1, num2, and operation are required.'
      });
    }

    const result = await calculatorService.addCalculationToAddress(address, num1, num2, operation);
    res.json(result);
  } catch (error) {
    console.error('Address reuse calculation error:', error);
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to perform calculation on existing address'
    });
  }
});

/**
 * Get transaction status
 */
app.get('/api/transaction/:txid', async (req, res) => {
  try {
    const { txid } = req.params;
    
    if (!/^[a-fA-F0-9]{64}$/.test(txid)) {
      return res.status(400).json({
        error: 'Invalid transaction ID format'
      });
    }

    const result = await calculatorService.getTransactionStatus(txid);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get transaction status'
    });
  }
});

/**
 * Get network status
 */
app.get('/api/network-status', async (req, res) => {
  try {
    const result = await calculatorService.getNetworkStatus();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get network status'
    });
  }
});

/**
 * Validate calculation parameters
 */
app.post('/api/validate', (req, res) => {
  try {
    const calculationRequest: CalculationRequest = req.body;
    const result = calculatorService.validateCalculationRequest(calculationRequest);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Validation failed'
    });
  }
});

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// 404 handler
// --- Offline Workflow Endpoints ---

/**
 * Sender: create initial funding PSBT (QR Code A + B)
 */
// Simple in-memory wallet store for demo - in production, use encrypted database
const walletStore = new Map<string, { privateKey: string; publicKey: string; name?: string }>();

app.post('/api/create-sender-transaction', async (req, res) => {
  try {
    const { senderWif, senderAddress, receiverAddress, amount, refundLocktime, receiverPublicKey } = req.body;
    
    // Allow either senderWif OR senderAddress (will lookup private key)
    let actualSenderWif = senderWif;
    let actualReceiverPubKey = receiverPublicKey;
    
    if (!senderWif && senderAddress) {
      // Look up private key for sender address
      const senderWallet = walletStore.get(senderAddress);
      if (!senderWallet) {
        return res.status(400).json({ 
          error: `No private key found for sender address: ${senderAddress}`,
          hint: 'Use /api/wallet/register to register this address with its private key'
        });
      }
      actualSenderWif = senderWallet.privateKey;
      console.log(`✅ Found private key for sender address: ${senderAddress}`);
    }
    
    // Look up public key for receiver address if not provided
    if (!receiverPublicKey && receiverAddress.startsWith('tb1')) {
      const receiverWallet = walletStore.get(receiverAddress);
      if (receiverWallet) {
        actualReceiverPubKey = receiverWallet.publicKey;
        console.log(`✅ Found public key for receiver address: ${receiverAddress}`);
      }
    }
    
    if (!actualSenderWif || !receiverAddress || typeof amount !== 'number' || typeof refundLocktime !== 'number') {
      return res.status(400).json({ error: 'senderWif/senderAddress, receiverAddress, amount, refundLocktime required' });
    }
    
    // Use the looked-up or provided public key
    let receiverPubKeyHex = actualReceiverPubKey;
    
    // If receiverAddress is a bech32 address and no public key found, create a simpler HTLC
    if (receiverAddress.startsWith('tb1') && !actualReceiverPubKey) {
      // Manual address mode - create HTLC that pays directly to the address
      const result = await workflowService.createSimpleHTLC(actualSenderWif, receiverAddress, amount, refundLocktime);
      
      // Broadcast the funding transaction
      if (result.psbt && result.psbt !== 'TODO') {
        const broadcastTxid = await mempoolAPI.broadcastTransaction(result.psbt);
        const explorerUrl = mempoolAPI.getMempoolURL(broadcastTxid);
        
        // Schedule balance update for sender address
        setTimeout(async () => {
          try {
            const senderAddr = result.senderAddress || senderAddress;
            if (senderAddr) {
              const newBalance = await mempoolAPI.checkAddressBalance(senderAddr, 0);
              console.log(`🔄 Updated sender balance: ${senderAddr} = ${newBalance.availableBalance} sats`);
            }
          } catch (error) {
            console.log('⚠️ Failed to update sender balance:', error);
          }
        }, 3000);
        
        res.json({ ...result, broadcastTxid, explorerUrl, htlcStarted: true });
      } else {
        res.json(result);
      }
      return;
    }
    
    // Validate public key format
    if (receiverPubKeyHex.length !== 66) {
      return res.status(400).json({ 
        error: `receiverPublicKey must be a 66-character hex public key, got ${receiverPubKeyHex.length} characters`,
        hint: 'Provide the public key corresponding to the receiver address',
        received: receiverPubKeyHex
      });
    }
    
    const result = await workflowService.createFundingPSBT(actualSenderWif, receiverPubKeyHex, amount, refundLocktime);
    
    // Broadcast the funding transaction to start HTLC timing
    if (result.psbt && result.psbt !== 'TODO') {
      const broadcastTxid = await mempoolAPI.broadcastTransaction(result.psbt);
      const explorerUrl = mempoolAPI.getMempoolURL(broadcastTxid);
      
      // Schedule balance update for sender address  
      setTimeout(async () => {
        try {
          const senderAddr = senderAddress;
          if (senderAddr) {
            const newBalance = await mempoolAPI.checkAddressBalance(senderAddr, 0);
            console.log(`🔄 Updated sender balance: ${senderAddr} = ${newBalance.availableBalance} sats`);
          }
        } catch (error) {
          console.log('⚠️ Failed to update sender balance:', error);
        }
      }, 3000);
      
      res.json({ ...result, broadcastTxid, explorerUrl, htlcStarted: true });
    } else {
      res.json(result);
    }
  } catch (error) {
    console.error('Sender transaction creation error:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create sender transaction' });
  }
});

/**
 * Receiver: create claim PSBT
 */
app.post('/api/create-receiver-claim-transaction', async (req, res) => {
  try {
    const { txoData, preimage, receiverWif } = req.body;
    if (!txoData || !preimage || !receiverWif) {
      return res.status(400).json({ error: 'txoData, preimage, receiverWif required' });
    }
    const { txid, vout, value, senderPublicKey, refundTimeLock } = txoData;
    
    // Check if HTLC has elapsed
    const currentHeight = (await mempoolAPI.checkNetworkHealth()).blockHeight;
    if (currentHeight >= refundTimeLock) {
      return res.status(400).json({ error: 'HTLC has expired. Funds can only be refunded by sender now.' });
    }
    
    const result = await workflowService.createClaimPSBT(receiverWif, preimage, txid, vout, value, senderPublicKey, refundTimeLock);
    
    // Broadcast the claim transaction
    if (result.rawTx) {
      const broadcastTxid = await mempoolAPI.broadcastTransaction(result.rawTx);
      const explorerUrl = mempoolAPI.getMempoolURL(broadcastTxid);
      res.json({ ...result, broadcastTxid, explorerUrl });
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create claim transaction' });
  }
});

/**
 * Sender: create refund PSBT (after timelock)
 */
app.post('/api/create-sender-refund-transaction', async (req, res) => {
  try {
    const { txoData, senderWif } = req.body;
    if (!txoData || !senderWif) {
      return res.status(400).json({ error: 'txoData and senderWif required' });
    }
    const { txid, vout, value, receiverPublicKey, refundTimeLock } = txoData;
    const result = await workflowService.createRefundPSBT(senderWif, txid, vout, value, receiverPublicKey, refundTimeLock);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create refund transaction' });
  }
});

/**
 * Wallet API endpoints
 */

// Create new wallet
app.post('/api/wallet/create', async (req, res) => {
  try {
    const { name, addressType } = req.body;
    if (!name || !addressType) {
      return res.status(400).json({ error: 'Name and addressType required' });
    }

    const keyPair = ECPair.makeRandom({ network: bitcoin.networks.testnet });
    let address: string;

    switch (addressType) {
      case 'p2wpkh':
        address = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: bitcoin.networks.testnet }).address!;
        break;
      case 'p2tr':
        address = bitcoin.payments.p2tr({ internalPubkey: keyPair.publicKey.slice(1, 33), network: bitcoin.networks.testnet }).address!;
        break;
      case 'p2sh':
        const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: bitcoin.networks.testnet });
        address = bitcoin.payments.p2sh({ redeem: p2wpkh, network: bitcoin.networks.testnet }).address!;
        break;
      default:
        return res.status(400).json({ error: 'Invalid address type' });
    }

    const wallet = {
      name,
      address,
      privateKey: keyPair.toWIF(),
      publicKey: keyPair.publicKey.toString('hex'),
      addressType,
      balance: 0,
      created: new Date().toISOString()
    };

    // Automatically register in HTLC wallet store for seamless integration
    walletStore.set(address, {
      privateKey: wallet.privateKey,
      publicKey: wallet.publicKey,
      name: wallet.name
    });
    
    console.log(`✅ Auto-registered wallet for HTLC use: ${address}`);

    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create wallet' });
  }
});

// Register existing address with private key for HTLC use
app.post('/api/wallet/register', async (req, res) => {
  try {
    const { address, privateKey, name } = req.body;
    if (!address || !privateKey) {
      return res.status(400).json({ error: 'address and privateKey required' });
    }

    // Validate private key and derive address to verify match
    const keyPair = ECPair.fromWIF(privateKey, bitcoin.networks.testnet);
    const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: bitcoin.networks.testnet });
    const derivedAddress = p2wpkh.address!;
    
    if (derivedAddress !== address) {
      return res.status(400).json({ 
        error: 'Private key does not match the provided address',
        provided: address,
        derived: derivedAddress
      });
    }

    // Store in wallet registry
    walletStore.set(address, {
      privateKey,
      publicKey: keyPair.publicKey.toString('hex'),
      name: name || `Wallet-${address.slice(-8)}`
    });

    console.log(`✅ Registered wallet: ${address}`);
    
    res.json({ 
      success: true, 
      address,
      publicKey: keyPair.publicKey.toString('hex'),
      message: 'Wallet registered successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to register wallet' });
  }
});

// Get all registered wallets
app.get('/api/wallet/registered', (req, res) => {
  const wallets = Array.from(walletStore.entries()).map(([address, data]) => ({
    address,
    publicKey: data.publicKey,
    name: data.name
  }));
  res.json({ wallets });
});

// Import existing wallet
app.post('/api/wallet/import', async (req, res) => {
  try {
    const { name, privateKey } = req.body;
    if (!name || !privateKey) {
      return res.status(400).json({ error: 'Name and privateKey required' });
    }

    const keyPair = ECPair.fromWIF(privateKey, bitcoin.networks.testnet);
    
    // Try to determine address type and create address
    const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: bitcoin.networks.testnet });
    const address = p2wpkh.address!;
    
    // Check balance
    const balanceInfo = await mempoolAPI.checkAddressBalance(address, 0);

    const wallet = {
      name,
      address,
      privateKey: keyPair.toWIF(),
      publicKey: keyPair.publicKey.toString('hex'),
      addressType: 'p2wpkh' as const,
      balance: balanceInfo.availableBalance,
      created: new Date().toISOString()
    };

    // Automatically register in HTLC wallet store for seamless integration
    walletStore.set(address, {
      privateKey: wallet.privateKey,
      publicKey: wallet.publicKey,
      name: wallet.name
    });
    
    console.log(`✅ Auto-registered imported wallet for HTLC use: ${address}`);

    res.json(wallet);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to import wallet' });
  }
});

// Get wallet balance
app.get('/api/wallet/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const balanceInfo = await mempoolAPI.checkAddressBalance(address, 0);
    res.json({ balance: balanceInfo.availableBalance });
  } catch (error) {
    console.log('Balance check failed, returning 0 for demo:', error);
    // Return 0 balance when API fails instead of error
    res.json({ balance: 0, apiError: true });
  }
});

// Refresh all wallet balances
app.post('/api/wallet/refresh-balances', async (req, res) => {
  try {
    const { addresses } = req.body;
    if (!addresses || !Array.isArray(addresses)) {
      return res.status(400).json({ error: 'addresses array required' });
    }

    const balanceResults = [];
    for (const address of addresses) {
      try {
        const balanceInfo = await mempoolAPI.checkAddressBalance(address, 0);
        balanceResults.push({
          address,
          balance: balanceInfo.availableBalance,
          confirmed: balanceInfo.confirmedBalance,
          unconfirmed: balanceInfo.unconfirmedBalance
        });
        console.log(`🔄 Refreshed balance: ${address} = ${balanceInfo.availableBalance} sats`);
      } catch (error) {
        balanceResults.push({
          address,
          balance: 0,
          error: error instanceof Error ? error.message : 'Failed to fetch balance'
        });
      }
    }

    res.json({ balances: balanceResults });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to refresh balances' });
  }
});

// Send transaction
app.post('/api/wallet/send', async (req, res) => {
  try {
    const { fromAddress, privateKey, toAddress, amount, feeRate } = req.body;
    if (!fromAddress || !privateKey || !toAddress || !amount || !feeRate) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const keyPair = ECPair.fromWIF(privateKey, bitcoin.networks.testnet);
    let utxos;
    try {
      utxos = await mempoolAPI.getAddressUTXOs(fromAddress);
    } catch (error) {
      return res.status(400).json({ 
        error: 'Mempool API unavailable. Cannot verify UTXOs. Please try again later or fund the address first.',
        details: 'The mempool.space API is currently experiencing issues (502 errors)',
        fundingInstructions: 'Fund your address at: https://testnet-faucet.mempool.co/'
      });
    }
    
    if (utxos.length === 0) {
      return res.status(400).json({
        error: 'No UTXOs found for this address. Please fund the address using testnet faucets first.',
        fundingInstructions: 'Visit: https://testnet-faucet.mempool.co/ and send testnet Bitcoin to: ' + fromAddress,
        faucetLinks: [
          'https://testnet-faucet.mempool.co/',
          'https://bitcoinfaucet.uo1.net/',
          'https://coinfaucet.eu/en/btc-testnet/'
        ]
      });
    }

    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
    const totalInput = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    const fee = Math.max(1000, Math.ceil(feeRate * 200)); // Rough fee estimate
    
    if (totalInput < amount + fee) {
      throw new Error(`Insufficient funds. Required: ${amount + fee}, Available: ${totalInput}`);
    }

    // Determine address type to use correct input format
    const isP2TR = fromAddress.startsWith('tb1p');
    
    // Add inputs with proper format for address type
    for (const utxo of utxos) {
      if (isP2TR) {
        // P2TR input
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            script: Buffer.from(utxo.scriptPubKey, 'hex'),
            value: utxo.value,
          },
          tapInternalKey: keyPair.publicKey.slice(1, 33), // x-only pubkey for P2TR
        });
      } else {
        // P2WPKH input
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            script: Buffer.from(utxo.scriptPubKey, 'hex'),
            value: utxo.value,
          },
        });
      }
    }

    // Add main output
    psbt.addOutput({ address: toAddress, value: amount });

    // Add change output if needed
    const changeAmount = totalInput - amount - fee;
    if (changeAmount > 546) {
      psbt.addOutput({ address: fromAddress, value: changeAmount });
    }

    // Sign and finalize
    try {
      console.log(`Signing transaction for ${isP2TR ? 'P2TR' : 'P2WPKH'} address`);
      psbt.signAllInputs(keyPair);
      psbt.finalizeAllInputs();
      
      const tx = psbt.extractTransaction();
      console.log('Transaction created successfully, broadcasting...');
      
      const txid = await mempoolAPI.broadcastTransaction(tx.toHex());
      const explorerUrl = mempoolAPI.getMempoolURL(txid);

      res.json({ txid, fee, explorerUrl });
    } catch (signError) {
      console.error('Transaction signing/broadcast error:', signError);
      throw new Error(`Transaction creation failed: ${signError instanceof Error ? signError.message : 'Unknown signing error'}`);
    }
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to send transaction' });
  }
});

// Get transaction history
app.get('/api/wallet/history/:address', async (req, res) => {
  try {
    const { address } = req.params;
    // For now, return empty array - can be enhanced to fetch actual history from mempool API
    res.json({ transactions: [] });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get history' });
  }
});

/**
 * Get current block height for HTLC timing checks
 */
app.get('/api/block-height', async (req, res) => {
  try {
    const health = await mempoolAPI.checkNetworkHealth();
    res.json({ blockHeight: health.blockHeight });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get block height' });
  }
});

// --- Legacy arithmetic endpoints remain below (may be deprecated) --

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🍊 Offline Bitcoin Wallet Server`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api/`);
  console.log(`⚡ Ready to create real Bitcoin testnet transactions!`);
});

export default app;