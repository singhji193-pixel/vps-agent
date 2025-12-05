# ERPNext v15 + Caddy Integration Guide

## Overview

This guide shows how to integrate ERPNext v15 with your **existing Caddy installation** on Ubuntu 22.04 LTS.

## What's Different for Caddy Users?

Instead of using the internal nginx container exposed directly, we:
1. Run ERPNext backend on `localhost:8000` (internal only)
2. Use Caddy as reverse proxy to handle external requests
3. Caddy manages SSL/TLS, routing, and public access

## Architecture

```
Internet
    ↓
Caddy (Port 8080)
    ↓
ERPNext Nginx (localhost:8000)
    ↓
ERPNext Backend + MariaDB + Redis
```

## Files for Caddy Integration

1. **docker-compose-caddy.yml** - Modified Docker setup (nginx bound to localhost only)
2. **Caddyfile.erpnext** - Caddy configuration snippet
3. **find-caddy.sh** - Script to locate your Caddy installation
4. **install-with-caddy.sh** - Automated installer for Caddy setup

## Installation Options

### Option 1: Automated Installation (Recommended)

This script will:
- Find your Caddy installation automatically
- Install ERPNext with proper configuration
- Add configuration to your existing Caddyfile
- Reload Caddy

```bash
# On your VPS (82.180.137.121)
cd /opt/erpnext
sudo bash install-with-caddy.sh
```

**The script will:**
1. Detect your Caddy installation location
2. Install Docker (if needed)
3. Deploy ERPNext containers
4. Find your Caddyfile automatically
5. Add ERPNext reverse proxy configuration
6. Reload Caddy

### Option 2: Manual Installation

#### Step 1: Find Your Caddy Installation

```bash
cd /opt/erpnext
sudo bash find-caddy.sh
```

This script will show you:
- ✅ Caddy binary location
- ✅ Caddyfile location
- ✅ Current Caddy configuration
- ✅ Ports Caddy is using

#### Step 2: Install ERPNext Containers

```bash
# Copy the Caddy-optimized docker-compose file
cp docker-compose-caddy.yml docker-compose.yml

# Configure your site
nano .env
# Set SITE_NAME and ADMIN_PASSWORD

# Start ERPNext
docker compose up -d configurator
sleep 10
docker compose up -d create-site

# Wait for site creation (5-10 minutes)
docker compose logs -f create-site

# Once complete, start all services
docker compose up -d
```

#### Step 3: Add ERPNext to Caddyfile

**Find your Caddyfile** (common locations):
- `/etc/caddy/Caddyfile`
- `/etc/Caddyfile`
- `~/.config/caddy/Caddyfile`

**Add this configuration:**

```caddy
# ERPNext on IP address
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
```

**Or use a subdomain** (when you have a domain):

```caddy
erp.yourdomain.com {
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
```

#### Step 4: Reload Caddy

```bash
# If Caddy is a systemd service
sudo systemctl reload caddy

# Or using Caddy directly
sudo caddy reload --config /etc/caddy/Caddyfile

# Check Caddy status
sudo systemctl status caddy
```

## Verification

### Check ERPNext Containers

```bash
cd /opt/erpnext
docker compose ps
```

All services should be "Up":
- backend
- db
- redis-cache
- redis-queue
- redis-socketio
- scheduler
- websocket
- queue-short
- queue-long
- nginx

### Check Caddy

```bash
# Caddy status
sudo systemctl status caddy

# Caddy logs
sudo journalctl -u caddy -f

# Test Caddy config
sudo caddy validate --config /etc/caddy/Caddyfile
```

### Test Access

Open browser: **http://82.180.137.121:8080**

You should see the ERPNext login page.

**Login:**
- Username: `Administrator`
- Password: (what you set in .env)

## Troubleshooting

### Can't Find Caddyfile?

Run the detection script:
```bash
sudo bash find-caddy.sh
```

Or search manually:
```bash
sudo find / -name "Caddyfile" 2>/dev/null
```

### Caddy Not Running?

```bash
# Check status
sudo systemctl status caddy

# Start Caddy
sudo systemctl start caddy

# View logs
sudo journalctl -u caddy -n 50
```

### Can't Access ERPNext?

1. **Check ERPNext containers:**
   ```bash
   docker compose ps
   docker compose logs nginx
   ```

2. **Check if nginx is listening:**
   ```bash
   netstat -tlnp | grep 8000
   # Should show: 127.0.0.1:8000
   ```

3. **Test internal access:**
   ```bash
   curl http://localhost:8000
   # Should return HTML
   ```

