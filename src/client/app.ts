import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';

interface OfflineTxoData {
  txid: string;
  vout: number;
  value: number;
  taprootAddress: string;
  senderPublicKey: string;
  refundTimeLock: number;
}

interface SenderData extends OfflineTxoData {
  preimage: string;
}

type WorkflowTab = 'sender' | 'receiver' | 'refund';

class OfflineBtcApp {
  // --- UI Elements ---
  private tabSender: HTMLElement;
  private tabReceiver: HTMLElement;
  private tabRefund: HTMLElement;
  private sectionSender: HTMLElement;
  private sectionReceiver: HTMLElement;
  private sectionRefund: HTMLElement;
  private qrCodeA: HTMLElement;
  private qrCodeB: HTMLElement;
  private senderResults: HTMLElement;
  private receiverScannerDiv: HTMLElement;
  private receiverForm: HTMLFormElement;
  private refundScannerDiv: HTMLElement;
  private refundForm: HTMLFormElement;
  private loadingDiv: HTMLElement;
  private errorDiv: HTMLElement;
  private generateSenderBtn: HTMLElement;
  private senderWifInput: HTMLInputElement;
  private generateReceiverBtn: HTMLElement;
  private receiverWifInput: HTMLInputElement;
  private receiverGeneratedDiv: HTMLElement;
  // Clipboard buttons
  private pasteTxBtn: HTMLElement;
  private pasteSecretBtn: HTMLElement;
  private toastDiv: HTMLElement;

  // --- State ---
  private activeTab: WorkflowTab = 'sender';
  private scannedTxoData: OfflineTxoData | null = null;
  private scannedPreimage: string | null = null;
  private receiverScanner: Html5Qrcode | null = null;
  private refundScanner: Html5Qrcode | null = null;

  constructor() {
    // Get UI elements
    this.tabSender = document.getElementById('tab-sender')!;
    this.tabReceiver = document.getElementById('tab-receiver')!;
    this.tabRefund = document.getElementById('tab-refund')!;
    this.sectionSender = document.getElementById('section-sender')!;
    this.sectionReceiver = document.getElementById('section-receiver')!;
    this.sectionRefund = document.getElementById('section-refund')!;
    this.qrCodeA = document.getElementById('qrcode-a')!;
    this.qrCodeB = document.getElementById('qrcode-b')!;
    this.senderResults = document.getElementById('sender-results')!;
    this.receiverScannerDiv = document.getElementById('receiver-scanner-div')!;
    this.receiverForm = document.getElementById('receiver-form') as HTMLFormElement;
    this.refundScannerDiv = document.getElementById('refund-scanner-div')!;
    this.refundForm = document.getElementById('refund-form') as HTMLFormElement;
    this.loadingDiv = document.getElementById('loading')!;
    this.errorDiv = document.getElementById('error')!;

    // Key generation elements
    this.generateSenderBtn = document.getElementById('generate-sender-wif-btn')!;
    this.senderWifInput = document.getElementById('sender-wif-input') as HTMLInputElement;
    this.generateReceiverBtn = document.getElementById('generate-receiver-wif-btn')!;
    this.receiverWifInput = document.getElementById('receiver-wif-input') as HTMLInputElement;
    this.receiverGeneratedDiv = document.getElementById('receiver-generated-address')!;
    this.pasteTxBtn = document.getElementById('paste-tx-btn')!;
    this.pasteSecretBtn = document.getElementById('paste-secret-btn')!;
    this.toastDiv = document.getElementById('toast')!;
    this.pasteTxBtn.addEventListener('click', () => this.handlePasteTx());
    this.pasteSecretBtn.addEventListener('click', () => this.handlePasteSecret());

    // Tab switching
    this.tabSender.addEventListener('click', () => this.switchTab('sender'));
    this.tabReceiver.addEventListener('click', () => this.switchTab('receiver'));
    this.tabRefund.addEventListener('click', () => this.switchTab('refund'));

    // Sender form
    document.getElementById('sender-form')!.addEventListener('submit', e => this.handleSenderSubmit(e));
    // Receiver scan
    document.getElementById('start-receiver-scan-btn')!.addEventListener('click', () => this.startReceiverScanner());
    this.receiverForm.addEventListener('submit', e => this.handleReceiverSubmit(e));
    // Refund scan
    document.getElementById('start-refund-scan-btn')!.addEventListener('click', () => this.startRefundScanner());
    this.refundForm.addEventListener('submit', e => this.handleRefundSubmit(e));

    // Key generation handlers
    this.generateSenderBtn.addEventListener('click', () => this.handleGenerateSender());
    this.generateReceiverBtn.addEventListener('click', () => this.handleGenerateReceiver());

    // Hide all errors/loading on start
    this.hideLoading();
    this.clearError();
    this.switchTab('sender');
  }

