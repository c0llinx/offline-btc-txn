import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize bitcoin lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const network = bitcoin.networks.testnet;

// Test data from saved addresses - exact match
const privateKeyWIF = "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei";
const expectedAddress = "tb1p4fuxteqjltq7mkrgszckdm88p4efva73p9r50kq65fj7q3gjpnkqapmdzh";

const keyPair = ECPair.fromWIF(privateKeyWIF, network);
const internalKey = keyPair.publicKey.slice(1, 33);

console.log("=== Exact Match Test ===");
console.log("Expected Address:", expectedAddress);
console.log("Internal Key:", internalKey.toString('hex'));

// Helper functions (matching the server code)
function numberToScriptNum(num) {
  if (num === 0) return Buffer.from([]);
  if (num >= 1 && num <= 16) return Buffer.from([bitcoin.opcodes.OP_1 + num - 1]);
  
  const isNegative = num < 0;
  num = Math.abs(num);
  
  const bytes = [];
  while (num > 0) {
    bytes.push(num & 0xff);
    num >>= 8;
  }
  
  if (bytes[bytes.length - 1] & 0x80) {
    bytes.push(isNegative ? 0x80 : 0x00);
  } else if (isNegative) {
    bytes[bytes.length - 1] |= 0x80;
  }
  
  return Buffer.from(bytes);
}

function getOperationOpcode(operation) {
  switch (operation) {
    case 'add': return bitcoin.opcodes.OP_ADD;
    case 'subtract': return bitcoin.opcodes.OP_SUB;
    case 'multiply': return bitcoin.opcodes.OP_MUL;
    case 'divide': return bitcoin.opcodes.OP_DIV;
    default: throw new Error(`Invalid operation: ${operation}`);
  }
}

function calculateExpectedResult(num1, num2, operation) {
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

// Create calculation script for 10 * 4 = 40
const num1 = 10, num2 = 4, operation = 'multiply';
const expectedResult = calculateExpectedResult(num1, num2, operation);

console.log(`Calculation: ${num1} * ${num2} = ${expectedResult}`);

const script = bitcoin.script.compile([
  numberToScriptNum(num1),
  numberToScriptNum(num2),
  getOperationOpcode(operation),
  numberToScriptNum(expectedResult),
  bitcoin.opcodes.OP_EQUAL
]);

console.log("Script:", script.toString('hex'));

const scriptTree = {
  output: script,
  version: 0xc0
};

// Create the payment object
const p2tr = bitcoin.payments.p2tr({
  internalPubkey: internalKey,
  scriptTree: scriptTree,
  network: network
});

console.log("Generated Address:", p2tr.address);
console.log("Addresses Match:", p2tr.address === expectedAddress);

// Generate control block
const redeemScript = {
  output: script,
  redeemVersion: 0xc0
};

const p2trRedeem = bitcoin.payments.p2tr({
  internalPubkey: internalKey,
  scriptTree: scriptTree,
  redeem: redeemScript,
  network: network
});

const controlBlock = p2trRedeem.witness?.[p2trRedeem.witness.length - 1];
console.log("Control Block:", controlBlock?.toString('hex') || 'null');
console.log("Control Block Length:", controlBlock?.length || 0);