const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class JupiterSwap {
    constructor(rpcUrl = 'https://api.mainnet-beta.solana.com', maxSlippage = 1) {
        this.connection = new Connection(rpcUrl, 'confirmed');
        this.maxSlippage = maxSlippage;
        this.baseUrl = 'https://quote-api.jup.ag/v6';
        
        // Load wallet
        const walletPath = path.join(process.env.HOME, '.openclaw/workspace/solana-wallet.json');
        if (!fs.existsSync(walletPath)) {
            throw new Error(`Wallet file not found: ${walletPath}`);
        }
        
        const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf8')));
        this.wallet = Keypair.fromSecretKey(secretKey);
        
        console.log(`🔑 Wallet loaded: ${this.wallet.publicKey.toString()}`);
    }

    /**
     * Get a swap quote from Jupiter
     * @param {string} inputMint - Input token mint address
     * @param {string} outputMint - Output token mint address
     * @param {number} amount - Amount to swap (in token's native units)
     * @returns {Promise<Object>} Quote object
     */
    async getQuote(inputMint, outputMint, amount) {
        try {
            const params = new URLSearchParams({
                inputMint,
                outputMint,
                amount: amount.toString(),
                slippageBps: Math.floor(this.maxSlippage * 100), // Convert % to basis points
                onlyDirectRoutes: 'false',
                asLegacyTransaction: 'false'
            });

            const response = await axios.get(`${this.baseUrl}/quote?${params}`);
            
            if (!response.data) {
                throw new Error('No quote received from Jupiter');
            }

            return response.data;
        } catch (error) {
            console.error('❌ Error getting quote:', error.message);
            throw error;
        }
    }

    /**
     * Execute a swap using Jupiter
     * @param {Object} quote - Quote object from getQuote()
     * @param {boolean} dryRun - If true, don't actually execute the trade
     * @returns {Promise<string>} Transaction signature
     */
    async executeSwap(quote, dryRun = false) {
        try {
            if (dryRun) {
                console.log('🧪 DRY RUN: Would execute swap:', {
                    input: quote.inputMint,
                    output: quote.outputMint,
                    inAmount: quote.inAmount,
                    outAmount: quote.outAmount,
                    slippage: this.maxSlippage + '%'
                });
                return 'DRY_RUN_TX_' + Date.now();
            }

            // Get swap transaction
            const swapResponse = await axios.post(`${this.baseUrl}/swap`, {
                quoteResponse: quote,
                userPublicKey: this.wallet.publicKey.toString(),
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: 'auto'
            });

            if (!swapResponse.data?.swapTransaction) {
                throw new Error('No swap transaction received from Jupiter');
            }

            // Deserialize and sign transaction
            const swapTransactionBuf = Buffer.from(swapResponse.data.swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([this.wallet]);

            // Send transaction
            const signature = await this.connection.sendTransaction(transaction, {
                skipPreflight: false,
                maxRetries: 3
            });

            console.log('📤 Transaction sent:', signature);

            // Wait for confirmation
            const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');
            
            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${confirmation.value.err}`);
            }

            console.log('✅ Transaction confirmed:', signature);
            return signature;

        } catch (error) {
            console.error('❌ Error executing swap:', error.message);
            throw error;
        }
    }

    /**
     * Perform a complete swap operation (quote + execute)
     * @param {string} inputToken - Input token symbol or mint
     * @param {string} outputToken - Output token symbol or mint  
     * @param {number} amount - Amount to swap
     * @param {boolean} dryRun - Paper trading mode
     * @returns {Promise<Object>} Swap result
     */
    async swap(inputToken, outputToken, amount, dryRun = false) {
        const startTime = Date.now();
        
        try {
            console.log(`🔄 Initiating swap: ${amount} ${inputToken} → ${outputToken}`);

            // Convert token symbols to mint addresses if needed
            const inputMint = await this.getMintAddress(inputToken);
            const outputMint = await this.getMintAddress(outputToken);

            // Get quote
            const quote = await this.getQuote(inputMint, outputMint, amount);
            
            const inputAmount = parseFloat(quote.inAmount) / Math.pow(10, quote.inputDecimals || 6);
            const outputAmount = parseFloat(quote.outAmount) / Math.pow(10, quote.outputDecimals || 6);
            const priceImpact = parseFloat(quote.priceImpactPct || 0);

            console.log(`📊 Quote: ${inputAmount} ${inputToken} → ${outputAmount.toFixed(6)} ${outputToken}`);
            console.log(`📈 Price Impact: ${priceImpact.toFixed(2)}%`);

            // Execute swap
            const signature = await this.executeSwap(quote, dryRun);

            const executionTime = Date.now() - startTime;

            const result = {
                signature,
                inputToken,
                outputToken,
                inputAmount,
                outputAmount,
                priceImpact,
                executionTime,
                timestamp: new Date().toISOString(),
                dryRun
            };

            // Log trade
            this.logTrade(result);

            return result;

        } catch (error) {
            console.error(`❌ Swap failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get mint address for a token symbol
     * @param {string} token - Token symbol or mint address
     * @returns {Promise<string>} Mint address
     */
    async getMintAddress(token) {
        // If it's already a mint address, return as-is
        if (token.length === 44 && /^[A-Za-z0-9]+$/.test(token)) {
            return token;
        }

        // Common token mint addresses
        const tokenMints = {
            'SOL': 'So11111111111111111111111111111111111111112', // Wrapped SOL
            'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
            'RAY': '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
            'SRM': 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt'
        };

        const mint = tokenMints[token.toUpperCase()];
        if (!mint) {
            throw new Error(`Unknown token symbol: ${token}`);
        }

        return mint;
    }

    /**
     * Log trade to file and console
     * @param {Object} trade - Trade result object
     */
    logTrade(trade) {
        const logEntry = {
            timestamp: trade.timestamp,
            type: 'SWAP',
            input: `${trade.inputAmount} ${trade.inputToken}`,
            output: `${trade.outputAmount.toFixed(6)} ${trade.outputToken}`,
            priceImpact: `${trade.priceImpact.toFixed(2)}%`,
            executionTime: `${trade.executionTime}ms`,
            signature: trade.signature,
            dryRun: trade.dryRun
        };

        console.log('💰', JSON.stringify(logEntry, null, 2));

        // Append to trades log file
        const logFile = path.join(__dirname, 'trades.log');
        const logLine = JSON.stringify(logEntry) + '\n';
        
        fs.appendFileSync(logFile, logLine);
    }
}

module.exports = JupiterSwap;

// CLI usage example
if (require.main === module) {
    async function main() {
        const args = process.argv.slice(2);
        
        if (args.length < 3) {
            console.log('Usage: node swap.js <inputToken> <outputToken> <amount> [dryRun]');
            console.log('Example: node swap.js USDC SOL 10 true');
            process.exit(1);
        }

        const [inputToken, outputToken, amount, dryRun] = args;
        const isDryRun = dryRun === 'true';

        try {
            const swapper = new JupiterSwap(process.env.RPC_URL);
            const result = await swapper.swap(inputToken, outputToken, parseFloat(amount), isDryRun);
            
            console.log('✅ Swap completed:', result.signature);
        } catch (error) {
            console.error('❌ Swap failed:', error.message);
            process.exit(1);
        }
    }

    main();
}