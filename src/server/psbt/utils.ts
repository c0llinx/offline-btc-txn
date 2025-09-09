import * as bitcoin from 'bitcoinjs-lib';
import QRCode from 'qrcode';

/**
 * Generates a QR code data URL from a PSBT object.
 *
 * @param psbt The bitcoinjs-lib PSBT object
 * @returns Promise<string> resolves to a data URL representing the QR code image
 */
export async function generatePsbtQrCodeDataUrl(
  psbt: bitcoin.Psbt
): Promise<string> {
  // Serialize the PSBT to base64
  const base64Psbt = psbt.toBase64();

  // Generate QR code data URL (default settings)
  return QRCode.toDataURL(base64Psbt);
}

/**
 * Render a PSBT QR code into an HTML element by id.
 *
 * @param psbt The bitcoinjs-lib PSBT object
 * @param elementId The DOM element id where the QR should be rendered
 */
export async function renderPsbtQrCode(
  psbt: bitcoin.Psbt,
  elementId: string
): Promise<void> {
  const base64Psbt = psbt.toBase64();
  await QRCode.toCanvas(
    document.getElementById(elementId) as HTMLCanvasElement,
    base64Psbt
  );
}

/**
 * Estimate transaction fee based on inputs, outputs, and fee rate (sats per byte).
 * Uses typical size estimates for inputs and outputs.
 *
 * @param numInputs Number of inputs
 * @param numOutputs Number of outputs
 * @param feeRate Fee rate in satoshis per byte
 * @returns Estimated fee in satoshis
 */
export function estimateFee(
  numInputs: number,
  numOutputs: number,
  feeRate: number
): number {
  const txSize = numInputs * 148 + numOutputs * 34 + 10; // typical P2WPKH sizes
  return txSize * feeRate;
}

/**
 * Serialize a PSBT object to base64 string for storage or transport.
 *
 * @param psbt bitcoinjs-lib PSBT object
 * @returns Base64-encoded PSBT string
 */
export function serializePsbtToBase64(psbt: bitcoin.Psbt): string {
  return psbt.toBase64();
}

/**
 * Parse a base64-encoded PSBT string into a bitcoinjs-lib PSBT object.
 *
 * @param base64Psbt Base64 string of PSBT
 * @param network bitcoinjs-lib Network object
 * @returns Parsed PSBT object
 */
export function parsePsbtFromBase64(
  base64Psbt: string,
  network: bitcoin.Network
): bitcoin.Psbt {
  return bitcoin.Psbt.fromBase64(base64Psbt, { network });
}

/**
 * Converts satoshi amount to BTC decimal value.
 *
 * @param satoshis Number of satoshis
 * @returns BTC value as number
 */
export function satoshisToBtc(satoshis: number): number {
  return satoshis / 100_000_000;
}

/**
 * Converts BTC amount to satoshis
 *
 * @param btc BTC value as number
 * @returns Amount in satoshis
 */
export function btcToSatoshis(btc: number): number {
  return Math.round(btc * 100_000_000);
}
