Product Requirements Document: Offline Bitcoin Transactions
Author: George Akor
Location: Gumi-si, Gyeongsangbuk-do
Date: June 24, 2025
Status: Version 1.0 - Draft

# Introduction
Users require a method to transact Bitcoin with the highest level of security, which involves keeping their private keys on a device that is never connected to the internet (an "air-gapped" or "cold" wallet). However, they still need to create and authorize transactions. This feature enables users to construct, sign, and receive Bitcoin transactions using a secure offline wallet, with an internet-connected "watch-only" wallet acting only as a messenger to the Bitcoin network. This process eliminates the risk of private key exposure to online threats.

# Problem Statement
The Problem: Bitcoin holders who prioritize security store their private keys on offline devices. This practice makes it impossible to create and broadcast a transaction directly. They need a secure workflow to authorize a transaction offline and then safely broadcast it without exposing their keys. Similarly, a receiver needs a secure way to claim funds destined for them through such an offline mechanism.

How we solve it: We will implement a two-part wallet system. The user will have a secure Offline Signer (this app, in offline mode) and an online Watch-Only Wallet (this app, in online mode). The workflow will use QR codes to transfer non-sensitive information across the "air gap" between the two, enabling the creation and reception of secure, conditional payments powered by Bitcoin's Taproot technology.

# Goals and Objectives
Goal 1: Enable Air-Gapped Bitcoin Sending. Allow users to construct and authorize a Bitcoin transaction on a fully offline device.
Goal 2: Enable Secure Offline Receiving. Allow users to construct and sign a transaction to claim funds that were sent to them via the offline mechanism.
Goal 3: Maximize Security and Privacy. Ensure private keys never leave the offline device. Leverage Taproot to make the on-chain transactions private and efficient.

# User Personas
Alex, The Security Maximalist: Alex holds a significant amount of Bitcoin and is deeply concerned about online theft. Alex's primary goal is to keep private keys completely isolated from the internet. They are willing to perform extra steps for peace of mind.
Bora, The Field Agent: Bora operates in areas with intermittent or untrusted internet connectivity. Bora needs to receive payments from a dispatcher securely and reliably, even if they can only get online briefly using public Wi-Fi.
    
# Goal 4: Provide a Clear User Experience. Guide the user through the multi-step process with clear instructions, minimizing the risk of user error.

# Functional Requirements (User Stories)
Epic: Offline Transaction Workflow
## User Story 1: Sender Creates an Offline Transaction
As Alex, the Security Maximalist,
I want to create a Bitcoin transaction on my offline wallet,
So that I can authorize the spending of my funds without connecting my private keys to the internet.

### Acceptance Criteria:
- The user can initiate a "Send Offline" transaction from their offline wallet.
- The wallet generates a secret (preimage) for the transaction.
- The wallet uses Taproot to construct a transaction with two conditions:
    - Path 1 (Receiver's Claim): Spendable with the preimage and the receiver's signature.
    - Path 2 (Sender's Refund): Spendable by the sender's key alone after a predefined time lock (e.g., 72 hours).
- The wallet signs the transaction using the offline private key, creating a Partially Signed Bitcoin Transaction (PSBT).
    - The wallet presents two distinct QR codes:
    - QR Code A (For Broadcast): The signed transaction data, ready to be scanned by any online device and broadcast to the Bitcoin network.
    - QR Code B (For Receiver): The secret preimage (the "offline token") and necessary metadata for the receiver to claim the funds.

### User Story 2: Receiver Claims an Offline Transaction
As Bora, the Field Agent,
I want to use a secret I received offline to claim my payment,
So that I can take custody of the funds securely.

### Acceptance Criteria:
- The receiver's offline wallet can scan QR Code B to import the secret preimage.
- The receiver uses an online device (e.g., a block explorer) to get the transaction details and transfers them to the offline wallet (e.g., via QR scan).
- The receiver's offline wallet uses the preimage and its private key to construct and sign the claim transaction (spending via Taproot's script path).
- The wallet presents a new QR code containing the signed claim transaction.
- The receiver can scan this QR code with any online device to broadcast it and finalize the transfer.

### User Story 3: Sender Reclaims an Unclaimed Transaction
As Alex, the Security Maximalist,
I want to reclaim my funds if the receiver fails to claim them after a set time,
So that my funds are not permanently lost.

### Acceptance Criteria:
- After the time lock (e.g., 72 hours) has expired, the sender's wallet can construct a refund transaction.
- This transaction uses the Taproot key path, making it look like a standard, private payment on-chain.
- The wallet signs the refund transaction and provides a QR code for broadcasting.

# Technical Requirements
1. Protocol: All transactions must be constructed as Pay-to-Taproot (P2TR) outputs.
2. Transaction Format: All unsigned/partially-signed transactions must use the BIP-174 PSBT standard.
3. Scripting:
    - The receiver's claim path must use OP_HASH160 to verify the preimage.
    - The sender's refund path must use OP_CHECKLOCKTIMEVERIFY (CLTV) to enforce the time lock.
4. Data Transfer: The exclusive method for transferring data between the offline wallet and an online device must be via QR codes. The wallet must be able to both generate and scan QR codes.
5. Security: The application must ensure a strict separation of keys. The network stack should be disabled or inaccessible when the wallet is in "Offline Signer" mode.

# Non-Functional Requirements
1. Usability: The UI must be exceptionally clear, with step-by-step guidance. For example: Step 1 of 3: Scan this QR code with your online device to broadcast.
2. Security: The attack surface of the offline component must be minimized. No libraries that require network access should be active in offline mode.
3. Privacy: The on-chain footprint of a successful send/claim should not reveal the wallet's use of a hashlock. The sender's refund transaction must be indistinguishable from a standard single-signature transaction.
4. Performance: QR code generation and signing operations must be fast and not block the UI for a noticeable period.

# Success Metrics
1. Adoption Rate: Percentage of active users who successfully complete at least one offline transaction per month.
2. Task Completion Rate: >95% of users who start the offline send workflow successfully generate the broadcastable QR code.
3. User Satisfaction: Positive user feedback and reviews specifically mentioning the security and usability of the offline feature.
4. Security Incidents: Zero reported incidents of private key compromise related to this feature.

# Out of Scope (Future Work)
1. Support for other air-gap data transfer methods (e.g., NFC, Bluetooth, microSD card).
2. Multi-signature offline transactions.
3. Offline transactions for other cryptocurrencies (e.g., Liquid Bitcoin).
4. A fully integrated "messenger" app that automates the broadcasting without requiring a third-party wallet or block explorer.
