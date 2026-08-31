#!/bin/bash
set -euo pipefail
sudo cp /tmp/create-modern-medicine-staff.ts /opt/patient-vault/scripts/
cd /opt/patient-vault
DATABASE_URL=$(sudo grep '^DATABASE_URL=' .env.production | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//; s/\r$//')
sudo docker run --rm \
  -e "DATABASE_URL=${DATABASE_URL}" \
  -v /opt/patient-vault:/app \
  -w /app \
  node:20-alpine \
  sh -c 'npm i tsx bcryptjs @prisma/client@6.19.0 prisma@6.19.0 --no-save --ignore-scripts >/dev/null 2>&1 && npx prisma generate --schema=prisma/schema.prisma >/dev/null 2>&1 && npx tsx scripts/create-modern-medicine-staff.ts'
