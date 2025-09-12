export default function BuyerMerchantDocs() {
  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-600 text-white">HELP</div>
      <h1 className="text-2xl font-semibold">Buyer / Merchant Offline Workflow</h1>
      <p className="text-zinc-500">Taproot claim/refund wallet with air‑gapped signing. Testnet by default.</p>

      <nav className="text-sm flex flex-wrap gap-3">
        <a className="text-blue-600 underline" href="#overview">Overview</a>
        <a className="text-blue-600 underline" href="#merchant-setup">Merchant Setup (Cold)</a>
        <a className="text-blue-600 underline" href="#buyer-funds">Buyer Funds</a>
        <a className="text-blue-600 underline" href="#merchant-claim">Merchant Claim</a>
        <a className="text-blue-600 underline" href="#buyer-refund">Buyer Refund</a>
        <a className="text-blue-600 underline" href="#signer">Signer</a>
        <a className="text-blue-600 underline" href="#broadcast">Broadcast</a>
      </nav>

      <section id="overview" className="rounded-lg border p-4 space-y-2">
        <h2 className="font-medium">Overview</h2>
        <ul className="list-disc pl-5 text-sm space-y-1">
          <li><b>Contract</b>: One Taproot address with two leaves: Claim (Merchant with R + preimage x) and Refund (Buyer with S after H_exp).</li>
          <li><b>Offline</b>: The Cold page enforces zero network; data moves via UR parts (QR/copy‑paste).</li>
          <li><b>Defaults</b>: Testnet endpoints and fee flow; signet/mainnet selectable.</li>
        </ul>
      </section>

      <section id="merchant-setup" className="rounded-lg border p-4 space-y-2">
        <h2 className="font-medium">Merchant Setup (Cold)</h2>
        <ol className="list-decimal pl-5 text-sm space-y-1">
          <li>Open <code>/cold</code> on the air‑gapped device. Choose network <b>testnet</b>.</li>
          <li>Set expiry <b>H_exp</b>. Tip+2 can set it near the chain tip. Temporarily disable Cold if network fetch is blocked.</li>
          <li>Provide/Generate keys: <b>R</b> (Merchant claim) and <b>S</b> (Buyer refund). Keep private keys offline.</li>
          <li>Compute <b>h</b> from your message or paste a 32‑byte value.</li>
          <li>Generate the <b>Claim Bundle</b> (v2). Share P2TR address + bundle with the Buyer.</li>
        </ol>
      </section>

      <section id="buyer-funds" className="rounded-lg border p-4 space-y-2">
        <h2 className="font-medium">Buyer Funds</h2>
        <ul className="list-disc pl-5 text-sm space-y-1">
          <li>Send tBTC to the P2TR address from your wallet/faucet.</li>
          <li>Optionally, share funding txid with the Merchant.</li>
        </ul>
      </section>

      <section id="merchant-claim" className="rounded-lg border p-4 space-y-2">
        <h2 className="font-medium">Merchant Claim (before H_exp)</h2>
        <ol className="list-decimal pl-5 text-sm space-y-1">
          <li>On <code>/receiver</code>, paste the Claim Bundle and decode.</li>
          <li>Enter prevout details (txid, vout, value, scriptPubKey hex).</li>
          <li>Select <b>Spend Path = Claim</b>; set destination and optional change; estimate fees; build PSBT.</li>
          <li>On <code>/signer</code>, import PSBT, enter <b>preimage x</b>, and sign with <b>R</b> private key.</li>
          <li>Broadcast on <code>/watch</code>. Done.</li>
        </ol>
      </section>

      <section id="buyer-refund" className="rounded-lg border p-4 space-y-2">
        <h2 className="font-medium">Buyer Refund (after H_exp)</h2>
        <ol className="list-decimal pl-5 text-sm space-y-1">
          <li>On <code>/receiver</code>, paste the v2 Claim Bundle and decode.</li>
          <li>Enter prevout details and select <b>Spend Path = Refund</b>.</li>
          <li>The builder sets <b>nLockTime = H_exp</b> and input <b>nSequence = 0xfffffffe</b>.
            It reconstructs the refund control block from <b>internal_pubkey</b> and both leaves.</li>
          <li>Build PSBT; on <code>/signer</code> sign with <b>S</b> private key (no preimage).</li>
          <li>Broadcast on <code>/watch</code> once tip &ge; H_exp; earlier attempts will be non‑final.</li>
        </ol>
      </section>

      <section id="signer" className="rounded-lg border p-4 space-y-2">
        <h2 className="font-medium">Signer</h2>
        <ul className="list-disc pl-5 text-sm space-y-1">
          <li>Auto‑detects Claim vs Refund from tapscript.</li>
          <li>Claim witness: <code>[sigR, x, script, control]</code>; Refund witness: <code>[sigS, script, control]</code>.</li>
          <li>Accepts WIF or 32‑byte hex for R/S private keys.</li>
        </ul>
      </section>

      <section id="broadcast" className="rounded-lg border p-4 space-y-2">
        <h2 className="font-medium">Broadcast / Watch</h2>
        <ul className="list-disc pl-5 text-sm space-y-1">
          <li><code>/watch</code> posts to testnet by default with a fallback endpoint and timeout.</li>
          <li>Switch the endpoint for signet/mainnet as needed.</li>
        </ul>
      </section>

      <section className="rounded-lg border p-4 space-y-2">
        <h2 className="font-medium">Source & Full Doc</h2>
        <ul className="list-disc pl-5 text-sm space-y-1">
          <li>Repo doc: <a className="text-blue-600 underline" href="https://github.com/c0llinx/offline-btc-txn/blob/features_george/docs/Buyer-Merchant-Offline-Workflow.md" target="_blank" rel="noreferrer">Buyer-Merchant-Offline-Workflow.md</a> (GitHub)</li>
        </ul>
      </section>
    </main>
  );
}