  private switchTab(tab: WorkflowTab) {
    this.activeTab = tab;
    this.sectionSender.style.display = tab === 'sender' ? 'block' : 'none';
    this.sectionReceiver.style.display = tab === 'receiver' ? 'block' : 'none';
    this.sectionRefund.style.display = tab === 'refund' ? 'block' : 'none';
    // (Tab highlight logic omitted for brevity)
  }

  // --- Sender Workflow ---
  private async handleSenderSubmit(e: Event) {
    e.preventDefault();
    this.hideError();
    this.showLoading('Creating sender transaction...');
    try {
      const formData = new FormData(e.target as HTMLFormElement);
      const senderWif = formData.get('sender-wif') as string;
      const receiverAddress = formData.get('receiver-address') as string;
      const amount = Number(formData.get('amount'));
      const refundLocktime = Number(formData.get('refund-locktime'));
      const resp = await fetch('/api/create-sender-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderWif, receiverAddress, amount, refundLocktime })
      });
      if (!resp.ok) throw new Error((await resp.json()).message || 'Failed to create transaction');
      const data: SenderData = await resp.json();
      this.displaySenderResults(data);
    } catch (err: any) {
      this.showError(err.message || String(err));
    } finally {
      this.hideLoading();
    }
  }

  private displaySenderResults(data: SenderData) {
    this.qrCodeA.innerHTML = '';
    this.qrCodeB.innerHTML = '';
    const canvasA = document.createElement('canvas');
QRCode.toCanvas(canvasA, JSON.stringify(data), { width: 256 }, (error: Error | null | undefined) => {
  if (error) throw error;
  this.qrCodeA.appendChild(canvasA);
});
const canvasB = document.createElement('canvas');
QRCode.toCanvas(canvasB, data.preimage, { width: 256 }, (error: Error | null | undefined) => {
  if (error) throw error;
  this.qrCodeB.appendChild(canvasB);
});
      const copyTxBtn = document.createElement('button');
  copyTxBtn.textContent = 'Copy Tx Data';
  copyTxBtn.className = 'btn btn-secondary';
  copyTxBtn.style.marginTop = '10px';
  copyTxBtn.addEventListener('click', async () => {
    try {
      const ok = await this.copyToClipboard(JSON.stringify(data));
      this.showToast(ok ? 'Tx data copied to clipboard' : 'Failed to copy', ok);
    } catch {
      this.showToast('Failed to copy', false);
    }
  });
  this.qrCodeA.appendChild(copyTxBtn);

  const copySecretBtn = document.createElement('button');
  copySecretBtn.textContent = 'Copy Secret';
  copySecretBtn.className = 'btn btn-secondary';
  copySecretBtn.style.marginTop = '10px';
  copySecretBtn.style.marginLeft = '10px';
  copySecretBtn.addEventListener('click', async () => {
    try {
      const ok = await this.copyToClipboard(data.preimage);
      this.showToast(ok ? 'Secret copied to clipboard' : 'Failed to copy', ok);
    } catch {
      this.showToast('Failed to copy', false);
    }
  });
  this.qrCodeB.appendChild(copySecretBtn);

  this.senderResults.classList.remove('results-hidden');
  }

  // --- Receiver Workflow ---
  private startReceiverScanner() {
    this.receiverScanner = new Html5Qrcode('receiver-scanner');
    this.receiverScannerDiv.innerHTML = '<p>Scan QR Code A (Transaction Data), then QR Code B (Secret).</p>';
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    this.receiverScanner.start(
  { facingMode: 'environment' },
  config,
  (decodedText: string, decodedResult: any) => this.handleReceiverScan(decodedText),
  (errorMessage: string) => { /* ignore scan errors */ }
);
  }

  private handleReceiverScan(decodedText: string) {
    try {
      const data = JSON.parse(decodedText) as OfflineTxoData;
      if (data.taprootAddress && data.txid) {
        this.scannedTxoData = data;
        this.receiverScannerDiv.innerHTML = '<p style="color:green;">Transaction QR Code Scanned! Now scan the Secret QR Code.</p>';
      } else throw new Error();
    } catch {
      if (decodedText.length === 64 && /^[0-9a-fA-F]+$/.test(decodedText)) {
        this.scannedPreimage = decodedText;
        this.receiverScannerDiv.innerHTML = '<p style="color:green;">Secret QR Code Scanned!</p>';
      } else {
        this.showError('Unrecognized QR Code.');
        return;
      }
    }
    if (this.scannedTxoData && this.scannedPreimage) {
      this.receiverScanner?.stop();
      this.receiverScannerDiv.innerHTML = '<p style="color:green; font-weight: bold;">Both QR codes scanned successfully. Enter your private key to claim.</p>';
      this.receiverForm.classList.remove('form-hidden');
    }
  }

  private async handleReceiverSubmit(e: Event) {
    e.preventDefault();
    this.hideError();
    if (!this.scannedTxoData || !this.scannedPreimage) {
      this.showError('Please scan both QR codes first.');
      return;
    }
    this.showLoading('Creating claim transaction...');
    try {
      const formData = new FormData(this.receiverForm);
      const receiverWif = formData.get('receiver-wif') as string;
      const resp = await fetch('/api/create-receiver-claim-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txoData: this.scannedTxoData, preimage: this.scannedPreimage, receiverWif })
      });
      if (!resp.ok) throw new Error((await resp.json()).message || 'Failed to create claim transaction');
      const result = await resp.json();
      if (result.psbt) {
        // Show success message in UI
        this.receiverScannerDiv.innerHTML = '<p style="color:green; font-weight:bold;">Claim PSBT created and copied to clipboard.<br>Broadcast it from an online device to finalize.</p>';
        await this.copyToClipboard(result.psbt);
        this.showToast('Claim PSBT copied to clipboard');
        this.receiverForm.reset();
        // Clear scanned data to avoid duplicate claims
        this.scannedTxoData = null;
        this.scannedPreimage = null;
      } else {
        this.showToast('Claim transaction created');
        this.receiverForm.reset();
      }
    } catch (err: any) {
      this.showError(err.message || String(err));
    } finally {
      this.hideLoading();
    }
  }

  // --- Refund Workflow ---
  private startRefundScanner() {
    this.refundScanner = new Html5Qrcode('refund-scanner');
    this.refundScannerDiv.innerHTML = '<p>Scan QR Code A (Transaction Data).</p>';
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    this.refundScanner.start(
  { facingMode: 'environment' },
  config,
  (decodedText: string, decodedResult: any) => this.handleRefundScan(decodedText),
  (errorMessage: string) => { /* ignore scan errors */ }
);
  }

  private handleRefundScan(decodedText: string) {
    try {
      const data = JSON.parse(decodedText) as OfflineTxoData;
      if (data.taprootAddress && data.txid) {
        this.scannedTxoData = data;
        this.refundScanner?.stop();
        this.refundScannerDiv.innerHTML = '<p style="color:green;">Transaction QR Code Scanned! Enter your private key to refund.</p>';
        this.refundForm.classList.remove('form-hidden');
      } else throw new Error();
    } catch {
      this.showError('Unrecognized QR Code.');
    }
  }

  private async handleRefundSubmit(e: Event) {
    e.preventDefault();
    if (!this.scannedTxoData) {
      this.showError('Please scan the transaction QR code first.');
      return;
    }
    this.showLoading('Creating refund transaction...');
    try {
      const formData = new FormData(this.refundForm);
      const senderWif = formData.get('sender-wif') as string;
      const resp = await fetch('/api/create-sender-refund-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txoData: this.scannedTxoData, senderWif })
      });
      if (!resp.ok) throw new Error((await resp.json()).message || 'Failed to create refund transaction');
      const result = await resp.json();
      // Display refund results (implement as needed)
    } catch (err: any) {
      this.showError(err.message || String(err));
    } finally {
      this.hideLoading();
    }
  }

  // --- Utility UI Methods ---
  private showLoading(message: string) {
    this.loadingDiv.textContent = message;
    this.loadingDiv.style.display = 'block';
  }
  private hideLoading() {
  this.loadingDiv.style.display = 'none';
}

  private async copyToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        /* fall through to legacy method */
      }
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }

  private showToast(message: string, success: boolean = true) {
    this.toastDiv.textContent = message;
    this.toastDiv.style.background = success ? '#198754' : '#dc3545';
    this.toastDiv.classList.add('show');
    setTimeout(() => this.toastDiv.classList.remove('show'), 3000);
  }

