# Offline Bitcoin Transaction Application - Documentation

## Overview

This documentation provides comprehensive guidance for developers and users of the Offline Bitcoin Transaction Application. The application is a Next.js-based web tool for creating and managing offline-friendly Bitcoin Taproot transactions with UR-encoded PSBT handoffs.

---

## Documentation Structure

### 1. [User Guide](./USER_GUIDE.md)
**For end users and operators**

Complete guide to using the application, including:
- Getting started and installation
- Wallet management
- Cold Mode workflow (offline signing)
- Receiver workflow (claiming funds)
- Refund workflow (recovering funds)
- Watch-Only Mode (broadcasting)
- Security best practices
- Troubleshooting

**Start here if you want to:** Use the application, understand workflows, or learn security practices.

---

### 2. [Architecture Overview](./ARCHITECTURE.md)
**For developers and system architects**

High-level system design and technical architecture:
- System architecture diagram
- Technology stack
- Project structure
- Core modules explanation
- Data flow diagrams
- Security architecture
- Network communication
- State management

**Start here if you want to:** Understand how the system works, contribute code, or integrate with the application.

---

### 3. [API Reference](./API_REFERENCE.md)
**For developers building on or extending the application**

Detailed API documentation for all functions, classes, and components:
- Core Libraries (Taproot, PSBT, UR encoding)
- Wallet Management functions
- Server utilities (Mempool service, UTXO service)
- HTTP API routes
- React components
- Type definitions
- Error handling patterns

**Start here if you want to:** Use the libraries in your own code, extend functionality, or understand implementation details.

---

## Quick Links

