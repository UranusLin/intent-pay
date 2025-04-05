import {
  toPasskeyTransport,
  toWebAuthnCredential,
  WebAuthnMode,
  toModularTransport,
  toCircleSmartAccount,
  encodeTransfer,
} from '@circle-fin/modular-wallets-core';
import { createPublicClient, Transport, Client, parseEther } from 'viem';
import { createBundlerClient, SmartAccount, toWebAuthnAccount } from 'viem/account-abstraction';

// testing chains
import { baseSepolia, arbitrumSepolia, sepolia } from 'viem/chains';

const clientKey = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_KEY || '';
const clientUrl = process.env.NEXT_PUBLIC_CIRCLE_CLIENT_URL || ''; 
const chainName = process.env.NEXT_PUBLIC_CIRCLE_CHAIN_NAME || '';
const USDC_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CIRCLE_USDC_ADDRESS as `0x${string}` || '';
const USDC_DECIMALS = process.env.NEXT_PUBLIC_CIRCLE_USDC_DECIMALS || 6;
const NUMBER_OF_USDC = 10 ** Number(USDC_DECIMALS);

export class walletService {
  private publicClient: any = null;
  private modularTransport: any = null;
  private passkeyTransport: any = null;

  constructor() {
    try {
      // Log configuration for debugging
      console.log('Initializing wallet service with config:', {
        clientUrl: clientUrl ? `${clientUrl.substring(0, 10)}...` : 'Not set',
        chainName: chainName || 'Not set',
        clientKeyExists: !!clientKey,
      });
      
      // Check if required configuration is available
      if (!clientUrl || !chainName || !clientKey) {
        console.error('Missing Circle wallet configuration. Check your environment variables.');
        return;
      }
      
      this.modularTransport = toModularTransport(
        `${clientUrl}/${chainName}`,
        clientKey
      );
      
      this.publicClient = createPublicClient({
        chain: arbitrumSepolia,
        transport: this.modularTransport as Transport,
      });
      
      this.passkeyTransport = toPasskeyTransport(clientUrl, clientKey);
      
      console.log('Wallet service initialized successfully');
    } catch (error) {
      console.error('Error initializing wallet service:', error);
    }
  }

  /**
   * Get a credential for a wallet by World ID (Registration)
   * @param hashWorldId - The hash of the World ID
   * @returns The credential for the passkey
   */
  async getCredentialByWorldIdForRegistration(hashWorldId: string) {
    try {
      if (!this.passkeyTransport) {
        throw new Error('Wallet service not properly initialized');
      }
      
      console.log('REGISTER_PASSKEY', { walletUniqueKey: hashWorldId });
      
      const credential = await toWebAuthnCredential({
        transport: this.passkeyTransport,
        mode: WebAuthnMode.Register,
        // credentialId: credential.id,  for existing login
        username: hashWorldId // different unique key for different wallet
      });

      console.log('REGISTER_PASSKEY', { id : credential.rpId });
      return credential;
    } catch (error) {
      console.log('REGISTER_PASSKEY duplicate', error);
      return this.getCredentialByWorldIdForLogin(hashWorldId);
    }
  }

  /**
   * Get a credential for a wallet by World ID (Login)
   * @param hashWorldId - The hash of the World ID
   * @param credentialId - Existed passkey
   * @returns The credential for the passkey
   */
  async getCredentialByWorldIdForLogin(hashWorldId?: string, credentialId?: string) {
    if (!hashWorldId && !credentialId) {
      throw new Error('hashWorldId or credentialId is required');
    }
    
    try {
      if (!this.passkeyTransport) {
        throw new Error('Wallet service not properly initialized');
      }
      
      console.log('LOGIN_PASSKEY', { username: hashWorldId });

      let credential;
      if (!credentialId) {
        credential = await toWebAuthnCredential({
          transport: this.passkeyTransport,
          mode: WebAuthnMode.Login,
          username: hashWorldId, // different hashWorldId for different wallet
        });
      } else {
        credential = await toWebAuthnCredential({
          transport: this.passkeyTransport,
          mode: WebAuthnMode.Login,
          credentialId
        });
      }

      console.log('LOGIN_PASSKEY', { username: hashWorldId });
      return credential;
    } catch (error) {
      console.error('LOGIN_PASSKEY', error);
      throw error;
    }
  }

  /**
   * Initialize Smart Account
   * @param credential - Credential for the passkey
   * @returns SmartAccount
   */
  async initializeSmartAccount(credential: any) {
    try {
      if (!this.modularTransport || !this.publicClient) {
        throw new Error('Wallet service not properly initialized');
      }
      
      const account = await toCircleSmartAccount({
        client: this.publicClient as Client,
        owner: toWebAuthnAccount({
          credential,
        }),
      });

      const bundlerClient = await createBundlerClient({
        chain: arbitrumSepolia,
        transport: this.modularTransport as Transport,
        account: account as SmartAccount,
      });

      return {
        account,
        address: account.address,
        bundlerClient,
      };
    } catch (error) {
      console.error('INITIALIZE_SMART_ACCOUNT', error);
      throw error;
    }
  }

  /**
   * Send USDC transfer (For testing purposes) based on the smart account
   * @param recipientAddress - The recipient address
   * @param amount - The amount of USDC to send
   * @param smartAccount - The smart account
   * @returns The user operation hash
   */
  async sendUSDCTransfer(recipientAddress: string, amount: string, smartAccount: any) {
    try {
      if (!this.publicClient || !smartAccount) {
        throw new Error('Smart account not initialized');
      }
      
      console.log('SEND_USDC_TRANSFER', { recipientAddress, amount: amount.toString() });

      const bundlerClient = createBundlerClient({
          account: smartAccount as SmartAccount,
          chain: arbitrumSepolia,
          transport: this.modularTransport,
      })

      const userOpHash = await bundlerClient.sendUserOperation({
        calls: [encodeTransfer(recipientAddress as `0x${string}`, USDC_CONTRACT_ADDRESS, this.parseToBigInt(amount, 'USDC'))],
        account: smartAccount as SmartAccount, 
        paymaster: true
      });

      console.log('userOpHash', userOpHash);

      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOpHash
      });

      console.log('SEND_USDC_TRANSFER', { userOpHash });
      return receipt.userOpHash;
    } catch (error) {
      console.error('SEND_USDC_TRANSFER', error);
      throw error;
    }
  }

  private parseToBigInt(amount: string, currency: string): bigint {
    if (currency === 'USDC') {
      // Convert 0.001 USDC to its smallest unit (microUSDC)
      // USDC has 6 decimal places, so multiply by 10^6
      const amountInSmallestUnit = Math.floor(parseFloat(amount) * 1_000_000);
      // Now convert to BigInt
      return BigInt(amountInSmallestUnit);
    } else if (currency === 'ETH') {
      return parseEther(amount);
    } 

    throw new Error('Invalid currency');
  }
} 