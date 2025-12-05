# ERPNext v15 Docker Installation Guide

## Overview
This package contains everything you need to install **ERPNext Version 15** (latest stable) on your Ubuntu 22.04 LTS VPS using Docker.

## Why ERPNext v15?
- **Latest Stable Version**: Most recent production-ready release
- **Long-term Support**: Supported until end of 2027
- **Better Features**: Improved functionality compared to v14
- **Active Maintenance**: Regular updates and security patches

## Prerequisites
- Ubuntu 22.04 LTS VPS
- Root or sudo access
- At least 4GB RAM (8GB recommended for production)
- At least 40GB disk space
- Open port 8080 (or your chosen port) in firewall

## Installation Methods

### Method 1: Automated Installation (Recommended)

1. **Upload files to your VPS**:
   ```bash
   # On your VPS, create directory
   mkdir -p /opt/erpnext
   cd /opt/erpnext
   
   # Upload these files: docker-compose.yml, .env, install.sh
   # You can use scp, sftp, or any file transfer method
   ```

2. **Make the install script executable**:
   ```bash
   chmod +x install.sh
   ```

3. **Run the installation script**:
   ```bash
   sudo bash install.sh
   ```

4. **Follow the prompts** to configure:
   - Site name (default: erpnext.local)
   - Admin password
   - Port number (default: 8080)

5. **Wait for installation** (typically 10-15 minutes)

### Method 2: Manual Installation

1. **Install Docker and Docker Compose**:
   ```bash
   # Update system
   sudo apt update && sudo apt upgrade -y
   
   # Install prerequisites
   sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
   
   # Add Docker GPG key
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
   
   # Add Docker repository
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   
   # Install Docker
   sudo apt update
   sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   
   # Start Docker
   sudo systemctl start docker
   sudo systemctl enable docker
   ```

2. **Create ERPNext directory**:
   ```bash
   sudo mkdir -p /opt/erpnext
   cd /opt/erpnext
   ```

3. **Copy docker-compose.yml and .env files** to `/opt/erpnext/`

4. **Edit .env file** with your settings:
   ```bash
   sudo nano .env
   ```
   Update:
   - `SITE_NAME` (your domain or erpnext.local)
   - `ADMIN_PASSWORD` (strong password)

5. **Start ERPNext**:
   ```bash
   # Run configurator
   sudo docker compose up -d configurator
   sleep 10
   
   # Create site
   sudo docker compose up -d create-site
   
   # Wait for site creation (5-10 minutes)
   # Check progress with:
   sudo docker compose logs -f create-site
   
   # Once complete, start all services
   sudo docker compose up -d
   ```

## Accessing ERPNext

Once installation is complete:

1. **Open your browser** and navigate to:
   - `http://YOUR_VPS_IP:8080`
   - Or `http://your-domain.com:8080` if you configured a domain

2. **Login with**:
   - **Username**: `Administrator`
   - **Password**: (the password you set in .env file)

## Configuration

### Change Port
Edit `docker-compose.yml` and change the port mapping:
```yaml
ports:
  - "8080:8080"  # Change first number to desired port
```

### Use Custom Domain
1. Edit `.env` file:
   ```bash
   SITE_NAME=erp.yourdomain.com
   ```

2. Point your domain's A record to your VPS IP

3. Restart services:
   ```bash
   sudo docker compose down
   sudo docker compose up -d
   ```

### Enable HTTPS (Production)
For production use, set up a reverse proxy with SSL:

1. Install nginx:
   ```bash
   sudo apt install nginx certbot python3-certbot-nginx
   ```

2. Create nginx config:
   ```bash
   sudo nano /etc/nginx/sites-available/erpnext
   ```
   
   Add:
   ```nginx
   server {
       listen 80;
       server_name erp.yourdomain.com;
       
       location / {
           proxy_pass http://localhost:8080;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. Enable site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/erpnext /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

4. Get SSL certificate:
   ```bash
   sudo certbot --nginx -d erp.yourdomain.com
   ```

## Management Commands

### View all services
```bash
cd /opt/erpnext
sudo docker compose ps
```

### View logs
```bash
# All services
sudo docker compose logs -f

# Specific service
sudo docker compose logs -f frontend
sudo docker compose logs -f backend
```

### Stop services
```bash
sudo docker compose down
```

### Start services
```bash
sudo docker compose up -d
```

### Restart services
```bash
sudo docker compose restart
```

### Update ERPNext
```bash
# Pull latest images
sudo docker compose pull

# Restart with new images
sudo docker compose up -d
```

## Backup and Restore

### Backup
```bash
# Backup volumes
sudo docker run --rm \
  -v erpnext_sites:/sites \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/erpnext-backup-$(date +%Y%m%d).tar.gz /sites

# Backup database
sudo docker compose exec db mysqldump -u root -padmin --all-databases > backup-$(date +%Y%m%d).sql
```

### Restore
```bash
# Restore volumes
sudo docker run --rm \
  -v erpnext_sites:/sites \
  -v $(pwd)/backup:/backup \
  alpine tar xzf /backup/erpnext-backup-YYYYMMDD.tar.gz -C /

# Restore database
sudo docker compose exec -T db mysql -u root -padmin < backup-YYYYMMDD.sql
```

## Troubleshooting

### Site not accessible
1. Check if all services are running:
   ```bash
   sudo docker compose ps
   ```

2. Check logs for errors:
   ```bash
   sudo docker compose logs -f
   ```

3. Ensure port is open:
   ```bash
   sudo ufw allow 8080/tcp
   ```

### Services keep restarting
1. Check system resources:
   ```bash
   free -h
   df -h
   ```

2. Increase memory if needed (4GB minimum)

3. Check logs:
   ```bash
   sudo docker compose logs backend
   ```

### Database connection issues
1. Ensure database is healthy:
   ```bash
   sudo docker compose ps db
   ```

2. Check database logs:
   ```bash
   sudo docker compose logs db
   ```

### Reset installation
```bash
cd /opt/erpnext
sudo docker compose down -v
sudo docker compose up -d
```

## Performance Optimization

### For Production Use:
1. Use at least 8GB RAM
2. Enable swap if needed:
   ```bash
   sudo fallocate -l 4G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

3. Set up regular backups (cron job)
4. Use a reverse proxy with SSL (nginx + Let's Encrypt)
5. Monitor logs regularly

## Security Recommendations

1. **Change default password** immediately after first login
2. **Enable firewall**:
   ```bash
   sudo ufw enable
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow 8080/tcp
   ```

3. **Use strong passwords** for all accounts
4. **Enable HTTPS** for production
5. **Regular updates**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

6. **Regular backups** (automate with cron)

## Resources

- **ERPNext Documentation**: https://docs.erpnext.com/
- **Frappe Framework**: https://frappeframework.com/
- **Community Forum**: https://discuss.frappe.io/
- **GitHub**: https://github.com/frappe/erpnext

## Support

For issues or questions:
1. Check the logs first: `sudo docker compose logs -f`
2. Visit the community forum: https://discuss.frappe.io/
3. Check official documentation: https://docs.erpnext.com/

## Version Information

- **ERPNext Version**: v15.32.3 (latest stable as of package creation)
- **Frappe Framework**: Included with ERPNext
- **MariaDB**: 10.6
- **Redis**: 6.2-alpine
- **Support Until**: December 2027

---

**Note**: This is a production-ready setup using official Frappe Docker images. The configuration is optimized for Ubuntu 22.04 LTS and follows Docker best practices for isolation and security.