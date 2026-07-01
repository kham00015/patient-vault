# Deploy to app.patientvault.care

**Target URL:** `https://app.patientvault.care`  
**Domain:** `patientvault.care` (you bought this ✅)  
**Time:** ~30–45 minutes in AWS Console

---

## Part A — Lightsail server (15 min)

1. AWS Console → **Lightsail** → **Create instance**
2. **Linux** → **OS Only** → **Ubuntu 22.04**
3. Plan: **$10/mo** (2 GB RAM)
4. Name: `patient-vault-prod`
5. **Create instance**

### Static IP
6. Lightsail → **Networking** → **Create static IP** → attach to `patient-vault-prod`  
7. **Copy the IP** (example: `3.85.xxx.xxx`) — you need it twice below

### Firewall
8. Instance → **Networking** tab → add rules:
   - **HTTP** (80)
   - **HTTPS** (443)

---

## Part B — Database access (5 min)

The app server must reach your RDS database.

1. AWS Console → **RDS** → **patient-vault-db**
2. **VPC security groups** → click the security group link
3. **Edit inbound rules** → **Add rule**:
   - Type: **PostgreSQL**
   - Port: **5432**
   - Source: **your Lightsail static IP** with `/32` (e.g. `3.85.xxx.xxx/32`)
4. Save rules

---

## Part C — DNS (5 min)

1. AWS Console → **Route 53** → **Hosted zones** → **patientvault.care**
2. **Create record**:
   - Record name: `app`
   - Type: **A**
   - Value: **Lightsail static IP**
   - TTL: 300
3. Save

Wait 5–15 minutes for DNS to propagate.

---

## Part D — Deploy the app (15 min)

### On your Windows PC (once)

```powershell
cd C:\Users\Firas\patient-vault
.\scripts\prepare-production-env.ps1
```

Edit `.env.production` — set **ACME_EMAIL** to your real practice email (for HTTPS certificate).

### On Lightsail (browser SSH)

1. Lightsail → `patient-vault-prod` → **Connect using SSH**
2. Run:

```bash
curl -fsSL https://raw.githubusercontent.com/kham00015/patient-vault/master/scripts/lightsail-bootstrap.sh | bash
```

3. If it says missing `.env.production`, upload the file from your PC:
   - In SSH: `nano /opt/patient-vault/.env.production` → paste contents → Ctrl+O, Enter, Ctrl+X
   - Then: `cd /opt/patient-vault && docker compose -f docker-compose.production.yml up -d --build`

---

## Part E — Test

1. `https://app.patientvault.care` — login page
2. `https://app.patientvault.care/api/health` — should show `{"ok":true}`

**Login (change before real PHI):**
- `admin@clinic.local` / `ChangeMe123!`

---

## Part F — IAM (optional, for Cursor auto-deploy later)

AWS Console → **IAM** → **Users** → `patient-vault-cli` → **Add permissions** → attach:
- `AmazonLightsailFullAccess`
- `AmazonRoute53FullAccess`
- `AmazonS3FullAccess`
- `AmazonEC2FullAccess` (security group updates)

Or use inline policy from `iam/deploy-policy.json` in this repo.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Site won't load | Check DNS A record → static IP |
| Health check fails | RDS security group — add Lightsail IP on port 5432 |
| HTTPS error | Wait 10 min after DNS; check ACME_EMAIL in `.env.production` |
| Build slow | Normal first time (3–5 min) |

---

## After it's live

- [ ] Sign **AWS BAA** (Artifact) if not done
- [ ] Change all dev passwords
- [ ] User admin + MFA (next build)
- [ ] No real patient data until MFA is on
