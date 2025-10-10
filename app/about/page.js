export default function About() {
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Spec Summary & Schemas</h1>
      <ul className="list-disc pl-6">
        <li><a className="text-blue-600 underline" href="/schemas/claim-bundle.cddl" target="_blank">claim-bundle@1 (CDDL)</a></li>
        <li><a className="text-blue-600 underline" href="/schemas/utxo-snapshot.cddl" target="_blank">utxo-snapshot@1 (CDDL)</a></li>
      </ul>
    </main>
  );
}
