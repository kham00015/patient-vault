#!/usr/bin/env bash
# Run ONCE on a fresh Ubuntu 22.04 Lightsail instance (browser SSH or terminal).
# Prereqs: .env.production in /opt/patient-vault before starting containers.
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y curl docker.io docker-compose-plugin git curl

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
