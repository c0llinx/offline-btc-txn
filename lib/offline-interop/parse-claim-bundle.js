import { decode } from 'cbor-x';

export function parseClaimBundle(cborBytes) {
  const message = decode(cborBytes);
  if (!message || message.ver !== 1) throw new Error('Unsupported claim-bundle version');

  const requiredKeys = ['h_alg', 'h', 'R_pub', 'script', 'leaf_ver', 'control', 'expires_at'];
  for (const key of requiredKeys) {
    if (!(key in message)) {
      throw new Error(`claim-bundle missing ${key}`);
    }
  }

  const result = { ...message };
  if (message.internal_pubkey) result.internal_pubkey = message.internal_pubkey;
  if (message.address) result.address = message.address;
  if (message.send_value_sat) result.send_value_sat = message.send_value_sat;
  return result;
}
