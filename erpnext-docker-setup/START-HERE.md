# 🚀 ERPNext v15 Installation - START HERE

## Which Setup Do You Need?

Since **Caddy runs inside Docker containers for each of your apps** (n8n, Nextcloud), use the **Docker Caddy Setup**.

---

## ✅ RECOMMENDED: Docker Caddy Setup

**Perfect for your setup!** Each app has its own isolated Caddy container.

### Quick Start

```bash
ssh root@82.180.137.121
mkdir -p /opt/erpnext && cd /opt/erpnext

# Upload these 4 files:
# 1. docker-compose-standalone-caddy.yml
# 2. Caddyfile
# 3. install-standalone-caddy.sh
# 4. .env (optional)

sudo bash install-standalone-caddy.sh
```

### Key Files
- ✅ **docker-compose-standalone-caddy.yml** - Main setup
- ✅ **Caddyfile** - Caddy config
- ✅ **install-standalone-caddy.sh** - Installer
- ✅ **DOCKER-CADDY-SETUP.md** - Full documentation
- ✅ **INSTALLATION-DOCKER-CADDY.txt** - Quick reference

### Benefits
- Same pattern as n8n/Nextcloud
- Fully isolated
- No system-wide configuration needed
- Easy management with docker compose

---

## Alternative Setups (If Needed)

### Setup 1: Standalone with Built-in Nginx
Use if you don't want Caddy at all.

**Files:**
- docker-compose.yml
- install.sh
- README.md

### Setup 2: System-Wide Caddy Integration
Use if you have Caddy installed as a system service (not Docker).

**Files:**
- docker-compose-caddy.yml
- Caddyfile.erpnext
- install-with-caddy.sh
- find-caddy.sh
- CADDY-INTEGRATION-GUIDE.md

---

## File Organization

```
/app/erpnext-docker-setup/

📦 FOR YOUR DOCKER CADDY SETUP (RECOMMENDED):
├── ✅ docker-compose-standalone-caddy.yml    ← Use this as docker-compose.yml
├── ✅ Caddyfile                              ← Caddy configuration
├── ✅ install-standalone-caddy.sh            ← Automated installer
├── ✅ DOCKER-CADDY-SETUP.md                  ← Full documentation
├── ✅ INSTALLATION-DOCKER-CADDY.txt          ← Quick reference
└── ✅ .env                                   ← Configuration

📚 DOCUMENTATION:
├── START-HERE.md                             ← This file
├── SUMMARY.md                                ← Overview
└── README.md                                 ← General docs

🔧 OTHER SETUPS (if needed):
├── docker-compose.yml                        ← Standalone nginx
├── docker-compose-caddy.yml                  ← System-wide Caddy
├── install.sh                                ← Standalone installer
├── install-with-caddy.sh                     ← System Caddy installer
├── find-caddy.sh                             ← Find system Caddy
├── Caddyfile.erpnext                         ← System Caddy config
├── CADDY-INTEGRATION-GUIDE.md                ← System Caddy docs
├── INSTALLATION-INSTRUCTIONS.txt             ← Standalone docs
└── QUICK-START-CADDY.txt                     ← System Caddy quick start
```

---

## Installation Comparison

| Method | Your Setup | Files to Use | Installation Time |
|--------|-----------|--------------|-------------------|
| **Docker Caddy** | ✅ **YES** | docker-compose-standalone-caddy.yml + Caddyfile | ~15 min |
| System Caddy | Maybe | docker-compose-caddy.yml + find-caddy.sh | ~15 min |
| Standalone Nginx | No Caddy | docker-compose.yml | ~15 min |

---

## Your App Structure (With ERPNext)

```
/opt/
├── n8n/
│   ├── docker-compose.yml
│   └── Caddyfile          (Caddy in Docker)
│
├── nextcloud/
│   ├── docker-compose.yml
│   └── Caddyfile          (Caddy in Docker)
│
└── erpnext/               ← NEW
    ├── docker-compose.yml (from docker-compose-standalone-caddy.yml)
    └── Caddyfile          (Caddy in Docker)
```

