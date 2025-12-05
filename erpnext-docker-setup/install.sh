#!/bin/bash

# ERPNext Docker Installation Script for Ubuntu 22.04 LTS
# This script installs Docker, Docker Compose, and sets up ERPNext v15

set -e

echo "========================================"
echo "ERPNext v15 Docker Installation Script"
echo "========================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}" 
   echo "Please run: sudo bash install.sh"
   exit 1
fi

echo -e "${GREEN}Step 1: Updating system packages...${NC}"
apt update && apt upgrade -y

echo ""
echo -e "${GREEN}Step 2: Installing prerequisites...${NC}"
apt install -y apt-transport-https ca-certificates curl software-properties-common gnupg lsb-release

echo ""
echo -e "${GREEN}Step 3: Installing Docker...${NC}"

# Check if Docker is already installed
if command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker is already installed. Version: $(docker --version)${NC}"
else
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Set up Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Start and enable Docker
    systemctl start docker
    systemctl enable docker
    
    echo -e "${GREEN}Docker installed successfully!${NC}"
fi

echo ""
echo -e "${GREEN}Step 4: Verifying Docker installation...${NC}"
docker --version
docker compose version

echo ""
echo -e "${GREEN}Step 5: Creating ERPNext directory...${NC}"
mkdir -p /opt/erpnext
cd /opt/erpnext

echo ""
echo -e "${GREEN}Step 6: Setting up ERPNext configuration...${NC}"
echo -e "${YELLOW}Please provide the following information:${NC}"

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

read -p "Continue with these settings? (y/n): " CONFIRM
if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo -e "${RED}Installation cancelled.${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Step 7: Downloading ERPNext Docker setup files...${NC}"

# You'll need to copy the docker-compose.yml and .env from this setup
echo -e "${YELLOW}Note: Make sure docker-compose.yml and .env files are in /opt/erpnext/${NC}"

echo ""
echo -e "${GREEN}Step 8: Creating .env file...${NC}"
cat > .env << EOF
# ERPNext Site Configuration
SITE_NAME=$SITE_NAME
ADMIN_PASSWORD=$ADMIN_PASSWORD

# Frappe Site Name Header (leave as default)
FRAPPE_SITE_NAME_HEADER=\$\$host
EOF

echo ""
echo -e "${GREEN}Step 9: Starting ERPNext services...${NC}"
echo "This may take several minutes on first run..."

# Run configurator first
docker compose up -d configurator
sleep 10

# Create the site
docker compose up -d create-site
echo "Waiting for site creation to complete (this can take 5-10 minutes)..."

# Wait for site creation to complete
while docker compose ps create-site | grep -q "running\|Up"; do
    echo -n "."
    sleep 5
done
echo ""

# Start all services
docker compose up -d

echo ""
echo -e "${GREEN}Step 10: Verifying installation...${NC}"
sleep 10
docker compose ps

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}ERPNext Installation Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}Access your ERPNext installation at:${NC}"
echo -e "  ${YELLOW}http://$(hostname -I | awk '{print $1}'):$PORT${NC}"
echo -e "  ${YELLOW}http://localhost:$PORT${NC} (if accessing locally)"
echo ""
echo -e "${GREEN}Login Credentials:${NC}"
echo -e "  Username: ${YELLOW}Administrator${NC}"
echo -e "  Password: ${YELLOW}$ADMIN_PASSWORD${NC}"
echo ""
echo -e "${GREEN}Useful Commands:${NC}"
echo -e "  View logs: ${YELLOW}docker compose logs -f${NC}"
echo -e "  Stop services: ${YELLOW}docker compose down${NC}"
echo -e "  Start services: ${YELLOW}docker compose up -d${NC}"
echo -e "  Restart services: ${YELLOW}docker compose restart${NC}"
echo ""
echo -e "${YELLOW}Note: If you're accessing from outside the server, make sure port $PORT is open in your firewall.${NC}"
echo ""