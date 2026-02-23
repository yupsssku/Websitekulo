#!/bin/bash
# ============================================================
# VirtualSIM - Auto Install Script untuk VPS Ubuntu/Debian
# Jalankan: bash install.sh
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════╗"
echo "║        VirtualSIM - Auto Installer           ║"
echo "║     Reseller Nomor Virtual OTP 24/7          ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Jalankan sebagai root: sudo bash install.sh${NC}"
  exit 1
fi

echo -e "${BLUE}[1/6] Update sistem...${NC}"
apt-get update -qq && apt-get upgrade -y -qq

echo -e "${BLUE}[2/6] Install Node.js 20 LTS...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
apt-get install -y nodejs -qq

echo -e "${BLUE}[3/6] Install PM2 (process manager)...${NC}"
npm install -g pm2 -q

echo -e "${BLUE}[4/6] Install dependencies...${NC}"
npm install -q

echo -e "${BLUE}[5/6] Buat folder database...${NC}"
mkdir -p database
chmod 755 database

echo -e "${BLUE}[6/6] Setup PM2 autostart...${NC}"
pm2 start server.js --name "virtualsim" -f
pm2 startup | tail -1 | bash > /dev/null 2>&1
pm2 save

# Cek port
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✅ INSTALASI BERHASIL!               ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  🌐 URL     : ${YELLOW}http://$(curl -s ifconfig.me):3000${NC}"
echo -e "${GREEN}║${NC}  🔑 Admin   : Daftar dengan kode ${YELLOW}ADMIN2025${NC}"
echo -e "${GREEN}║${NC}  📁 Log     : ${CYAN}pm2 logs virtualsim${NC}"
echo -e "${GREEN}║${NC}  🔄 Restart : ${CYAN}pm2 restart virtualsim${NC}"
echo -e "${GREEN}║${NC}  ⛔ Stop    : ${CYAN}pm2 stop virtualsim${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  ⚠️  JANGAN LUPA edit ${YELLOW}server.js${NC} baris 12:     ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}     ${CYAN}API_KEY: 'MASUKKAN_API_KEY_RUMAHOTP'${NC}     ${GREEN}║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
