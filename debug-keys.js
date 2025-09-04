import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize bitcoin lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const network = bitcoin.networks.testnet;

// Test data from saved addresses
const privateKeyWIF = "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei";
const publicKeyHex = "0362c7197b6f3e02bd5f16a8bfee0920c2298518a487d13c1e12c90b00331a91f5";
const expectedAddress = "tb1p4fuxteqjltq7mkrgszckdm88p4efva73p9r50kq65fj7q3gjpnkqapmdzh";

console.log("=== Key Derivation Debug ===");
console.log("Private Key WIF:", privateKeyWIF);
console.log("Public Key Hex:", publicKeyHex);
console.log("Expected Address:", expectedAddress);
console.log();

// Method 1: From WIF private key
const keyPairFromWIF = ECPair.fromWIF(privateKeyWIF, network);
const pubKeyFromWIF = keyPairFromWIF.publicKey.toString('hex');
const internalKeyFromWIF = keyPairFromWIF.publicKey.slice(1, 33);

console.log("=== Method 1: From WIF ===");
console.log("Public Key from WIF:", pubKeyFromWIF);
console.log("Internal Key from WIF:", internalKeyFromWIF.toString('hex'));

// Create address from WIF-derived internal key
const addressFromWIF = bitcoin.payments.p2tr({
  internalPubkey: internalKeyFromWIF,
  network
});
console.log("Address from WIF internal key:", addressFromWIF.address);
console.log();

// Method 2: From hex public key string (how addresses were originally created)
const pubKeyBuffer = Buffer.from(publicKeyHex, 'hex');
const internalKeyFromHex = pubKeyBuffer.slice(1, 33);

console.log("=== Method 2: From Hex ===");
console.log("Public Key Buffer:", pubKeyBuffer.toString('hex'));
console.log("Internal Key from Hex:", internalKeyFromHex.toString('hex'));

// Create address from hex-derived internal key
const addressFromHex = bitcoin.payments.p2tr({
  internalPubkey: internalKeyFromHex,
  network
});
console.log("Address from Hex internal key:", addressFromHex.address);
console.log();

// Compare
console.log("=== Comparison ===");
console.log("WIF pubkey matches saved pubkey:", pubKeyFromWIF === publicKeyHex);
console.log("Internal keys match:", internalKeyFromWIF.equals(internalKeyFromHex));
console.log("WIF address matches expected:", addressFromWIF.address === expectedAddress);
console.log("Hex address matches expected:", addressFromHex.address === expectedAddress);