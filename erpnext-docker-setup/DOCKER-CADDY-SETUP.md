# ERPNext v15 with Caddy Container Setup

## Perfect for Your Setup!

Since you're running **Caddy inside Docker for each app** (like n8n and Nextcloud), this setup follows the **same pattern**.

## Architecture

```
┌─────────────────────────────────────────┐
│  ERPNext Docker Stack (Port 8080)      │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  Caddy Container                 │  │
│  │  (Port 8080 exposed)             │  │
│  └──────────┬───────────────────────┘  │
│             ↓                           │
│  ┌──────────────────────────────────┐  │
│  │  Nginx Container (internal)      │  │
│  └──────────┬───────────────────────┘  │
│             ↓                           │
│  ┌──────────────────────────────────┐  │
│  │  ERPNext Backend                 │  │
│  │  MariaDB                         │  │
│  │  Redis (cache/queue)             │  │
│  │  Workers & Scheduler             │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Just like your n8n and Nextcloud!** Each app has its own isolated Caddy container.

## Key Files

1. **docker-compose-standalone-caddy.yml** - Complete Docker setup with Caddy container
2. **Caddyfile** - Caddy configuration (mounted into Caddy container)
3. **install-standalone-caddy.sh** - One-click installer
4. **.env** - Configuration (site name, password)

## Quick Installation

### 3-Step Installation

```bash
# 1. SSH to your VPS
ssh root@82.180.137.121

# 2. Create directory and upload files
mkdir -p /opt/erpnext
cd /opt/erpnext
# Upload these files here:
# - docker-compose-standalone-caddy.yml
# - Caddyfile
# - install-standalone-caddy.sh
# - .env

# 3. Run installer
sudo bash install-standalone-caddy.sh
```

**Time:** ~15 minutes

## What Makes This Different?

### ✅ Same Pattern as Your Other Apps

| App | Setup |
|-----|-------|
| **n8n** | Docker Compose + Caddy container |
| **Nextcloud** | Docker Compose + Caddy container |
| **ERPNext** | Docker Compose + Caddy container ← Same! |

### ✅ Benefits

- **Isolated**: Each app has its own Caddy container
- **No Conflicts**: ERPNext port 8080 won't affect n8n or Nextcloud
- **Independent**: Start/stop ERPNext without affecting other apps
- **Familiar**: Same management commands as n8n/Nextcloud
- **Clean**: No system-wide Caddy to configure

## Docker Compose Structure

```yaml
services:
  caddy:                # ← Caddy container (exposed to internet)
    image: caddy:2.7-alpine
    ports:
      - "8080:8080"     # ← External port (change if needed)
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
  
  nginx:                # ← Internal nginx (not exposed)
    image: frappe/erpnext:v15
    # No ports exposed
  
  backend:              # ← ERPNext backend
    image: frappe/erpnext:v15
  
  db:                   # ← MariaDB
    image: mariadb:10.6
  
  redis-cache:          # ← Redis
    image: redis:6.2-alpine
  
  # ... workers, scheduler, etc.
```

## Caddyfile Configuration

Simple reverse proxy configuration:

```caddy
:8080 {
    reverse_proxy nginx:8080
}
```

That's it! Caddy handles everything automatically.

## Port Configuration

**Default:** Port 8080

**Change Port:** Edit `docker-compose-standalone-caddy.yml`

```yaml
caddy:
  ports:
    - "9090:8080"  # Change first number to desired port
```

Or the installer will ask you during setup.

## Management Commands

Same commands as your n8n and Nextcloud setups:

```bash
cd /opt/erpnext

# View status
docker compose ps

# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f caddy
docker compose logs -f backend
docker compose logs -f db

# Restart all services
docker compose restart

# Restart specific service
docker compose restart caddy

# Stop all services
docker compose down

# Start all services
docker compose up -d

# Update to latest images
docker compose pull
docker compose up -d
```

## File Structure

```
/opt/erpnext/
├── docker-compose.yml          # Main Docker config
├── Caddyfile                   # Caddy configuration
├── .env                        # Environment variables
└── (volumes created by Docker)
```

## Access ERPNext

**URL:** `http://82.180.137.121:8080`

**Login:**
- Username: `Administrator`
- Password: (from .env file)

## Adding Custom Domain

When you get a domain (e.g., `erp.yourdomain.com`):

### 1. Update DNS
Point A record to `82.180.137.121`

### 2. Update .env
```bash
SITE_NAME=erp.yourdomain.com
```

