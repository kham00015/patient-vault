#!/bin/bash
set -euo pipefail
cd /opt/patient-vault

FILE_URL=$(sudo grep '^DATABASE_URL=' .env.production | sed -E "s/^DATABASE_URL=//; s/^\"//; s/\"$//; s/\r$//")
export FILE_URL

# Build alternate URL with password decoded once (in case of double-encoding)
DECODED_URL=$(python3 - <<'PY'
import os
from urllib.parse import urlparse, urlunparse, quote, unquote
raw = os.environ["FILE_URL"]
u = urlparse(raw)
pw = unquote(u.password or "")
# re-encode once properly
user = u.username or ""
netloc = f"{user}:{quote(pw, safe='')}@{u.hostname}"
if u.port:
    netloc += f":{u.port}"
print(urlunparse((u.scheme, netloc, u.path, "", u.query, "")))
PY
)

echo "=== test encoded (current file) ==="
sudo docker run --rm -e "DATABASE_URL=${FILE_URL}" -v /opt/patient-vault/prisma:/prisma -w /tmp node:20-alpine \
  sh -c 'npm i prisma@6.19.0 --no-save --ignore-scripts >/dev/null 2>&1 && printf "SELECT 1;\n" | node node_modules/prisma/build/index.js db execute --stdin --schema=/prisma/schema.prisma' \
  && echo ENCODED_OK || echo ENCODED_FAIL

echo "=== test once-decoded-then-reencoded ==="
sudo docker run --rm -e "DATABASE_URL=${DECODED_URL}" -v /opt/patient-vault/prisma:/prisma -w /tmp node:20-alpine \
  sh -c 'npm i prisma@6.19.0 --no-save --ignore-scripts >/dev/null 2>&1 && printf "SELECT 1;\n" | node node_modules/prisma/build/index.js db execute --stdin --schema=/prisma/schema.prisma' \
  && echo DECODED_OK || echo DECODED_FAIL
