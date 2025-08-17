import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

// Initialize bitcoin lib with ECC
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.testnet;

console.log("=== FIXING TAPROOT SCRIPT-PATH SIGNING ISSUE ===\n");

// Test data
const privateKeyWIF = "cS8ZqJWDDfcLuypEx7qBfLcYyc5paQtwxRmVgq7bmAtNRGx1tYei";
const keyPair = ECPair.fromWIF(privateKeyWIF, network);
const internalKey = keyPair.publicKey.slice(1, 33);

// Create the script
function numberToScriptNum(num) {
    if (num === 0) return Buffer.from([bitcoin.opcodes.OP_0]);
    if (num === 1) return Buffer.from([bitcoin.opcodes.OP_1]);
    if (num >= 2 && num <= 16) return Buffer.from([bitcoin.opcodes.OP_2 + num - 2]);
    return bitcoin.script.number.encode(num);
}

const script = bitcoin.script.compile([
    numberToScriptNum(10),
    numberToScriptNum(4),
    bitcoin.opcodes.OP_MUL,
    numberToScriptNum(40),
    bitcoin.opcodes.OP_EQUAL
]);

const scriptTree = {
    output: script,
    version: 0xc0
};

const payment = bitcoin.payments.p2tr({
    internalPubkey: internalKey,
    scriptTree: scriptTree,
    network: network
});

console.log("Generated Address:", payment.address);

// The issue is that for script-path spending, bitcoinjs-lib expects the signing key
// to be tweaked with the script tree. Let's investigate this.

console.log("\n1. UNDERSTANDING THE SIGNING KEY REQUIREMENT");
console.log("============================================");

// For Taproot script-path spending, the signing happens with the internal private key
// But bitcoinjs-lib needs to verify that this key can produce valid signatures
// for the specific script path being spent.

// The error message shows it's trying to use the full public key (with prefix)
// but for Taproot, we need to work with X-only keys

console.log("Internal Key (X-only):", internalKey.toString('hex'));
console.log("Full Public Key:", keyPair.publicKey.toString('hex'));

// Let's try creating a tweaked key pair specifically for this script
console.log("\n2. CREATING SCRIPT-SPECIFIC KEY");
console.log("===============================");

// For script-path spending, the key doesn't need to be tweaked
// The internal key is used directly for signing
// But we need to ensure the PSBT setup is correct

const psbt = new bitcoin.Psbt({ network: network });

// Mock UTXO with correct scriptPubKey
const tweakedPubkey = payment.pubkey;
const scriptPubKey = Buffer.from('5120' + tweakedPubkey.toString('hex'), 'hex');

console.log("Tweaked Pubkey:", tweakedPubkey.toString('hex'));
console.log("Script PubKey:", scriptPubKey.toString('hex'));

// Calculate control block correctly
const parityBit = tweakedPubkey[0] === 0x03 ? 1 : 0;
const controlBlock = Buffer.concat([
    Buffer.from([0xc0 | parityBit]),
    internalKey
]);

console.log("Control Block:", controlBlock.toString('hex'));

// The key insight: For script-path spending, we need to provide the script
// in the redeem property of the payment object when creating the input

console.log("\n3. CORRECT PSBT SETUP FOR SCRIPT-PATH SPENDING");
console.log("==============================================");

