"use client";
import { useEffect, useMemo, useState } from 'react';
import { NETWORKS, buildClaimRefundTaproot, buildFundingPsbt, generateBurnedInternalKey } from '@offline/core';
import { encode as cborEncode } from 'cbor-x';
import { encodeUR, decodeUR } from '@offline/core';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

export default function Cold() {
  const [status, setStatus] = useState('checking...');
  // Claim/Refund generator state
  const [networkKey, setNetworkKey] = useState('testnet');
  const [RHex, setRHex] = useState(''); // x-only 32-byte hex
  const [SHex, setSHex] = useState(''); // x-only 32-byte hex
  const [message, setMessage] = useState('hello offline bitcoin');
  const [hHex, setHHex] = useState(''); // 32-byte hex
  const [expiry, setExpiry] = useState(500000);
  const [address, setAddress] = useState('');
  const [p2trOutHex, setP2trOutHex] = useState('');
  const [claimBundleUR, setClaimBundleUR] = useState('');
  const [genError, setGenError] = useState('');
  const network = useMemo(() => NETWORKS[networkKey] || NETWORKS.signet, [networkKey]);

  // Funding PSBT state
  const [utxosJson, setUtxosJson] = useState('[\n  {\n    "txid": "<txid>",\n    "vout": 0,\n    "value": 150000,\n    "scriptHex": "0014..."\n  }\n]');
  const [sendValueSat, setSendValueSat] = useState(70000);
  const [feeRate, setFeeRate] = useState(2);
  const [changeAddress, setChangeAddress] = useState('');
  const [psbtB64, setPsbtB64] = useState('');
  const [psbtUR, setPsbtUR] = useState('');
  const [psbtErr, setPsbtErr] = useState('');
  const [guidedOpen, setGuidedOpen] = useState(true);
  const [rPrivNotice, setRPrivNotice] = useState('');
  const [sPrivNotice, setSPrivNotice] = useState('');
  const [savedRConfirmed, setSavedRConfirmed] = useState(false);

  useEffect(() => {
    checkColdStatus();
  }, []);

  async function checkColdStatus() {
    if (!('serviceWorker' in navigator)) {
      setStatus('Service Worker unsupported');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration('/cold/');
      if (!reg) {
        setStatus('Cold OFF');
        return;
      }
      try {
        const r = await fetch('/cold/sw-probe');
        setStatus(r.status === 451 ? 'COLD enforced (blocked)' : 'Cold ON (not blocking api)');
      } catch {
        setStatus('COLD enforced (blocked)');
      }
    } catch (e) {
      setStatus('Cold status unknown');
    }
  }

  async function enableCold() {
    try {
      await navigator.serviceWorker.register('/sw-cold.js', { scope: '/cold/' });
      await checkColdStatus();
    } catch {
      setStatus('SW registration failed');
    }
  }

  async function disableCold() {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/cold/');
      if (reg) await reg.unregister();
      // Also try to clean any root-scoped legacy SWs
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.filter(r => (r?.active?.scriptURL || '').endsWith('/sw-cold.js')).map(r => r.unregister()));
      await checkColdStatus();
    } catch {
      setStatus('Failed to unregister SW');
    }
  }

  function parseUtxosFromJson(text) {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error('UTXOs JSON must be an array');
    return arr.map(u => {
      if (!u.txid || typeof u.txid !== 'string') throw new Error('utxo.txid missing');
      if (typeof u.vout !== 'number') throw new Error('utxo.vout missing');
      if (typeof u.value !== 'number') throw new Error('utxo.value missing');
      const scriptHex = u.scriptHex || u.witnessUtxo?.scriptHex || u.witnessUtxo?.script || u.script;
      if (!scriptHex || typeof scriptHex !== 'string') throw new Error('utxo.scriptHex missing');
      const witnessUtxo = { script: Buffer.from(scriptHex, 'hex'), value: u.value };
      const res = { txid: u.txid, vout: u.vout, witnessUtxo };
      if (u.tapInternalKey && typeof u.tapInternalKey === 'string') {
        res.tapInternalKey = Buffer.from(u.tapInternalKey, 'hex');
      }
      return res;
    });
  }

  function psbtToBase64(psbt) {
    try { return psbt.toBase64(); } catch {}
    try { return Buffer.from(psbt.toBuffer()).toString('base64'); } catch {}
    return '';
  }

  async function handleBuildFunding() {
    try {
      setPsbtErr('');
      setPsbtB64('');
      setPsbtUR('');
      if (!address || !p2trOutHex) throw new Error('Generate claim/refund address first');
      const utxos = parseUtxosFromJson(utxosJson);
      const psbt = buildFundingPsbt({
        utxos,
        sendOutputScript: Buffer.from(p2trOutHex, 'hex'),
        sendValueSat: Number(sendValueSat) || 0,
        changeAddress: changeAddress || undefined,
        feeRateSatVb: Number(feeRate) || 1,
        network,
      });
      const b64 = psbtToBase64(psbt);
      setPsbtB64(b64);
      const ur = encodeUR('crypto-psbt', psbt.toBuffer(), 180);
      const parts = [];
      const seen = new Set();
      let guard = 0;
      while (guard < 200) {
        const p = ur.nextPart();
        if (!seen.has(p)) { parts.push(p); seen.add(p); }
        try {
          await decodeUR(parts);
          break; // successful decode
        } catch (e) {
          if (!String(e).includes('UR not complete')) break; // some other error
        }
        guard++;
      }
      setPsbtUR(parts.join('\n'));
    } catch (e) {
      setPsbtErr(String(e?.message || e));
    }
  }
  function hexToU8(hex) {
    const h = hex.trim().replace(/^0x/i, '');
    if (h.length % 2) throw new Error('hex length must be even');
    const arr = new Uint8Array(h.length / 2);
    for (let i = 0; i < arr.length; i++) arr[i] = parseInt(h.slice(2*i, 2*i+2), 16);
    return arr;
  }
  function u8ToHex(u8) {
    return Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function genXOnlyHex() {
    // Use core helper which already uses a browser-friendly RNG and ECC lib
    const xonly = generateBurnedInternalKey(); // Buffer of 32 bytes
    return u8ToHex(new Uint8Array(xonly));
  }
  function genPrivAndXonlyHex() {
    // Generate a real private key (32 bytes) and its x-only pubkey
    for (let i = 0; i < 128; i++) {
      const d = new Uint8Array(32);
      if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(d); else for (let j=0;j<32;j++) d[j] = (Math.random()*256)|0;
      const pub = ecc.pointFromScalar(Buffer.from(d), true);
      if (!pub) continue; // invalid scalar
      const xonly = pub.slice(1,33);
      const privHex = u8ToHex(d);
      const xonlyHex = u8ToHex(new Uint8Array(xonly));
      return { privHex, xonlyHex };
    }
    throw new Error('Failed to generate keypair');
  }
  function handleRandomR() {
    try {
      const { privHex, xonlyHex } = genPrivAndXonlyHex();
      setRHex(xonlyHex);
      setRPrivNotice(privHex);
      setSavedRConfirmed(false);
    } catch (e) { setGenError(String(e?.message || e)); }
  }
  function handleRandomS() {
    try {
      const { privHex, xonlyHex } = genPrivAndXonlyHex();
      setSHex(xonlyHex);
      setSPrivNotice(privHex);
    } catch (e) { setGenError(String(e?.message || e)); }
  }
  async function sha256(bytes) {
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return new Uint8Array(buf);
  }
  async function handleComputeH() {
    try {
      setGenError('');
      const msg = new TextEncoder().encode(message || '');
      const h = await sha256(msg);
      setHHex(u8ToHex(h));
    } catch (e) {
      setGenError(String(e?.message || e));
    }
  }

  async function handleGenerate() {
    try {
      setGenError('');
      setClaimBundleUR('');
      setAddress('');
      setP2trOutHex('');
      const R = hexToU8(RHex);
      const S = hexToU8(SHex);
      const h = hHex ? hexToU8(hHex) : await sha256(new TextEncoder().encode(message || ''));
      if (R.length !== 32) throw new Error('R x-only must be 32 bytes');
      if (S.length !== 32) throw new Error('S x-only must be 32 bytes');
      if (h.length !== 32) throw new Error('h must be 32 bytes');
      const { address: addr, leaves, internalPubkey, scriptTree, output } = buildClaimRefundTaproot({ R_xonly: R, S_xonly: S, h32: h, H_exp: Number(expiry) || 0, network });
      setAddress(addr || '');
      setP2trOutHex(Buffer.from(output).toString('hex'));
      // Compute Taproot control block for the claim leaf
      const redeem = { output: leaves.claim, redeemVersion: 0xc0 };
      const p2trRedeem = bitcoin.payments.p2tr({ internalPubkey, scriptTree, redeem, network });
      const witness = p2trRedeem.witness || [];
      const control = witness.length ? witness[witness.length - 1] : new Uint8Array([]);
      // Build claim-bundle CBOR object: note control is currently a placeholder; computed during claim assembly later
      const bundle = {
        ver: 1,
        h_alg: 'sha256',
        h,
        R_pub: R,
        script: leaves.claim,
        leaf_ver: 0xc0,
        control,
        expires_at: Number(expiry) || 0,
      };
      const cbor = cborEncode(bundle);
      const ur = encodeUR('claim-bundle', cbor, 140);
      const parts = [];
      const seen = new Set();
      let guard = 0;
      while (guard < 200) {
        const p = ur.nextPart();
        if (!seen.has(p)) { parts.push(p); seen.add(p); }
        try {
          await decodeUR(parts);
          break; // successful decode
        } catch (e) {
          if (!String(e).includes('UR not complete')) break; // some other error
        }
        guard++;
      }
      setClaimBundleUR(parts.join('\n'));
    } catch (e) {
      setGenError(String(e?.message || e));
    }
  }
  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600 text-white">COLD</div>
      <h1 className="text-2xl font-semibold">Cold Mode (Offline Signer)</h1>
      <p className="text-zinc-500">This mode enforces zero network access via a Service Worker.</p>
      <div className="rounded-xl border p-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-sm">Self‑check: {status}</p>
          <div className="flex gap-2">
            <button onClick={enableCold} className="px-3 py-2 rounded border">Enable Cold Mode</button>
            <button onClick={disableCold} className="px-3 py-2 rounded border">Disable Cold Mode</button>
            <button onClick={checkColdStatus} className="px-3 py-2 rounded border">Re-check</button>
          </div>
        </div>
      </div>

      <section className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Guided Mode</h2>
          <button onClick={()=>setGuidedOpen(v=>!v)} className="text-sm px-2 py-1 rounded border">{guidedOpen ? 'Hide' : 'Show'}</button>
        </div>
        {guidedOpen && (
          <div className="text-sm text-zinc-700 space-y-2">
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Choose network (signet/testnet/mainnet). For your case use <span className="font-mono">testnet</span>.
              </li>
              <li>
                Decide keys:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>R (receiver x-only pubkey). You can reuse the same R across payments or click Random.</li>
                  <li>S (refund signer x-only pubkey). Usually the sender’s pubkey; can be stable per counterparty.</li>
                </ul>
              </li>
              <li>
                Enter a message and click <b>Compute h</b> (uses sha256(message)). Use a new message for each payment.
              </li>
              <li>
                Click <b>Generate Claim Bundle</b>. Copy ALL lines of the UR output (multiple lines starting with <span className="font-mono">ur:claim-bundle/…</span>).
              </li>
              <li>
                Share the Taproot address with the sender. The sender funds that exact address on the same network.
              </li>
              <li>
                After funding, go to <a className="text-blue-600 underline" href="/receiver" target="_self">Receiver</a>, paste the claim-bundle UR, and use “Build Claim PSBT”.
              </li>
            </ol>
            <p className="text-xs text-zinc-500">Note: Cold Mode blocks network calls for this page when enabled. Disable it if you need to fetch anything from the network here.</p>
          </div>
        )}
      </section>
      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">Claim/Refund Address & Claim Bundle</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Network</div>
            <select className="w-full rounded border px-3 py-2" value={networkKey} onChange={e=>setNetworkKey(e.target.value)}>
              <option value="signet">signet</option>
              <option value="testnet">testnet</option>
              <option value="mainnet">mainnet</option>
            </select>
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Expiry height (H_exp)</div>
            <input type="number" className="w-full rounded border px-3 py-2" value={expiry} onChange={e=>setExpiry(Number(e.target.value)||0)} />
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">R x-only pubkey (32-byte hex)</div>
            <div className="flex gap-2">
              <input className="w-full rounded border px-3 py-2 font-mono" value={RHex} onChange={e=>{setRHex(e.target.value); setSavedRConfirmed(false);}} placeholder="e.g., 32-byte hex" />
              <button onClick={handleRandomR} type="button" className="px-2 rounded border text-sm">Random</button>
            </div>
            {rPrivNotice && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-1">
                Generated R private key (hex): <span className="font-mono break-all">{rPrivNotice}</span><br />
                Copy and store this securely. Without it, you cannot claim.
              </div>
            )}
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-700">
              <input type="checkbox" checked={savedRConfirmed} onChange={e=>setSavedRConfirmed(e.target.checked)} />
              <span>I control and have saved the private key corresponding to this R_pub.</span>
            </label>
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">S x-only pubkey (refund signer) (32-byte hex)</div>
            <div className="flex gap-2">
              <input className="w-full rounded border px-3 py-2 font-mono" value={SHex} onChange={e=>setSHex(e.target.value)} placeholder="e.g., 32-byte hex" />
              <button onClick={handleRandomS} type="button" className="px-2 rounded border text-sm">Random</button>
            </div>
            {sPrivNotice && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-1">
                Generated S private key (hex): <span className="font-mono break-all">{sPrivNotice}</span><br />
                This is for refund path after expiry. In production, the sender should supply S pubkey and keep their private key.
              </div>
            )}
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Message (for h = sha256(message))</div>
            <input className="w-full rounded border px-3 py-2" value={message} onChange={e=>setMessage(e.target.value)} />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">h (32-byte hex, optional; overrides message)</div>
            <input className="w-full rounded border px-3 py-2 font-mono" value={hHex} onChange={e=>setHHex(e.target.value)} />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleComputeH} className="px-3 py-2 rounded border">Compute h</button>
          <button onClick={handleGenerate} disabled={!savedRConfirmed} className={`px-3 py-2 rounded text-white ${savedRConfirmed? 'bg-blue-600' : 'bg-blue-300 cursor-not-allowed'}`}>Generate Claim Bundle</button>
          {!!genError && <div className="text-sm text-red-600">{genError}</div>}
        </div>
        {address && (
          <div className="text-sm">
            <div className="text-zinc-500">Generated Taproot Address</div>
            <div className="font-mono break-all">{address}</div>
          </div>
        )}
        {claimBundleUR && (
          <div className="text-sm space-y-1">
            <div className="text-zinc-500">Claim Bundle (UR part)</div>
            <textarea className="w-full rounded border px-3 py-2 font-mono min-h-[80px]" readOnly value={claimBundleUR} />
            <div className="text-xs text-zinc-500">Paste this UR on the Receiver page and click "Decode Claim"</div>
          </div>
        )}
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <h2 className="font-semibold">Funding PSBT</h2>
        <p className="text-sm text-zinc-500">Paste UTXOs JSON and parameters to build a PSBT paying to the claim leaf.</p>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">UTXOs (JSON array)</div>
            <textarea className="w-full rounded border px-3 py-2 font-mono min-h-[120px]" value={utxosJson} onChange={e=>setUtxosJson(e.target.value)} />
            <div className="text-xs text-zinc-500">Each item: txid, vout, value, scriptHex. Value in sats. Example scriptHex for P2WPKH is the witness output script (e.g., 0014...)</div>
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Send value (sats)</div>
            <input type="number" className="w-full rounded border px-3 py-2" value={sendValueSat} onChange={e=>setSendValueSat(Number(e.target.value)||0)} />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Fee rate (sat/vB)</div>
            <input type="number" className="w-full rounded border px-3 py-2" value={feeRate} onChange={e=>setFeeRate(Number(e.target.value)||1)} />
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">Change address (optional)</div>
            <input className="w-full rounded border px-3 py-2" value={changeAddress} onChange={e=>setChangeAddress(e.target.value)} />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleBuildFunding} className="px-3 py-2 rounded bg-emerald-600 text-white">Build PSBT</button>
          {!!psbtErr && <div className="text-sm text-red-600">{psbtErr}</div>}
        </div>
        {psbtB64 && (
          <div className="text-sm space-y-1">
            <div className="text-zinc-500">PSBT (base64)</div>
            <textarea className="w-full rounded border px-3 py-2 font-mono min-h-[80px]" readOnly value={psbtB64} />
          </div>
        )}
        {psbtUR && (
          <div className="text-sm space-y-1">
            <div className="text-zinc-500">PSBT (UR part)</div>
            <textarea className="w-full rounded border px-3 py-2 font-mono min-h-[80px]" readOnly value={psbtUR} />
            <div className="text-xs text-zinc-500">Scan or transfer this to your signing device/app.</div>
          </div>
        )}
      </div>
    </main>
  );
}