### 3. Update Caddyfile
```caddy
erp.yourdomain.com {
    reverse_proxy nginx:8080 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

### 4. Restart
```bash
docker compose down
docker compose up -d
```

**Caddy will automatically get SSL certificate!** 🎉

## Comparison with System-Wide Caddy

| Aspect | System-Wide Caddy | Docker Caddy (Your Setup) |
|--------|-------------------|---------------------------|
| **Installation** | Installed on host OS | Container per app |
| **Configuration** | Single Caddyfile | Caddyfile per app |
| **Isolation** | Shared | Fully isolated |
| **Updates** | Update host Caddy | Update container image |
| **Conflicts** | Possible | None |
| **Management** | systemctl | docker compose |
| **Your n8n** | ❌ | ✅ |
| **Your Nextcloud** | ❌ | ✅ |
| **ERPNext (this)** | ❌ | ✅ |

## Troubleshooting

### Port Already in Use?

```bash
# Check what's using port 8080
sudo netstat -tlnp | grep 8080

# Or use different port
nano docker-compose.yml
# Change: "8080:8080" to "9090:8080"
```

### Caddy Container Not Starting?

```bash
# Check logs
docker compose logs caddy

# Validate Caddyfile
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile

# Restart Caddy
docker compose restart caddy
```

### Can't Access ERPNext?

```bash
# 1. Check all containers running
docker compose ps

# 2. Check Caddy logs
docker compose logs caddy

# 3. Check nginx logs
docker compose logs nginx

# 4. Test internal connection
docker compose exec caddy wget -O- http://nginx:8080

# 5. Check firewall
sudo ufw allow 8080/tcp
```

### ERPNext Site Not Created?

```bash
# Check create-site logs
docker compose logs create-site

# Manually trigger site creation
docker compose up create-site

# Or recreate
docker compose down -v
docker compose up -d
```

## Backup

### Backup Everything

```bash
cd /opt/erpnext

# Backup database
docker compose exec db mysqldump -u root -padmin --all-databases > backup-$(date +%Y%m%d).sql

# Backup files
docker compose exec backend tar czf /tmp/sites-backup.tar.gz /home/frappe/frappe-bench/sites
docker compose cp backend:/tmp/sites-backup.tar.gz ./sites-backup-$(date +%Y%m%d).tar.gz

# Backup configuration
tar czf config-backup-$(date +%Y%m%d).tar.gz docker-compose.yml Caddyfile .env
```

## Advantages of This Setup

✅ **Consistency**: Same setup pattern as n8n/Nextcloud
✅ **Isolation**: Each app completely independent
✅ **Portability**: Easy to move to another server
✅ **Updates**: Simple container updates
✅ **Rollback**: Easy to revert if issues
✅ **Scalability**: Can add more ERPNext instances easily
✅ **No System Changes**: Doesn't modify host OS
✅ **Clean Removal**: Simple `docker compose down -v` removes everything

## Adding More Apps

You can continue this pattern:

```
/opt/
├── n8n/               (Port 8000)
│   ├── docker-compose.yml
│   └── Caddyfile
├── nextcloud/         (Port 8100)
│   ├── docker-compose.yml
│   └── Caddyfile
├── erpnext/           (Port 8080)
│   ├── docker-compose.yml
│   └── Caddyfile
└── another-app/       (Port 8200)
    ├── docker-compose.yml
    └── Caddyfile
```

Each app is completely isolated! 🎉

## Security Notes

1. **Change default password** in .env before installation
2. **Use strong passwords** for admin account
3. **Enable firewall**:
   ```bash
   sudo ufw enable
   sudo ufw allow 22/tcp
   sudo ufw allow 8080/tcp
   ```
4. **Regular backups**: Automate with cron
5. **Keep updated**: Run `docker compose pull` regularly
6. **Monitor logs**: Check for suspicious activity

## Performance Tips

1. **Allocate enough RAM**: 8GB recommended
2. **Use SSD storage**: Much faster database operations
3. **Monitor resources**:
   ```bash
   docker stats
   ```
4. **Set up swap** if needed:
   ```bash
   sudo fallocate -l 4G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

## Next Steps After Installation

1. ✅ Access ERPNext at http://82.180.137.121:8080
2. ✅ Complete setup wizard
3. ✅ Change Administrator password
4. ✅ Configure company details
5. ⬜ Import data (if migrating)
6. ⬜ Set up users and permissions
7. ⬜ Configure modules (Accounting, Inventory, etc.)
8. ⬜ Set up automated backups

---

**Perfect for your setup!** This matches exactly how you're running n8n and Nextcloud.

Run the installer and you'll have ERPNext running in minutes! 🚀
