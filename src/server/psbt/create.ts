/**
 * @file Provides utility functions for creating PSBTs (Partially Signed Bitcoin Transactions).
 * Supports both sender-funded and receiver-created PSBT workflows.
 */

import * as bitcoin from 'bitcoinjs-lib';
import { BitcoinNetwork, MapToBitcoinNetwork } from '../bitcoin/networks';
import { Satoshi } from '../bitcoin/types';
import { UTXO } from '../bitcoin/utxo';

/**
 * The minimum amount for a transaction output to be considered non-dust.
 * Outputs below this value are uneconomical to spend and may be rejected by the network.
 * This is the standard P2WPKH dust limit.
 */
const DUST_THRESHOLD = 546; // in satoshis

/**
 * Options for creating a Partially Signed Bitcoin Transaction (PSBT).
 */
export interface PsbtCreateOptions {
  /** The Bitcoin network (e.g., Mainnet, Testnet) on which the transaction will occur. */
  network: BitcoinNetwork;
  /** The amount to be sent to the recipient, in satoshis. */
  sendAmount: Satoshi;
  /** The recipient's Bitcoin address. Required for both sender and receiver-created PSBTs. */
  recipientAddress: string;
  /** An array of Unspent Transaction Outputs (UTXOs) available for spending. Required for `createSenderPsbt`. */
  utxos?: UTXO[];
  /** The sender's address to receive any change from the transaction. Required for `createSenderPsbt`. */
  changeAddress?: string;
  /** The desired fee rate for the transaction, in satoshis per virtual byte (sats/vB). */
  feeRate?: number;
}

/**
 * Creates a PSBT from the **sender's perspective**.
 *
 * This function selects UTXOs to cover the send amount and fee, adds them as inputs,
 * and defines the recipient and change outputs. The resulting PSBT is ready for the sender to sign.
 *
 * @param options - The configuration options for creating the PSBT.
 * @returns A `bitcoin.Psbt` object with inputs and outputs defined.
 * @throws If `utxos`, `changeAddress`, or `feeRate` are not provided.
 * @throws If the available UTXOs are insufficient to cover the send amount and transaction fee.
 */
export function createSenderPsbt({
  network,
  utxos = [],
  sendAmount,
  recipientAddress,
  changeAddress,
  feeRate,
}: PsbtCreateOptions): bitcoin.Psbt {
  if (!changeAddress || feeRate === undefined) {
    throw new Error(
      'UTXOs, changeAddress, and feeRate are required for a sender-created PSBT.'
    );
  }

  const btcNetwork = MapToBitcoinNetwork(network);
  const psbt = new bitcoin.Psbt({ network: btcNetwork });

  let totalInputValue = 0;
  const selectedUtxos: UTXO[] = [];

  // Find enough UTXOs to cover the send amount + estimated fee
  for (const utxo of utxos) {
    selectedUtxos.push(utxo);
    totalInputValue += utxo.amount;

    // Estimate fee with the current set of inputs and 2 outputs (recipient + change)
    const estimatedFee = estimateFee(selectedUtxos.length, 2, feeRate);

    // If we have enough to cover the payment and the fee, we're done selecting.
    if (totalInputValue >= sendAmount + estimatedFee) {
      break;
    }
  }

  const finalFee = estimateFee(selectedUtxos.length, 2, feeRate);
  if (totalInputValue < sendAmount + finalFee) {
    throw new Error(
      `Insufficient funds. Available: ${totalInputValue} sats, Required: ${sendAmount + finalFee} sats (amount + fee).`
    );
  }

  for (const utxo of selectedUtxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      // For SegWit inputs, witnessUtxo is required for signing.
      witnessUtxo: {
        script: Buffer.from(utxo.scriptPubKey, 'hex'),
        value: utxo.amount,
      },
    });
  }

  // Add the recipient's output
  psbt.addOutput({
    address: recipientAddress,
    value: sendAmount,
  });

  // Calculate change and add the change output if it's not dust
  const changeAmount = totalInputValue - sendAmount - finalFee;
  if (changeAmount >= DUST_THRESHOLD) {
    psbt.addOutput({
      address: changeAddress,
      value: changeAmount,
    });
  }

  return psbt;
}

/**
 * Creates a PSBT from the **receiver's perspective** (a "payment request").
 *
 * This function creates a PSBT with only an output defined: the recipient's address
 * and the amount they wish to receive. The sender will then add their inputs and
 * a change output before signing and broadcasting.
 *
 * @param options - The configuration options, requiring `network`, `recipientAddress`, and `sendAmount`.
 * @returns A `bitcoin.Psbt` object with only an output defined.
 */
export function createReceiverPsbt({
  network,
  sendAmount,
  recipientAddress,
}: PsbtCreateOptions): bitcoin.Psbt {
  const btcNetwork = MapToBitcoinNetwork(network);
  const psbt = new bitcoin.Psbt({ network: btcNetwork });

  // The receiver only specifies the output they want to receive.
  psbt.addOutput({
    address: recipientAddress,
    value: sendAmount,
  });

  // Inputs and change are left for the sender to add.
  return psbt;
}

/**
 * Estimates the virtual size of a transaction and calculates the fee.
 *
 * This calculation assumes all inputs are P2WPKH (standard SegWit) and
 * all outputs are P2WPKH.
 *
 * The formula for virtual size is:
 * (numInputs * 68) + (numOutputs * 31) + 10.5
 *
 * @param numInputs - The number of inputs in the transaction.
 * @param numOutputs - The number of outputs in the transaction.
 * @param feeRate - The desired fee rate in satoshis per virtual byte (sats/vB).
 * @returns The estimated total fee in satoshis.
 */
function estimateFee(
  numInputs: number,
  numOutputs: number,
  feeRate: number
): number {
  // P2WPKH input vbytes: 68
  // P2WPKH output vbytes: 31
  // Base transaction vbytes (version, locktime, etc.): 10.5
  const transactionVSize = numInputs * 68 + numOutputs * 31 + 10.5;
  const fee = Math.ceil(transactionVSize * feeRate);
  return fee;
}
