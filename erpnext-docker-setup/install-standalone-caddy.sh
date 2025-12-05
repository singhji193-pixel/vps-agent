#!/bin/bash

# ERPNext Installation with Standalone Caddy Container
# Similar to your n8n and Nextcloud Docker setups

set -e

echo "=========================================="
echo "ERPNext v15 Installation"
echo "With Caddy Container (like n8n/Nextcloud)"
echo "=========================================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}"
   exit 1
fi

echo -e "${GREEN}Step 1: Checking Docker installation...${NC}"
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    apt update
    apt install -y apt-transport-https ca-certificates curl software-properties-common gnupg
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl start docker
    systemctl enable docker
    echo -e "${GREEN}Docker installed!${NC}"
else
    echo -e "${GREEN}Docker already installed${NC}"
    docker --version
    docker compose version
fi

echo ""
echo -e "${GREEN}Step 2: Configuration...${NC}"
read -p "Enter site name (default: erpnext.local): " SITE_NAME
SITE_NAME=${SITE_NAME:-erpnext.local}

read -sp "Enter admin password (default: admin): " ADMIN_PASSWORD
echo ""
ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin}

read -p "Enter port for ERPNext (default: 8080): " PORT
PORT=${PORT:-8080}

echo ""
echo -e "${GREEN}Configuration:${NC}"
echo "  Site Name: $SITE_NAME"
echo "  Admin Password: ********"
echo "  Port: $PORT"
echo ""

read -p "Continue? (y/n): " CONFIRM
if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Installation cancelled."
    exit 1
fi

echo ""
echo -e "${GREEN}Step 3: Setting up ERPNext directory...${NC}"
mkdir -p /opt/erpnext
cd /opt/erpnext

# Create .env file
cat > .env << EOF
SITE_NAME=$SITE_NAME
ADMIN_PASSWORD=$ADMIN_PASSWORD
FRAPPE_SITE_NAME_HEADER=\$\$host
EOF

echo -e "${GREEN}.env file created${NC}"

# Copy docker-compose file
if [ -f "docker-compose-standalone-caddy.yml" ]; then
    cp docker-compose-standalone-caddy.yml docker-compose.yml
    echo -e "${GREEN}docker-compose.yml configured${NC}"
else
    echo -e "${RED}Error: docker-compose-standalone-caddy.yml not found${NC}"
    exit 1
fi

# Check if Caddyfile exists
if [ ! -f "Caddyfile" ]; then
    echo -e "${RED}Error: Caddyfile not found${NC}"
    exit 1
fi

# Update port in docker-compose if not 8080
if [ "$PORT" != "8080" ]; then
    echo -e "${YELLOW}Updating port to $PORT...${NC}"
    sed -i "s/\"8080:8080\"/\"$PORT:8080\"/g" docker-compose.yml
fi

echo ""
echo -e "${GREEN}Step 4: Starting ERPNext services...${NC}"
echo "This may take several minutes..."

# Run configurator
docker compose up -d configurator
sleep 10

# Create site
docker compose up -d create-site
echo "Creating ERPNext site (5-10 minutes)..."

# Wait for site creation
while docker compose ps create-site | grep -q "running\|Up"; do
    echo -n "."
    sleep 5
done
echo ""

# Start all services
docker compose up -d

echo ""
echo -e "${GREEN}Step 5: Verifying installation...${NC}"
sleep 5
docker compose ps

echo ""
echo -e "${GREEN}=========================================="
echo "Installation Complete!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo -e "${GREEN}Access ERPNext at:${NC}"
echo -e "  ${YELLOW}http://$(hostname -I | awk '{print $1}'):$PORT${NC}"
echo -e "  ${YELLOW}http://82.180.137.121:$PORT${NC}"
echo ""
echo -e "${GREEN}Login Credentials:${NC}"
echo -e "  Username: ${YELLOW}Administrator${NC}"
echo -e "  Password: ${YELLOW}$ADMIN_PASSWORD${NC}"
echo ""
echo -e "${GREEN}Docker Containers:${NC}"
echo -e "  Caddy:      Reverse proxy (like n8n/Nextcloud)"
echo -e "  Backend:    ERPNext application"
echo -e "  DB:         MariaDB database"
echo -e "  Redis:      Cache & queue"
echo -e "  Workers:    Background jobs"
echo ""
echo -e "${GREEN}Management Commands:${NC}"
echo -e "  Status:     ${YELLOW}docker compose ps${NC}"
echo -e "  Logs:       ${YELLOW}docker compose logs -f${NC}"
echo -e "  Restart:    ${YELLOW}docker compose restart${NC}"
echo -e "  Stop:       ${YELLOW}docker compose down${NC}"
echo -e "  Start:      ${YELLOW}docker compose up -d${NC}"
echo ""
echo -e "${YELLOW}Note: Make sure port $PORT is open in your firewall${NC}"
echo -e "  Run: ${YELLOW}sudo ufw allow $PORT/tcp${NC}"
echo ""