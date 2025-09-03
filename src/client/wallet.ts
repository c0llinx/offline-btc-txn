interface Wallet {
  name: string;
  address: string;
  privateKey: string;
  publicKey: string;
  addressType: 'p2wpkh' | 'p2tr' | 'p2sh';
  balance: number;
  created: string;
}

interface Transaction {
  txid: string;
  type: 'sent' | 'received';
  amount: number;
  fee?: number;
  address: string;
  timestamp: string;
  confirmations: number;
  status: 'confirmed' | 'pending' | 'failed';
  explorerUrl: string;
}

class BitcoinWallet {
  private currentWallet: Wallet | null = null;
  private wallets: Wallet[] = [];
  private transactions: Transaction[] = [];

  constructor() {
    console.log('BitcoinWallet constructor called');
    this.loadWallets();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    console.log('Setting up event listeners');
    
    // Create wallet form
    const createForm = document.getElementById('create-wallet-form') as HTMLFormElement;
    console.log('Create form found:', !!createForm);
    createForm?.addEventListener('submit', (e) => this.handleCreateWallet(e));

    // Import wallet form
    const importForm = document.getElementById('import-wallet-form') as HTMLFormElement;
    console.log('Import form found:', !!importForm);
    importForm?.addEventListener('submit', (e) => this.handleImportWallet(e));

    // Send form
    const sendForm = document.getElementById('send-form') as HTMLFormElement;
    console.log('Send form found:', !!sendForm);
    sendForm?.addEventListener('submit', (e) => this.handleSendTransaction(e));

    // Tab buttons
    const tabButtons = document.querySelectorAll('.tab-btn');
    console.log('Tab buttons found:', tabButtons.length);
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabName = (e.target as HTMLElement).getAttribute('data-tab');
        console.log('Tab clicked:', tabName);
        if (tabName) this.switchTab(tabName);
      });
    });

    // Quick action buttons
    document.querySelectorAll('[data-tab]').forEach(btn => {
      if (!btn.classList.contains('tab-btn')) { // Skip tab buttons, handle quick actions
        btn.addEventListener('click', (e) => {
          const tabName = (e.target as HTMLElement).getAttribute('data-tab');
          if (tabName) this.switchTab(tabName);
        });
      }
    });

    // Refresh balance button
    const refreshBtn = document.getElementById('refresh-balance-btn');
    refreshBtn?.addEventListener('click', () => this.refreshBalance());

    // Copy buttons (delegated event listener)
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('copy-btn')) {
        const textToCopy = target.getAttribute('data-copy');
        if (textToCopy) this.copyToClipboard(textToCopy);
      }
    });
  }

  private async handleCreateWallet(e: Event) {
    e.preventDefault();
    this.hideError();
    this.showLoading();

    try {
      const formData = new FormData(e.target as HTMLFormElement);
      const walletName = formData.get('wallet-name') as string;
      const addressType = formData.get('address-type') as 'p2wpkh' | 'p2tr' | 'p2sh';

      const response = await fetch('/api/wallet/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: walletName, addressType })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create wallet');
      }

      const wallet: Wallet = await response.json();
      this.addWallet(wallet);
      this.setCurrentWallet(wallet);
      this.displayNewWalletResult(wallet);
      
      // Reset form
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      this.showError(error instanceof Error ? error.message : 'Failed to create wallet');
    } finally {
      this.hideLoading();
    }
  }

  private async handleImportWallet(e: Event) {
    e.preventDefault();
    this.hideError();
    this.showLoading();

    try {
      const formData = new FormData(e.target as HTMLFormElement);
      const walletName = formData.get('wallet-name') as string;
      const privateKey = formData.get('private-key') as string;

      const response = await fetch('/api/wallet/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: walletName, privateKey: privateKey.trim() })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to import wallet');
      }

      const wallet: Wallet = await response.json();
      this.addWallet(wallet);
      this.setCurrentWallet(wallet);
      this.displayImportWalletResult(wallet);
      
      // Reset form
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      this.showError(error instanceof Error ? error.message : 'Failed to import wallet');
    } finally {
      this.hideLoading();
    }
  }

  private async handleSendTransaction(e: Event) {
    e.preventDefault();
    this.hideError();

    if (!this.currentWallet) {
      this.showError('No wallet loaded. Please create or import a wallet first.');
      return;
    }

    this.showLoading();

    try {
      const formData = new FormData(e.target as HTMLFormElement);
      const recipientAddress = formData.get('recipient-address') as string;
      const amount = Number(formData.get('amount'));
      const feeRate = Number(formData.get('fee-rate'));

      const response = await fetch('/api/wallet/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAddress: this.currentWallet.address,
          privateKey: this.currentWallet.privateKey,
          toAddress: recipientAddress,
          amount,
          feeRate
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send transaction');
      }

      const result = await response.json();
      this.displaySendResult(result);
      this.refreshBalance();
      
      // Reset form
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      this.showError(error instanceof Error ? error.message : 'Failed to send transaction');
    } finally {
      this.hideLoading();
    }
  }

  private addWallet(wallet: Wallet) {
    // Remove existing wallet with same address
    this.wallets = this.wallets.filter(w => w.address !== wallet.address);
    this.wallets.push(wallet);
    this.saveWallets();
  }

  private setCurrentWallet(wallet: Wallet) {
    this.currentWallet = wallet;
    this.updateWalletDisplay();
    this.loadTransactionHistory();
  }

  private updateWalletDisplay() {
    const walletInfoDiv = document.getElementById('current-wallet-info')!;
    const receiveInfoDiv = document.getElementById('receive-address-info')!;

    if (this.currentWallet) {
      walletInfoDiv.innerHTML = `
        <div class="wallet-info">
          <h3>${this.currentWallet.name}</h3>
          <div class="address-display">
            ${this.currentWallet.address}
            <button class="copy-btn" data-copy="${this.currentWallet.address}">Copy</button>
          </div>
          <div class="balance">Balance: ${this.currentWallet.balance.toLocaleString()} satoshis</div>
          <p><strong>Type:</strong> ${this.currentWallet.addressType.toUpperCase()}</p>
          <p><strong>Created:</strong> ${new Date(this.currentWallet.created).toLocaleDateString()}</p>
        </div>
      `;

      // Update receive tab
      this.generateReceiveQR();
    } else {
      walletInfoDiv.innerHTML = '<p>No wallet loaded. Create or import a wallet to get started.</p>';
      receiveInfoDiv.innerHTML = '<p>Load a wallet first to generate receiving addresses.</p>';
    }
  }

  private async generateReceiveQR() {
    const receiveInfoDiv = document.getElementById('receive-address-info')!;
    
    if (!this.currentWallet) return;

    receiveInfoDiv.innerHTML = `
      <div class="wallet-info">
        <h3>Receive Bitcoin</h3>
        <div class="address-display">
          ${this.currentWallet.address}
          <button class="copy-btn" data-copy="${this.currentWallet.address}">Copy Address</button>
        </div>
        <div class="qr-display" id="receive-qr"></div>
        <p><strong>Instructions:</strong></p>
        <ul>
          <li>Share this address to receive testnet Bitcoin</li>
          <li>Use testnet faucets to fund your wallet</li>
          <li>Monitor balance updates in Overview tab</li>
        </ul>
      </div>
    `;

    // Generate QR code
    try {
      const canvas = document.createElement('canvas');
      await (window as any).QRCode.toCanvas(canvas, this.currentWallet.address, {
        width: 200,
        margin: 2
      });
      const qrDiv = document.getElementById('receive-qr')!;
      qrDiv.appendChild(canvas);
    } catch (error) {
      console.error('QR generation failed:', error);
    }
  }

  private displayNewWalletResult(wallet: Wallet) {
    const resultDiv = document.getElementById('new-wallet-result')!;
    resultDiv.innerHTML = `
      <div class="success">
        <h3>Wallet Created Successfully!</h3>
        <p><strong>Name:</strong> ${wallet.name}</p>
        <div class="address-display">
          <strong>Address:</strong> ${wallet.address}
          <button class="copy-btn" data-copy="${wallet.address}">Copy</button>
        </div>
        <div class="address-display">
          <strong>Private Key:</strong> ${wallet.privateKey}
          <button class="copy-btn" data-copy="${wallet.privateKey}">Copy</button>
        </div>
        <p><strong>⚠️ Important:</strong> Save your private key securely. It cannot be recovered if lost!</p>
      </div>
    `;
  }

  private displayImportWalletResult(wallet: Wallet) {
    const resultDiv = document.getElementById('import-wallet-result')!;
    resultDiv.innerHTML = `
      <div class="success">
        <h3>Wallet Imported Successfully!</h3>
        <p><strong>Name:</strong> ${wallet.name}</p>
        <div class="address-display">
          <strong>Address:</strong> ${wallet.address}
          <button class="copy-btn" data-copy="${wallet.address}">Copy</button>
        </div>
        <div class="balance">Balance: ${wallet.balance.toLocaleString()} satoshis</div>
      </div>
    `;
  }

  private displaySendResult(result: any) {
    const sendResultDiv = document.getElementById('send-result')!;
    sendResultDiv.innerHTML = `
      <div class="success">
        <h3>Transaction Sent Successfully!</h3>
        <p><strong>Transaction ID:</strong></p>
        <div class="address-display">
          ${result.txid}
          <button class="copy-btn" data-copy="${result.txid}">Copy</button>
        </div>
        <p><strong>Fee:</strong> ${result.fee} satoshis</p>
        <p><a href="${result.explorerUrl}" target="_blank" style="color: #0d6efd;">View on Testnet Explorer →</a></p>
      </div>
    `;
  }

  public async refreshBalance() {
    if (!this.currentWallet) return;
    
    this.showLoading();
    try {
      const response = await fetch(`/api/wallet/balance/${this.currentWallet.address}`);
      const balanceInfo = await response.json();
      
      this.currentWallet.balance = balanceInfo.balance;
      this.updateWalletDisplay();
      this.saveWallets();
    } catch (error) {
      this.showError('Failed to refresh balance');
    } finally {
      this.hideLoading();
    }
  }

  private async loadTransactionHistory() {
    if (!this.currentWallet) return;

    try {
      const response = await fetch(`/api/wallet/history/${this.currentWallet.address}`);
      const history = await response.json();
      this.transactions = history.transactions || [];
      this.displayTransactionHistory();
    } catch (error) {
      console.error('Failed to load transaction history:', error);
    }
  }

  private displayTransactionHistory() {
    const historyDiv = document.getElementById('transaction-history')!;
    
    if (this.transactions.length === 0) {
      historyDiv.innerHTML = '<p>No transactions found.</p>';
      return;
    }

    const transactionItems = this.transactions.map(tx => `
      <div class="transaction-item">
        <div class="tx-info">
          <div class="tx-amount ${tx.type === 'sent' ? 'negative' : ''}">${tx.type === 'sent' ? '-' : '+'}${tx.amount.toLocaleString()} sats</div>
          <div class="tx-id">${tx.txid}</div>
          <div style="font-size: 0.9rem; color: #6c757d;">
            ${tx.type === 'sent' ? 'To: ' + tx.address : 'From: ' + tx.address}
            ${tx.fee ? ` • Fee: ${tx.fee} sats` : ''}
          </div>
        </div>
        <div>
          <div style="font-size: 0.9rem; color: ${tx.status === 'confirmed' ? '#198754' : '#ffc107'};">
            ${tx.status} (${tx.confirmations} conf)
          </div>
          <a href="${tx.explorerUrl}" target="_blank" style="font-size: 0.8rem;">View →</a>
        </div>
      </div>
    `).join('');

    historyDiv.innerHTML = `<div class="transaction-list">${transactionItems}</div>`;
  }

  private loadWallets() {
    const stored = localStorage.getItem('bitcoin-wallets');
    if (stored) {
      this.wallets = JSON.parse(stored);
      if (this.wallets.length > 0) {
        this.setCurrentWallet(this.wallets[0]);
      }
    }
  }

  private saveWallets() {
    localStorage.setItem('bitcoin-wallets', JSON.stringify(this.wallets));
  }

  private showLoading() {
    document.getElementById('loading')?.classList.remove('hidden');
  }

  private hideLoading() {
    document.getElementById('loading')?.classList.add('hidden');
  }

  private showError(message: string) {
    const errorDiv = document.getElementById('error-display')!;
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    setTimeout(() => errorDiv.classList.add('hidden'), 5000);
  }

  private hideError() {
    document.getElementById('error-display')?.classList.add('hidden');
  }

  private switchTab(tabName: string) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
      tab.classList.remove('active');
    });
    
    // Remove active class from all tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(`${tabName}-tab`)?.classList.add('active');
    
    // Add active class to the correct button
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      }
    });
  }

  private copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      console.log('Copied to clipboard:', text);
      // Could add a toast notification here
    }).catch(err => {
      console.error('Failed to copy:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    });
  }
}

// Initialize wallet when page loads
document.addEventListener('DOMContentLoaded', () => {
  new BitcoinWallet();
});