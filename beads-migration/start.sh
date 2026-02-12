#!/bin/bash
# Beads UI VPS Startup Script
# Deploy: /root/.openclaw/workspace/beads-ui/start.sh

# Configuration
BEADS_UI_DIR="/root/.openclaw/workspace/beads-ui"
PROJECT_DIR="/root/.openclaw/workspace/riaan-issues"
PORT=3000
HOST="0.0.0.0"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Beads UI${NC}"

# Check Node.js version
NODE_VERSION=$(node --version 2>/dev/null)
if [[ -z "$NODE_VERSION" ]]; then
    echo -e "${RED}Error: Node.js not found${NC}"
    exit 1
fi
echo -e "Node.js: ${NODE_VERSION}"

# Check bd CLI
BD_VERSION=$(bd --version 2>/dev/null)
if [[ -z "$BD_VERSION" ]]; then
    echo -e "${YELLOW}Warning: bd CLI not found in PATH${NC}"
fi

# Ensure project directory exists
if [[ ! -d "$PROJECT_DIR" ]]; then
    echo -e "${YELLOW}Creating project directory...${NC}"
    mkdir -p "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    bd init
fi

# Check for .beads database
if [[ ! -d "$PROJECT_DIR/.beads" ]]; then
    echo -e "${YELLOW}Initializing beads database...${NC}"
    cd "$PROJECT_DIR"
    bd init
fi

# Change to project directory (server uses cwd for DB)
cd "$PROJECT_DIR"
echo -e "Working directory: $(pwd)"

# Start server
echo -e "${GREEN}Starting server on ${HOST}:${PORT}${NC}"
echo -e "Access URL: http://76.13.36.42:${PORT}"
echo ""

# Export environment
export HOST=$HOST
export PORT=$PORT

# Start the server
node "$BEADS_UI_DIR/server/index.js" --host "$HOST" --port "$PORT"
