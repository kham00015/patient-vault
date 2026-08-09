# Patient Vault — clinic reliability (so login cannot silently die again)
#
# What broke production login
# ---------------------------
# AWS RDS was set to manage/rotate the database master password via Secrets Manager.
# The live app stores DATABASE_URL in `/opt/patient-vault/.env.production`.
# When AWS rotated the password, the app still had the old one → every login failed
# (staff saw a generic error; health returned 503).
#
# Permanent prevention (layers)
# -----------------------------
# 1) Do NOT let AWS manage/rotate the app DB password
#    Already fixed for current prod: master password is no longer Secrets Manager-managed.
#    Verify anytime:
#      .\scripts\assert-rds-password-stable.ps1
#    That command must print OK. If it fails, clinic login is at risk again.
#
# 2) Phone/email alerts when the site is down (do this once — 5 minutes)
#    Option A (recommended): https://uptimerobot.com
#      - Monitor type: HTTPS
#      - URL: https://app.patientvault.care/api/health
#      - Keyword: "ok":true   (or expect HTTP 200)
#      - Alert contacts: your cell + clinic email
#      - Interval: 5 minutes
#    Option B: https://healthchecks.io
#      - Create a check, copy the ping URL
#      - $env:HEALTHCHECK_PING_URL = 'https://hc-ping.com/<uuid>'
#      - .\scripts\install-production-health-watchdog.ps1
#
# 3) Server watchdog (installed on Lightsail)
#    Checks health every minute, logs to /var/log/patient-vault-health.log
#    Install/refresh:
#      .\scripts\install-production-health-watchdog.ps1
#
# 4) Clear login message when DB is down
#    Staff should see that it is a system outage, not a wrong password.
#
# 5) Deploy / password sync must prove health
#    After deploy or credential sync, https://app.patientvault.care/api/health
#    must return {"ok":true,...}. Scripts now treat a failed health check as failure.
#
# If login ever fails again in clinic
# ----------------------------------
# 1. Open https://app.patientvault.care/api/health
#    - ok:true  → problem is account/password/MFA, not database
#    - ok:false → database/app outage
# 2. Fast DB credential repair (admin laptop):
#      .\scripts\assert-rds-password-stable.ps1
#      .\scripts\fix-live-login.ps1
# 3. Do not full-redeploy first — redeploy alone will not fix a bad DB password
#    (deploy keeps the existing production DATABASE_URL on purpose).
#
# Monthly 60-second habit
# -----------------------
# - Open /api/health (expect ok:true)
# - Run .\scripts\assert-rds-password-stable.ps1
# - Confirm UptimeRobot/Healthchecks still has your phone as alert contact
