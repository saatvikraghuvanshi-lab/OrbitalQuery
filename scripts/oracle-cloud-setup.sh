#!/bin/bash
# ──────────────────────────────────────────────────────────────
# OrbitalQuery — Oracle Cloud Always Free VM Setup
# ──────────────────────────────────────────────────────────────
# Run this ONCE on a fresh Oracle Cloud ARM VM (Ubuntu 22.04/24.04).
#
# Prerequisites:
#   1. Create an Oracle Cloud Always Free account
#   2. Create an ARM A1 Flex instance (2 OCPUs, 12GB RAM recommended)
#   3. Ubuntu 22.04 or 24.04 image
#   4. SSH key-based auth
#
# Usage:
#   ssh ubuntu@<your-vm-ip>
#   curl -fsSL https://raw.githubusercontent.com/.../scripts/oracle-cloud-setup.sh | bash
#
# Or clone and run:
#   git clone <repo> && cd OrbitalQuery && bash scripts/oracle-cloud-setup.sh
# ──────────────────────────────────────────────────────────────

set -euo pipefail

echo "═══════════════════════════════════════════════════════"
echo "  OrbitalQuery — Oracle Cloud Always Free Setup"
echo "═══════════════════════════════════════════════════════"

# ── 1. System packages ──────────────────────────────────────
echo ""
echo "→ Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
  docker.io docker-compose-plugin \
  git curl wget ufw \
  > /dev/null 2>&1

echo "→ Starting Docker..."
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER 2>/dev/null || true

# ── 2. Firewall ─────────────────────────────────────────────
echo "→ Configuring firewall..."
sudo ufw --force enable > /dev/null 2>&1
sudo ufw allow 22/tcp > /dev/null 2>&1    # SSH
sudo ufw allow 80/tcp > /dev/null 2>&1    # HTTP
sudo ufw allow 443/tcp > /dev/null 2>&1   # HTTPS
sudo ufw allow 3001/tcp > /dev/null 2>&1  # Backend API (direct access)
sudo ufw allow 8000/tcp > /dev/null 2>&1  # Python API (direct access)

# ── 3. Clone repo ───────────────────────────────────────────
echo "→ Setting up OrbitalQuery..."
cd ~
if [ -d "OrbitalQuery" ]; then
  cd OrbitalQuery
  git pull
else
  git clone https://github.com/saatvikraghuvanshi-lab/OrbitalQuery.git
  cd OrbitalQuery
fi

# ── 4. Environment file ─────────────────────────────────────
echo "→ Configuring environment..."
if [ ! -f ".env.oracle" ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  cat > .env.oracle << EOF
# OrbitalQuery — Oracle Cloud Environment
JWT_SECRET=${JWT_SECRET}
PYTHON_SERVICE_URL=http://python:8000
CORS_ORIGIN=*
NODE_ENV=production
PORT=3001
EOF
  echo "  Created .env.oracle with generated JWT_SECRET"
else
  echo "  .env.oracle already exists, skipping"
fi

# ── 5. Build and start ──────────────────────────────────────
echo "→ Building and starting services..."
echo "  This may take 5-10 minutes on first run (installing dependencies)..."

# Use docker compose v2 syntax
sudo docker compose --env-file .env.oracle up -d --build 2>&1 | tail -5

# ── 6. Health check ─────────────────────────────────────────
echo ""
echo "→ Waiting for services to start..."
sleep 10

BACKEND_OK=false
PYTHON_OK=false

for i in {1..12}; do
  if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    BACKEND_OK=true
  fi
  if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
    PYTHON_OK=true
  fi
  if $BACKEND_OK && $PYTHON_OK; then
    break
  fi
  echo "  Waiting... ($i/12)"
  sleep 5
done

# ── 7. Report ───────────────────────────────────────────────
PUBLIC_IP=$(curl -sf http://169.254.169.254/opc/v1/instance/metadata/public_ip 2>/dev/null || echo "<your-vm-ip>")

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Deployment Complete!"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Backend API:    http://${PUBLIC_IP}:3001"
echo "  Python API:     http://${PUBLIC_IP}:8000"
echo "  Health check:   http://${PUBLIC_IP}:3001/api/health"
echo ""
echo "  Docker status:"
sudo docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""

if $BACKEND_OK && $PYTHON_OK; then
  echo "  ✓ Both services are healthy!"
  echo ""
  echo "  Next steps:"
  echo "  1. Update Vercel env: NEXT_PUBLIC_BACKEND_URL=http://${PUBLIC_IP}:3001"
  echo "  2. Update frontend vercel.json rewrites to point to this IP"
  echo "  3. (Optional) Set up Nginx + SSL with Let's Encrypt"
else
  echo "  ⚠ Some services may still be starting. Check logs:"
  echo "    sudo docker compose logs -f"
fi

echo ""
echo "  Useful commands:"
echo "    sudo docker compose logs -f          # View logs"
echo "    sudo docker compose restart           # Restart all"
echo "    sudo docker compose up -d --build     # Rebuild and restart"
echo "    sudo docker compose down              # Stop all"
echo ""
