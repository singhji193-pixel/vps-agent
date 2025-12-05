#!/bin/bash

# ERPNext with Caddy Integration Installation Script

set -e

echo "========================================"
echo "ERPNext v15 + Caddy Installation"
echo "========================================"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}"
   exit 1
fi

echo -e "${GREEN}Step 1: Detecting Caddy installation...${NC}"
bash find-caddy.sh > /tmp/caddy-detection.log
cat /tmp/caddy-detection.log

echo ""
echo -e "${YELLOW}Please review the Caddy detection output above${NC}"
read -p "Continue with installation? (y/n): " CONFIRM
if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Installation cancelled."
    exit 1
fi

echo ""
echo -e "${GREEN}Step 2: Installing Docker (if not present)...${NC}"
if ! command -v docker &> /dev/null; then
    apt update
    apt install -y apt-transport-https ca-certificates curl software-properties-common gnupg
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl start docker
    systemctl enable docker
    echo -e "${GREEN}Docker installed successfully!${NC}"
else
    echo -e "${GREEN}Docker already installed${NC}"
fi

echo ""
echo -e "${GREEN}Step 3: Configuration...${NC}"
read -p "Enter site name (default: erpnext.local): " SITE_NAME
SITE_NAME=${SITE_NAME:-erpnext.local}

read -sp "Enter admin password (default: admin): " ADMIN_PASSWORD
echo ""
ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin}

cat > .env << EOF
SITE_NAME=$SITE_NAME
ADMIN_PASSWORD=$ADMIN_PASSWORD
FRAPPE_SITE_NAME_HEADER=\$\$host
EOF

echo ""
echo -e "${GREEN}Step 4: Starting ERPNext services...${NC}"
cp docker-compose-caddy.yml docker-compose.yml

# Run configurator
docker compose up -d configurator
sleep 10

# Create site
docker compose up -d create-site
echo "Creating ERPNext site (this takes 5-10 minutes)..."

while docker compose ps create-site | grep -q "running\|Up"; do
    echo -n "."
    sleep 5
done
echo ""

# Start all services
docker compose up -d

echo ""
echo -e "${GREEN}Step 5: Configuring Caddy...${NC}"
echo ""
echo -e "${YELLOW}Searching for Caddyfile...${NC}"

CADDYFILE=""
for loc in /etc/caddy/Caddyfile /etc/Caddyfile ~/.config/caddy/Caddyfile; do
    if [ -f "$loc" ]; then
        CADDYFILE="$loc"
        echo -e "${GREEN}Found Caddyfile: $loc${NC}"
        break
    fi
done

if [ -z "$CADDYFILE" ]; then
    echo -e "${YELLOW}Caddyfile not found in standard locations${NC}"
    read -p "Enter full path to your Caddyfile: " CADDYFILE
    if [ ! -f "$CADDYFILE" ]; then
        echo -e "${RED}Caddyfile not found at $CADDYFILE${NC}"
        echo -e "${YELLOW}Creating new Caddyfile at /etc/caddy/Caddyfile${NC}"
        mkdir -p /etc/caddy
        CADDYFILE="/etc/caddy/Caddyfile"
        touch "$CADDYFILE"
    fi
fi

echo ""
echo -e "${GREEN}Current Caddyfile location: $CADDYFILE${NC}"
echo ""
read -p "Add ERPNext configuration to Caddyfile? (y/n): " ADD_CONFIG

if [[ $ADD_CONFIG =~ ^[Yy]$ ]]; then
    # Backup existing Caddyfile
    cp "$CADDYFILE" "${CADDYFILE}.backup.$(date +%Y%m%d-%H%M%S)"
    echo -e "${GREEN}Backed up existing Caddyfile${NC}"
    
    # Append ERPNext configuration
    cat >> "$CADDYFILE" << 'EOF'

# ERPNext Configuration
82.180.137.121:8080 {
    reverse_proxy localhost:8000 {
        header_up X-Forwarded-Host {host}
        header_up X-Forwarded-Proto {scheme}
    }

    @websocket {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @websocket localhost:8000

    log {
        output file /var/log/caddy/erpnext.log
    }
}
EOF
    
    echo -e "${GREEN}Added ERPNext configuration to Caddyfile${NC}"
    
    # Reload Caddy
    echo ""
    echo -e "${GREEN}Reloading Caddy...${NC}"
    if systemctl is-active --quiet caddy; then
        systemctl reload caddy
        echo -e "${GREEN}Caddy reloaded successfully${NC}"
    elif command -v caddy &> /dev/null; then
        caddy reload --config "$CADDYFILE"
        echo -e "${GREEN}Caddy reloaded successfully${NC}"
    else
        echo -e "${YELLOW}Please reload Caddy manually${NC}"
    fi
else
    echo -e "${YELLOW}Skipped Caddy configuration${NC}"
    echo -e "${YELLOW}Please manually add configuration from Caddyfile.erpnext${NC}"
fi

echo ""
echo -e "${GREEN}Step 6: Verifying installation...${NC}"
sleep 5
docker compose ps

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Installation Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}Access ERPNext at:${NC}"
echo -e "  ${YELLOW}http://82.180.137.121:8080${NC}"
echo ""
echo -e "${GREEN}Login Credentials:${NC}"
echo -e "  Username: ${YELLOW}Administrator${NC}"
echo -e "  Password: ${YELLOW}$ADMIN_PASSWORD${NC}"
echo ""
echo -e "${GREEN}Caddyfile location: ${YELLOW}$CADDYFILE${NC}"
echo ""
echo -e "${GREEN}Useful Commands:${NC}"
echo -e "  View ERPNext logs: ${YELLOW}docker compose logs -f${NC}"
echo -e "  Restart ERPNext: ${YELLOW}docker compose restart${NC}"
echo -e "  Reload Caddy: ${YELLOW}systemctl reload caddy${NC}"
echo -e "  View Caddy logs: ${YELLOW}journalctl -u caddy -f${NC}"
echo ""