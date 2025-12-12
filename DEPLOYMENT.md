# VPS Agent - Deployment Guide

Deploy VPS Agent to your own VPS server.

## Prerequisites

- Ubuntu 20.04+ VPS (DigitalOcean, Linode, AWS, etc.)
- SSH access with sudo privileges
- Domain name (optional, for SSL)
- Anthropic API key

## Quick Deploy (Automated)

### Step 1: Download the App

From Replit, click the three dots menu → **Download as ZIP**

### Step 2: Upload to Your VPS

```bash
# On your local machine
scp vps-agent.zip user@your-vps-ip:~/

# On your VPS
ssh user@your-vps-ip
unzip vps-agent.zip -d vps-agent
cd vps-agent
```

### Step 3: Run the Deploy Script

```bash
# Make executable
chmod +x deploy.sh

# Run with your Anthropic API key
./deploy.sh --anthropic-key "sk-ant-xxxxx"

# Or with a domain
./deploy.sh --anthropic-key "sk-ant-xxxxx" --domain "vps.yourdomain.com"
```

The script will:
1. Install Node.js 20, PM2, PostgreSQL, Nginx
2. Create the database
3. Configure environment variables
4. Build and start the app
5. Set up Nginx reverse proxy
6. Configure SSL (if domain provided)
7. Set up firewall

## Manual Deployment

If you prefer manual control, follow these steps:

### 1. System Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib
```

### 2. Database Setup

```bash
sudo -u postgres psql

CREATE USER vpsagent WITH PASSWORD 'your-secure-password';
CREATE DATABASE vpsagent OWNER vpsagent;
GRANT ALL PRIVILEGES ON DATABASE vpsagent TO vpsagent;
\q
```

### 3. Application Setup

```bash
cd ~/vps-agent

# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://vpsagent:your-secure-password@localhost:5432/vpsagent
SESSION_SECRET=$(openssl rand -base64 32)
ANTHROPIC_API_KEY=your-anthropic-key
NODE_ENV=production
PORT=5000
EOF

# Install dependencies
npm install

# Push database schema
npm run db:push

# Build for production
npm run build
```

### 4. Start with PM2

```bash
# Using ecosystem config
pm2 start ecosystem.config.cjs

# Or directly
pm2 start dist/index.cjs --name vps-agent

# Save for auto-restart
pm2 save
pm2 startup
```

### 5. Nginx Setup

```bash
sudo apt install -y nginx

sudo nano /etc/nginx/sites-available/vps-agent
```

Add:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

Enable:
```bash
sudo ln -s /etc/nginx/sites-available/vps-agent /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6. SSL with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Updating the App

```bash
cd ~/vps-agent

# Upload new files or git pull
git pull origin main  # if using git

# Rebuild
npm install
npm run build

# Restart
pm2 restart vps-agent
```

## Useful Commands

```bash
pm2 logs vps-agent        # View logs
pm2 monit                  # Monitor resources
pm2 restart vps-agent     # Restart app
pm2 stop vps-agent        # Stop app
sudo systemctl status nginx   # Check Nginx
sudo certbot renew --dry-run  # Test SSL renewal
```

## Troubleshooting

### App not accessible
```bash
pm2 logs vps-agent
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

### Database connection issues
```bash
sudo -u postgres psql -c "\l"  # List databases
sudo systemctl status postgresql
```

### Port already in use
```bash
sudo lsof -i :5000
pm2 delete all
pm2 start ecosystem.config.cjs
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| DATABASE_URL | PostgreSQL connection string |
| SESSION_SECRET | Random secret for session encryption |
| ANTHROPIC_API_KEY | Your Anthropic API key |
| NODE_ENV | Set to "production" |
| PORT | Server port (default: 5000) |

## Security Recommendations

1. Use strong passwords for database
2. Keep system packages updated
3. Enable automatic security updates
4. Use SSH keys instead of passwords
5. Consider adding fail2ban for brute-force protection
