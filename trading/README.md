# Claw16z Trading Agent

This directory contains the core trading logic for your Claw16z Trading Agent.

## How It Works

The trading bot uses a momentum-based strategy:

1. **Market Scanning** - Monitors DexScreener for trending tokens
2. **Opportunity Detection** - Identifies tokens with strong momentum and volume
3. **Risk Assessment** - Checks liquidity, market cap, and volatility
4. **Trade Execution** - Uses Jupiter for optimal swap routing
5. **Position Management** - Implements stop-losses and profit taking

## Components

### monitor.js
The main trading loop that:
- Scans DexScreener API every 30 seconds
- Filters tokens by volume, price change, and liquidity
- Executes buy/sell decisions via Jupiter
- Logs all trades and maintains position state

### swap.js  
Jupiter integration helper that:
- Gets optimal swap quotes
- Signs and submits transactions
- Handles slippage and retry logic
- Provides detailed trade logging

## Configuration

Create a `.env` file in this directory:

```bash
# RPC Configuration
RPC_URL=https://api.mainnet-beta.solana.com
# For better performance, use Helius or QuickNode:
# RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY

# Trading Parameters
POSITION_SIZE=10          # USDC per trade
MAX_SLIPPAGE=1           # Maximum slippage percentage
MIN_LIQUIDITY=100000     # Minimum pool liquidity in USD
STOP_LOSS=10             # Stop loss percentage

# Entry Criteria
MIN_VOLUME_24H=50000     # Minimum 24h volume in USD
MIN_PRICE_CHANGE=5       # Minimum price change percentage
MIN_MARKET_CAP=100000    # Minimum market cap in USD

# Timing
SCAN_INTERVAL=30000      # Scan every 30 seconds
MAX_POSITIONS=3          # Maximum concurrent positions

# Safety Features
DRY_RUN=false           # Set to true for paper trading
BLACKLIST=MEME,SCAM     # Comma-separated token keywords to avoid
```

## Strategy Details

### Entry Signals
- 24h volume > MIN_VOLUME_24H
- Price change > MIN_PRICE_CHANGE in last 1-4 hours
- Liquidity > MIN_LIQUIDITY
- Not in blacklist
- Market cap > MIN_MARKET_CAP

### Exit Signals
- Price drops > STOP_LOSS% from entry
- Momentum weakens (volume declining, price stalling)
- Manual position limits exceeded

### Risk Management
- Fixed position sizing
- Stop-loss orders
- Maximum position limits
- Liquidity checks before trading
- Slippage protection

## Usage

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your preferences

# Start trading (make sure wallet is funded)
npm start

# Or run directly
node monitor.js
```

## Monitoring

The bot logs all activity to console:

```
[2024-01-15 10:30:15] 🔍 Scanning 847 tokens...
[2024-01-15 10:30:16] 📈 Found opportunity: BONK (+12.5%, $89K vol)
[2024-01-15 10:30:17] 💰 BUY: 10 USDC → 125,436 BONK (0.5% slippage)
[2024-01-15 10:30:18] ✅ Trade confirmed: TxID abc123...
```

## Paper Trading

To test without real money, set `DRY_RUN=true` in your `.env` file. The bot will simulate all trades and log what it would have done.

## Safety Features

- **Blacklist filtering** - Avoids known scam/meme tokens
- **Liquidity checks** - Ensures you can exit positions
- **Position limits** - Prevents over-exposure
- **Error handling** - Graceful failure recovery
- **Transaction confirmation** - Verifies all trades

## Customization

### Adding New Strategies

Modify `monitor.js` to add custom entry/exit logic:

```javascript
function isGoodEntry(token) {
    // Your custom logic here
    return token.volume24h > 100000 && 
           token.priceChange24h > 5 &&
           !isBlacklisted(token.symbol);
}
```

### Different Data Sources

Replace DexScreener with other APIs:
- CoinGecko
- Jupiter API
- Birdeye
- Custom on-chain analysis

### Advanced Features

Consider adding:
- Multiple timeframe analysis
- Technical indicators (RSI, MACD)
- Social sentiment analysis
- Portfolio rebalancing
- Dollar-cost averaging

## Troubleshooting

### Common Issues

**"Insufficient funds"**
- Check SOL balance for gas fees
- Verify USDC balance for trading

**"Transaction failed"**
- Increase slippage tolerance
- Check network congestion
- Verify token liquidity

**"No opportunities found"**
- Lower MIN_VOLUME_24H or MIN_PRICE_CHANGE
- Check market conditions
- Verify DexScreener API access

**"Rate limited"**
- Use premium RPC endpoint
- Increase SCAN_INTERVAL
- Implement request throttling

### Performance Optimization

- Use dedicated RPC endpoints (Helius, QuickNode)
- Cache token metadata
- Batch API requests
- Optimize scan intervals

## Disclaimer

This is experimental software. Cryptocurrency trading involves substantial risk of loss. Never trade with more than you can afford to lose. Past performance does not guarantee future results.