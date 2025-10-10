"use client";

import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";

const STORAGE_KEY = "offline-wallets-v1";
const ACTIVE_KEY = "offline-wallets-active";

let eccReady = false;

function ensureEcc() {
  if (!eccReady) {
    bitcoin.initEccLib(ecc);
    eccReady = true;
  }
}

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function notifyChange() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event("offline-wallets-change"));
  } catch {
    // noop
  }
}

function withDefaults(wallet) {
  return {
    ...wallet,
    balanceSats: typeof wallet.balanceSats === "number" ? wallet.balanceSats : 0,
    history: Array.isArray(wallet.history) ? wallet.history : [],
    lastRefreshedAt: wallet.lastRefreshedAt || null,
    pendingDelta: typeof wallet.pendingDelta === "number" ? wallet.pendingDelta : 0,
  };
}

function toJSON(wallets) {
  return wallets.map((w) => ({
    ...w,
    createdAt: w.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    balanceSats: typeof w.balanceSats === "number" ? w.balanceSats : 0,
    history: Array.isArray(w.history) ? w.history : [],
    lastRefreshedAt: w.lastRefreshedAt || null,
    pendingDelta: typeof w.pendingDelta === "number" ? w.pendingDelta : 0,
  }));
}

export function loadWallets() {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((w) => ({
      ...w,
      createdAt: w.createdAt || new Date().toISOString(),
      updatedAt: w.updatedAt || w.createdAt || new Date().toISOString(),
      balanceSats: typeof w.balanceSats === "number" ? w.balanceSats : 0,
      history: Array.isArray(w.history) ? w.history : [],
      lastRefreshedAt: w.lastRefreshedAt || null,
      pendingDelta: typeof w.pendingDelta === "number" ? w.pendingDelta : 0,
    }));
  } catch {
    return [];
  }
}

export function saveWallets(wallets) {
  const storage = getStorage();
  if (!storage) return;
  const payload = JSON.stringify(toJSON(wallets), null, 2);
  storage.setItem(STORAGE_KEY, payload);
  notifyChange();
}

export function getActiveWalletId() {
  const storage = getStorage();
  if (!storage) return null;
  return storage.getItem(ACTIVE_KEY);
}

export function setActiveWalletId(id) {
  const storage = getStorage();
  if (!storage) return;
  if (id) {
    storage.setItem(ACTIVE_KEY, id);
  } else {
    storage.removeItem(ACTIVE_KEY);
  }
  notifyChange();
}

export function getActiveWallet() {
  const activeId = getActiveWalletId();
  if (!activeId) return null;
  return loadWallets().find((w) => w.id === activeId) || null;
}

function resolveNetwork(networkKey = "testnet4") {
  if (networkKey === "mainnet") return { key: "mainnet", params: bitcoin.networks.bitcoin };
  if (networkKey === "testnet" || networkKey === "signet" || networkKey === "testnet4") {
    return { key: "testnet4", params: bitcoin.networks.testnet };
  }
  return { key: "testnet4", params: bitcoin.networks.testnet };
}

function createWalletObject({ key, params }, pair) {
  ensureEcc();
  const pubkey = pair.publicKey || ecc.pointFromScalar(pair.privateKey, true);
  if (!pubkey) throw new Error("Failed to derive public key");
  const xonly = Buffer.from(pubkey.slice(1, 33));
  const p2wpkh = bitcoin.payments.p2wpkh({ pubkey, network: params });
  const p2tr = bitcoin.payments.p2tr({ internalPubkey: xonly, network: params });
  const now = new Date().toISOString();
  const globalCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  const entropy = globalCrypto?.getRandomValues
    ? globalCrypto.getRandomValues(new Uint32Array(2))
    : [Math.floor(Math.random() * 1e9), Math.floor(Math.random() * 1e9)];
  const id = `${key}-${Buffer.from(pubkey.slice(-4)).toString("hex")}-${entropy[0].toString(
    36,
  )}${entropy[1]?.toString(36) || ""}`;
  return {
    id,
    label: `Wallet ${now.slice(11, 19)}`,
    network: key,
    wif: pair.toWIF(),
    publicKeyHex: Buffer.from(pubkey).toString("hex"),
    xOnlyHex: xonly.toString("hex"),
    p2wpkh: p2wpkh.address || "",
    p2tr: p2tr.address || "",
    createdAt: now,
    updatedAt: now,
    note: "",
    balanceSats: 0,
    history: [],
    lastRefreshedAt: null,
    pendingDelta: 0,
  };
}

export function generateWallet(networkKey = "testnet4") {
  ensureEcc();
  const { key, params } = resolveNetwork(networkKey);
  const ECPair = ECPairFactory(ecc);
  const pair = ECPair.makeRandom({ network: params });
  return withDefaults(createWalletObject({ key, params }, pair));
}