// --- Clipboard Paste Helpers ---
private async handlePasteTx() {
  try {
    const text = await navigator.clipboard.readText();
    const data = JSON.parse(text) as OfflineTxoData;
    if (data.taprootAddress && data.txid) {
      this.scannedTxoData = data;
      this.receiverScannerDiv.innerHTML = '<p style="color:green;">Transaction data pasted!</p>';
      this.showToast('Transaction data pasted from clipboard');
    } else throw new Error();
  } catch {
    this.showError('Clipboard does not contain valid transaction data.');
  }
  this.checkReceiverReady();
}

private async handlePasteSecret() {
  try {
    const raw = await navigator.clipboard.readText();
    const trimmed = raw.trim();
    const match = trimmed.match(/[0-9a-fA-F]{64}/);
    if (match) {
      this.scannedPreimage = match[0];
    } else if (trimmed.length > 0) {
      // Accept any non-empty secret for now (backend may send shorter placeholder during dev)
      this.scannedPreimage = trimmed;
    } else {
      throw new Error();
    }
    this.receiverScannerDiv.innerHTML += '<p style="color:green;">Secret pasted!</p>';
    this.showToast('Secret pasted from clipboard');
  } catch {
    this.showToast('Clipboard does not contain a valid secret', false);
    this.showError('Clipboard does not contain valid secret.');
  }
  this.checkReceiverReady();
}

