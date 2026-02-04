#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

WALLET_FILE="$HOME/.openclaw/workspace/solana-wallet.json"

echo "💰 Claw16z Trading Agent Wallet Funding Check"
echo "================================="
echo

# Check if wallet file exists
if [ ! -f "$WALLET_FILE" ]; then
    echo -e "${RED}❌ Wallet file not found: ${WALLET_FILE}${NC}"
    echo "Run ./setup.sh first to create your wallet"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules/@solana/web3.js" ]; then
    echo "Installing dependencies..."
    npm install @solana/web3.js @solana/spl-token
    echo
fi

# Create the balance checker script
cat > /tmp/check-balance.js << 'EOF'
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const fs = require('fs');

// USDC mint address on mainnet
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

async function checkBalances() {
    try {
        // Connect to Solana
        const connection = new Connection(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
        
        // Load wallet
        const walletPath = process.argv[2];
        const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf8')));
        const keypair = Keypair.fromSecretKey(secretKey);
        
        console.log('Wallet Address:', keypair.publicKey.toString());
        console.log('');
        
        // Check SOL balance
        const solBalance = await connection.getBalance(keypair.publicKey);
        const solBalanceFormatted = (solBalance / LAMPORTS_PER_SOL).toFixed(4);
        
        console.log(`SOL Balance: ${solBalanceFormatted} SOL`);
        
        // Check USDC balance
        let usdcBalance = 0;
        try {
            const usdcTokenAccount = await getAssociatedTokenAddress(
                USDC_MINT,
                keypair.publicKey
            );
            
            const usdcAccount = await getAccount(connection, usdcTokenAccount);
            usdcBalance = Number(usdcAccount.amount) / 1000000; // USDC has 6 decimals
        } catch (error) {
            // USDC account doesn't exist yet (no USDC received)
            usdcBalance = 0;
        }
        
        console.log(`USDC Balance: ${usdcBalance.toFixed(2)} USDC`);
        console.log('');
        
        // Check if wallet is funded
        const minSol = 0.05;  // Minimum SOL needed
        const minUsdc = 10;   // Minimum USDC needed
        
        if (solBalance / LAMPORTS_PER_SOL >= minSol && usdcBalance >= minUsdc) {
            console.log('✅ Wallet is funded and ready to trade!');
            return 'funded';
        } else {
            console.log('⏳ Wallet needs funding...');
            if (solBalance / LAMPORTS_PER_SOL < minSol) {
                console.log(`   Need at least ${minSol} SOL (current: ${solBalanceFormatted})`);
            }
            if (usdcBalance < minUsdc) {
                console.log(`   Need at least ${minUsdc} USDC (current: ${usdcBalance.toFixed(2)})`);
            }
            return 'waiting';
        }
        
    } catch (error) {
        console.error('Error checking balances:', error.message);
        return 'error';
    }
}

checkBalances().then(result => {
    process.exit(result === 'funded' ? 0 : 1);
}).catch(error => {
    console.error('Script error:', error);
    process.exit(1);
});
EOF

# Get the public key for display
PUBLIC_KEY=$(node -e "
const fs = require('fs');
const { Keypair } = require('@solana/web3.js');
try {
    const secretKey = new Uint8Array(JSON.parse(fs.readFileSync('$WALLET_FILE', 'utf8')));
    const keypair = Keypair.fromSecretKey(secretKey);
    console.log(keypair.publicKey.toString());
} catch (error) {
    console.error('Error reading wallet:', error.message);
    process.exit(1);
}
")

echo -e "${BLUE}📍 Your wallet address:${NC}"
echo -e "${GREEN}${PUBLIC_KEY}${NC}"
echo

# Check initial balance
echo "Checking current balance..."
echo

if node /tmp/check-balance.js "$WALLET_FILE"; then
    echo
    echo -e "${GREEN}🎉 Your agent is funded and ready to trade!${NC}"
    echo
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. cd trading"
    echo "2. npm install"
    echo "3. node monitor.js"
    echo
else
    echo
    echo -e "${YELLOW}💡 How to fund your wallet:${NC}"
    echo "1. Send SOL and USDC to the address above"
    echo "2. Recommended amounts:"
    echo "   • 0.1 SOL (for transaction fees)"
    echo "   • \$50+ USDC (for trading)"
    echo "3. Use any Solana wallet or exchange"
    echo
    
    # Ask if user wants to wait for funding
    echo -e "${BLUE}Would you like to wait for funding? (y/N)${NC}"
    read -r WAIT_FOR_FUNDING
    
    if [[ $WAIT_FOR_FUNDING == "y" || $WAIT_FOR_FUNDING == "Y" ]]; then
        echo
        echo "⏳ Waiting for funds... (checking every 10 seconds)"
        echo "Press Ctrl+C to stop"
        echo
        
        while true; do
            if node /tmp/check-balance.js "$WALLET_FILE" 2>/dev/null; then
                echo
                echo -e "${GREEN}🎉 Funded! Your agent is ready to trade!${NC}"
                break
            fi
            sleep 10
        done
    fi
fi

# Clean up temp file
rm -f /tmp/check-balance.js

echo -e "${GREEN}✨ Funding check complete!${NC}"