**Perfect consistency!** 🎯

---

## Quick Reference

### Installation
```bash
# 1. Transfer files to VPS
scp docker-compose-standalone-caddy.yml Caddyfile install-standalone-caddy.sh \
    root@82.180.137.121:/opt/erpnext/

# 2. SSH and install
ssh root@82.180.137.121
cd /opt/erpnext
sudo bash install-standalone-caddy.sh
```

### Access
- **URL:** http://82.180.137.121:8080
- **Username:** Administrator
- **Password:** (what you set during installation)

### Management
```bash
cd /opt/erpnext
docker compose ps              # Status
docker compose logs -f         # Logs
docker compose restart         # Restart
```

---

## What You Get

✅ **ERPNext v15** (Latest stable, supported until 2027)

✅ **Complete Stack:**
- Caddy container (reverse proxy)
- ERPNext backend (Frappe)
- MariaDB 10.6 (database)
- Redis 6.2 (cache & queues)
- Background workers
- Scheduler

✅ **Isolated Setup:**
- Own Docker network
- Own volumes
- No conflicts with n8n/Nextcloud

✅ **Production Ready:**
- Automatic restarts
- Persistent data
- Easy backups
- Simple updates

---

## After Installation

1. ✅ Access ERPNext at http://82.180.137.121:8080
2. ✅ Login with Administrator account
3. ✅ Complete setup wizard
4. ✅ Change default password
5. ✅ Configure company details
6. ✅ Start using ERPNext!

---

## Support & Documentation

- **Quick Start:** INSTALLATION-DOCKER-CADDY.txt
- **Full Guide:** DOCKER-CADDY-SETUP.md
- **ERPNext Docs:** https://docs.erpnext.com/
- **Caddy Docs:** https://caddyserver.com/docs/
- **Community:** https://discuss.frappe.io/

---

## Need Help?

### Can't decide which setup?
→ Use **Docker Caddy Setup** (matches your n8n/Nextcloud)

### Port conflict?
→ Installer will ask which port to use

### Want to use domain?
→ Instructions in DOCKER-CADDY-SETUP.md

### Want to customize?
→ Edit Caddyfile and docker-compose.yml

---

## Ready to Install?

### Step 1: Transfer Files
Transfer these to your VPS `/opt/erpnext/`:
1. docker-compose-standalone-caddy.yml
2. Caddyfile
3. install-standalone-caddy.sh

### Step 2: Run Installer
```bash
ssh root@82.180.137.121
cd /opt/erpnext
sudo bash install-standalone-caddy.sh
```

### Step 3: Wait ~15 Minutes

### Step 4: Access ERPNext
http://82.180.137.121:8080

---

## Questions?

| Question | Answer |
|----------|--------|
| **Which version?** | ERPNext v15 (latest, supported until 2027) |
| **Which setup?** | Docker Caddy (matches your n8n/Nextcloud) |
| **Which port?** | 8080 (or choose during install) |
| **Need domain?** | Optional, can add later |
| **Need SSL?** | Automatic when using domain |
| **Time needed?** | ~15 minutes |
| **System changes?** | None (all in Docker) |

---

## 🎯 Bottom Line

**For your setup (Caddy in Docker):**
1. Use **docker-compose-standalone-caddy.yml**
2. Use **Caddyfile**
3. Run **install-standalone-caddy.sh**
4. Read **DOCKER-CADDY-SETUP.md** for details

**Simple, isolated, and consistent with your other apps!** ✅

---

## Let's Go! 🚀

```bash
ssh root@82.180.137.121
mkdir -p /opt/erpnext && cd /opt/erpnext
sudo bash install-standalone-caddy.sh
```

**That's it!** ERPNext will be running on port 8080 in ~15 minutes.