private checkReceiverReady() {
  if (this.scannedTxoData && this.scannedPreimage) {
    this.receiverScanner?.stop();
    this.receiverScannerDiv.innerHTML = '<p style="color:green; font-weight:bold;">Transaction & Secret ready. Enter your private key to claim.</p>';
    this.receiverForm.classList.remove('form-hidden');
  }
}

  private showError(message: string) {
    this.errorDiv.textContent = message;
    this.errorDiv.style.display = 'block';
  }
  // --- Key Generation ---
  private async handleGenerateSender() {
    try {
      const resp = await fetch('/api/generate-keypair');
      if (!resp.ok) throw new Error('Failed to generate key');
      const { wif } = await resp.json();
      this.senderWifInput.value = wif;
    } catch (err: any) {
      this.showError(err.message || String(err));
    }
  }

  private async handleGenerateReceiver() {
    try {
      const resp = await fetch('/api/generate-keypair');
      if (!resp.ok) throw new Error('Failed to generate key');
      const { wif, pubkeyHex } = await resp.json();
      this.receiverWifInput.value = wif;
      this.receiverGeneratedDiv.textContent = `PubKey: ${pubkeyHex}`;
      // Autofill sender form receiver pubkey if present
      const receiverPubInput = document.querySelector<HTMLInputElement>('input[name="receiver-address"]');
      if (receiverPubInput) receiverPubInput.value = pubkeyHex;
    } catch (err: any) {
      this.showError(err.message || String(err));
    }
  }

  private hideError() {
    this.errorDiv.style.display = 'none';
  }
  private clearError() {
    this.errorDiv.textContent = '';
    this.errorDiv.style.display = 'none';
  }
}

// --- App Initialization ---
// --- App Initialization ---
let app: OfflineBtcApp;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app = new OfflineBtcApp();
    (window as any).offlineBtcApp = app;
  });
} else {
  app = new OfflineBtcApp();
  (window as any).offlineBtcApp = app;
}