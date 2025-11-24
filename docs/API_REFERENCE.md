# API Reference: Offline Bitcoin Transaction Application

## Table of Contents

This API reference is split into multiple documents for better organization:

1. **[Core Libraries API](./API_CORE_LIBRARIES.md)** - Cryptographic functions and Bitcoin operations
   - Offline Core (taproot.js, psbt.js, ur.js)
   - Offline Interop (parse-claim-bundle.js)
   - Server Utilities (mempool.js, utxo-service.js)

2. **[Wallet Management API](./API_WALLET_MANAGEMENT.md)** - Wallet operations and storage
   - Wallet CRUD operations
   - Balance management
   - Transaction history
   - Storage functions

3. **[HTTP API Routes](./API_HTTP_ROUTES.md)** - Server-side API endpoints
   - Broadcast API
   - UTXO API
   - Balance API
   - Transaction API

4. **[Component API](./API_COMPONENTS.md)** - React components and UI utilities
   - WalletManager component
   - CameraScanner component
   - ActiveWalletBadge component
   - Utility functions

---

## Quick Reference

### Most Common Operations

#### Generate a New Wallet
```javascript
import { generateWallet, upsertWallet } from '@/lib/wallets';

const wallet = generateWallet('testnet4');
upsertWallet(wallet);
```

#### Build Taproot Commitment
```javascript
import { buildClaimRefundTaproot } from '@/lib/offline-core';

const taproot = buildClaimRefundTaproot({
  R_xonly: receiverKey,
  S_xonly: senderKey,
  h32: hashBuffer,
  H_exp: 500000,
  network: NETWORKS.testnet4
});
```

#### Fetch UTXOs
```javascript
import { UTXOService } from '@/lib/server/utxo-service';

const service = new UTXOService('testnet4');
const utxos = await service.getUTXOsForAddress('tb1p...');
```

#### Encode Claim Bundle
```javascript
import { encodeUR } from '@/lib/offline-core';
import { encode as cborEncode } from 'cbor-x';

const cbor = cborEncode(bundleData);
const encoder = encodeUR('claim-bundle', cbor);
const urString = encoder.nextPart();
```

#### Broadcast Transaction
```javascript
const response = await fetch('/api/broadcast', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ hex: txHex, network: 'testnet4' })
});
const result = await response.json();
```

---

## Type Definitions

### Common Types

```typescript
// Network configuration
type NetworkKey = 'mainnet' | 'testnet' | 'testnet4' | 'signet';

interface Network {
  messagePrefix: string;
  bech32: string;
  bip32: { public: number; private: number };
  pubKeyHash: number;
  scriptHash: number;
  wif: number;
}

// Wallet structure
interface Wallet {
  id: string;
  label: string;
  network: NetworkKey;
  wif: string;
  publicKeyHex: string;
  xOnlyHex: string;
  p2tr: string;
  taprootAddresses: string[];
  balanceSats: number;
  availableTaprootSats: number;
  history: WalletEvent[];
  lastRefreshedAt: string | null;
  pendingDelta: number;
  createdAt: string;
  updatedAt: string;
  note: string;
}

// Transaction event
interface WalletEvent {
  id: string;
  type: 'receive' | 'send' | 'adjust';
  amountSats: number;
  description: string;
  relatedAddress: string;
  txid: string;
  timestamp: string;
  source: 'manual' | 'sync' | 'workflow';
}

// UTXO structure
interface UTXO {
  txid: string;
  vout: number;
  value: number;
  scriptHex: string;
  address: string;
  confirmations: number;
  network: string;
}

// Taproot output
interface TaprootOutput {
  address: string;
  output: Buffer;
  internalPubkey: Buffer;
  leaves: {
    claim: Buffer;
    refund: Buffer;
  };
  scriptTree: Array<{ output: Buffer }>;
  requiresSignature: boolean;
}

// Claim bundle
interface ClaimBundle {
  ver: number;
  h_alg: string;
  h: Uint8Array;
  R_pub: Uint8Array | null;
  script: Uint8Array;
  leaf_ver: number;
  control: Uint8Array;
  expires_at: number;
  internal_pubkey?: Uint8Array;
  address?: string;
  send_value_sat?: number;
  fund_txid?: Uint8Array;
  vout?: number;
  value?: number;
  funding_script?: Uint8Array;
  fund_tx?: Uint8Array;
  broadcast_endpoint?: string;
  network?: string;
  requires_signature?: boolean;
  meta?: object;
}
```

---

## Error Handling

### Common Error Patterns

