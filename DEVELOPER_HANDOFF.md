# Developer Handoff Guide

**Last updated:** July 4, 2026 — see also `C:\Users\Firas\Desktop\Patient-Vault-Project-Handoff.html` for full project context (Word-ready).

## Production status

| Item | Status |
|------|--------|
| URL | http://app.patientvault.care (HTTP; HTTPS pending) |
| Lightsail | `patient-vault-prod`, IP `44.196.211.127`, `/opt/patient-vault` |
| RDS | PostgreSQL `patient-vault-db.cj9hnwn91exe.us-east-1.rds.amazonaws.com` |
| Deploy | Use **both** compose files: `docker-compose.production.yml` + `docker-compose.override.yml` |
| Security update (July 4) | User admin, MFA, lockout — **deploy may be incomplete**; reboot Lightsail if down |

## Overview

Patient Vault is a full-stack TypeScript application replacing a monolithic Firebase HTML file. It preserves all original functionality while adding HIPAA-oriented security patterns.

## Architecture Decisions

### Why Next.js?
- Single codebase for UI + API (simpler handoff)
- Server Components + API routes keep secrets off the client
- Easy to split into separate frontend/backend later if needed

### Why Prisma + PostgreSQL?
- Relational data fits clinical records
- PostgreSQL is HIPAA-eligible on AWS RDS
- **Production uses PostgreSQL** — `schema.prisma` provider must be `postgresql`

### Encryption Strategy

**Layer 1 — Transport:** TLS 1.2+ everywhere (HTTPS not yet live on production)

**Layer 2 — Application:** `src/lib/encryption.ts` encrypts PHI fields before DB write

**Layer 3 — Database:** Enable TDE on PostgreSQL host

**Layer 4 — Files:** S3 with SSE-KMS in `src/lib/storage.ts` (currently `STORAGE_TYPE=local` on Lightsail)

## API Reference

All routes require authentication unless noted.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login (lockout, MFA challenge) |
| DELETE | `/api/auth/login` | Logout |
| GET | `/api/auth/login` | Current user |
| POST/PATCH | `/api/auth/change-password` | Self-service / forced password change |
| POST/PUT/DELETE | `/api/auth/mfa` | MFA setup, verify, disable |
| POST | `/api/auth/mfa/verify-login` | Complete login with TOTP |
| GET/POST | `/api/users` | List/create users (admin) |
| PATCH | `/api/users/[id]` | Update user (admin) |
| POST | `/api/users/[id]/reset-password` | Admin reset + unlock |
| POST | `/api/users/[id]/unlock` | Admin unlock |
| GET/POST | `/api/patients` | List/create patients |
| GET/PATCH/DELETE | `/api/patients/[id]` | Patient CRUD |
| GET/POST | `/api/patients/[id]/notes` | Notes |
| GET | `/api/patients/[id]/documents` | List documents |
| POST | `/api/patients/[id]/documents/upload` | Upload (multipart, max 25MB) |
| GET/DELETE | `/api/patients/[id]/documents/[docId]` | Download/delete |
| GET | `/api/audit` | Audit log (admin only) |

## Roles

| Role | Read PHI | Write PHI | Delete PHI | Audit Log | Manage Users |
|------|----------|-----------|------------|-----------|--------------|
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ |
| CLINICIAN | ✅ | ✅ | ✅ | ❌ | ❌ |
| STAFF | ✅ | ✅ | ❌ | ❌ | ❌ |
| READONLY | ✅ | ❌ | ❌ | ❌ | ❌ |

## Security features (July 2026)

### Account lockout
- 5 failed login attempts → `lockedAt` set
- Admin resets password or unlocks via `/api/users/[id]/reset-password` or `/unlock`
- See `src/lib/account-lockout.ts`

### Password policy
- Min 12 chars, upper, lower, number, special character
- Admin sets initial password; `mustChangePassword` forces change on first login
- See `src/lib/password-policy.ts`

### MFA (TOTP)
- Authenticator app + backup codes
- Two-step login when `mfaEnabled`
- See `src/lib/mfa.ts`, `otplib`, `qrcode`

### User admin UI
- `src/components/app/users-admin-modal.tsx` — admin sidebar **Users**
- `src/components/app/account-security-modal.tsx` — **Account security** for all users

## Production deploy notes

```bash
# On Lightsail — always use both compose files
cd /opt/patient-vault
docker compose -f docker-compose.production.yml -f docker-compose.override.yml build app
docker compose -f docker-compose.production.yml -f docker-compose.override.yml run --rm --no-deps --entrypoint sh app -c "node ./node_modules/prisma/build/index.js db push --skip-generate"
docker compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --force-recreate
```

- `docker-compose.override.yml` on server: `command: ["node", "server.js"]`
- `docker-entrypoint.sh`: chowns `/app/storage` for document uploads
- Caddy currently HTTP-only on `:80`

## Priority tasks remaining

### P0 — Before real PHI
1. **Finish security deploy** + verify site up after reboot
2. **HTTPS** — Caddy ACME + `COOKIE_SECURE=true`
3. **Change demo passwords**; create real users via admin UI
4. **Enable MFA** for admin/clinicians
5. **S3 document storage**
6. **Rotate secrets** if any were exposed

### P1 — Production hardening
1. Rate limiting on login (IP-level)
2. CSRF protection
3. Structured logging → CloudWatch
4. Session timeout 15 min in production

## Environment Variables

See `.env.example`. Required for production:

```
DATABASE_URL=postgresql://...  # URL-encode special chars in password
JWT_SECRET=<64+ char random>
ENCRYPTION_KEY=<32 byte base64>
STORAGE_TYPE=local            # or s3
STORAGE_LOCAL_PATH=/app/storage
SESSION_TIMEOUT_MINUTES=15
NODE_ENV=production
COOKIE_SECURE=true            # after HTTPS
```

## File Map

| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | Sessions, JWT, MFA pending token |
| `src/lib/account-lockout.ts` | 5-attempt lockout |
| `src/lib/password-policy.ts` | Password validation |
| `src/lib/mfa.ts` | TOTP + backup codes |
| `src/lib/audit.ts` | HIPAA audit logging |
| `src/lib/encryption.ts` | PHI field encryption |
| `src/lib/storage.ts` | Document storage |
| `src/components/app/users-admin-modal.tsx` | Admin user UI |
| `src/components/app/account-security-modal.tsx` | Password + MFA UI |
| `docker-entrypoint.sh` | Storage permissions on start |
| `prisma/schema.prisma` | Data model |

## Questions?

Review `HIPAA_COMPLIANCE.md` and `PRODUCTION_LAUNCH.md`. Full handoff: Desktop `Patient-Vault-Project-Handoff.html`.
