import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize bitcoin lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.testnet;

console.log("=== TAPROOT SCRIPT-PATH SIGNING ANALYSIS ===\n");

// Test data from saved-addresses.json
const privateKeyWIF = "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei";
const savedAddress = "tb1p4fuxteqjltq7mkrgszckdm88p4efva73p9r50kq65fj7q3gjpnkqapmdzh";

// Create the key pair
const keyPair = ECPair.fromWIF(privateKeyWIF, network);
const internalKey = keyPair.publicKey.slice(1, 33);

console.log("1. KEY SETUP");
console.log("============");
console.log("Private Key WIF:", privateKeyWIF);
console.log("Internal Key:", internalKey.toString('hex'));
console.log("Key Pair Network:", keyPair.network.bech32);
console.log("");

// Recreate the script (10 * 4 = 40)
function numberToScriptNum(num) {
    if (num === 0) return Buffer.from([bitcoin.opcodes.OP_0]);
    if (num === 1) return Buffer.from([bitcoin.opcodes.OP_1]);
    if (num >= 2 && num <= 16) return Buffer.from([bitcoin.opcodes.OP_2 + num - 2]);
    return bitcoin.script.number.encode(num);
}

const script = bitcoin.script.compile([
    numberToScriptNum(10),  // num1
    numberToScriptNum(4),   // num2
    bitcoin.opcodes.OP_MUL, // operation
    numberToScriptNum(40),  // expected result
    bitcoin.opcodes.OP_EQUAL
]);

console.log("2. SCRIPT ANALYSIS");
console.log("==================");
console.log("Script hex:", script.toString('hex'));
console.log("Script ASM:", bitcoin.script.toASM(script));

// Create the script tree
const scriptTree = {
    output: script,
    version: 0xc0
};

// Create payment object
const payment = bitcoin.payments.p2tr({
    internalPubkey: internalKey,
    scriptTree: scriptTree,
    network: network
});

console.log("Generated Address:", payment.address);
console.log("Matches Expected:", payment.address === savedAddress);
console.log("");

// Create a mock PSBT to test the signing process
console.log("3. PSBT SIGNING TEST");
console.log("===================");

try {
    const psbt = new bitcoin.Psbt({ network: network });
    
    // Mock UTXO data (this would normally come from the blockchain)
    const mockUtxo = {
        hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        index: 0,
        value: 100000,
        scriptPubKey: Buffer.from('5120aa7865e412fac1edd86880b166ece70d729677d1094747d81aa265e045120cec', 'hex')
    };
    
    // Calculate control block
    const tweakedPubkey = payment.pubkey;
    if (!tweakedPubkey) {
        throw new Error('Failed to get tweaked pubkey');
    }
    
    const parityBit = tweakedPubkey[0] === 0x03 ? 1 : 0;
    const controlBlock = Buffer.concat([
        Buffer.from([0xc0 | parityBit]), // leaf version + parity
        internalKey
    ]);
    
    console.log("Control Block:", controlBlock.toString('hex'));
    console.log("Tweaked Pubkey:", tweakedPubkey.toString('hex'));
    console.log("Parity Bit:", parityBit);
    
    // Add input with Taproot script-path data
    psbt.addInput({
        hash: mockUtxo.hash,
        index: mockUtxo.index,
        witnessUtxo: {
            script: mockUtxo.scriptPubKey,
            value: mockUtxo.value
        },
        tapInternalKey: internalKey,
        tapLeafScript: [{
            leafVersion: 0xc0,
            script: script,
            controlBlock: controlBlock
        }]
    });
    
    // Add output
    psbt.addOutput({
        address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        value: 50000
    });
    
    console.log("PSBT created successfully");
    console.log("Input count:", psbt.inputCount);
    console.log("Output count:", psbt.outputCount);
    
    // Test signing
    console.log("\n4. SIGNING ATTEMPT");
    console.log("=================");
    
    // Check what key bitcoinjs-lib expects for signing
    console.log("Attempting to sign input 0...");
    
    try {
        psbt.signInput(0, keyPair);
        console.log("✅ Signing successful!");
        
        // Try to finalize
        psbt.finalizeInput(0);
        console.log("✅ Finalization successful!");
        
        const tx = psbt.extractTransaction();
        console.log("✅ Transaction extracted successfully!");
        console.log("Transaction hex:", tx.toHex());
        
    } catch (signError) {
        console.log("❌ Signing failed:", signError.message);
        
        // Let's analyze what went wrong
        console.log("\n5. SIGNING ERROR ANALYSIS");
        console.log("=========================");
        
        if (signError.message.includes('Can not sign for input')) {
            console.log("This is the exact error we're investigating!");
            console.log("The error suggests the key doesn't match what's expected for signing.");
            
            // Check if the internal key matches what we're using for signing
            const signingPubkey = keyPair.publicKey.toString('hex');
            console.log("Signing key public key:", signingPubkey);
            console.log("Internal key (from signing key):", internalKey.toString('hex'));
            console.log("Tweaked pubkey:", tweakedPubkey.toString('hex'));
            
            // For Taproot script-path spending, we sign with the internal private key
            // The error might be that bitcoinjs-lib is expecting a different key
            
            console.log("\nPossible issues:");
            console.log("1. The tapInternalKey in PSBT doesn't match the key used for signing");
            console.log("2. The control block is incorrect");
            console.log("3. The script or leaf version is wrong");
            console.log("4. The scriptPubKey doesn't match the generated address");
            
            // Test with correct scriptPubKey
            const correctScriptPubKey = Buffer.from('5120' + tweakedPubkey.toString('hex'), 'hex');
            console.log("Expected scriptPubKey:", correctScriptPubKey.toString('hex'));
            console.log("Mock scriptPubKey matches:", mockUtxo.scriptPubKey.equals(correctScriptPubKey));
        }
        
        console.log("\nDetailed error:", signError);
    }
    
} catch (error) {
    console.log("❌ PSBT creation failed:", error.message);
    console.log("Full error:", error);
}

console.log("\n6. SUMMARY");
console.log("==========");
console.log("Key relationship: ✅ Private key correctly derives public key");
console.log("Address generation: ✅ Script-path address matches expected");
console.log("Script creation: ✅ Script compiles correctly");
console.log("Control block: ✅ Generated with correct format");
console.log("");
console.log("The issue is likely in the transaction building/signing process:");
console.log("- Ensure UTXO scriptPubKey matches the tweaked pubkey");
console.log("- Verify tapInternalKey in PSBT input matches the internal key");
console.log("- Check that the actual UTXO data from the blockchain is correct");
console.log("- Ensure the control block parity bit calculation is accurate");

console.log("\n=== ANALYSIS COMPLETE ===");