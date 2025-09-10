import * as bitcoin from 'bitcoinjs-lib';
import { ECPairInterface } from 'bitcoinjs-lib';

/**
 * Signs a specific input of a PSBT using the provided private key.
 *
 * @param psbt The PSBT object to sign
 * @param inputIndex The input index to sign
 * @param keyPair The bitcoinjs-lib key pair containing the private key
 * @returns The PSBT with the input signed
 * NOTE: we are not validating signature here, but this would be essential
 * for a multisig situation
 */
export function signPsbtInput(
  psbt: bitcoin.Psbt,
  inputIndex: number,
  keyPair: ECPairInterface
): bitcoin.Psbt {
  psbt.signInput(inputIndex, keyPair);
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
    } catch (e) {
      // If signing or finalizing fails, continue to next input
      // This can occur in multisig or partially signed inputs
    }
  }
  return psbt;
}