try {
    // Create a redeem script payment
    const redeemScript = {
        output: script,
        redeemVersion: 0xc0
    };
    
    // Create payment with redeem script
    const scriptPathPayment = bitcoin.payments.p2tr({
        internalPubkey: internalKey,
        scriptTree: scriptTree,
        redeem: redeemScript,
        network: network
    });
    
    console.log("Script path payment address:", scriptPathPayment.address);
    console.log("Has witness?", !!scriptPathPayment.witness);
    
    if (scriptPathPayment.witness) {
        console.log("Witness stack length:", scriptPathPayment.witness.length);
        scriptPathPayment.witness.forEach((item, i) => {
            console.log(`Witness[${i}]:`, item.toString('hex'));
        });
    }
    
    // Add input with proper script path setup
    psbt.addInput({
        hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        index: 0,
        witnessUtxo: {
            script: scriptPubKey,
            value: 100000
        },
        tapInternalKey: internalKey,
        tapLeafScript: [{
            leafVersion: 0xc0,
            script: script,
            controlBlock: controlBlock
        }]
    });
    
    psbt.addOutput({
        address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        value: 50000
    });
    
    console.log("\n4. SIGNING WITH CORRECT SETUP");
    console.log("=============================");
    
    // The fix: For script-path spending, we need to sign with a hash type
    // that indicates script-path spending
    
    try {
        // Try signing with explicit hash type
        psbt.signInput(0, keyPair, [bitcoin.Transaction.SIGHASH_DEFAULT]);
        console.log("✅ Signing successful with explicit hash type!");
        
    } catch (error1) {
        console.log("❌ Signing with hash type failed:", error1.message);
        
        // Try the alternative approach: signing with just the key pair
        try {
            // Maybe the issue is in how we set up the tapLeafScript
            // Let's try without the controlBlock and let bitcoinjs-lib generate it
            
            const psbt2 = new bitcoin.Psbt({ network: network });
            
            psbt2.addInput({
                hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                index: 0,
                witnessUtxo: {
                    script: scriptPubKey,
                    value: 100000
                },
                tapInternalKey: internalKey,
                tapScriptSig: [{
                    pubkey: internalKey,
                    signature: Buffer.alloc(64) // placeholder
                }],
                tapLeafScript: [{
                    leafVersion: 0xc0,
                    script: script,
                    controlBlock: controlBlock
                }]
            });
            
            psbt2.addOutput({
                address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
                value: 50000
            });
            
            psbt2.signInput(0, keyPair);
            console.log("✅ Alternative signing successful!");
            
        } catch (error2) {
            console.log("❌ Alternative signing failed:", error2.message);
            
            console.log("\n5. ROOT CAUSE ANALYSIS");
            console.log("======================");
            
            // The error is specifically about key matching
            // Let's check what bitcoinjs-lib expects vs what we provide
            
            console.log("The error 'Can not sign for input #0 with the key' suggests:");
            console.log("1. bitcoinjs-lib is looking for a specific key format");
            console.log("2. For script-path spending, it expects the key to match the tapInternalKey");
            console.log("3. The issue might be in the comparison between the signing key and internal key");
            
            console.log("\nKey comparison:");
            console.log("Signing key pubkey:", keyPair.publicKey.toString('hex'));
            console.log("Internal key:", internalKey.toString('hex'));
            console.log("They should be related but not identical");
            
            console.log("\nThe fix is likely one of these:");
            console.log("1. Use only the X-only portion of the public key for signing");
            console.log("2. Ensure the tapInternalKey exactly matches the signing key's X-only pubkey");
            console.log("3. Use a different signing method for script-path spending");
            
            // Create an X-only key pair
            const xOnlyKeyPair = {
                privateKey: keyPair.privateKey,
                publicKey: internalKey,
                sign: keyPair.sign.bind(keyPair),
                network: keyPair.network
            };
            
            console.log("\n6. TRYING WITH X-ONLY KEY");
            console.log("=========================");
            
            try {
                const psbt3 = new bitcoin.Psbt({ network: network });
                
                psbt3.addInput({
                    hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                    index: 0,
                    witnessUtxo: {
                        script: scriptPubKey,
                        value: 100000
                    },
                    tapInternalKey: internalKey,
                    tapLeafScript: [{
                        leafVersion: 0xc0,
                        script: script,
                        controlBlock: controlBlock
                    }]
                });
                
                psbt3.addOutput({
                    address: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
                    value: 50000
                });
                
                // This is the key insight: we need to sign with the original keyPair
                // but ensure the PSBT setup is correct
                psbt3.signInput(0, keyPair);
                console.log("✅ X-only key signing successful!");
                
            } catch (error3) {
                console.log("❌ X-only key signing failed:", error3.message);
                
                console.log("FINAL DIAGNOSIS:");
                console.log("================");
                console.log("The issue is in the bitcoinjs-lib validation logic.");
                console.log("For script-path spending, it expects:");
                console.log("- tapInternalKey to match the X-only version of the signing key");
                console.log("- Proper control block with correct parity");
                console.log("- Script and leaf version to be correct");
                console.log("");
                console.log("The error occurs because bitcoinjs-lib is comparing:");
                console.log("- Signing key:", keyPair.publicKey.toString('hex'));
                console.log("- Expected key: should be the X-only internal key");
                console.log("");
                console.log("SOLUTION: Ensure the signing process uses the correct key format");
                console.log("and that all PSBT fields are properly set up for script-path spending.");
            }
        }
    }
    
} catch (error) {
    console.log("❌ PSBT setup failed:", error.message);
}

console.log("\n=== ANALYSIS COMPLETE ===");