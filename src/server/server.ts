import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { TaprootCalculatorService } from './calculator.js';
import { OfflineWorkflowService } from './workflow.ts';
import { RealBitcoinCalculator } from './bitcoin.js';
import { CalculationRequest } from '../shared/types.js';

const app = express();
const PORT = process.env.PORT || 3001;

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

// Serve UI root
app.get('/', (_req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
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
app.post('/api/create-sender-transaction', async (req, res) => {
  try {
    const { senderWif, receiverAddress, amount, refundLocktime } = req.body;
    if (!senderWif || !receiverAddress || typeof amount !== 'number' || typeof refundLocktime !== 'number') {
      return res.status(400).json({ error: 'senderWif, receiverAddress, amount, refundLocktime required' });
    }
    const result = await workflowService.createFundingPSBT(senderWif, receiverAddress, amount, refundLocktime);
    res.json(result);
  } catch (error) {
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
    const result = await workflowService.createClaimPSBT(receiverWif, preimage, txid, vout, value, senderPublicKey, refundTimeLock);
    res.json(result);
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

// --- Legacy arithmetic endpoints remain below (may be deprecated) --

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🍊 Real Bitcoin Taproot Calculator Server`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints available at http://localhost:${PORT}/api/`);
  console.log(`⚡ Ready to create real Bitcoin testnet transactions!`);
});

export default app;