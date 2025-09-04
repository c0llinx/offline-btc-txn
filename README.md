# Real Bitcoin Taproot Calculator

A complete Bitcoin Taproot calculator that creates **actual Bitcoin testnet transactions** with Tapscript arithmetic operations. This application generates real Bitcoin addresses, builds transactions with embedded calculations, and broadcasts them to the Bitcoin testnet network.

## 🚀 Features

- **Real Bitcoin Transactions**: Creates actual Bitcoin testnet transactions viewable on mempool.space
- **Taproot Integration**: Uses Bitcoin Taproot (P2TR) addresses with embedded Tapscript calculations
- **Arithmetic Operations**: Supports addition, subtraction, multiplication, and division with Bitcoin script constraints
- **Complete Transaction Flow**: Address generation → Funding → Transaction creation → Broadcasting → Verification
- **Mempool Integration**: Direct links to view transactions on mempool.space/testnet
- **Full-Stack Architecture**: Node.js backend with Bitcoin libraries + Frontend web interface

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Access to Bitcoin testnet faucets for funding
- Internet connection for mempool.space API

## 🛠️ Installation & Setup

1. **Clone and install dependencies:**
   ```bash
   cd btc-offline
   npm install
   ```

2. **Build the application:**
   ```bash
   npm run build
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Access the application:**
   - Open your browser to `http://localhost:3001`
   - The server provides both API endpoints and web interface

## 🔧 Architecture

### Backend (Node.js + TypeScript)
- **`src/server/bitcoin.ts`**: Core Bitcoin operations, Taproot address generation, transaction building
- **`src/server/mempool.ts`**: Mempool.space API integration for UTXOs, broadcasting, status checking
- **`src/server/calculator.ts`**: Main calculator service coordinating Bitcoin operations
- **`src/server/server.ts`**: Express.js API server with endpoints

### Frontend (TypeScript + Vanilla JS)
- **`src/client/app.ts`**: Web application interface and API communication
- **`index.html`**: Modern responsive UI with real-time status updates

### Shared
- **`src/shared/types.ts`**: TypeScript interfaces and types for Bitcoin operations

## 🧮 How It Works

### 1. Address Generation
```typescript
// Generate Taproot address with embedded calculation script
const { address, scriptHash } = generateTaprootAddressWithScript(
  internalKey, 
  10,    // num1
  5,     // num2  
  'add'  // operation
);
```

### 2. Tapscript Creation
Each calculation creates a Bitcoin script:
```
OP_10 OP_5 OP_ADD OP_15 OP_EQUAL
```
This script pushes both numbers, performs the operation, pushes the expected result, and verifies equality.

### 3. Transaction Building
- Fetches UTXOs from funded address
- Builds PSBT (Partially Signed Bitcoin Transaction)
- Signs with generated private key
- Creates raw transaction hex

### 4. Broadcasting
- Submits transaction to Bitcoin testnet via mempool.space API
- Returns transaction ID for verification
- Transaction becomes viewable on blockchain explorers

## 📡 API Endpoints

### Core Operations
- `POST /api/generate-address` - Generate funding address for calculation
- `GET /api/check-funding/:address` - Check if address has sufficient funds
- `POST /api/calculate` - Perform calculation and create Bitcoin transaction
- `GET /api/transaction/:txid` - Get transaction status and details

### Utility
- `GET /api/health` - Health check and network status
- `GET /api/network-status` - Bitcoin testnet network information
- `POST /api/validate` - Validate calculation parameters

## 💰 Funding Process

### 1. Generate Address
- Select numbers and operation
- Click "Generate Funding Address"
- Unique Taproot address created for your calculation

