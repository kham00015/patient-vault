# Production Launch — Modern Medicine Patient Vault

**Goal:** Real website like `https://app.yourclinic.com` (not a temporary demo link), built for HIPAA production — not just testing.

**You do the boxes marked YOU. We (you + Cursor) do the boxes marked US.**

---

## What you have today

| Piece | Status |
|-------|--------|
| App code | ✅ On GitHub |
| Database (AWS RDS PostgreSQL) | ✅ Running in `aloha` AWS account |
| Demo URL (Cloudflare tunnel) | ✅ Good for showing doctors — **not** production |
| Domain + HTTPS | ❌ Not yet |
| App on AWS 24/7 | ❌ Not yet |
| User admin screen | ❌ Coming next |
| MFA | ❌ Coming before real PHI |
| AWS BAA signed | ❓ Confirm in AWS Artifact |

---

## Step 1 — Buy your domain (YOU — ~20 minutes)

### Recommended name

Pick something patients and staff will recognize:

- **Best:** `modernmedicine.com` (if available)
- **Alternatives:** `modernmedicine.care`, `modernmedicine.health`, `modernmedicineclinic.com`
- **App address:** use a subdomain → `app.modernmedicine.com` or `vault.modernmedicine.com`

### Where to buy (pick one)

**Option A — AWS Route 53 (recommended)**  
Same place as your database → easier DNS + HIPAA paperwork later.

1. Log in to AWS Console (your **aloha** account: `885362002526`)
2. Search **Route 53** → **Registered domains** → **Register domains**
3. Search your name → add to cart → complete purchase (~$12–15/year for `.com`)
4. Use your **practice email** for registration contact

**Option B — Cloudflare or Namecheap**  
Cheaper sometimes. You’ll point DNS to AWS later (we help with that).

### After purchase — send us:

- The domain name (e.g. `modernmedicine.com`)
- Which subdomain you want for the app (e.g. `app`)

---

## Step 2 — Sign AWS BAA (YOU — 15 minutes)

Required before storing **real** patient data in production.

1. AWS Console → search **AWS Artifact**
2. **Agreements** → **AWS Business Associate Addendum (BAA)**
3. **Accept**
4. Screenshot the accepted date for your HIPAA officer

---

## Step 3 — Production server on AWS (US — after domain)

We will:

1. Create a **Lightsail** server ($10/mo, 2 GB RAM) in `us-east-1`
2. Attach a **static IP**
3. Open ports 80 and 443 (web traffic)
4. Deploy the app with Docker (same as `Dockerfile` in repo)
5. Connect it to your **existing RDS** database
6. Move document storage to **S3** (encrypted, no public access)
7. Set production secrets (`JWT_SECRET`, `ENCRYPTION_KEY`, etc.)

**You may need to do in AWS Console (if CLI user lacks permission):**

- Add **Lightsail** access to IAM user, OR
- Create the Lightsail instance yourself using `AWS_DEPLOY_GUIDE.md` Phase 4

**Estimated monthly cost (production):**

| Item | ~Cost |
|------|-------|
| Domain | ~$1/mo |
| Lightsail app server | $10/mo |
| RDS PostgreSQL (you have this) | ~$15–30/mo |
| S3 documents | ~$1–5/mo |
| **Total** | **~$30–50/mo** |

---

## Step 4 — HTTPS + real URL (US — after Step 3)

1. **Route 53:** create `A` record → `app.yourdomain.com` → Lightsail static IP
2. **Lightsail certificate** (free) for `app.yourdomain.com`
3. **Lightsail load balancer** OR **Caddy** on the server for HTTPS

**Result:** `https://app.modernmedicine.com` — works 24/7, no laptop needed.

---

## Step 5 — User management (US — next build)

Before real staff use the system:

- Admin screen: **create / disable users**, assign roles (`ADMIN`, `CLINICIAN`, `STAFF`)
- Force password change on first login
- No more shared `ChangeMe123!` password

---

## Step 6 — HIPAA officer presentation (checklist)

Give your compliance officer this list. **Green = already in the app.**

### Technical (in code today)

- [x] Unique user logins + roles
- [x] Audit log (who accessed/changed what — no PHI in logs)
- [x] Encrypted passwords (bcrypt)
- [x] Session timeout (configurable)
- [x] Signed notes / encounters cannot be deleted
- [x] Delete actions require documented reason
- [x] Security headers (HTTPS, HSTS in production)
- [x] Field-level encryption for chart data

### Must complete before real PHI

- [ ] **AWS BAA** signed
- [ ] **Production HTTPS** (no demo tunnel)
- [ ] **MFA** for all users
- [ ] **User admin** (no shared dev passwords)
- [ ] **S3** for documents with encryption
- [ ] **RDS backups** verified + test restore once
- [ ] **Session timeout 15 min** in production
- [ ] **Risk assessment** (organizational — your officer)
- [ ] **Staff HIPAA training** documented
- [ ] **Incident / breach response plan**
- [ ] **Privacy policy** and patient notice
- [ ] **AI:** use Bedrock/Azure with BAA (not consumer OpenAI) if AI stays on

### Nice to have before scale

- [ ] Penetration test
- [ ] Audit logs shipped to CloudWatch (retention 6+ years)
- [ ] Annual access review process

Full detail: [HIPAA_COMPLIANCE.md](./HIPAA_COMPLIANCE.md)

---

## Your action list (do these in order)

1. **Buy domain** (Route 53 or elsewhere) — tell us the name
2. **Confirm BAA** signed in AWS Artifact
3. **Tell us** the subdomain you want (`app` vs `vault`)
4. **Expand IAM** (optional): in AWS Console → IAM → `patient-vault-cli` → add `AmazonLightsailFullAccess` so we can deploy without you clicking in console

When Step 1–3 are done, say **“domain is ready”** and we deploy production.

---

## What NOT to do yet

- Don’t put **real patient names/records** in the system until MFA + user admin + HTTPS are live
- Don’t use the Cloudflare demo link for daily clinic work
- Don’t commit `staging.env` or passwords to GitHub

---

## Quick reference — accounts

| Login | Use |
|-------|-----|
| `admin@clinic.local` | Full admin (change password in production) |
| `user@clinic.local` | Staff demo only |
| AWS account `aloha` | Database + future hosting |
