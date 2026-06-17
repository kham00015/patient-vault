# =============================================================================
# Patient Vault — AWS DIY Guide (you + Cursor)
# =============================================================================
# Goal: BAA signed, database with backups, app live on AWS — minimal outside help.
# Estimated cost: ~$35–55/month (Lightsail DB + instance + S3)
# =============================================================================

## Phase 0 — Before you touch AWS

- [ ] Use a **practice email** (not random personal if avoidable)
- [ ] Credit card for AWS billing
- [ ] Clone repo: `git clone https://github.com/kham00015/patient-vault.git`
- [ ] Run `scripts/generate-secrets.ps1` — save output in a password manager
- [ ] **Do NOT put real patient data** in AWS until Phase 5 is complete

---

## Phase 1 — Sign the BAA (15 minutes, you alone)

1. Go to https://aws.amazon.com/ and **Create an AWS Account**
2. Complete identity verification + enable billing
3. Sign in to **AWS Console**
4. Search **AWS Artifact**
5. Open **Agreements** → find **AWS Business Associate Addendum (BAA)**
6. Click **Accept** / **Accept agreement**
7. Screenshot the accepted date for your records

✅ You can now use HIPAA-eligible AWS services for PHI (when configured correctly).

---

## Phase 2 — Create the database (30 minutes, you alone)

### Option A: Lightsail Database (recommended — easiest)

1. AWS Console → **Lightsail** → **Databases** → **Create database**
2. Engine: **PostgreSQL** (latest stable)
3. Plan: **$15/mo** (or higher if you expect heavy use)
4. Name: `patient-vault-db`
5. Enable **automatic backups** (on by default — confirm retention ≥ 7 days)
6. Create database
7. When ready: **Networking** → note the endpoint, username, password
8. Connection string format:
   ```
   postgresql://dbmasteruser:YOUR_PASSWORD@YOUR_ENDPOINT:5432/patientvault
   ```
9. Under **Databases** tab, ensure database `patientvault` exists (or create it)

### Backup check (you)

- Lightsail → your database → **Snapshots & backups**
- Confirm automatic snapshots are enabled
- Optional: create a **manual snapshot** before major changes

---

## Phase 3 — Create document storage (20 minutes, you alone)

1. AWS Console → **S3** → **Create bucket**
2. Name: `patient-vault-docs-YOUR-UNIQUE-SUFFIX` (globally unique)
3. Region: same as your database (e.g. `us-east-1`)
4. **Block all public access** — ON
5. **Bucket versioning** — Enable (recommended)
6. **Default encryption** — SSE-S3 (or SSE-KMS if you set up KMS)
7. Create bucket

Save the bucket name for env vars.

---

## Phase 4 — Deploy the app on Lightsail (1–2 hours, you + guide)

### 4a. Create a Lightsail instance

1. Lightsail → **Instances** → **Create instance**
2. Platform: **Linux/Unix**
3. Blueprint: **OS Only** → Ubuntu 22.04
4. Plan: **$10/mo** (2 GB RAM) minimum
5. Name: `patient-vault-app`
6. Create instance

### 4b. Attach static IP

1. Instance → **Networking** → **Create static IP** → attach to instance

### 4c. Open firewall ports

1. Instance → **Networking** tab
2. Add rules: **HTTP (80)**, **HTTPS (443)**, **Custom TCP 3000** (temporary for testing)

### 4d. Connect via SSH (browser terminal in Lightsail)

Run on the instance:

```bash
# Install Docker
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin git
sudo usermod -aG docker ubuntu

# Log out and back in, then:
git clone https://github.com/kham00015/patient-vault.git
cd patient-vault
```

### 4e. Create production env file on the server

```bash
nano .env.production
```

Paste (fill in YOUR values):

```env
DATABASE_URL=postgresql://dbmasteruser:PASSWORD@endpoint.region.rds.amazonaws.com:5432/patientvault
JWT_SECRET=from-generate-secrets.ps1
ENCRYPTION_KEY=from-generate-secrets.ps1
SESSION_TIMEOUT_MINUTES=15
STORAGE_TYPE=s3
AWS_REGION=us-east-1
AWS_S3_BUCKET=patient-vault-docs-your-suffix
NODE_ENV=production
OPENAI_API_KEY=optional
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`

### 4f. IAM permissions for S3 (Lightsail instance)

1. AWS Console → **IAM** → **Users** → create user `patient-vault-app`
2. Attach policy (inline) allowing `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on your bucket only
3. Create **access key** → save key + secret
4. On Lightsail instance:

```bash
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
```

(Better long-term: attach an IAM role to EC2 if you migrate off Lightsail.)

### 4g. Build and run

```bash
docker build -t patient-vault .
docker run -d --name patient-vault --env-file .env.production -p 3000:3000 \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
  --restart unless-stopped patient-vault
```

### 4h. Test

Open: `http://YOUR_STATIC_IP:3000`

- Login with seeded admin (first deploy only — change password immediately)
- Add a test patient (fake name, not real PHI)
- Upload a test document

Health check: `http://YOUR_STATIC_IP:3000/api/health`

---

## Phase 5 — HTTPS + domain (optional but recommended)

1. Buy/use a domain (Route 53 or elsewhere)
2. Point A record → Lightsail static IP
3. Lightsail → **Certificates** → create HTTPS cert for your domain
4. Use **Lightsail load balancer** or **Caddy/nginx** reverse proxy on the instance

We can configure Caddy together in a follow-up step.

---

## Phase 6 — Go-live checklist (before real PHI)

- [ ] BAA signed
- [ ] DB backups confirmed
- [ ] HTTPS enabled
- [ ] Default admin password changed
- [ ] `SESSION_TIMEOUT_MINUTES=15`
- [ ] S3 bucket not public
- [ ] Test restore from DB snapshot once
- [ ] Migrate Firebase data (script — coming next)
- [ ] MFA on AWS root account + IAM users

---

## Phase 7 — Migrate from Firebase (we'll build this together)

Your old data is at Firebase path `people/`. We'll add `scripts/migrate-firebase.ts` to import into PostgreSQL.

---

## Monthly cost estimate

| Item | Cost |
|------|------|
| Lightsail PostgreSQL | ~$15 |
| Lightsail instance 2GB | ~$10 |
| S3 (low usage) | ~$1–5 |
| Static IP | ~$3.50 |
| **Total** | **~$30–35/mo** |

---

## When to stop and ask for help

- Database won't connect from app → security groups / networking
- App builds but crashes → send us the Docker logs
- Anything involving real patient data before checklist is done

---

## Quick commands reference

```bash
# View app logs on server
docker logs -f patient-vault

# Restart app after env change
docker restart patient-vault

# Rebuild after code update
git pull && docker build -t patient-vault . && docker restart patient-vault
```

---

## What we (you + Cursor) handle in code

- ✅ Docker production build
- ✅ PostgreSQL schema (Prisma)
- ✅ S3 document storage
- ✅ Health check endpoint
- 🔲 Firebase migration script (next)
- 🔲 HTTPS with Caddy (next)
- 🔲 MFA login (next)

**Start with Phase 1 today. Tell me when BAA is signed and we'll do Phase 2 together.**