export function walletFromWIF(wif, label) {
  ensureEcc();
  const trimmed = (wif || "").trim();
  if (!trimmed) throw new Error("WIF is required");
  const ECPair = ECPairFactory(ecc);
  const pair = ECPair.fromWIF(trimmed);
  const pairNetwork = pair.network || bitcoin.networks.testnet;
  const isMainnet = pairNetwork === bitcoin.networks.bitcoin;
  const networkGuess = isMainnet ? "mainnet" : "testnet4";
  const { key, params } = resolveNetwork(networkGuess);
  const wallet = createWalletObject({ key, params }, pair);
  wallet.wif = trimmed;
  if (label) wallet.label = label;
  return withDefaults(wallet);
}

export function upsertWallet(wallet) {
  const wallets = loadWallets();
  const existingIndex = wallets.findIndex((w) => w.id === wallet.id);
  if (existingIndex >= 0) {
    wallets[existingIndex] = {
      ...withDefaults(wallets[existingIndex]),
      ...withDefaults(wallet),
      updatedAt: new Date().toISOString(),
    };
  } else {
    wallets.push(withDefaults(wallet));
  }
  saveWallets(wallets);
  return wallets;
}

export function deleteWallet(id) {
  const wallets = loadWallets().filter((w) => w.id !== id);
  saveWallets(wallets);
  const activeId = getActiveWalletId();
  if (activeId === id) {
    setActiveWalletId(wallets[0]?.id || null);
  }
  notifyChange();
  return wallets;
}

export function renameWallet(id, label) {
  const wallets = loadWallets();
  const idx = wallets.findIndex((w) => w.id === id);
  if (idx === -1) return wallets;
  wallets[idx] = {
    ...wallets[idx],
    label: label || wallets[idx].label,
    updatedAt: new Date().toISOString(),
  };
  saveWallets(wallets);
  return wallets;
}

export function markWalletNote(id, note) {
  const wallets = loadWallets();
  const idx = wallets.findIndex((w) => w.id === id);
  if (idx === -1) return wallets;
  wallets[idx] = {
    ...wallets[idx],
    note: note ?? "",
    updatedAt: new Date().toISOString(),
  };
  saveWallets(wallets);
  return wallets;
}

function createEvent({ type, amountSats, description, relatedAddress, txid, source }) {
  const now = new Date().toISOString();
  const entropy = Math.random().toString(36).slice(2, 10);
  return {
    id: `${now}-${entropy}`,
    type,
    amountSats: Math.abs(Math.trunc(amountSats ?? 0)),
    description: description || "",
    relatedAddress: relatedAddress || "",
    txid: txid || "",
    timestamp: now,
    source: source || "manual",
  };
}

export function recordWalletEvent({
  walletId,
  type,
  amountSats,
  description,
  relatedAddress,
  txid,
  source,
}) {
  if (!walletId || !type || !amountSats) return null;
  const wallets = loadWallets();
  const idx = wallets.findIndex((w) => w.id === walletId);
  if (idx === -1) return null;

  const entry = createEvent({ type, amountSats, description, relatedAddress, txid, source });
  const sign = type === "receive" ? 1 : type === "send" ? -1 : 0;
  const currentBalance = typeof wallets[idx].balanceSats === "number" ? wallets[idx].balanceSats : 0;
  const updatedBalance = currentBalance + sign * entry.amountSats;

  const shouldMarkRefresh = source === "sync" || type === "adjust";
  wallets[idx] = {
    ...wallets[idx],
    balanceSats: updatedBalance,
    lastRefreshedAt: shouldMarkRefresh ? entry.timestamp : wallets[idx].lastRefreshedAt,
    updatedAt: entry.timestamp,
    history: [entry, ...(wallets[idx].history || [])].slice(0, 50),
  };

  saveWallets(wallets);
  return wallets[idx];
}

export function setWalletBalance(
  walletId,
  newBalanceSats,
  description = "Manual adjustment",
  source = "manual",
) {
  const wallets = loadWallets();
  const idx = wallets.findIndex((w) => w.id === walletId);
  if (idx === -1) return null;
  const current = typeof wallets[idx].balanceSats === "number" ? wallets[idx].balanceSats : 0;
  const delta = Math.trunc(newBalanceSats) - current;
  if (delta === 0) {
    wallets[idx] = {
      ...wallets[idx],
      balanceSats: current,
      lastRefreshedAt: new Date().toISOString(),
    };
    saveWallets(wallets);
    return wallets[idx];
  }
  const type = delta >= 0 ? "receive" : "send";
  return recordWalletEvent({
    walletId,
    type,
    amountSats: Math.abs(delta),
    description,
    source,
  });
}
