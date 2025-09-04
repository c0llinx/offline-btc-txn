export function buildClaimWitness({ sigR, x, script, control }) {
  if (!sigR || !x || !script || !control) throw new Error('missing fields');
  return [sigR, x, script, control];
}
