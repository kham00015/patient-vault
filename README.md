# Patient Vault

HIPAA-oriented clinical records platform — a secure rebuild of the original Firebase Patient Vault app.

**Stack:** Next.js 16 · TypeScript · Prisma · PostgreSQL/SQLite · Tailwind CSS

## Features

| Feature | Status |
|---------|--------|
| Secure login (httpOnly sessions, bcrypt) | ✅ |
| Patient CRUD + chart sections | ✅ |
| Auto-save encrypted notes | ✅ |
| Clinical notes (dated) | ✅ |
| Clinic schedule | ✅ |
| Knowledge base | ✅ |
| Patient lists | ✅ |
| Document upload/download | ✅ |
| AI chat (server-side proxy) | ✅ |
| AI chart organize | ✅ |
| Audit logging (all PHI access) | ✅ |
| Role-based access control | ✅ |
| Field-level PHI encryption | ✅ |
| MFA | 🔲 Scaffold ready |
| Signed BAA cloud deploy | 🔲 See HIPAA doc |

## Production (AWS DIY)

**You + this repo can go far without a developer.** Follow the step-by-step guide:

👉 **[AWS_DEPLOY_GUIDE.md](./AWS_DEPLOY_GUIDE.md)** — BAA → database → backups → deploy

Generate secrets:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-secrets.ps1
```

Test production stack locally:
```bash
docker compose -f docker-compose.prod.yml up --build
```

## Quick Start (local dev)

```bash
git clone https://github.com/kham00015/patient-vault.git
cd patient-vault
cp .env.example .env
docker compose up postgres -d
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Default dev logins** (change immediately):

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@clinic.local` | `ChangeMe123!` |
| User (staff) | `user@clinic.local` | `ChangeMe123!` |

Staff users can chart patients but cannot archive charts, delete clinical records, or access the audit log.

## Production

1. Use **PostgreSQL** (see `docker-compose.yml`)
2. Set strong `JWT_SECRET` and `ENCRYPTION_KEY`
3. Deploy on HIPAA-eligible infrastructure with **signed BAA**
4. Enable HTTPS, WAF, backups, monitoring
5. Read [HIPAA_COMPLIANCE.md](./HIPAA_COMPLIANCE.md) and [DEVELOPER_HANDOFF.md](./DEVELOPER_HANDOFF.md)

## Project Structure

```
src/
├── app/              # Next.js pages + API routes
├── components/       # UI + main app shell
└── lib/              # Auth, encryption, audit, AI, storage
prisma/               # Database schema
storage/              # Local dev file storage (gitignored)
```

## License

Proprietary — for clinic use. Developers: see DEVELOPER_HANDOFF.md.
