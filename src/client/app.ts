import { CalculationRequest, CalculationResult, Operation } from '../shared/types.js';

interface AppState {
  num1: number;
  num2: number;
  operation: Operation | null;
  isCalculating: boolean;
  currentAddress: string | null;
  fundingStatus: 'checking' | 'funded' | 'unfunded' | 'error';
  lastResult: CalculationResult | null;
  error: string | null;
}

class RealBitcoinCalculatorApp {
  private state: AppState;
  private apiBaseUrl: string;

  constructor() {
    this.state = {
      num1: 10,
      num2: 5,
      operation: null,
      isCalculating: false,
      currentAddress: null,
      fundingStatus: 'checking',
      lastResult: null,
      error: null
    };

    this.apiBaseUrl = '/api';
    this.initializeEventListeners();
    this.checkNetworkStatus();
  }

  private initializeEventListeners(): void {
    console.log('🔧 Initializing Real Bitcoin Calculator...');

    // Operation buttons
    document.querySelectorAll('.op-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        const operation = target.dataset.op as Operation;
        this.selectOperation(operation);
      });
    });

    // Calculate button
    const calculateButton = document.getElementById('calculateBtn') as HTMLButtonElement;
    if (calculateButton) {
      calculateButton.addEventListener('click', () => {
        this.performCalculation();
      });
    }

    // Generate address button
    const generateAddressBtn = document.getElementById('generateAddressBtn') as HTMLButtonElement;
    if (generateAddressBtn) {
      generateAddressBtn.addEventListener('click', () => {
        this.generateFundingAddress();
      });
    }

    // Check funding button
    const checkFundingBtn = document.getElementById('checkFundingBtn') as HTMLButtonElement;
    if (checkFundingBtn) {
      checkFundingBtn.addEventListener('click', () => {
        this.checkFunding();
      });
    }

    // Input fields
    const num1Input = document.getElementById('num1') as HTMLInputElement;
    const num2Input = document.getElementById('num2') as HTMLInputElement;

    if (num1Input) {
      num1Input.addEventListener('input', () => {
        this.state.num1 = parseFloat(num1Input.value) || 0;
        this.validateInputs();
        this.loadSavedAddresses(); // Only refresh display, don't auto-select
      });
      this.state.num1 = parseFloat(num1Input.value) || 0;
    }

    if (num2Input) {
      num2Input.addEventListener('input', () => {
        this.state.num2 = parseFloat(num2Input.value) || 0;
        this.validateInputs();
        this.loadSavedAddresses(); // Only refresh display, don't auto-select
      });
      this.state.num2 = parseFloat(num2Input.value) || 0;
    }

    // Load saved addresses on startup
    this.loadSavedAddresses();

    console.log('✅ Real Bitcoin Calculator initialized');
  }

  private selectOperation(operation: Operation): void {
    console.log('Operation selected:', operation);
    this.state.operation = operation;

    // Update UI
    document.querySelectorAll('.op-btn').forEach(button => {
      button.classList.remove('selected');
    });

    const selectedButton = document.querySelector(`[data-op="${operation}"]`);
    if (selectedButton) {
      selectedButton.classList.add('selected');
    }

    this.validateInputs();
    this.clearError();

    // Only refresh the display of saved addresses, don't auto-select
    this.loadSavedAddresses();
  }

  private async loadSavedAddresses(): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/saved-addresses`);
      if (!response.ok) return;

      const savedAddresses = await response.json();
      this.displaySavedAddresses(savedAddresses);
    } catch (error) {
      console.warn('Failed to load saved addresses:', error);
    }
  }

  private displaySavedAddresses(addresses: any[]): void {
    const savedAddressesSection = document.getElementById('saved-addresses-section') as HTMLElement;
    const savedAddressesList = document.getElementById('saved-addresses-list') as HTMLElement;

    if (!savedAddressesList) return;

    if (addresses.length === 0) {
      savedAddressesList.innerHTML = '<p style="text-align: center; color: #666;">No saved addresses yet. Generate an address first.</p>';
      savedAddressesSection.style.display = 'block';
      return;
    }

    // Identify current calculation for highlighting (but not auto-selecting)
    const currentCalculationKey = this.state.operation ? 
      `${this.state.num1}_${this.state.num2}_${this.state.operation}` : null;

    // Check if we have a currently selected address
    const selectedAddress = this.state.currentAddress;

    let html = '';
    
    addresses.forEach(addr => {
      const isSelected = addr.address === selectedAddress;
      const balanceClass = addr.balance > 0 ? 'funded' : 'unfunded';
      const balanceText = addr.balance > 0 ? `${addr.balance} sats` : 'Unfunded';
      
      // Only show as selected if explicitly selected
      let itemClass = 'saved-address-item';
      if (isSelected) {
        itemClass += ' selected';
      }
      
      let statusText = '';
      if (isSelected) {
        statusText = '(Selected)';
      }
      
      // Display calculations history
      let calculationsDisplay = '';
      if (addr.calculations && addr.calculations.length > 0) {
        calculationsDisplay = addr.calculations.map((calc: any) => {
          const operationSymbol = this.getOperationSymbol(calc.operation);
          return `${calc.num1} ${operationSymbol} ${calc.num2} = ${calc.result}`;
        }).join(', ');
      } else {
        calculationsDisplay = 'No calculations yet';
      }
      
      html += `
        <div class="${itemClass}" 
             data-address="${addr.address}"
             onclick="window.calculator.selectSavedAddress('${addr.address}')">
          <div class="saved-address-header">
            <div class="saved-address-calculation">
              ${calculationsDisplay}
              ${statusText}
            </div>
            <div class="saved-address-balance ${balanceClass}">
              ${balanceText}
            </div>
          </div>
          <div class="saved-address-details">
            ${addr.address.slice(0, 20)}...${addr.address.slice(-20)}
          </div>
        </div>
      `;
    });

    savedAddressesList.innerHTML = html;
    savedAddressesSection.style.display = 'block';
  }

  public async selectSavedAddress(address: string): Promise<void> {
    try {
      // Just select the address for reuse without changing the current calculation
      this.state.currentAddress = address;
      
      // Update visual selection
      document.querySelectorAll('.saved-address-item').forEach(item => {
        item.classList.remove('selected');
      });
      
      const selectedItem = document.querySelector(`[data-address="${address}"]`);
      if (selectedItem) {
        selectedItem.classList.add('selected');
      }
      
      // Show funding section with selected address info
      const fundingSection = document.getElementById('funding-section');
      const addressDisplay = document.getElementById('funding-address');
      
      if (fundingSection && addressDisplay) {
        addressDisplay.textContent = address;
        fundingSection.style.display = 'block';
        
        // Update balance display if available
        const response = await fetch(`${this.apiBaseUrl}/saved-addresses`);
        if (response.ok) {
          const addresses = await response.json();
          const selectedAddr = addresses.find((addr: any) => addr.address === address);
          if (selectedAddr) {
            const balanceElement = document.querySelector('.address-balance');
            if (balanceElement) {
              balanceElement.textContent = selectedAddr.balance > 0 ? 
                `✅ Funded with ${selectedAddr.balance} sats` : '❌ Not funded';
            }
          }
        }
      }
      
      console.log(`Selected address: ${address} for reuse with new calculations`);
    } catch (error) {
      this.showError(`Failed to select address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private symbolToOperation(symbol: string): Operation {
    switch (symbol) {
      case '+': return 'add';
      case '-': return 'subtract';
      case '×': return 'multiply';
      case '÷': return 'divide';
      default: return 'add';
    }
  }

  private getOperationSymbol(operation: string): string {
    switch (operation) {
      case 'add': return '+';
      case 'subtract': return '-';
      case 'multiply': return '×';
      case 'divide': return '÷';
      default: return '?';
    }
  }

  private calculateResult(num1: number, num2: number, operation: string): number {
    switch (operation) {
      case 'add': return num1 + num2;
      case 'subtract': return num1 - num2;
      case 'multiply': return num1 * num2;
      case 'divide': return Math.floor(num1 / num2);
      default: return 0;
    }
  }

  private displayAddressInfo(addressInfo: any): void {
    const fundingAddress = document.getElementById('funding-address') as HTMLElement;
    const fundingSection = document.getElementById('funding-section') as HTMLElement;

    if (fundingAddress) {
      fundingAddress.textContent = addressInfo.address;
    }

    if (fundingSection) {
      fundingSection.style.display = 'block';
    }
  }

  private validateInputs(): boolean {
    const { num1, num2, operation } = this.state;
    
    if (!operation) {
      this.updateCalculateButton(false, 'Select an operation first');
      return false;
    }

    if (isNaN(num1) || isNaN(num2)) {
      this.updateCalculateButton(false, 'Enter valid numbers');
      return false;
    }

    if (!Number.isInteger(num1) || !Number.isInteger(num2)) {
      this.updateCalculateButton(false, 'Only integers are supported');
      return false;
    }

    if (operation === 'divide' && num2 === 0) {
      this.updateCalculateButton(false, 'Division by zero not allowed');
      return false;
    }

    // Check for overflow
    const MAX_SCRIPT_NUM = 2147483647;
    const MIN_SCRIPT_NUM = -2147483648;

    if (num1 < MIN_SCRIPT_NUM || num1 > MAX_SCRIPT_NUM || 
        num2 < MIN_SCRIPT_NUM || num2 > MAX_SCRIPT_NUM) {
      this.updateCalculateButton(false, 'Numbers must be 32-bit signed integers');
      return false;
    }

    // Check result overflow
    let result: number;
    switch (operation) {
      case 'add': result = num1 + num2; break;
      case 'subtract': result = num1 - num2; break;
      case 'multiply': result = num1 * num2; break;
      case 'divide': result = Math.floor(num1 / num2); break;
    }

    if (result < MIN_SCRIPT_NUM || result > MAX_SCRIPT_NUM) {
      this.updateCalculateButton(false, 'Result would overflow 32-bit range');
      return false;
    }

    this.updateCalculateButton(true);
    return true;
  }

  private updateCalculateButton(enabled: boolean, message?: string): void {
    const calculateButton = document.getElementById('calculateBtn') as HTMLButtonElement;
    const statusText = document.getElementById('calculation-status') as HTMLElement;
    
    if (calculateButton) {
      calculateButton.disabled = !enabled || this.state.isCalculating;
    }

    if (statusText) {
      statusText.textContent = message || '';
      statusText.style.display = message ? 'block' : 'none';
    }
  }

  private async generateFundingAddress(): Promise<void> {
    const { num1, num2, operation } = this.state;
    
    if (!operation || !this.validateInputs()) {
      return;
    }

    try {
      this.showLoading('Generating Bitcoin address...');
      
      const response = await fetch(`${this.apiBaseUrl}/generate-address`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ num1, num2, operation })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate address');
      }

      const result = await response.json();
      
      this.state.currentAddress = result.address;
      this.displayFundingInfo(result);
      
      // Check funding status
      await this.checkFunding();

    } catch (error) {
      console.error('Address generation error:', error);
      this.showError(`Failed to generate address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.hideLoading();
    }
  }

  private async checkFunding(): Promise<void> {
    if (!this.state.currentAddress) {
      return;
    }

    try {
      this.state.fundingStatus = 'checking';
      this.updateFundingStatus('Checking funding status...');

      const response = await fetch(`${this.apiBaseUrl}/check-funding/${this.state.currentAddress}`);
      
      if (!response.ok) {
        throw new Error('Failed to check funding status');
      }

      const result = await response.json();
      
      if (result.isFunded) {
        this.state.fundingStatus = 'funded';
        this.updateFundingStatus(`✅ Funded with ${result.availableBalance} sats`, 'success');
      } else {
        this.state.fundingStatus = 'unfunded';
        this.updateFundingStatus(`❌ ${result.message}`, 'warning');
      }

      this.updateCalculateButton(result.isFunded && this.validateInputs());

    } catch (error) {
      this.state.fundingStatus = 'error';
      this.updateFundingStatus(`Error checking funding: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }

  private async performCalculation(): Promise<void> {
    const { num1, num2, operation, currentAddress } = this.state;
    
    if (!operation || !this.validateInputs()) {
      return;
    }

    // Check if we have a selected address for reuse
    if (currentAddress) {
      // Use existing address for new calculation
      try {
        this.setCalculating(true);
        this.clearError();

        const calculationRequest = { address: currentAddress, num1, num2, operation };

        const response = await fetch(`${this.apiBaseUrl}/calculate-existing`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(calculationRequest)
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Calculation with existing address failed');
        }

        const calculationResult = await response.json();
        this.displayResults(calculationResult);
        this.loadSavedAddresses(); // Refresh the addresses list
        return;
        
      } catch (error) {
        this.showError(error instanceof Error ? error.message : 'Calculation failed');
        this.setCalculating(false);
        return;
      }
    }

    // Original logic for new address generation
    if (this.state.fundingStatus !== 'funded') {
      this.showError('Address must be funded before performing calculation');
      return;
    }

    try {
      this.setCalculating(true);
      this.clearError();

      const calculationRequest: CalculationRequest = { num1, num2, operation };

      const response = await fetch(`${this.apiBaseUrl}/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(calculationRequest)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Calculation failed');
      }

      const result: CalculationResult = await response.json();
      
      this.state.lastResult = result;
      this.displayResults(result);

      console.log('✅ Real Bitcoin transaction created:', result.txid);
      
    } catch (error) {
      console.error('Calculation error:', error);
      this.showError(`Calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.setCalculating(false);
    }
  }

  private displayFundingInfo(fundingInfo: any): void {
    const addressDisplay = document.getElementById('funding-address') as HTMLElement;
    const instructionsDisplay = document.getElementById('funding-instructions') as HTMLElement;
    const fundingSection = document.getElementById('funding-section') as HTMLElement;

    if (addressDisplay) {
      addressDisplay.textContent = fundingInfo.address;
    }

    if (instructionsDisplay) {
      instructionsDisplay.textContent = fundingInfo.fundingInstructions;
    }

    if (fundingSection) {
      fundingSection.style.display = 'block';
    }
  }

  private updateFundingStatus(message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info'): void {
    const statusElement = document.getElementById('funding-status') as HTMLElement;
    
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.className = `funding-status ${type}`;
      statusElement.style.display = 'block';
    }
  }

  private displayResults(result: CalculationResult): void {
    const resultsDiv = document.getElementById('results') as HTMLElement;
    
    if (!resultsDiv) return;

    const elements = {
      operation: document.getElementById('operation'),
      result: document.getElementById('result'),
      address: document.getElementById('address'),
      txid: document.getElementById('txid'),
      fee: document.getElementById('fee'),
      rawTx: document.getElementById('rawTx'),
      mempoolLink: document.getElementById('mempoolLink') as HTMLAnchorElement,
      broadcastStatus: document.getElementById('broadcast-status'),
      privateKey: document.getElementById('private-key')
    };

    if (elements.operation) elements.operation.textContent = result.operation;
    if (elements.result) elements.result.textContent = result.result.toString();
    if (elements.address) elements.address.textContent = result.taprootAddress;
    if (elements.txid) elements.txid.textContent = result.txid;
    if (elements.fee) elements.fee.textContent = `${result.fee} sats`;
    if (elements.rawTx) elements.rawTx.textContent = result.rawTx;
    if (elements.privateKey) elements.privateKey.textContent = result.privateKey;

    if (elements.broadcastStatus) {
      const statusText = result.broadcastStatus === 'success' ? '✅ Successfully broadcasted' : '❌ Broadcast failed';
      elements.broadcastStatus.textContent = statusText;
      elements.broadcastStatus.className = `broadcast-status ${result.broadcastStatus}`;
    }

    if (elements.mempoolLink) {
      const mempoolUrl = `https://mempool.space/testnet/tx/${result.txid}`;
      elements.mempoolLink.href = mempoolUrl;
      elements.mempoolLink.textContent = 'View on Mempool.space';
    }

    resultsDiv.style.display = 'block';
  }

  private setCalculating(isCalculating: boolean): void {
    this.state.isCalculating = isCalculating;
    const calculateButton = document.getElementById('calculateBtn') as HTMLButtonElement;
    const loadingDiv = document.getElementById('loading') as HTMLElement;

    if (calculateButton) {
      calculateButton.disabled = isCalculating;
      calculateButton.textContent = isCalculating ? 
        'Creating & Broadcasting Transaction...' : 'Calculate & Create Real Transaction';
    }

    if (loadingDiv) {
      loadingDiv.style.display = isCalculating ? 'block' : 'none';
    }
  }

  private showLoading(message: string): void {
    const loadingDiv = document.getElementById('loading') as HTMLElement;
    if (loadingDiv) {
      loadingDiv.textContent = message;
      loadingDiv.style.display = 'block';
    }
  }

  private hideLoading(): void {
    const loadingDiv = document.getElementById('loading') as HTMLElement;
    if (loadingDiv) {
      loadingDiv.style.display = 'none';
    }
  }

  private showError(message: string): void {
    this.state.error = message;
    const errorDiv = document.getElementById('error') as HTMLElement;
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
    }
  }

  private clearError(): void {
    this.state.error = null;
    const errorDiv = document.getElementById('error') as HTMLElement;
    if (errorDiv) {
      errorDiv.style.display = 'none';
    }
  }

  private async checkNetworkStatus(): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/network-status`);
      const status = await response.json();
      
      const networkStatusDiv = document.getElementById('network-status') as HTMLElement;
      if (networkStatusDiv) {
        const statusText = status.isHealthy ? 
          `✅ Network: Block ${status.blockHeight}, ${status.mempoolSize} pending txs` :
          '❌ Network: Disconnected';
        networkStatusDiv.textContent = statusText;
        networkStatusDiv.className = status.isHealthy ? 'network-status healthy' : 'network-status unhealthy';
      }
    } catch (error) {
      console.warn('Failed to check network status:', error);
    }
  }
}

// Initialize app when DOM is ready
let calculatorApp: RealBitcoinCalculatorApp;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    calculatorApp = new RealBitcoinCalculatorApp();
    (window as any).calculator = calculatorApp;
  });
} else {
  calculatorApp = new RealBitcoinCalculatorApp();
  (window as any).calculator = calculatorApp;
}