import { decode } from 'cbor-x';

export function parseClaimBundle(cborBytes) {
  const m = decode(cborBytes);
  if (!m || m.ver !== 1) throw new Error('Unsupported claim-bundle version');
  const required = ['h_alg', 'h', 'R_pub', 'script', 'leaf_ver', 'control', 'expires_at'];
  for (const k of required) if (!(k in m)) throw new Error(`claim-bundle missing ${k}`);
  const result = { ...m };
  if (m.internal_pubkey) {
    result.internal_pubkey = m.internal_pubkey;
  }
  if (m.address) {
    result.address = m.address;
  }
  if (m.send_value_sat) {
    result.send_value_sat = m.send_value_sat;
  }
  return result;
}