```javascript
// Try-catch for async operations
try {
  const utxos = await service.getUTXOsForAddress(address);
} catch (error) {
  if (error.message.includes('404')) {
    console.log('Address has no UTXOs');
  } else if (error.message.includes('429')) {
    console.log('Rate limited, retry later');
  } else {
    console.error('Unexpected error:', error);
  }
}

// Validation before operations
if (!wallet.wif) {
  throw new Error('Wallet missing WIF key');
}

if (amount <= 0) {
  throw new Error('Amount must be positive');
}

// Network error handling
const response = await fetch('/api/utxos?address=' + address);
if (!response.ok) {
  const error = await response.json();
  throw new Error(error.error || 'API request failed');
}
```

### Error Types

- **Validation Errors:** Invalid input parameters
- **Network Errors:** API failures, timeouts
- **Cryptographic Errors:** Invalid keys, signature failures
- **Storage Errors:** localStorage quota exceeded
- **Business Logic Errors:** Insufficient funds, expired timelocks

---

## Best Practices

### Security

1. **Never log private keys**
   ```javascript
   // ❌ Bad
   console.log('WIF:', wallet.wif);
   
   // ✅ Good
   console.log('Wallet ID:', wallet.id);
   ```

2. **Validate all inputs**
   ```javascript
   if (!/^[0-9a-fA-F]{64}$/.test(txid)) {
     throw new Error('Invalid txid format');
   }
   ```

3. **Use constant-time comparisons for secrets**
   ```javascript
   // Use crypto.timingSafeEqual() for preimage validation
   ```

### Performance

1. **Batch UTXO fetches**
   ```javascript
   const promises = addresses.map(addr => 
     service.getUTXOsForAddress(addr)
   );
   const results = await Promise.all(promises);
   ```

2. **Memoize expensive computations**
   ```javascript
   const memoizedTaproot = useMemo(() => 
     buildClaimRefundTaproot(params), 
     [params]
   );
   ```

3. **Debounce user input**
   ```javascript
   const debouncedValidate = debounce(validateAddress, 300);
   ```

### Code Organization

1. **Separate concerns**
   - UI components in `/components`
   - Business logic in `/lib`
   - API routes in `/app/api`

2. **Use TypeScript or JSDoc**
   ```javascript
   /**
    * @param {string} address - Bitcoin address
    * @returns {Promise<UTXO[]>} Array of UTXOs
    */
   async function getUTXOs(address) { ... }
   ```

3. **Handle errors at appropriate levels**
   - Network errors: Retry with exponential backoff
   - Validation errors: Show user-friendly messages
   - Critical errors: Log and alert

---

## Testing

### Unit Test Example

```javascript
import { buildClaimScript } from '@/lib/offline-core';

describe('buildClaimScript', () => {
  it('creates hash-only script', () => {
    const h = Buffer.alloc(32, 0xaa);
    const script = buildClaimScript(null, h);
    
    expect(script.length).toBe(35);
    expect(script[0]).toBe(0xa8); // OP_SHA256
  });
  
  it('creates hash + signature script', () => {
    const h = Buffer.alloc(32, 0xaa);
    const R = Buffer.alloc(32, 0xbb);
    const script = buildClaimScript(R, h);
    
    expect(script.length).toBe(68);
    expect(script[0]).toBe(0xa8); // OP_SHA256
  });
});
```

### Integration Test Example

```javascript
import { generateWallet, upsertWallet, loadWallets } from '@/lib/wallets';

describe('Wallet persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  
  it('saves and loads wallet', () => {
    const wallet = generateWallet('testnet4');
    upsertWallet(wallet);
    
    const loaded = loadWallets();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe(wallet.id);
  });
});
```

---

## Migration Guide

### From v0.3 to v0.4

**Breaking Changes:**
- `p2wpkh` field removed from wallets (use `p2tr` only)
- `taprootAddresses` now array instead of single address
- `pendingDelta` added for unconfirmed balance tracking

**Migration Steps:**
1. Export all wallet WIFs
2. Clear localStorage
3. Re-import wallets
4. Refresh balances

---

## Contributing

When adding new API functions:

1. **Add type definitions** in this document
2. **Write JSDoc comments** in source code
3. **Add unit tests** for pure functions
4. **Update examples** in relevant docs
5. **Document breaking changes** in migration guide

---

## Support

- **GitHub Issues:** https://github.com/c0llinx/offline-btc-txn/issues
- **Documentation:** See `/docs` folder
- **Examples:** See test files and page components

---

## License

MIT License - See LICENSE file for details
