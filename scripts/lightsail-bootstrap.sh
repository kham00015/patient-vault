#!/usr/bin/env bash
# Run ONCE on a fresh Ubuntu 22.04 Lightsail instance (browser SSH or terminal).
# Prereqs: .env.production in /opt/patient-vault before starting containers.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y curl git docker.io

# Ubuntu 24.04: docker-compose-plugin package name varies — install compose v2 manually if needed
if ! sudo apt-get install -y docker-compose-plugin 2>/dev/null; then
  if ! sudo apt-get install -y docker-compose-v2 2>/dev/null; then
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -fsSL "https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-linux-x86_64" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  fi
fi

sudo usermod -aG docker "$USER" || true

APP_DIR=/opt/patient-vault
if [ ! -d "$APP_DIR/.git" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown "$USER":"$USER" "$APP_DIR"
  git clone https://github.com/kham00015/patient-vault.git "$APP_DIR"
fi

cd "$APP_DIR"
git pull origin master

if [ ! -f .env.production ]; then
  echo ""
  echo "ERROR: Missing .env.production in $APP_DIR"
  echo "On your PC run:  .\\scripts\\prepare-production-env.ps1"
  echo "Then upload .env.production to the server (Lightsail SSH file transfer or nano)."
  exit 1
fi

echo "Building and starting Patient Vault (this takes 3-5 minutes)..."
docker compose -f docker-compose.production.yml up -d --build

echo ""
echo "Done. Test: curl -s http://localhost/api/health"
echo "After DNS points here: https://app.patientvault.care"
