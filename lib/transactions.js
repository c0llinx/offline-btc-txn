"use client";

/**
 * Transaction tracker for offline Bitcoin transactions.
 * Persists initiated transactions to track claim/refund status.
 */

const STORAGE_KEY = "offline-txn-tracker-v1";

/**
 * Transaction status values:
 * - pending: Created, waiting for claim or expiry
 * - claimed: Receiver has claimed the funds
 * - refundable: Expiry reached, funds still unspent
 * - refunded: Sender has reclaimed funds
 */
export const TXN_STATUS = {
  PENDING: "pending",
  CLAIMED: "claimed",
  REFUNDABLE: "refundable",
  REFUNDED: "refunded",
  CANCELLED: "cancelled",
};

function getStorage()
{
  if (typeof window === "undefined") return null;
  try
  {
    return window.localStorage;
  } catch
  {
    return null;
  }
}

function notifyChange()
{
  if (typeof window === "undefined") return;
  try
  {
    window.dispatchEvent(new Event("offline-txn-change"));
  } catch { }
}

/**
 * Load all tracked transactions from localStorage.
 * @returns {Array} Array of transaction objects
 */
export function loadTransactions()
{
  const storage = getStorage();
  if (!storage) return [];
  try
  {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch
  {
    return [];
  }
}

/**
 * Save a new transaction to storage.
 * @param {Object} tx Transaction object
 * @returns {Object} The saved transaction with generated ID
 */
export function saveTransaction(tx)
{
  const storage = getStorage();
  if (!storage) throw new Error("Storage unavailable");

  const transactions = loadTransactions();
  const newTx = {
    id: generateId(),
    createdAt: Date.now(),
    status: TXN_STATUS.PENDING,
    ...tx,
  };

  transactions.push(newTx);
  storage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  notifyChange();
  return newTx;
}

/**
 * Update an existing transaction by ID.
 * @param {string} id Transaction ID
 * @param {Object} updates Fields to update
 * @returns {Object|null} Updated transaction or null if not found
 */
export function updateTransaction(id, updates)
{
  const storage = getStorage();
  if (!storage) return null;

  const transactions = loadTransactions();
  const index = transactions.findIndex((tx) => tx.id === id);
  if (index < 0) return null;

  transactions[index] = { ...transactions[index], ...updates, updatedAt: Date.now() };
  storage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  notifyChange();
  return transactions[index];
}

/**
 * Delete a transaction by ID.
 * @param {string} id Transaction ID
 * @returns {boolean} True if deleted
 */
export function deleteTransaction(id)
{
  const storage = getStorage();
  if (!storage) return false;

  const transactions = loadTransactions();
  const filtered = transactions.filter((tx) => tx.id !== id);
  if (filtered.length === transactions.length) return false;

  storage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  notifyChange();
  return true;
}

/**
 * Get transactions for a specific wallet.
 * @param {string} walletId Wallet ID
 * @returns {Array} Transactions for the wallet
 */
export function getTransactionsByWallet(walletId)
{
  return loadTransactions().filter((tx) => tx.senderWalletId === walletId);
}

/**
 * Get a single transaction by ID.
 * @param {string} id Transaction ID
 * @returns {Object|null} Transaction or null
 */
export function getTransactionById(id)
{
  return loadTransactions().find((tx) => tx.id === id) || null;
}

/**
 * Get transactions that are refundable (expiry passed, still pending).
 * @param {number} currentHeight Current block height
 * @returns {Array} Refundable transactions
 */
export function getRefundableTransactions(currentHeight)
{
  return loadTransactions().filter(
    (tx) => tx.status === TXN_STATUS.PENDING && tx.expiryHeight <= currentHeight
  );
}

/**
 * Batch update transaction statuses based on current block height.
 * @param {number} currentHeight Current block height
 * @returns {Array} Updated transactions
 */
export function updateStatusesByHeight(currentHeight)
{
  const storage = getStorage();
  if (!storage) return [];

  const transactions = loadTransactions();
  let changed = false;

  for (const tx of transactions)
  {
    if (tx.status === TXN_STATUS.PENDING && tx.expiryHeight <= currentHeight)
    {
      tx.status = TXN_STATUS.REFUNDABLE;
      tx.updatedAt = Date.now();
      changed = true;
    }
  }

  if (changed)
  {
    storage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    notifyChange();
  }

  return transactions;
}

/**
 * Generate a unique transaction ID.
 */
function generateId()
{
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `txn-${timestamp}-${random}`;
}

/**
 * Clear all transactions (for testing/debugging).
 */
export function clearAllTransactions()
{
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(STORAGE_KEY);
  notifyChange();
}