### For Users
- [Installation Instructions](./USER_GUIDE.md#getting-started)
- [Creating Your First Wallet](./USER_GUIDE.md#wallet-management)
- [Cold Mode Tutorial](./USER_GUIDE.md#cold-mode-workflow)
- [Security Best Practices](./USER_GUIDE.md#security-best-practices)
- [Troubleshooting Guide](./USER_GUIDE.md#troubleshooting)

### For Developers
- [Project Structure](./ARCHITECTURE.md#project-structure)
- [Core Modules](./ARCHITECTURE.md#core-modules)
- [API Quick Reference](./API_REFERENCE.md#quick-reference)
- [Type Definitions](./API_REFERENCE.md#type-definitions)
- [Contributing Guidelines](#contributing)

---

## Key Concepts

### Taproot Commitments

The application uses Bitcoin Taproot to create commitment transactions with two spending paths:

1. **Claim Path:** Receiver can spend by providing the preimage (and signature if required)
2. **Refund Path:** Sender can recover funds after a timelock expires

```
        Taproot Address
             |
      ┌──────┴──────┐
   Claim          Refund
   Script         Script
      |              |
  Preimage      Timelock
  (+ Sig)       + Signature
```

### UR Encoding

Uniform Resource (UR) encoding enables QR code transmission of binary data:

```
Binary Data → CBOR → Base64URL → ur:type/data
```

This allows offline devices to exchange transaction data via QR codes without network connectivity.

### Air-Gapped Workflow

1. **Cold Device (Offline):**
   - Generate commitment
   - Create claim bundle
   - Display QR code

2. **Transfer:**
   - Scan QR code
   - Or copy UR string via USB

3. **Hot Device (Online):**
   - Decode bundle
   - Provide preimage
   - Sign and broadcast

---

## Technology Stack

- **Frontend:** Next.js 14, React 18, TailwindCSS
- **Bitcoin:** bitcoinjs-lib, ecpair, secp256k1
- **Encoding:** cbor-x, qrcode
- **Network:** mempool.space API
- **Storage:** Browser localStorage

---

## System Requirements

### Minimum Requirements
- **Browser:** Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **JavaScript:** Enabled
- **Storage:** 10 MB localStorage
- **Network:** Optional (Cold Mode works offline)

### Recommended Setup
- **Browser:** Latest Chrome or Firefox
- **Camera:** For QR code scanning
- **Network:** Stable internet for UTXO fetching
- **Device:** Desktop or mobile with 2GB+ RAM

---

## Installation

### Development

```bash
# Clone repository
git clone https://github.com/c0llinx/offline-btc-txn.git
cd offline-btc-txn

# Install dependencies
npm install

# Run development server
npm run dev
```

Visit `http://localhost:3000`

### Production

```bash
# Build for production
npm run build

# Start production server
npm start
```

### Docker (Optional)

```bash
# Build image
docker build -t offline-btc-txn .

# Run container
docker run -p 3000:3000 offline-btc-txn
```

---

## Configuration

### Network Selection

Edit `lib/offline-core/taproot.js` to add custom networks:

```javascript
export const NETWORKS = {
  signet: bitcoin.networks.testnet,
  testnet: bitcoin.networks.testnet,
  testnet4: bitcoin.networks.testnet,
  mainnet: bitcoin.networks.bitcoin,
  custom: {
    messagePrefix: '\x18Bitcoin Signed Message:\n',
    bech32: 'bcrt',
    // ... other params
  }
};
```

### API Endpoints

Edit `lib/server/mempool.js` to use custom mempool instances:

```javascript
const NETWORK_BASE = {
  mainnet: 'https://mempool.space/api',
  testnet4: 'https://your-mempool.com/testnet4/api',
  // ...
};
```

---

## Usage Examples

### Example 1: Generate Wallet

```javascript
import { generateWallet, upsertWallet } from '@/lib/wallets';

const wallet = generateWallet('testnet4');
console.log('Address:', wallet.p2tr);
console.log('WIF:', wallet.wif);

upsertWallet(wallet);
```

### Example 2: Create Commitment

```javascript
import { buildClaimRefundTaproot, NETWORKS } from '@/lib/offline-core';
import crypto from 'crypto';

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

### Example 3: Fetch UTXOs

```javascript
import { UTXOService } from '@/lib/server/utxo-service';

const service = new UTXOService('testnet4');
const utxos = await service.getUTXOsForAmount('tb1p...', 50000);

console.log(`Selected ${utxos.length} UTXOs`);
```

---

## Security Considerations

### Private Key Storage
- Keys stored in browser localStorage (unencrypted)
- Use browser profiles for isolation
- Enable full-disk encryption
- Regular backups to secure location

### Air-Gap Recommendations
- Use dedicated offline device for Cold Mode
- Transfer data via QR codes only
- Never connect cold device to internet
- Verify all QR codes before scanning

### Network Security
- All API calls over HTTPS
- No private keys sent to servers
- Mempool.space is trusted third party
- Consider running own mempool instance

---

## Troubleshooting

### Common Issues

**Wallet not showing balance:**
- Click "Refresh" to sync with network
- Verify address has confirmed UTXOs
- Check network selection matches funding network

**Claim bundle generation fails:**
- Ensure wallet has Taproot UTXOs
- Verify commitment amount ≤ balance
- Check expiry height is in future
- Try manual UTXO entry if offline

**Broadcast errors:**
- "Already in mempool" - Transaction already submitted
- "Insufficient fee" - Increase fee rate
- "Invalid signature" - Re-sign transaction
- "Network error" - Check internet connection

---

## Contributing

We welcome contributions! Please follow these guidelines:

### Code Style
- Use Prettier for formatting
- Follow ESLint rules
- Add JSDoc comments for functions
- Write descriptive commit messages

### Pull Request Process
1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Testing
- Add unit tests for new functions
- Test on multiple browsers
- Verify offline functionality
- Test on testnet, never on mainnet

---

## Roadmap

###  Version 1.0(Future)
- [ ] Hardware wallet support (Ledger, Trezor)
- [ ] Multi-signature Taproot scripts
- [ ] BIP39 seed phrase generation
- [ ] Enhanced fee estimation
- [ ] Transaction history export
- [ ] Integration with the Purewallet Mobile app
- [ ] Desktop app (Electron)
- [ ] Lightning Network integration
- [ ] Advanced coin control
- [ ] Batch operations

---

## FAQ

**Q: Is this safe for mainnet?**
A: The application is purely experimental. Test thoroughly on testnet before using with real funds. Use at your own risk.

**Q: Can I use this without internet?**
A: Yes, Cold Mode works completely offline. You'll need to manually provide UTXOs.

**Q: Where are my private keys stored?**
A: In your browser's localStorage. They never leave your device.

**Q: What if I lose my WIF?**
A: Your funds are permanently lost. Always backup WIFs immediately after generation.

**Q: Can I recover wallets on another device?**
A: Yes, import the WIF on the new device using "Import Wallet".

**Q: Does this work on mobile?**
A: Yes, the web app is mobile-responsive. 

---

## Support

### Getting Help
- **GitHub Issues:** https://github.com/c0llinx/offline-btc-txn/issues
- **Documentation:** This folder

### Reporting Bugs
Include:
- Browser and version
- Network (testnet4, mainnet, etc.)
- Steps to reproduce
- Error messages
- Screenshots (if applicable)

### Feature Requests
Open an issue with:
- Use case description
- Proposed solution
- Alternative approaches
- Willingness to contribute

---

## License

MIT License

Copyright (c) 2024 Networked Systems Laboratory Blockchain Project Group

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Acknowledgments

- **Bitcoin Core:** For the Bitcoin protocol
- **bitcoinjs-lib:** For Bitcoin transaction construction
- **mempool.space:** For public API access
- **Next.js:** For the application framework
- **Blockchain Commons:** For UR specification

---



**Last Updated:** November, 2025
**Documentation Version:** 1.0
**Application Version:** 0.4.0