4. **Check Caddy reverse proxy:**
   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl status caddy
   ```

5. **Check firewall:**
   ```bash
   sudo ufw status
   sudo ufw allow 8080/tcp
   ```

### Port Conflict?

If port 8080 is already in use by another app:

**Option 1: Change ERPNext port**

Edit Caddyfile, change `8080` to another port (e.g., `8081`):
```caddy
82.180.137.121:8081 {
    # ... rest of config
}
```

**Option 2: Use different port in Caddy**

The ERPNext backend always runs on `localhost:8000` (internal), so you only need to change the Caddy external port.

## Configuration Examples

### Using a Custom Domain

1. **Point DNS to your VPS:**
   - Add A record: `erp.yourdomain.com` → `82.180.137.121`

2. **Update .env:**
   ```bash
   SITE_NAME=erp.yourdomain.com
   ```

3. **Update Caddyfile:**
   ```caddy
   erp.yourdomain.com {
       reverse_proxy localhost:8000 {
           header_up X-Forwarded-Host {host}
           header_up X-Forwarded-Proto {scheme}
       }
       
       @websocket {
           header Connection *Upgrade*
           header Upgrade websocket
       }
       reverse_proxy @websocket localhost:8000
   }
   ```

4. **Reload:**
   ```bash
   docker compose down
   docker compose up -d
   sudo systemctl reload caddy
   ```

Caddy will automatically get a Let's Encrypt SSL certificate! 🎉

### Multiple ERPNext Instances

If you want to run multiple ERPNext instances:

```caddy
# Instance 1
erp1.yourdomain.com {
    reverse_proxy localhost:8001
}

# Instance 2
erp2.yourdomain.com {
    reverse_proxy localhost:8002
}
```

Then configure each ERPNext instance to use different internal ports in docker-compose.yml.

## Caddy Configuration Tips

### Enable HTTP/2
Already enabled by default in Caddy! ✅

### Rate Limiting
```caddy
82.180.137.121:8080 {
    rate_limit {
        zone erpnext {
            match {
                path /*
            }
            key {remote_host}
            events 100
            window 1m
        }
    }
    
    reverse_proxy localhost:8000 {
        header_up X-Forwarded-Host {host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

### Security Headers
```caddy
82.180.137.121:8080 {
    header {
        # Security headers
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "no-referrer-when-downgrade"
        -Server
    }
    
    reverse_proxy localhost:8000 {
        header_up X-Forwarded-Host {host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

### Access Logs
```caddy
82.180.137.121:8080 {
    log {
        output file /var/log/caddy/erpnext-access.log {
            roll_size 100mb
            roll_keep 10
        }
        format json
    }
    
    reverse_proxy localhost:8000
}
```

## Management Commands

### ERPNext (Docker)

```bash
cd /opt/erpnext

# View all services
docker compose ps

# View logs
docker compose logs -f
docker compose logs -f nginx
docker compose logs -f backend

# Restart services
docker compose restart

# Stop services
docker compose down

# Start services
docker compose up -d

# Update ERPNext
docker compose pull
docker compose up -d
```

### Caddy

```bash
# Status
sudo systemctl status caddy

# Start/Stop/Restart
sudo systemctl start caddy
sudo systemctl stop caddy
sudo systemctl restart caddy

# Reload config (no downtime)
sudo systemctl reload caddy

# View logs
sudo journalctl -u caddy -f

# Validate config
sudo caddy validate --config /etc/caddy/Caddyfile

# Test config and show details
sudo caddy adapt --config /etc/caddy/Caddyfile
```

## Backup

### Backup ERPNext Data

```bash
cd /opt/erpnext

# Backup database
docker compose exec db mysqldump -u root -padmin --all-databases > backup-$(date +%Y%m%d).sql

# Backup files
docker run --rm -v erpnext_sites:/sites -v $(pwd):/backup alpine tar czf /backup/sites-$(date +%Y%m%d).tar.gz /sites
```

### Backup Caddy Configuration

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup-$(date +%Y%m%d)
```

## Benefits of Caddy + ERPNext

✅ **Automatic HTTPS** - Caddy handles SSL automatically
✅ **Easy Configuration** - Simple, readable Caddyfile
✅ **HTTP/2 & HTTP/3** - Modern protocols out of the box
✅ **Graceful Reloads** - No downtime when updating config
✅ **Multiple Sites** - Easy to host multiple ERPNext instances
✅ **Consistent** - Works like your n8n and other Docker apps

## Next Steps

1. ✅ Install ERPNext with Caddy
2. ✅ Access and complete setup wizard
3. ✅ Change default password
4. ⬜ Set up custom domain (optional)
5. ⬜ Configure automated backups
6. ⬜ Set up monitoring
7. ⬜ Invite team members

## Support

- **Caddy Docs**: https://caddyserver.com/docs/
- **ERPNext Docs**: https://docs.erpnext.com/
- **Community Forum**: https://discuss.frappe.io/

---

**Ready to install?** Run:
```bash
ssh root@82.180.137.121
cd /opt/erpnext
sudo bash install-with-caddy.sh
```
