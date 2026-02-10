#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Legacy swap helper (Solana/Jupiter); for Base we simulate swaps in DRY_RUN mode
const JupiterSwap = require('./swap');

class TradingMonitor {
    constructor() {
        this.config = {
            // RPC Configuration
            // Default to Base mainnet RPC (can be overridden via RPC_URL env)
            rpcUrl: process.env.RPC_URL || 'https://mainnet.base.org',
            
            // Trading Parameters
            positionSize: parseFloat(process.env.POSITION_SIZE) || 10, // USDC per trade
            maxSlippage: parseFloat(process.env.MAX_SLIPPAGE) || 1, // Percentage
            minLiquidity: parseFloat(process.env.MIN_LIQUIDITY) || 100000, // USD
            stopLoss: parseFloat(process.env.STOP_LOSS) || 10, // Percentage
            
            // Entry Criteria
            minVolume24h: parseFloat(process.env.MIN_VOLUME_24H) || 50000, // USD
            minPriceChange: parseFloat(process.env.MIN_PRICE_CHANGE) || 5, // Percentage
            minMarketCap: parseFloat(process.env.MIN_MARKET_CAP) || 100000, // USD
            
            // Timing
            scanInterval: parseInt(process.env.SCAN_INTERVAL) || 30000, // Milliseconds
            maxPositions: parseInt(process.env.MAX_POSITIONS) || 3,
            
            // Safety
            dryRun: process.env.DRY_RUN === 'true',
            blacklist: (process.env.BLACKLIST || 'MEME,SCAM,INU,DOGE').split(',').map(s => s.trim().toLowerCase())
        };

        this.swapper = new JupiterSwap(this.config.rpcUrl, this.config.maxSlippage);
        this.positions = new Map(); // Track current positions
        this.isScanning = false;
        
        console.log('🚀 Claw16z Trading Agent Monitor Started');
        console.log('📊 Configuration:', JSON.stringify(this.config, null, 2));
        
        if (this.config.dryRun) {
            console.log('🧪 DRY RUN MODE: No real trades will be executed');
        }
    }

