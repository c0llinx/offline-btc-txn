import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize bitcoin lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const network = bitcoin.networks.testnet;

// Test data from saved addresses
const privateKeyWIF = "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei";
const keyPair = ECPair.fromWIF(privateKeyWIF, network);
const internalKey = keyPair.publicKey.slice(1, 33);

console.log("=== Control Block Test ===");
console.log("Internal Key:", internalKey.toString('hex'));

// Create a simple script (like the calculation script)
const script = bitcoin.script.compile([
  Buffer.from([10]), // OP_10 
  Buffer.from([4]),  // OP_4
  bitcoin.opcodes.OP_MUL,
  Buffer.from([40]), // Expected result: 40
  bitcoin.opcodes.OP_EQUAL
]);

console.log("Script:", script.toString('hex'));

const scriptTree = {
  output: script,
  version: 0xc0 // TAPROOT_LEAF_TAPSCRIPT
};

// Create the payment object
const p2tr = bitcoin.payments.p2tr({
  internalPubkey: internalKey,
  scriptTree: scriptTree,
  network: network
});

console.log("Address:", p2tr.address);

// Create redeem script for spending
const redeemScript = {
  output: script,
  redeemVersion: 0xc0
};

// Generate witness for the redeem to get control block
const p2trRedeem = bitcoin.payments.p2tr({
  internalPubkey: internalKey,
  scriptTree: scriptTree,
  redeem: redeemScript,
  network: network
});

console.log("Witness length:", p2trRedeem.witness?.length || 0);
if (p2trRedeem.witness) {
  p2trRedeem.witness.forEach((w, i) => {
    console.log(`Witness[${i}]:`, w.toString('hex'), `(${w.length} bytes)`);
  });
}

const controlBlock = p2trRedeem.witness?.[p2trRedeem.witness.length - 1];
console.log("Control Block:", controlBlock?.toString('hex') || 'null');
console.log("Control Block Length:", controlBlock?.length || 0);