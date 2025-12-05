#!/bin/bash

# Script to transfer ERPNext setup files to your VPS
# Run this from your local machine (not on VPS)

VPS_IP="82.180.137.121"
VPS_USER="root"
VPS_PATH="/opt/erpnext"

echo "=========================================="
echo "Transfer ERPNext Setup Files to VPS"
echo "=========================================="
echo ""
echo "This will copy all necessary files to:"
echo "  $VPS_USER@$VPS_IP:$VPS_PATH"
echo ""
read -p "Continue? (y/n): " CONFIRM

if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Transfer cancelled."
    exit 1
fi

echo ""
echo "Creating directory on VPS..."
ssh $VPS_USER@$VPS_IP "mkdir -p $VPS_PATH"

echo "Transferring files..."
scp docker-compose.yml .env install.sh quick-start.sh README.md INSTALLATION-INSTRUCTIONS.txt \
    $VPS_USER@$VPS_IP:$VPS_PATH/

echo ""
echo "Setting permissions..."
ssh $VPS_USER@$VPS_IP "chmod +x $VPS_PATH/*.sh"

echo ""
echo "=========================================="
echo "Transfer Complete!"
echo "=========================================="
echo ""
echo "Next steps on your VPS:"
echo "  1. SSH to VPS: ssh $VPS_USER@$VPS_IP"
echo "  2. Go to directory: cd $VPS_PATH"
echo "  3. Run installer: sudo bash install.sh"
echo ""
echo "Or if Docker is already installed:"
echo "  sudo bash quick-start.sh"
echo ""
