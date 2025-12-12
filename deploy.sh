#!/bin/bash

# VPS Agent Deployment Script
# Run this on your VPS to deploy the application

set -e

echo "=========================================="
echo "  VPS Agent Deployment Script"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration - EDIT THESE VALUES
APP_NAME="vps-agent"
APP_DIR="/home/$USER/$APP_NAME"
DOMAIN=""  # Leave empty if no domain yet
DB_NAME="vpsagent"
DB_USER="vpsagent"
DB_PASS=""  # Will be generated if empty
ANTHROPIC_KEY=""  # Your Anthropic API key

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Please don't run as root. Run as a regular user with sudo access.${NC}"
    exit 1
fi

# Function to generate random password
generate_password() {
    openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 24
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --anthropic-key)
            ANTHROPIC_KEY="$2"
            shift 2
            ;;
        --db-pass)
            DB_PASS="$2"
            shift 2
            ;;
        --help)
            echo "Usage: ./deploy.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --domain <domain>       Your domain name (e.g., vps.example.com)"
            echo "  --anthropic-key <key>   Your Anthropic API key"
            echo "  --db-pass <password>    Database password (auto-generated if not provided)"
            echo "  --help                  Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Check for required API key
if [ -z "$ANTHROPIC_KEY" ]; then
    echo -e "${YELLOW}Anthropic API key not provided.${NC}"
    read -p "Enter your Anthropic API key: " ANTHROPIC_KEY
    if [ -z "$ANTHROPIC_KEY" ]; then
        echo -e "${RED}Anthropic API key is required!${NC}"
        exit 1
    fi
fi

# Generate database password if not provided
if [ -z "$DB_PASS" ]; then
    DB_PASS=$(generate_password)
    echo -e "${GREEN}Generated database password: $DB_PASS${NC}"
    echo -e "${YELLOW}Save this password somewhere safe!${NC}"
fi

# Generate session secret
SESSION_SECRET=$(generate_password)

echo ""
echo -e "${GREEN}Step 1: Updating system packages...${NC}"
sudo apt update && sudo apt upgrade -y

echo ""
echo -e "${GREEN}Step 2: Installing Node.js 20...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "Node.js already installed: $(node --version)"
fi

echo ""
echo -e "${GREEN}Step 3: Installing PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
else
    echo "PM2 already installed: $(pm2 --version)"
fi

echo ""
echo -e "${GREEN}Step 4: Installing PostgreSQL...${NC}"
if ! command -v psql &> /dev/null; then
    sudo apt install -y postgresql postgresql-contrib
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
else
    echo "PostgreSQL already installed"
fi

echo ""
echo -e "${GREEN}Step 5: Setting up database...${NC}"
# Check if database exists
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo "Database $DB_NAME already exists"
else
    sudo -u postgres psql << EOF
CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF
    echo "Database created successfully"
fi

echo ""
echo -e "${GREEN}Step 6: Setting up application directory...${NC}"
mkdir -p $APP_DIR
cd $APP_DIR

# Check if app files exist
if [ ! -f "package.json" ]; then
    echo -e "${YELLOW}Application files not found in $APP_DIR${NC}"
    echo "Please upload your application files first using one of these methods:"
    echo ""
    echo "Option 1: Git clone (if pushed to GitHub)"
    echo "  git clone https://github.com/yourusername/vps-agent.git $APP_DIR"
    echo ""
    echo "Option 2: SCP from your local machine"
    echo "  scp -r /path/to/your/app/* $USER@$(hostname -I | awk '{print $1}'):$APP_DIR/"
    echo ""
    echo "Option 3: Download ZIP from Replit and extract here"
    echo ""
    echo "After uploading, run this script again."
    exit 1
fi

echo ""
echo -e "${GREEN}Step 7: Creating environment file...${NC}"
cat > .env << EOF
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
SESSION_SECRET=$SESSION_SECRET
ANTHROPIC_API_KEY=$ANTHROPIC_KEY
NODE_ENV=production
PORT=5000
EOF
echo "Environment file created"

echo ""
echo -e "${GREEN}Step 8: Installing dependencies...${NC}"
npm install

echo ""
echo -e "${GREEN}Step 9: Pushing database schema...${NC}"
npm run db:push

echo ""
echo -e "${GREEN}Step 10: Building application...${NC}"
npm run build

echo ""
echo -e "${GREEN}Step 11: Starting application with PM2...${NC}"
pm2 delete $APP_NAME 2>/dev/null || true
pm2 start dist/index.cjs --name $APP_NAME
pm2 save

echo ""
echo -e "${GREEN}Step 12: Setting up PM2 startup...${NC}"
pm2 startup systemd -u $USER --hp /home/$USER
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER
pm2 save

echo ""
echo -e "${GREEN}Step 13: Installing and configuring Nginx...${NC}"
if ! command -v nginx &> /dev/null; then
    sudo apt install -y nginx
fi

# Create Nginx config
if [ -n "$DOMAIN" ]; then
    NGINX_SERVER_NAME="server_name $DOMAIN www.$DOMAIN;"
else
    NGINX_SERVER_NAME="server_name _;"
fi

sudo tee /etc/nginx/sites-available/$APP_NAME > /dev/null << EOF
server {
    listen 80;
    $NGINX_SERVER_NAME

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # WebSocket support
        proxy_read_timeout 86400;
    }
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Test and reload Nginx
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable nginx

echo ""
echo -e "${GREEN}Step 14: Configuring firewall...${NC}"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# SSL setup if domain provided
if [ -n "$DOMAIN" ]; then
    echo ""
    echo -e "${GREEN}Step 15: Setting up SSL with Let's Encrypt...${NC}"
    sudo apt install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN || {
        echo -e "${YELLOW}SSL setup failed. You can run it manually later:${NC}"
        echo "sudo certbot --nginx -d $DOMAIN"
    }
fi

echo ""
echo "=========================================="
echo -e "${GREEN}  Deployment Complete!${NC}"
echo "=========================================="
echo ""
echo "Your VPS Agent is now running!"
echo ""
if [ -n "$DOMAIN" ]; then
    echo -e "Access your app at: ${GREEN}https://$DOMAIN${NC}"
else
    echo -e "Access your app at: ${GREEN}http://$(hostname -I | awk '{print $1}')${NC}"
fi
echo ""
echo "Useful commands:"
echo "  pm2 logs $APP_NAME     - View application logs"
echo "  pm2 restart $APP_NAME  - Restart the application"
echo "  pm2 stop $APP_NAME     - Stop the application"
echo "  pm2 monit              - Monitor CPU/memory usage"
echo ""
echo -e "${YELLOW}Save these credentials:${NC}"
echo "  Database Password: $DB_PASS"
echo "  Session Secret: $SESSION_SECRET"
echo ""
