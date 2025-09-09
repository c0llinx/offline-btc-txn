import * as bitcoin from 'bitcoinjs-lib';
import { ECPairInterface } from 'bitcoinjs-lib';

/**
 * Signs a specific input of a PSBT using the provided private key.
 *
 * @param psbt The PSBT object to sign
 * @param inputIndex The input index to sign
 * @param keyPair The bitcoinjs-lib key pair containing the private key
 * @returns The PSBT with the input signed
 */
export function signPsbtInput(
  psbt: bitcoin.Psbt,
  inputIndex: number,
  keyPair: ECPairInterface
): bitcoin.Psbt {
  psbt.signInput(inputIndex, keyPair);

  // Optionally validate the signature
  const isValid = psbt.validateSignaturesOfInput(inputIndex);
  if (!isValid) {
    throw new Error(`Invalid signature for input ${inputIndex}`);
  }

  // Finalize input if all signatures are present (adjust logic per multisig needs)
  try {
    psbt.finalizeInput(inputIndex);
  } catch (e) {
    // Input may require multiple signatures or additional steps before finalization
  }

  return psbt;
}

/**
 * Signs all inputs of the PSBT that can be signed with the provided key pair.
 *
 * @param psbt The PSBT object to sign
 * @param keyPair The bitcoinjs-lib key pair containing the private key
 * @returns The PSBT with inputs signed accordingly
 */
export function signAllInputs(
  psbt: bitcoin.Psbt,
  keyPair: ECPairInterface
): bitcoin.Psbt {
  for (let i = 0; i < psbt.inputCount; i++) {
    try {
      psbt.signInput(i, keyPair);
      const isValid = psbt.validateSignaturesOfInput(i);
      if (!isValid) {
        throw new Error(`Invalid signature for input ${i}`);
      }
      psbt.finalizeInput(i);
    } catch (e) {
      // If signing or finalizing fails, continue to next input
      // This can occur in multisig or partially signed inputs
    }
  }
  return psbt;
}

/**
 * Verifies that all inputs in the PSBT are signed and valid.
 *
 * @param psbt The PSBT object to verify
 * @returns true if all inputs have valid signatures, false otherwise
 */
export function verifyPsbtSignatures(psbt: bitcoin.Psbt): boolean {
  for (let i = 0; i < psbt.inputCount; i++) {
    if (!psbt.validateSignaturesOfInput(i)) {
      return false;
    }
  }
  return true;
}
