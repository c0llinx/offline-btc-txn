import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize bitcoin lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.testnet;

console.log("=== TAPROOT KEY MISMATCH ANALYSIS ===\n");

// Test data from saved-addresses.json
const privateKeyWIF = "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei";
const savedPublicKey = "0362c7197b6f3e02bd5f16a8bfee0920c2298518a487d13c1e12c90b00331a91f5";
const savedAddress = "tb1p4fuxteqjltq7mkrgszckdm88p4efva73p9r50kq65fj7q3gjpnkqapmdzh";

console.log("1. TESTING CRYPTOGRAPHIC KEY RELATIONSHIP");
console.log("=========================================");

// Step 1: Verify private key -> public key relationship
const keyPair = ECPair.fromWIF(privateKeyWIF, network);
const derivedPublicKey = keyPair.publicKey.toString('hex');

console.log("Private Key WIF:", privateKeyWIF);
console.log("Saved Public Key:", savedPublicKey);
console.log("Derived Public Key:", derivedPublicKey);
console.log("Keys Match:", derivedPublicKey === savedPublicKey);

if (derivedPublicKey !== savedPublicKey) {
    console.log("❌ CRITICAL ERROR: Private key does not correspond to saved public key!");
} else {
    console.log("✅ Private key correctly corresponds to public key");
}

console.log("\n2. INTERNAL KEY DERIVATION FOR TAPROOT");
console.log("=====================================");

// Step 2: Extract internal key (32-byte X-only pubkey)
const internalKey = keyPair.publicKey.slice(1, 33);
console.log("Internal Key (32 bytes):", internalKey.toString('hex'));
console.log("Internal Key Length:", internalKey.length, "bytes");

// Verify this is correct X-only key format
console.log("Is valid X-only key:", internalKey.length === 32);

console.log("\n3. TAPROOT ADDRESS GENERATION");
console.log("============================");

// Step 3: Create basic Taproot address (key-path only)
const p2trKeyPath = bitcoin.payments.p2tr({
    internalPubkey: internalKey,
    network: network
});

console.log("Key-path Address:", p2trKeyPath.address);
console.log("Matches Saved Address:", p2trKeyPath.address === savedAddress);

console.log("\n4. SCRIPT-PATH TAPROOT ANALYSIS");
console.log("===============================");

// Step 4: Recreate the exact script from the application
const num1 = 10, num2 = 4, operation = 'multiply';

function numberToScriptNum(num) {
    if (num === 0) return Buffer.from([bitcoin.opcodes.OP_0]);
    if (num === 1) return Buffer.from([bitcoin.opcodes.OP_1]);
    if (num >= 2 && num <= 16) return Buffer.from([bitcoin.opcodes.OP_2 + num - 2]);
    
    // For larger numbers, use bitcoin's script number encoding
    return bitcoin.script.number.encode(num);
}

const script = bitcoin.script.compile([
    numberToScriptNum(num1),
    numberToScriptNum(num2), 
    bitcoin.opcodes.OP_MUL,
    numberToScriptNum(40), // 10 * 4 = 40
    bitcoin.opcodes.OP_EQUAL
]);

console.log("Script hex:", script.toString('hex'));
console.log("Script ASM:", bitcoin.script.toASM(script));

// Create script tree
const scriptTree = {
    output: script,
    version: 0xc0
};

// Step 5: Generate script-path Taproot address
const p2trScriptPath = bitcoin.payments.p2tr({
    internalPubkey: internalKey,
    scriptTree: scriptTree,
    network: network
});

console.log("Script-path Address:", p2trScriptPath.address);
console.log("Matches Saved Address:", p2trScriptPath.address === savedAddress);

console.log("\n5. CONTROL BLOCK ANALYSIS");
console.log("=========================");

// Step 6: Generate proper control block for spending
const leafHash = bitcoin.crypto.taggedHash('TapLeaf', Buffer.concat([
    Buffer.from([0xc0]), // leaf version
    bitcoin.script.number.encode(script.length),
    script
]));

console.log("Leaf Hash:", leafHash.toString('hex'));

// Get tweaked pubkey and parity
const tweakedPubkey = p2trScriptPath.pubkey;
console.log("Tweaked Pubkey:", tweakedPubkey?.toString('hex'));

if (tweakedPubkey) {
    const parityBit = tweakedPubkey[0] === 0x03 ? 1 : 0;
    console.log("Parity Bit:", parityBit);
    
    const controlBlock = Buffer.concat([
        Buffer.from([0xc0 | parityBit]), // leaf version + parity
        internalKey
    ]);
    
    console.log("Control Block:", controlBlock.toString('hex'));
    console.log("Control Block Length:", controlBlock.length);
}

console.log("\n6. TAPROOT SPENDING ANALYSIS");
console.log("============================");

// Step 7: Analyze what's needed for script-path spending
console.log("For Taproot script-path spending, we need:");
console.log("1. The script itself");
console.log("2. The control block (leaf version + parity + internal key)");
console.log("3. The private key that corresponds to the internal key");

console.log("\nKey Requirements:");
console.log("- Internal Key:", internalKey.toString('hex'));
console.log("- Private Key WIF:", privateKeyWIF);
console.log("- Public Key matches:", derivedPublicKey === savedPublicKey);

console.log("\n7. SIGNING KEY COMPATIBILITY");
console.log("============================");

// Step 8: Test if the key can be used for signing
try {
    // Create a dummy PSBT to test signing capability
    const psbt = new bitcoin.Psbt({ network: network });
    
    // For Taproot script-path, the signing key should be the same as the one used for internal key
    console.log("Can create ECPair from WIF:", !!keyPair);
    console.log("Key pair has private key:", !!keyPair.privateKey);
    console.log("Key pair compressed:", keyPair.compressed);
    console.log("Network matches:", keyPair.network === network);
    
    // Test if we can sign with this key
    const message = Buffer.from("test message");
    const signature = keyPair.sign(message);
    console.log("Can sign messages:", !!signature);
    
} catch (error) {
    console.log("❌ Signing test failed:", error.message);
}

console.log("\n8. POTENTIAL ISSUES IDENTIFIED");
console.log("==============================");

let issues = [];

if (derivedPublicKey !== savedPublicKey) {
    issues.push("❌ Private key does not match saved public key");
}

if (p2trKeyPath.address !== savedAddress && p2trScriptPath.address !== savedAddress) {
    issues.push("❌ Neither key-path nor script-path address matches saved address");
}

if (internalKey.length !== 32) {
    issues.push("❌ Internal key is not 32 bytes (X-only format)");
}

if (!keyPair.privateKey) {
    issues.push("❌ Key pair missing private key component");
}

if (issues.length === 0) {
    console.log("✅ No cryptographic issues found with the keys");
    console.log("The error might be in the transaction building or signing process");
} else {
    console.log("Issues found:");
    issues.forEach(issue => console.log(issue));
}

console.log("\n9. RECOMMENDED DEBUGGING STEPS");
console.log("==============================");

console.log("1. Verify the UTXO scriptPubKey matches the generated address");
console.log("2. Check that tapInternalKey in PSBT matches the internal key used for address generation");
console.log("3. Ensure tapLeafScript in PSBT has correct script and control block");
console.log("4. Verify the control block parity bit is calculated correctly");
console.log("5. Check that the script execution would return true (valid calculation)");

console.log("\n=== ANALYSIS COMPLETE ===");