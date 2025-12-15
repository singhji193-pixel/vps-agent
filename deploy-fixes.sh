#!/bin/bash

# VPS Agent - Deploy Critical Fixes
# This script deploys logout button and new conversation fixes
# Author: AI Assistant
# Date: 2025-12-15

set -e  # Exit on error

echo "🚀 VPS Agent - Deploying Critical Fixes"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Check current directory
echo "📍 Step 1: Checking current directory..."
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Not in vps-agent directory!${NC}"
    echo "Please cd to vps-agent directory and run again"
    exit 1
fi
echo -e "${GREEN}✅ In vps-agent directory${NC}"
echo ""

# Step 2: Pull latest changes
echo "📥 Step 2: Pulling latest changes from GitHub..."
git pull origin main
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}⚠️  Git pull failed, trying to stash and pull...${NC}"
    git stash
    git pull origin main
    git stash pop
fi
echo -e "${GREEN}✅ Latest changes pulled${NC}"
echo ""

# Step 3: Backup current routes.ts
echo "💾 Step 3: Backing up server/routes.ts..."
cp server/routes.ts server/routes.ts.backup
echo -e "${GREEN}✅ Backup created: server/routes.ts.backup${NC}"
echo ""

# Step 4: Add POST /api/conversations endpoint
echo "🔧 Step 4: Adding POST /api/conversations endpoint..."

# Create the code to insert
cat > /tmp/conversation-endpoint.txt << 'ENDPOINT_CODE'

  // Create new conversation endpoint
  app.post("/api/conversations", requireAuth, async (req, res) => {
    try {
      const userId = (req as any).userId;
      const { title, mode, vpsServerId } = req.body;

      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      if (vpsServerId) {
        const server = await storage.getVpsServer(vpsServerId);
        if (!server || server.userId !== userId) {
          return res.status(403).json({ error: "Invalid VPS server" });
        }
      }

      const conversation = await storage.createConversation({
        userId,
        title: title || "New Conversation",
        mode: mode || "chat",
        vpsServerId: vpsServerId || null,
      });

      res.json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });
ENDPOINT_CODE

# Find the line number after GET /api/conversations
LINE_NUM=$(grep -n 'app.get("/api/conversations"' server/routes.ts | head -1 | cut -d: -f1)

if [ -z "$LINE_NUM" ]; then
    echo -e "${RED}❌ Could not find GET /api/conversations route${NC}"
    echo "Please add the endpoint manually"
    exit 1
fi

# Find the closing }); after that line
CLOSING_LINE=$(awk -v start="$LINE_NUM" 'NR > start && /^  \}\);/ {print NR; exit}' server/routes.ts)

if [ -z "$CLOSING_LINE" ]; then
    echo -e "${RED}❌ Could not find closing }); for GET /api/conversations${NC}"
    echo "Please add the endpoint manually"
    exit 1
fi

echo "Found GET /api/conversations at line $LINE_NUM"
echo "Inserting new endpoint after line $CLOSING_LINE"

# Insert the new code after the closing line
awk -v line="$CLOSING_LINE" -v code="$(cat /tmp/conversation-endpoint.txt)" '
    NR == line {print; print code; next}
    {print}
' server/routes.ts > server/routes.ts.new

# Replace old file with new one
mv server/routes.ts.new server/routes.ts

echo -e "${GREEN}✅ POST /api/conversations endpoint added${NC}"
echo ""

# Step 5: Verify the change
echo "🔍 Step 5: Verifying changes..."
if grep -q 'app.post("/api/conversations"' server/routes.ts; then
    echo -e "${GREEN}✅ Endpoint successfully added${NC}"
else
    echo -e "${RED}❌ Endpoint not found - something went wrong${NC}"
    echo "Restoring backup..."
    mv server/routes.ts.backup server/routes.ts
    exit 1
fi
echo ""

# Step 6: Install dependencies
echo "📦 Step 6: Installing dependencies..."
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Step 7: Build the project
echo "🔨 Step 7: Building project..."
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed!${NC}"
    echo "Restoring backup..."
    mv server/routes.ts.backup server/routes.ts
    exit 1
fi
echo -e "${GREEN}✅ Build completed successfully${NC}"
echo ""

# Step 8: Restart the application
echo "🔄 Step 8: Restarting application..."

# Check if PM2 is installed
if command -v pm2 &> /dev/null; then
    echo "Using PM2 to restart..."
    pm2 restart vps-agent
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}⚠️  'vps-agent' not found, trying all PM2 apps...${NC}"
        pm2 restart all
    fi
    echo ""
    echo "PM2 Status:"
    pm2 status
elif systemctl list-units --type=service | grep -q vps-agent; then
    echo "Using systemctl to restart..."
    sudo systemctl restart vps-agent
else
    echo -e "${YELLOW}⚠️  Could not detect process manager${NC}"
    echo "Please restart manually using your process manager"
fi

echo -e "${GREEN}✅ Application restarted${NC}"
echo ""

# Step 9: Check logs
echo "📋 Step 9: Checking application logs..."
if command -v pm2 &> /dev/null; then
    echo "Recent PM2 logs:"
    pm2 logs vps-agent --lines 20 --nostream
fi
echo ""

# Step 10: Cleanup
echo "🧹 Step 10: Cleaning up..."
rm -f /tmp/conversation-endpoint.txt
echo -e "${GREEN}✅ Cleanup complete${NC}"
echo ""

# Final summary
echo "========================================"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo "========================================"
echo ""
echo "Changes deployed:"
echo "  ✅ Logout button added to sidebar"
echo "  ✅ New Conversation button fixed"
echo "  ✅ POST /api/conversations endpoint added"
echo ""
echo "Backup saved at: server/routes.ts.backup"
echo ""
echo "🧪 Testing:"
echo "  1. Visit: https://vps.coengine.ai"
echo "  2. Click 'New Conversation' → Should work"
echo "  3. Click 'Logout' → Should log you out"
echo "  4. Testing Dashboard → Should work"
echo ""
echo "If something goes wrong, restore backup:"
echo "  mv server/routes.ts.backup server/routes.ts"
echo "  npm run build"
echo "  pm2 restart vps-agent"
echo ""
echo -e "${GREEN}🎉 All done!${NC}"