    /**
     * Main monitoring loop
     */
    async start() {
        console.log('👀 Starting market monitoring...');
        
        // Initial balance check
        await this.checkBalance();
        
        // Start scanning loop
        this.scanLoop();
        
        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down trading monitor...');
            this.stop();
        });
    }

    /**
     * Stop the monitoring loop
     */
    stop() {
        this.isScanning = false;
        console.log('✅ Trading monitor stopped');
        process.exit(0);
    }

    /**
     * Main scanning loop
     */
    async scanLoop() {
        this.isScanning = true;
        
        while (this.isScanning) {
            try {
                await this.scanMarkets();
                await this.checkPositions();
                
                // Wait for next scan
                await this.sleep(this.config.scanInterval);
                
            } catch (error) {
                console.error('❌ Error in scan loop:', error.message);
                await this.sleep(5000); // Wait 5s on error
            }
        }
    }

    /**
     * Scan markets for trading opportunities
     */
    async scanMarkets() {
        try {
            console.log(`🔍 [${new Date().toISOString()}] Scanning markets...`);
            
            // Get trending tokens from DexScreener
            const tokens = await this.getTrendingTokens();
            console.log(`📈 Found ${tokens.length} trending tokens`);
            
            // Filter for opportunities
            const opportunities = tokens.filter(token => this.isGoodOpportunity(token));
            
            if (opportunities.length === 0) {
                console.log('⏳ No opportunities found, waiting...');
                return;
            }
            
            console.log(`🎯 Found ${opportunities.length} opportunities:`);
            opportunities.forEach(token => {
                console.log(`   ${token.symbol}: +${token.priceChange24h.toFixed(1)}% (Vol: $${(token.volume24h/1000).toFixed(0)}K)`);
            });
            
            // Execute trades for best opportunities
            const topOpportunities = opportunities.slice(0, Math.min(3, opportunities.length));
            
            for (const token of topOpportunities) {
                if (this.positions.size >= this.config.maxPositions) {
                    console.log(`🚫 Max positions (${this.config.maxPositions}) reached`);
                    break;
                }
                
                await this.enterPosition(token);
            }
            
        } catch (error) {
            console.error('❌ Error scanning markets:', error.message);
        }
    }

    /**
     * Get trending tokens from DexScreener (Base chain)
     */
    async getTrendingTokens() {
        try {
            // Try multiple endpoints to get Base tokens
            let pairs = [];
            
            // First try: trending endpoint
            try {
                const trendingResponse = await axios.get('https://api.dexscreener.com/latest/dex/tokens/trending', {
                    timeout: 5000
                });
                if (trendingResponse.data?.pairs && Array.isArray(trendingResponse.data.pairs)) {
                    pairs = trendingResponse.data.pairs;
                }
            } catch (e) {
                console.log('⚠️ Trending endpoint returned no data, trying alternative...');
            }
            
            // Fallback: get popular Base tokens via pairs endpoint
            if (pairs.length === 0 || !pairs.some(p => p.chainId === 'base')) {
                try {
                    // Use popular Base token addresses to get pairs
                    const popularTokens = [
                        // SOL on Base (DexScreener \"Solana\"-named token on Base)
                        '0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82',
                        // USDC on Base
                        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
                    ];
                    
                    // Try to get pairs for popular tokens
                    for (const tokenAddress of popularTokens.slice(0, 2)) {
                        try {
                            const tokenResponse = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
                                timeout: 5000
                            });
                            if (tokenResponse.data?.pairs && Array.isArray(tokenResponse.data.pairs)) {
                                const basePairs = tokenResponse.data.pairs
                                    .filter(p => p.chainId === 'base' && p.volume?.h24 > this.config.minVolume24h);
                                pairs = pairs.concat(basePairs);
                            }
                        } catch (e) {
                            // Continue to next token
                        }
                    }
                    
                    // Remove duplicates
                    const seen = new Set();
                    pairs = pairs.filter(p => {
                        const key = p.pairAddress;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                } catch (e) {
                    console.log('⚠️ Fallback endpoint also failed:', e.message);
                }
            }
            
            if (!pairs || pairs.length === 0) {
                return [];
            }
            
            // Process and filter tokens for Base chain
            return pairs
                .filter(pair => pair.chainId === 'base')
                .map(pair => ({
                    address: pair.baseToken.address,
                    symbol: pair.baseToken.symbol,
                    name: pair.baseToken.name,
                    price: parseFloat(pair.priceUsd) || 0,
                    priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
                    volume24h: parseFloat(pair.volume?.h24) || 0,
                    liquidity: parseFloat(pair.liquidity?.usd) || 0,
                    marketCap: parseFloat(pair.fdv) || 0,
                    pairAddress: pair.pairAddress
                }))
                .filter(token => 
                    token.price > 0 && 
                    token.volume24h > 0 && 
                    token.symbol && 
                    token.address
                );
                
        } catch (error) {
            console.error('❌ Error fetching trending tokens:', error.message);
            return [];
        }
    }

    /**
     * Check if a token is a good trading opportunity
     */
    isGoodOpportunity(token) {
        // Basic filters
        if (token.volume24h < this.config.minVolume24h) return false;
        if (Math.abs(token.priceChange24h) < this.config.minPriceChange) return false;
        if (token.liquidity < this.config.minLiquidity) return false;
        if (token.marketCap < this.config.minMarketCap) return false;
        
        // Blacklist check
        const symbolLower = token.symbol.toLowerCase();
        if (this.config.blacklist.some(word => symbolLower.includes(word))) {
            return false;
        }
        
        // Already have position
        if (this.positions.has(token.address)) return false;
        
        // Positive momentum (for now, only buy on upward moves)
        if (token.priceChange24h <= 0) return false;
        
        return true;
    }

    /**
     * Enter a trading position
     */
    async enterPosition(token) {
        try {
            console.log(`🚀 Entering position: ${token.symbol} (${token.address})`);
            
            // Calculate amount to swap (in USDC base units)
            const usdcAmount = this.config.positionSize * Math.pow(10, 6); // USDC has 6 decimals
            
            // Execute swap: USDC -> Token
            // For Base we currently only support DRY_RUN mode, so we simulate the fill
            let result;
            if (this.config.dryRun) {
                const simulatedAmount = token.price > 0
                    ? this.config.positionSize / token.price
                    : this.config.positionSize;
                result = {
                    signature: 'DRY_RUN',
                    outputAmount: simulatedAmount,
                    priceImpact: 0,
                    executionTime: 0,
                    timestamp: new Date().toISOString(),
                    dryRun: true
                };
            } else {
                // NOTE: Non-DRY_RUN execution is still legacy Solana/Jupiter-specific in swap.js
                // and would need a dedicated Uniswap/Base DEX integration to perform real trades.
                result = await this.swapper.swap(
                    'USDC',
                    token.address,
                    usdcAmount,
                    this.config.dryRun
                );
            }
            
            // Record position
            const position = {
                token: token.symbol,
                address: token.address,
                entryPrice: token.price,
                entryTime: new Date().toISOString(),
                amount: result.outputAmount,
                usdcInvested: this.config.positionSize,
                signature: result.signature,
                stopLoss: token.price * (1 - this.config.stopLoss / 100)
            };
            
            this.positions.set(token.address, position);
            
            console.log(`✅ Position entered: ${position.amount.toFixed(2)} ${token.symbol}`);
            console.log(`💰 Invested: $${position.usdcInvested} USDC`);
            console.log(`🎯 Stop Loss: $${position.stopLoss.toFixed(6)}`);
            
            // Save position to file
            this.savePositions();
            
        } catch (error) {
            console.error(`❌ Failed to enter position for ${token.symbol}:`, error.message);
        }
    }

    /**
     * Check existing positions for exit signals
     */
    async checkPositions() {
        if (this.positions.size === 0) return;
        
        console.log(`📋 Checking ${this.positions.size} positions...`);
        
        for (const [address, position] of this.positions) {
            try {
                await this.checkPosition(address, position);
            } catch (error) {
                console.error(`❌ Error checking position ${position.token}:`, error.message);
            }
        }
    }

    /**
     * Check a single position for exit signals
     */
    async checkPosition(address, position) {
        // Get current token data
        const currentData = await this.getTokenData(address);
        if (!currentData) return;
        
        const currentPrice = currentData.price;
        const pnl = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        const currentValue = position.amount * currentPrice;
        
        console.log(`📊 ${position.token}: $${currentPrice.toFixed(6)} (${pnl > 0 ? '+' : ''}${pnl.toFixed(1)}%) Val: $${currentValue.toFixed(2)}`);
        
        let shouldExit = false;
        let exitReason = '';
        
        // Stop loss check
        if (currentPrice <= position.stopLoss) {
            shouldExit = true;
            exitReason = `Stop loss triggered (${position.stopLoss.toFixed(6)})`;
        }
        
        // Time-based exit (example: exit after 4 hours if no significant gain)
        const positionAge = Date.now() - new Date(position.entryTime).getTime();
        const maxAge = 4 * 60 * 60 * 1000; // 4 hours
        
        if (positionAge > maxAge && pnl < 20) {
            shouldExit = true;
            exitReason = `Time exit (4h, +${pnl.toFixed(1)}%)`;
        }
        
        // Profit taking (example: exit at +50% gain)
        if (pnl > 50) {
            shouldExit = true;
            exitReason = `Profit taking (+${pnl.toFixed(1)}%)`;
        }
        
        if (shouldExit) {
            await this.exitPosition(address, position, exitReason);
        }
    }

    /**
     * Exit a trading position
     */
    async exitPosition(address, position, reason) {
        try {
            console.log(`🚪 Exiting position: ${position.token} - ${reason}`);
            
            // Calculate amount to swap (in token's base units)
            const tokenAmount = Math.floor(position.amount * Math.pow(10, 6)); // Assume 6 decimals for now
            
            // Execute swap: Token -> USDC
            const result = await this.swapper.swap(
                address,
                'USDC',
                tokenAmount,
                this.config.dryRun
            );
            
            const finalValue = result.outputAmount;
            const pnl = finalValue - position.usdcInvested;
            const pnlPercent = (pnl / position.usdcInvested) * 100;
            
            console.log(`✅ Position closed: ${position.token}`);
            console.log(`💰 Final value: $${finalValue.toFixed(2)} USDC`);
            console.log(`📈 P&L: ${pnl > 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnl > 0 ? '+' : ''}${pnlPercent.toFixed(1)}%)`);
            
            // Remove position
            this.positions.delete(address);
            this.savePositions();
            
            // Log trade
            this.logTrade({
                type: 'EXIT',
                token: position.token,
                reason,
                entryPrice: position.entryPrice,
                entryTime: position.entryTime,
                exitTime: new Date().toISOString(),
                invested: position.usdcInvested,
                finalValue,
                pnl,
                pnlPercent,
                signature: result.signature
            });
            
        } catch (error) {
            console.error(`❌ Failed to exit position for ${position.token}:`, error.message);
        }
    }

    /**
     * Get current token data
     */
    async getTokenData(address) {
        try {
            const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
                timeout: 5000
            });
            
            const pair = response.data?.pairs?.find(p => p.chainId === 'base');
            if (!pair) return null;
            
            return {
                price: parseFloat(pair.priceUsd) || 0,
                priceChange24h: parseFloat(pair.priceChange?.h24) || 0,
                volume24h: parseFloat(pair.volume?.h24) || 0,
                liquidity: parseFloat(pair.liquidity?.usd) || 0
            };
            
        } catch (error) {
            console.error(`❌ Error fetching token data for ${address}:`, error.message);
            return null;
        }
    }

    /**
     * Check wallet balances
     */
    async checkBalance() {
        // This would check ETH and USDC balances on Base
        // Implementation depends on your wallet setup
        console.log('💳 Balance check - implement wallet balance checking');
    }

    /**
     * Save positions to file
     */
    savePositions() {
        const positionsFile = path.join(__dirname, 'positions.json');
        const positionsArray = Array.from(this.positions.entries()).map(([address, position]) => ({
            address,
            ...position
        }));
        
        fs.writeFileSync(positionsFile, JSON.stringify(positionsArray, null, 2));
    }

    /**
     * Load positions from file
     */
    loadPositions() {
        const positionsFile = path.join(__dirname, 'positions.json');
        
        if (fs.existsSync(positionsFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(positionsFile, 'utf8'));
                data.forEach(pos => {
                    this.positions.set(pos.address, pos);
                });
                console.log(`📁 Loaded ${this.positions.size} existing positions`);
            } catch (error) {
                console.error('❌ Error loading positions:', error.message);
            }
        }
    }

    /**
     * Log trade to file
     */
    logTrade(trade) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            ...trade
        };
        
        console.log('📝', JSON.stringify(logEntry, null, 2));
        
        const logFile = path.join(__dirname, 'trades.log');
        fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    }

    /**
     * Utility: Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run the monitor
if (require.main === module) {
    const monitor = new TradingMonitor();
    
    // Load existing positions
    monitor.loadPositions();
    
    // Start monitoring
    monitor.start().catch(error => {
        console.error('💥 Monitor crashed:', error);
        process.exit(1);
    });
}

module.exports = TradingMonitor;