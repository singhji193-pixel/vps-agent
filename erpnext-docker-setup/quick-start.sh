#!/bin/bash

# Quick Start Script - For users who already have Docker installed

set -e

echo "ERPNext v15 Quick Start"
echo "========================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed."
    echo "Please run install.sh instead for full installation."
    exit 1
fi

echo "Docker found: $(docker --version)"
echo ""

# Get configuration
read -p "Enter site name (default: erpnext.local): " SITE_NAME
SITE_NAME=${SITE_NAME:-erpnext.local}

read -sp "Enter admin password (default: admin): " ADMIN_PASSWORD
echo ""
ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin}

# Create .env file
cat > .env << EOF
SITE_NAME=$SITE_NAME
ADMIN_PASSWORD=$ADMIN_PASSWORD
FRAPPE_SITE_NAME_HEADER=\$\$host
EOF

echo ""
echo "Starting ERPNext services..."
echo "This will take several minutes on first run."
echo ""

# Run configurator
docker compose up -d configurator
sleep 10

# Create site
docker compose up -d create-site
echo "Creating ERPNext site..."

# Wait for site creation
while docker compose ps create-site | grep -q "running\|Up"; do
    echo -n "."
    sleep 5
done
echo ""

# Start all services
docker compose up -d

echo ""
echo "ERPNext is starting up!"
echo ""
echo "Access at: http://localhost:8080"
echo "Username: Administrator"
echo "Password: $ADMIN_PASSWORD"
echo ""
echo "Check status: docker compose ps"
echo "View logs: docker compose logs -f"
echo ""