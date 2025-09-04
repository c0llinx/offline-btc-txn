import { UREncoder } from '@keystonehq/ur-encoder';
import { URDecoder } from '@keystonehq/ur-decoder';

export function encodeUR(type, payloadBytes, maxFragmentLength = 800) {
  const encoder = new UREncoder({ type, cbor: payloadBytes }, maxFragmentLength);
  return {
    nextPart: () => encoder.nextPart(),
    isComplete: () => encoder.isComplete(),
    estimatedParts: encoder.estimatedPartCount(),
  };
}

export async function decodeUR(parts) {
  const decoder = new URDecoder();
  for (const p of parts) decoder.receivePart(p);
  if (!decoder.isComplete()) throw new Error('UR not complete');
  const ur = decoder.resultUR();
  return { type: ur.type, cbor: ur.cbor };
}
