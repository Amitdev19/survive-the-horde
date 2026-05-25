#!/bin/bash
# Survival the Horde - Pre-Deployment Checklist
# Run this script to verify your multiplayer game is ready

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║     Survive the Horde - Pre-Deployment Checklist              ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Counter for checks
passed=0
failed=0

# Helper functions
check_pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((passed++))
}

check_fail() {
  echo -e "${RED}✗${NC} $1"
  ((failed++))
}

check_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

# ============================================================================
# Core Files Check
# ============================================================================
echo -e "${YELLOW}[1/7] Core Files...${NC}"

if [ -f "server.js" ]; then
  check_pass "server.js exists"
else
  check_fail "server.js missing"
fi

if [ -f "client/src/main.js" ]; then
  check_pass "client/src/main.js exists"
else
  check_fail "client/src/main.js missing"
fi

if [ -f "package.json" ]; then
  check_pass "package.json exists"
else
  check_fail "package.json missing"
fi

if [ -d "client" ]; then
  check_pass "client/ directory exists"
else
  check_fail "client/ directory missing"
fi

echo ""

# ============================================================================
# Dependencies Check
# ============================================================================
echo -e "${YELLOW}[2/7] Dependencies...${NC}"

if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  check_pass "Node.js installed ($NODE_VERSION)"
else
  check_fail "Node.js not installed"
  exit 1
fi

if command -v npm &> /dev/null; then
  NPM_VERSION=$(npm --version)
  check_pass "npm installed ($NPM_VERSION)"
else
  check_fail "npm not installed"
  exit 1
fi

if [ -d "node_modules" ]; then
  check_pass "Dependencies installed (node_modules exists)"
else
  check_warn "node_modules not found - run 'npm install'"
fi

if grep -q '"ws"' package.json; then
  check_pass "WebSocket (ws) dependency in package.json"
else
  check_fail "WebSocket (ws) dependency missing"
fi

echo ""

# ============================================================================
# Client Build Check
# ============================================================================
echo -e "${YELLOW}[3/7] Client Build...${NC}"

if [ -d "client/dist" ]; then
  check_pass "Client built (dist/ exists)"
  
  if [ -f "client/dist/index.html" ]; then
    check_pass "index.html generated"
  else
    check_fail "index.html not found in dist/"
  fi
else
  check_warn "Client not built yet - run 'npm run build'"
fi

echo ""

# ============================================================================
# Configuration Files
# ============================================================================
echo -e "${YELLOW}[4/7] Configuration Files...${NC}"

config_files=(
  "QUICK_DEPLOY.md"
  "MULTIPLAYER_SUMMARY.md"
  "Dockerfile"
  "railway.toml"
  "render.yaml"
)

for file in "${config_files[@]}"; do
  if [ -f "$file" ]; then
    check_pass "$file exists"
  else
    check_fail "$file missing"
  fi
done

echo ""

# ============================================================================
# Server Code Check
# ============================================================================
echo -e "${YELLOW}[5/7] Server Configuration...${NC}"

if grep -q "GameRoom" server.js; then
  check_pass "GameRoom class defined"
else
  check_fail "GameRoom class not found"
fi

if grep -q "wss\.on.*connection" server.js; then
  check_pass "WebSocket connection handler found"
else
  check_fail "WebSocket handler not found"
fi

if grep -q "setInterval" server.js; then
  check_pass "Game loop timer found"
else
  check_fail "Game loop timer not found"
fi

if grep -q "PORT\|port\|3000" server.js; then
  check_pass "Port configuration found"
else
  check_fail "Port configuration not found"
fi

echo ""

# ============================================================================
# Network Check
# ============================================================================
echo -e "${YELLOW}[6/7] Network Connectivity...${NC}"

# Get local IP
if [[ "$OSTYPE" == "darwin"* ]]; then
  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "unknown")
else
  LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown")
fi

if [ "$LOCAL_IP" != "unknown" ]; then
  check_pass "Local IP detected: $LOCAL_IP"
else
  check_warn "Could not detect local IP - networking may be limited"
fi

echo ""

# ============================================================================
# Quick Test
# ============================================================================
echo -e "${YELLOW}[7/7] Quick Test...${NC}"

# Try to install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
  if [ -d "node_modules" ]; then
    check_pass "Dependencies installed"
  else
    check_fail "Failed to install dependencies"
  fi
fi

# Try to build client if not built
if [ ! -d "client/dist" ]; then
  echo "Building client..."
  npm run build
  if [ -d "client/dist" ]; then
    check_pass "Client built successfully"
  else
    check_fail "Client build failed"
  fi
fi

echo ""

# ============================================================================
# Summary
# ============================================================================
echo -e "${YELLOW}╔════════════════════════════════════════════════════════════════╗${NC}"

if [ $failed -eq 0 ]; then
  echo -e "${GREEN}║  ✓ All checks passed! Ready to deploy.${NC}"
else
  echo -e "${RED}║  ✗ Some checks failed. See above for details.${NC}"
fi

echo -e "${YELLOW}║  Passed: $passed | Failed: $failed${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================================
# Next Steps
# ============================================================================
echo -e "${GREEN}Next Steps:${NC}"
echo ""

if [ $failed -eq 0 ]; then
  echo "1. Test locally:"
  echo "   npm start"
  echo ""
  echo "2. Open multiple browser tabs:"
  echo "   http://localhost:3000"
  echo ""
  echo "3. Test local network (share with friends):"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "   bash start-multiplayer.sh"
  else
    echo "   Start the server and share: http://$LOCAL_IP:3000"
  fi
  echo ""
  echo "4. Deploy to cloud:"
  echo "   See QUICK_DEPLOY.md for options"
else
  echo "Please fix the failed checks above, then run this script again."
fi

echo ""

exit $failed
