#!/usr/bin/env bash
# Production health watchdog — runs every minute via cron on Lightsail.
# Logs failures and optionally pings Healthchecks.io so you get email/SMS.
set -euo pipefail

URL="${PV_HEALTH_URL:-https://app.patientvault.care/api/health}"
LOG="${PV_HEALTH_LOG:-/var/log/patient-vault-health.log}"
STATE="${PV_HEALTH_STATE:-/var/lib/patient-vault/health-state}"
PING_URL="${HEALTHCHECK_PING_URL:-}"

mkdir -p "$(dirname "$LOG")" "$(dirname "$STATE")" 2>/dev/null || true

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
body="$(curl -sS --max-time 15 -w '\n%{http_code}' "$URL" 2>/dev/null || echo -e '\n000')"
http_code="$(echo "$body" | tail -n1)"
payload="$(echo "$body" | sed '$d')"

ok=0
if [[ "$http_code" == "200" ]] && echo "$payload" | grep -q '"ok":true'; then
  ok=1
fi

prev="unknown"
if [[ -f "$STATE" ]]; then
  prev="$(cat "$STATE" 2>/dev/null || echo unknown)"
fi

if [[ "$ok" -eq 1 ]]; then
  echo "$ts OK http=$http_code" >>"$LOG"
  echo "ok" >"$STATE"
  if [[ -n "$PING_URL" ]]; then
    curl -sS --max-time 10 "$PING_URL" >/dev/null 2>&1 || true
  fi
  # Notify once when recovering
  if [[ "$prev" == "down" ]]; then
    echo "$ts RECOVERED" >>"$LOG"
    logger -t patient-vault-health "Patient Vault RECOVERED — health OK"
  fi
  exit 0
fi

echo "$ts FAIL http=$http_code body=$payload" >>"$LOG"
echo "down" >"$STATE"
logger -t patient-vault-health "Patient Vault DOWN — health check failed (http=$http_code)"

if [[ -n "$PING_URL" ]]; then
  # Healthchecks.io: ping /fail to trigger alert immediately
  fail_url="${PING_URL%/}/fail"
  curl -sS --max-time 10 "$fail_url" >/dev/null 2>&1 || true
fi

exit 1
