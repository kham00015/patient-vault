#!/bin/bash
set -euo pipefail
cd /opt/patient-vault

echo "=== container DATABASE_URL ==="
RAW=$(sudo docker compose -f docker-compose.production.yml -f docker-compose.override.yml exec -T app printenv DATABASE_URL 2>/dev/null || true)
export RAW
python3 - <<'PY'
import os
from urllib.parse import urlparse
raw = os.environ.get("RAW", "").strip()
print("empty", not raw)
print("len", len(raw))
print("first_char", repr(raw[:1]) if raw else None)
u = urlparse(raw.strip('"').strip("'"))
print("user", u.username)
print("host", u.hostname)
print("pw_len", len(u.password or ""))
print("pw_has_pct", "%" in (u.password or ""))
PY

echo "=== file DATABASE_URL ==="
FILE_URL=$(sudo grep '^DATABASE_URL=' .env.production | sed -E "s/^DATABASE_URL=//; s/^\"//; s/\"$//; s/^'//; s/'$//; s/\r$//")
export FILE_URL
python3 - <<'PY'
import os
from urllib.parse import urlparse, unquote
raw = os.environ["FILE_URL"].strip()
u = urlparse(raw)
print("user", u.username)
print("host", u.hostname)
print("pw_len", len(u.password or ""))
print("pw_has_pct", "%" in (u.password or ""))
print("decoded_pw_len", len(unquote(u.password or "")))
PY

echo "=== prisma connectivity test with file URL ==="
sudo docker run --rm \
  -e "DATABASE_URL=${FILE_URL}" \
  -v /opt/patient-vault/prisma:/prisma \
  -w /tmp \
  node:20-alpine \
  sh -c 'npm i prisma@6.19.0 --no-save --ignore-scripts >/dev/null 2>&1 && printf "SELECT 1 as ok;\n" | node node_modules/prisma/build/index.js db execute --stdin --schema=/prisma/schema.prisma' 2>&1 | tail -40
