# Offline Bitcoin Transaction Application

A Next.js-based web application for creating and managing offline-friendly Bitcoin Taproot transactions. The application enables secure, air-gapped Bitcoin operations using UR-encoded PSBT handoffs, claim/refund script generation, and testnet UTXO management.

## Features

- **Air-Gapped Transaction Signing** - Create and sign transactions on offline devices
- **Taproot Commitments** - Hash-locked and time-locked Bitcoin scripts
- **QR Code Transfer** - UR-encoded data transmission via QR codes
- **Wallet Management** - Generate, import, and manage Taproot wallets locally
- **Testnet4 Support** - Full integration with mempool.space API
- **No Backend Required** - All operations run client-side or through API routes
- **Balance Tracking** - On-device balance and transaction history
- **Multiple Modes** - Cold, Receiver, Refund, Watch-Only, and Wallet Manager

## Documentation

Comprehensive documentation is available in the [`/docs`](./docs) directory:

- **[Documentation Overview](./docs/README.md)** - Start here for navigation
- **[User Guide](./docs/USER_GUIDE.md)** - Complete usage instructions and workflows
- **[Architecture Overview](./docs/ARCHITECTURE.md)** - System design and technical details
- **[API Reference](./docs/API_REFERENCE.md)** - Detailed API documentation

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/c0llinx/offline-btc-txn.git
cd offline-btc-txn

# Install dependencies
npm install

# Run development server
npm run dev
```

Visit `http://localhost:3000` to access the application.

### First Steps

1. **Create a Wallet** - Navigate to Wallet Manager and generate a new wallet
2. **Fund Your Wallet** - Get testnet coins from a faucet
3. **Try Cold Mode** - Create your first commitment transaction
4. **Claim Funds** - Use Receiver mode to claim with the preimage

See the [User Guide](./docs/USER_GUIDE.md) for detailed instructions.

## Project Structure

```
offline-btc-txn/
├── app/                    # Next.js pages and API routes
│   ├── api/               # Server-side API endpoints
│   ├── cold/              # Cold Mode (offline signer)
│   ├── receiver/          # Receiver Mode (claim funds)
│   ├── refund/            # Refund Mode (recover funds)
│   ├── wallets/           # Wallet Manager
│   └── watch/             # Watch-Only Mode (broadcaster)
├── components/            # React components
├── lib/                   # Core libraries
│   ├── offline-core/     # Bitcoin cryptography
│   ├── offline-interop/  # Data parsing
│   ├── server/           # Network utilities
│   └── wallets.js        # Wallet management
├── docs/                  # Documentation
└── public/                # Static assets
```

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Create production build
npm run build:cold   # Build with service worker for Cold Mode
npm start            # Start production server
npm run lint         # Lint code with ESLint
```

## Technology Stack

- **Frontend:** Next.js 14, React 18, TailwindCSS
- **Bitcoin:** bitcoinjs-lib, ecpair, @bitcoinerlab/secp256k1
- **Encoding:** cbor-x, qrcode
- **Network:** mempool.space API (Testnet4)
- **Storage:** Browser localStorage

## Application Modes

### 1. Cold Mode (Offline Signer)
Create commitment transactions on an air-gapped device without internet access.

### 2. Receiver Mode
Claim funds from a commitment by providing the secret preimage.

### 3. Refund Mode
Recover funds after the timelock expires if the receiver never claimed.

### 4. Watch-Only Mode
Broadcast pre-signed transactions to the Bitcoin network.

### 5. Wallet Manager
Create, import, and manage Bitcoin Taproot wallets locally.

## Security

- **Client-Side Cryptography** - All private key operations in browser
- **No Server-Side Keys** - Keys never leave your device
- **Air-Gap Support** - Cold Mode works completely offline
- **Service Worker Isolation** - Network blocking for enhanced security
- **HTTPS Only** - All external API calls over secure connections

See [Security Best Practices](./docs/USER_GUIDE.md#security-best-practices) for detailed guidance.

## Usage Example

```javascript
import { buildClaimRefundTaproot, NETWORKS } from '@/lib/offline-core';
import crypto from 'crypto';

// Create a Taproot commitment
const message = 'secret preimage';
const h32 = crypto.createHash('sha256').update(message).digest();

const taproot = buildClaimRefundTaproot({
  R_xonly: receiverPubkey,
  S_xonly: senderPubkey,
  h32,
  H_exp: 500000,
  network: NETWORKS.testnet4
});

console.log('Commitment address:', taproot.address);
```

See [API Reference](./docs/API_REFERENCE.md) for complete documentation.

## Contributing

Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [Contributing Guidelines](./docs/README.md#contributing) for details.
PLease the most up-to-date branch is `feature/simplify-and-modularize`. If you wish to see the codebase of the app @https://offline-btc-wallet.onrender.com/, use that branch.

## Troubleshooting

Common issues and solutions:

- **Wallet not showing balance** - Click "Refresh" to sync with network
- **Claim bundle generation fails** - Ensure wallet has Taproot UTXOs
- **Broadcast errors** - Check network connection and fee rates

See [Troubleshooting Guide](./docs/USER_GUIDE.md#troubleshooting) for more help.

## Requirements

- **Node.js:** 18+ 
- **Browser:** Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Storage:** 10 MB localStorage
- **Network:** Optional (Cold Mode works offline)


## License

MIT License - See [LICENSE](./LICENSE) file for details.

## Acknowledgments

- **Bitcoin Core** - For the Bitcoin protocol
- **bitcoinjs-lib** - For Bitcoin transaction construction
- **mempool.space** - For public API access
- **Next.js** - For the application framework
- **Blockchain Commons** - For UR specification

## Support

- **GitHub Issues:** https://github.com/c0llinx/offline-btc-txn/issues
- **Documentation:** [/docs](./docs)
- **Bitcoin Stack Exchange:** Tag with `taproot` and `psbt`

---

**Disclaimer:** This software is in beta. Test thoroughly on testnet before using with real funds. Use at your own risk.

**Version:** 0.4.0  
**Target Network:** Testnet4 (configurable for mainnet)
