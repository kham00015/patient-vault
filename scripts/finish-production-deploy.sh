#!/bin/bash
set -euo pipefail
cd /opt/patient-vault

DATABASE_URL=$(sudo grep "^DATABASE_URL=" .env.production | sed -E "s/^DATABASE_URL=//; s/^[\"']//; s/[\"']$//; s/\r$//")
echo "URL protocol check: ${DATABASE_URL:0:12}..."

echo "=== db push ==="
sudo docker run --rm \
  -e "DATABASE_URL=${DATABASE_URL}" \
  -v /opt/patient-vault/prisma:/prisma \
  -w /prisma \
  node:20-alpine \
  sh -c 'npm i prisma@6.19.0 --no-save --ignore-scripts >/dev/null && node node_modules/prisma/build/index.js db push --schema=/prisma/schema.prisma --skip-generate'

echo "=== ensure override command ==="
if [ -f /tmp/pv-override-backup.yml ]; then
  sudo cp /tmp/pv-override-backup.yml /opt/patient-vault/docker-compose.override.yml
fi

sudo python3 - <<'PY'
from pathlib import Path
p = Path("/opt/patient-vault/docker-compose.override.yml")
text = p.read_text() if p.exists() else ""
marker = "# Deploy-time: do not run prisma"
if marker in text:
    text = text.split(marker)[0].rstrip() + "\n"
p.write_text(text)
print("override base ok", len(text))
PY

sudo tee -a /opt/patient-vault/docker-compose.override.yml >/dev/null <<'EOF'

# Deploy-time: do not run prisma CLI inside slim app image
services:
  app:
    command: ["node", "server.js"]
EOF

echo "=== recreate ==="
cd /opt/patient-vault
sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --force-recreate
sleep 12
sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml ps
sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml logs app --tail 40
echo "=== health ==="
curl -sS --max-time 15 http://localhost/api/health || true
echo
curl -sS --max-time 20 https://app.patientvault.care/api/health || true
echo
echo DEPLOY_COMPLETE
