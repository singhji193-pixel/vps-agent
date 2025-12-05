#!/bin/bash

# Script to find and display Caddy installation details

echo "=========================================="
echo "Caddy Installation Detector"
echo "=========================================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if Caddy is running
echo -e "${GREEN}1. Checking if Caddy is running...${NC}"
if systemctl is-active --quiet caddy; then
    echo -e "${GREEN}✓ Caddy service is running${NC}"
    systemctl status caddy --no-pager | head -10
elif pgrep -x caddy > /dev/null; then
    echo -e "${GREEN}✓ Caddy process is running (not as systemd service)${NC}"
    ps aux | grep caddy | grep -v grep
elif docker ps | grep -q caddy; then
    echo -e "${GREEN}✓ Caddy is running in Docker${NC}"
    docker ps | grep caddy
else
    echo -e "${RED}✗ Caddy does not appear to be running${NC}"
fi

echo ""
echo -e "${GREEN}2. Searching for Caddy binary...${NC}"
CADDY_BIN=$(which caddy 2>/dev/null)
if [ -n "$CADDY_BIN" ]; then
    echo -e "${GREEN}✓ Caddy binary found: $CADDY_BIN${NC}"
    caddy version
else
    echo -e "${YELLOW}⚠ Caddy binary not in PATH${NC}"
    # Search common locations
    for loc in /usr/bin/caddy /usr/local/bin/caddy /opt/caddy/caddy ~/caddy; do
        if [ -f "$loc" ]; then
            echo -e "${GREEN}✓ Found at: $loc${NC}"
            CADDY_BIN=$loc
            break
        fi
    done
fi

echo ""
echo -e "${GREEN}3. Searching for Caddyfile...${NC}"
CADDYFILE_LOCATIONS=(
    "/etc/caddy/Caddyfile"
    "/etc/Caddyfile"
    "$HOME/Caddyfile"
    "/opt/caddy/Caddyfile"
    "/srv/caddy/Caddyfile"
    "$HOME/.config/caddy/Caddyfile"
)

FOUND_CADDYFILE=""
for loc in "${CADDYFILE_LOCATIONS[@]}"; do
    if [ -f "$loc" ]; then
        echo -e "${GREEN}✓ Caddyfile found: $loc${NC}"
        FOUND_CADDYFILE="$loc"
        echo "  Size: $(du -h $loc | cut -f1)"
        echo "  Last modified: $(stat -c %y $loc | cut -d. -f1)"
        break
    fi
done

if [ -z "$FOUND_CADDYFILE" ]; then
    echo -e "${YELLOW}⚠ Caddyfile not found in common locations${NC}"
    echo "Searching entire system (this may take a moment)..."
    SEARCH_RESULT=$(find / -name "Caddyfile" 2>/dev/null | head -1)
    if [ -n "$SEARCH_RESULT" ]; then
        echo -e "${GREEN}✓ Found: $SEARCH_RESULT${NC}"
        FOUND_CADDYFILE="$SEARCH_RESULT"
    fi
fi

echo ""
echo -e "${GREEN}4. Caddy configuration directory...${NC}"
for dir in /etc/caddy /etc/caddy/conf.d ~/.config/caddy /opt/caddy; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✓ Config directory found: $dir${NC}"
        echo "  Contents:"
        ls -lah "$dir" | head -10
    fi
done

echo ""
echo -e "${GREEN}5. Caddy ports in use...${NC}"
ss -tlnp | grep caddy || netstat -tlnp | grep caddy

echo ""
echo -e "${GREEN}6. Caddy Docker container (if applicable)...${NC}"
if docker ps | grep -q caddy; then
    docker ps | grep caddy
    echo ""
    echo "Docker Caddy config location:"
    docker inspect $(docker ps | grep caddy | awk '{print $1}') | grep -i volume -A 10
else
    echo "No Caddy Docker container found"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}Summary${NC}"
echo "=========================================="

if [ -n "$CADDY_BIN" ]; then
    echo -e "Caddy Binary: ${GREEN}$CADDY_BIN${NC}"
else
    echo -e "Caddy Binary: ${RED}Not found${NC}"
fi

if [ -n "$FOUND_CADDYFILE" ]; then
    echo -e "Caddyfile: ${GREEN}$FOUND_CADDYFILE${NC}"
    echo ""
    echo -e "${YELLOW}Current Caddyfile contents:${NC}"
    echo "------------------------------------------"
    cat "$FOUND_CADDYFILE"
    echo "------------------------------------------"
else
    echo -e "Caddyfile: ${RED}Not found${NC}"
fi

echo ""
echo -e "${YELLOW}Next steps for ERPNext integration:${NC}"
if [ -n "$FOUND_CADDYFILE" ]; then
    echo "1. Add ERPNext config to: $FOUND_CADDYFILE"
    echo "2. Use the configuration from Caddyfile.erpnext"
    echo "3. Reload Caddy: systemctl reload caddy (or caddy reload)"
else
    echo "1. Locate your Caddyfile manually"
    echo "2. Or create new one at /etc/caddy/Caddyfile"
    echo "3. Add ERPNext configuration"
fi
echo ""