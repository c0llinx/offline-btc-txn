import { decode } from 'cbor-x';

export function parseClaimBundle(cborBytes) {
  const m = decode(cborBytes);
  if (!m || (m.ver !== 1 && m.ver !== 2)) throw new Error('Unsupported claim-bundle version');
  const required = ['h_alg', 'h', 'R_pub', 'script', 'leaf_ver', 'control', 'expires_at'];
  for (const k of required) if (!(k in m)) throw new Error(`claim-bundle missing ${k}`);
  if (m.ver === 2) {
    const req2 = ['refund_script', 'internal_pubkey'];
    for (const k of req2) if (!(k in m)) throw new Error(`claim-bundle v2 missing ${k}`);
  }
  return m;
}
