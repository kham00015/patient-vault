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

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/patient-vault.git
cd patient-vault
cp .env.example .env
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

**Default dev login** (change immediately):
- Email: `admin@clinic.local`
- Password: `ChangeMe123!`

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
