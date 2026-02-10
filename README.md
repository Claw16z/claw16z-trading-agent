# Claw16z Trading Agent

A dead-simple quickstart that takes you from zero to having an AI agent with a funded EVM wallet on Base, ready to trade autonomously.

## What is this?

**Claw16z Trading Agent** is an AI agent platform that can act autonomously on your behalf. This repository sets up a Claw16z Trading Agent with an EVM wallet on Base so it can trade tokens automatically.

The flow is simple:
1. The agent gets an EVM wallet address on Base  
2. You fund it with ETH (for gas) and USDC (for trading)
3. The agent scans for trading opportunities and executes swaps

Think: **clone, configure, fund, go.**

## Prerequisites

- **Linux server** (Ubuntu 22.04+ recommended)
- **Node.js 22+**
- **An Anthropic API key** (for Claude)

## Quick Start

```bash
# Clone this repository
git clone https://github.com/Claw16z/claw16z-trading-agent.git
cd claw16z-trading-agent

# Install OpenClaw
npm install -g openclaw

# Run the setup wizard (creates your agent workspace)
openclaw onboard

# Create an EVM wallet for your agent (managed by OpenClaw)
chmod +x setup.sh
./setup.sh
# Output: Your agent's wallet address is: <address>
#         Fund this address with ETH (on Base) and USDC to start trading.

# Fund your agent's wallet (see next section)
chmod +x fund-wallet.sh
./fund-wallet.sh

# Install trading dependencies
cd trading && npm install && cd ..

# Start the trading monitor
cd trading && node monitor.js
```

## Fund Your Agent

Your agent needs funds to trade. The setup script will show you the wallet address (public key).

### Recommended starting amounts:
- **0.01–0.05 ETH** on Base (for transaction fees)
- **$50 USDC** (for trading)

### How to fund:
1. Send ETH (on Base) and USDC to the wallet address shown by `setup.sh`
2. Run `./fund-wallet.sh` to check balances and wait for funding confirmation

```bash
# Check if your agent is funded
./fund-wallet.sh
```

Once funded, the script will show (example values):
```
✅ Funded! Ready to trade.
ETH Balance: 0.05
USDC Balance: 50.00
```

## Start Trading

```bash
# Navigate to trading directory
cd trading

# Configure your trading parameters (optional)
export RPC_URL="https://mainnet.base.org"
export POSITION_SIZE="10"  # USDC per trade
export MIN_LIQUIDITY="100000"  # Minimum pool liquidity

# Start the trading monitor
node monitor.js
```

The trading bot will:
- Scan DexScreener for trending tokens on Base
- Look for momentum opportunities
- Simulate swaps via Uniswap (DRY_RUN mode by default)
- Manage position sizes and exits (simulated)

### How the Strategy Works

1. **Momentum Scanning**: Monitors tokens with high volume and price movement
2. **Entry Criteria**: Looks for tokens breaking resistance with strong volume
3. **Position Management**: Uses fixed position sizes with stop-losses
4. **Exit Strategy**: Takes profits on momentum exhaustion or stops on drawdown

## Customization

### Trading Parameters

Edit these environment variables in `trading/.env`:

```bash
# RPC Configuration (Base mainnet)
RPC_URL=https://mainnet.base.org

# Trading Settings
POSITION_SIZE=10          # USDC per trade
MAX_SLIPPAGE=1           # Maximum slippage %
MIN_LIQUIDITY=100000     # Minimum pool liquidity
STOP_LOSS=10             # Stop loss percentage

# Scanning Settings
MIN_VOLUME_24H=50000     # Minimum 24h volume
MIN_PRICE_CHANGE=5       # Minimum price change %
SCAN_INTERVAL=30000      # Scan every 30 seconds
```

### Agent Instructions

Customize your agent's behavior by editing `config/AGENTS.md` and placing it in your OpenClaw workspace:

```bash
cp config/AGENTS.md ~/.openclaw/workspace/AGENTS.md
```

## Architecture

```
Claw16z Trading Agent → Reads EVM wallet → Scans opportunities → Simulates swaps via Uniswap
       ↓
   EVM Wallet on Base
   (ETH + USDC)
       ↓
   Uniswap DEX (Base)
   (Swap execution / simulation)
```

### Components:

- **Claw16z Trading Agent**: The AI that makes trading decisions
- **EVM Wallet (Base)**: Stores ETH (gas) and USDC (trading capital)
- **Trading Monitor**: Scans markets and identifies opportunities
- **Uniswap Integration (planned)**: Executes token swaps on Base (currently simulated)
- **DexScreener API**: Provides market data and trending tokens

## Security

- ⚠️ **NEVER commit real keypairs or API keys to version control**
- The trading bot uses your local wallet file (`~/.openclaw/workspace/solana-wallet.json`)
- Keep your Claw16z Trading Agent workspace secure and backed up
- Start with small amounts to test the system

## Troubleshooting

### Common Issues

**"Command not found: openclaw"**
```bash
npm install -g openclaw
```
Note: Claw16z Trading Agent uses OpenClaw as the underlying platform.

**"Insufficient funds for transaction"**
- Check your ETH balance on Base for gas fees
- Ensure you have enough USDC for trading

**"RPC rate limiting"**
- Use a dedicated RPC like Helius or QuickNode
- Set `RPC_URL` to your premium endpoint

**"No trading opportunities found"**
- Markets may be quiet - this is normal
- Adjust `MIN_VOLUME_24H` and `MIN_PRICE_CHANGE` parameters

### Getting Help

- [OpenClaw Documentation](https://docs.openclaw.com) (Claw16z Trading Agent uses OpenClaw platform)
- [Uniswap Docs](https://docs.uniswap.org/)

## License

MIT License - see [LICENSE](LICENSE) file.

## Disclaimer

This software is for educational purposes. Trading cryptocurrencies involves substantial risk. Never invest more than you can afford to lose. The authors are not responsible for any financial losses.