### 2. Fund Address
Send testnet Bitcoin from faucets:
- [Mempool.co Faucet](https://testnet-faucet.mempool.co/)
- [BitcoinFaucet.uo1.net](https://bitcoinfaucet.uo1.net/)
- [Testnet.help](https://testnet.help/en/btcfaucet/testnet)
- [CoinFaucet.eu](https://coinfaucet.eu/en/btc-testnet/)

### 3. Verify Funding
- Click "Check Funding Status"
- Minimum required: 100,000 satoshis (0.001 tBTC)
- Wait for confirmations (10-30 minutes)

### 4. Create Transaction
- Click "Calculate & Create Real Transaction"
- Transaction builds, signs, and broadcasts automatically
- Receive real transaction ID viewable on mempool.space

## 🔍 Example Usage

### Basic Calculation (10 + 5)
1. Enter numbers: `10` and `5`
2. Click `+` operation
3. Generate funding address
4. Fund address with 0.001 tBTC from faucet
5. Wait for confirmation
6. Click "Calculate & Create Real Transaction"
7. Receive transaction ID: `abc123...` 
8. View at: `https://mempool.space/testnet/tx/abc123...`

### Tapscript Generated
```
Script: OP_10 OP_5 OP_ADD OP_15 OP_EQUAL
Result: Transaction proves 10 + 5 = 15 on Bitcoin blockchain
```

## ⚠️ Bitcoin Script Constraints

- **Integers Only**: Bitcoin script operates on 32-bit signed integers
- **Range**: -2,147,483,648 to 2,147,483,647
- **Division**: Integer division (truncates decimals)
- **Overflow**: Operations that exceed range will fail validation

### Valid Examples
```
✅ 100 + 50 = 150
✅ 1000 - 300 = 700  
✅ 12 × 8 = 96
✅ 20 ÷ 4 = 5
```

### Invalid Examples
```
❌ 3.14 + 2.71 (decimals not supported)
❌ 1000000000 × 3 (overflow)
❌ 10 ÷ 0 (division by zero)
```

## 🧪 Testing

### Manual Testing
1. Start the application: `npm start`
2. Open `http://localhost:3001`
3. Follow the funding and calculation process
4. Verify transactions on mempool.space/testnet

### API Testing
```bash
# Check health
curl http://localhost:3001/api/health

# Generate address
curl -X POST http://localhost:3001/api/generate-address \
  -H "Content-Type: application/json" \
  -d '{"num1": 10, "num2": 5, "operation": "add"}'

# Check funding
curl http://localhost:3001/api/check-funding/tb1p...

# Perform calculation (requires funded address)
curl -X POST http://localhost:3001/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"num1": 10, "num2": 5, "operation": "add"}'
```

## 🔒 Security Considerations

### Testnet Safety
- ✅ **Testnet Only**: No real Bitcoin value
- ✅ **Educational Purpose**: For learning and demonstration
- ✅ **Open Source**: Code is transparent and auditable

### Private Key Handling
- 🔑 **Generated Fresh**: New keys for each calculation
- 📱 **Displayed Safely**: Private keys shown for educational purposes
- ⚠️ **Not for Production**: This is demonstration software

### Network Security
- 🌐 **Public APIs**: Uses mempool.space public APIs
- 🔒 **HTTPS**: All external API calls use HTTPS
- 🛡️ **Rate Limiting**: Respects API rate limits

## 📚 Educational Value

This calculator demonstrates:

1. **Bitcoin Taproot Technology**: Real-world usage of Bitcoin's latest upgrade
2. **Tapscript Programming**: How to embed logic in Bitcoin transactions  
3. **UTXO Management**: Bitcoin's transaction model
4. **Digital Signatures**: Cryptographic transaction authorization
5. **Blockchain Broadcasting**: How transactions enter the Bitcoin network

## 🐛 Troubleshooting

### Common Issues

1. **"Address not funded"**
   - Solution: Send testnet Bitcoin from faucets, wait for confirmation

2. **"Transaction broadcast failed"**
   - Check network connectivity
   - Verify sufficient UTXOs
   - Ensure proper fee calculation

3. **"UTXO not found"**
   - Wait longer for confirmations
   - Check transaction on mempool.space
   - Try different faucet

4. **"Invalid operation result"**
   - Check for integer overflow
   - Verify operation is supported
   - Ensure inputs are valid integers

### Debug Mode
Enable detailed logging:
```bash
DEBUG=* npm start
```

## 🔗 External Dependencies

- **bitcoinjs-lib**: Bitcoin transaction building and cryptography
- **tiny-secp256k1**: Elliptic curve cryptography
- **mempool.space API**: UTXO fetching and transaction broadcasting
- **Express.js**: Web server framework

## 📈 Future Enhancements

- [ ] Support for more complex arithmetic operations
- [ ] Multi-input transaction support
- [ ] Custom fee selection
- [ ] Transaction confirmation monitoring
- [ ] Batch calculations
- [ ] Mainnet support (with proper warnings)

## 👥 Contributors

- Original Author: c0llinx
- Feature Additions: George

## 📄 License

MIT License - This is educational software for learning Bitcoin development.

## ⚡ Quick Start Summary

```bash
# Install and run
npm install
npm run build
npm start

# Open browser
http://localhost:3001

# Fund address → Calculate → Get real transaction ID
# View on: https://mempool.space/testnet/tx/[your-txid]
```

## 🎯 Success Criteria

When everything works correctly, you will:

1. ✅ Generate a unique Bitcoin Taproot address
2. ✅ Fund it with testnet Bitcoin from faucets  
3. ✅ Create a real Bitcoin transaction with embedded calculation
4. ✅ Broadcast it to Bitcoin testnet network
5. ✅ View the transaction on mempool.space/testnet
6. ✅ Verify the Tapscript contains your arithmetic operation

**The transaction ID will be real and viewable on mempool.space - no more "transaction not found" errors!**