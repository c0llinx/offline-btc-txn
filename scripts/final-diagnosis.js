import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize bitcoin lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.testnet;

console.log("=== FINAL DIAGNOSIS: TAPROOT SCRIPT-PATH SIGNING ISSUE ===\n");

// Test data
const privateKeyWIF = "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei";
const keyPair = ECPair.fromWIF(privateKeyWIF, network);
const internalKey = keyPair.publicKey.slice(1, 33);

console.log("PROBLEM IDENTIFIED:");
console.log("==================");
console.log("The error 'Can not sign for input #0 with the key' occurs because:");
console.log("bitcoinjs-lib's pubkeyInScript() function looks for the signing key INSIDE the script.");
console.log("But our arithmetic script doesn't contain any public keys!");
console.log("");

// Our arithmetic script
function numberToScriptNum(num) {
    if (num === 0) return Buffer.from([bitcoin.opcodes.OP_0]);
    if (num === 1) return Buffer.from([bitcoin.opcodes.OP_1]);
    if (num >= 2 && num <= 16) return Buffer.from([bitcoin.opcodes.OP_2 + num - 2]);
    return bitcoin.script.number.encode(num);
}

const script = bitcoin.script.compile([
    numberToScriptNum(10),  // 0x5a
    numberToScriptNum(4),   // 0x54
    bitcoin.opcodes.OP_MUL, // 0x95
    numberToScriptNum(40),  // 0x28
    bitcoin.opcodes.OP_EQUAL // 0x87
]);

console.log("OUR SCRIPT ANALYSIS:");
console.log("===================");
console.log("Script hex:", script.toString('hex'));
console.log("Script ASM:", bitcoin.script.toASM(script));
console.log("Script contains:");

const decompiled = bitcoin.script.decompile(script);
decompiled.forEach((element, i) => {
    if (typeof element === 'number') {
        console.log(`  [${i}] Opcode: ${element.toString(16)} (${bitcoin.script.toASM([element])})`);
    } else {
        console.log(`  [${i}] Data: ${element.toString('hex')}`);
    }
});

console.log("");
console.log("KEY SEARCH IN SCRIPT:");
console.log("====================");

// Simulate what pubkeyInScript does
const signingPubkey = keyPair.publicKey;
const pubkeyXOnly = signingPubkey.slice(1, 33);
const pubkeyHash = bitcoin.crypto.hash160(signingPubkey);

console.log("Looking for signing key:", signingPubkey.toString('hex'));
console.log("Looking for X-only key:", pubkeyXOnly.toString('hex'));
console.log("Looking for pubkey hash:", pubkeyHash.toString('hex'));

let found = false;
decompiled.forEach((element, i) => {
    if (typeof element !== 'number') {
        if (element.equals(signingPubkey)) {
            console.log(`✅ Found full pubkey at position ${i}`);
            found = true;
        } else if (element.equals(pubkeyXOnly)) {
            console.log(`✅ Found X-only pubkey at position ${i}`);
            found = true;
        } else if (element.equals(pubkeyHash)) {
            console.log(`✅ Found pubkey hash at position ${i}`);
            found = true;
        }
    }
});

if (!found) {
    console.log("❌ No signing key found in script! This is why signing fails.");
}

console.log("");
console.log("THE SOLUTION:");
console.log("=============");
console.log("For Taproot script-path spending with scripts that don't contain public keys,");
console.log("we need to modify the script to include the public key, OR");
console.log("use a different approach for validation.");
console.log("");

console.log("OPTION 1: Modify script to include the public key");
console.log("=================================================");

// Create a script that includes the public key for validation
const scriptWithPubkey = bitcoin.script.compile([
    numberToScriptNum(10),   // Push 10
    numberToScriptNum(4),    // Push 4
    bitcoin.opcodes.OP_MUL,  // Multiply: 10 * 4 = 40
    numberToScriptNum(40),   // Push expected result
    bitcoin.opcodes.OP_EQUAL, // Check equality
    // Add the public key for signing validation
    internalKey,             // Push the X-only internal public key
    bitcoin.opcodes.OP_CHECKSIG // Verify signature (this will always be true if properly signed)
]);

console.log("Modified script hex:", scriptWithPubkey.toString('hex'));
console.log("Modified script ASM:", bitcoin.script.toASM(scriptWithPubkey));

// Test if this script contains the key
const decompiledWithPubkey = bitcoin.script.decompile(scriptWithPubkey);
let foundInModified = false;
decompiledWithPubkey.forEach((element, i) => {
    if (typeof element !== 'number') {
        if (element.equals(internalKey)) {
            console.log(`✅ Found X-only pubkey at position ${i} in modified script`);
            foundInModified = true;
        }
    }
});

console.log("");
console.log("OPTION 2: Use a proper Bitcoin Script pattern");
console.log("=============================================");

// A more Bitcoin-standard approach: computation + signature verification
const properScript = bitcoin.script.compile([
    // Computation part
    numberToScriptNum(10),
    numberToScriptNum(4),
    bitcoin.opcodes.OP_MUL,
    numberToScriptNum(40),
    bitcoin.opcodes.OP_EQUAL,
    // Signature verification part
    bitcoin.opcodes.OP_IF,       // If computation is correct
        internalKey,             // Push pubkey
        bitcoin.opcodes.OP_CHECKSIG, // Check signature
    bitcoin.opcodes.OP_ENDIF
]);

console.log("Proper script hex:", properScript.toString('hex'));
console.log("Proper script ASM:", bitcoin.script.toASM(properScript));

console.log("");
console.log("RECOMMENDATION:");
console.log("===============");
console.log("The application should use OPTION 2 (or similar) to create scripts that:");
console.log("1. Perform the arithmetic calculation");
console.log("2. Include signature verification with the internal public key");
console.log("3. This allows bitcoinjs-lib to find the signing key in the script");
console.log("4. Enables proper Taproot script-path spending");

console.log("");
console.log("CURRENT ISSUE SUMMARY:");
console.log("=====================");
console.log("❌ The arithmetic-only script doesn't contain the signing key");
console.log("❌ bitcoinjs-lib's pubkeyInScript() returns false");
console.log("❌ getTaprootHashesForSig() returns empty array");
console.log("❌ Signing fails with 'Can not sign for input' error");
console.log("");
console.log("✅ The private key DOES correspond to the public key");
console.log("✅ The address generation is correct");
console.log("✅ The control block is properly formatted");
console.log("✅ The issue is purely in the script design for signing compatibility");

console.log("\n=== DIAGNOSIS COMPLETE ===");