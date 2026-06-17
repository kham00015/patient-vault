# Developer Handoff Guide

## Overview

Patient Vault is a full-stack TypeScript application replacing a monolithic Firebase HTML file. It preserves all original functionality while adding HIPAA-oriented security patterns.

## Architecture Decisions

### Why Next.js?
- Single codebase for UI + API (simpler handoff)
- Server Components + API routes keep secrets off the client
- Easy to split into separate frontend/backend later if needed

### Why Prisma + PostgreSQL?
- Relational data fits clinical records
- PostgreSQL is HIPAA-eligible on AWS RDS, GCP Cloud SQL, Azure Database
- SQLite is **dev only** — never use in production for PHI

### Encryption Strategy

**Layer 1 — Transport:** TLS 1.2+ everywhere

**Layer 2 — Application:** `src/lib/encryption.ts` encrypts PHI fields before DB write
- Uses AES-256-GCM with `ENCRYPTION_KEY` env var
- **Production:** replace with AWS KMS / GCP Cloud KMS envelope encryption

**Layer 3 — Database:** Enable TDE on PostgreSQL host

**Layer 4 — Files:** Implement S3 with SSE-KMS in `src/lib/storage.ts`

## API Reference

All routes require authentication unless noted.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| DELETE | `/api/auth/login` | Logout |
| GET | `/api/auth/login` | Current user |
| GET/POST | `/api/patients` | List/create patients |
| GET/PATCH/DELETE | `/api/patients/[id]` | Patient CRUD |
| GET/POST | `/api/patients/[id]/notes` | Notes |
| DELETE | `/api/patients/[id]/notes/[noteId]` | Delete note |
| GET | `/api/patients/[id]/documents` | List documents |
| POST | `/api/patients/[id]/documents/upload` | Upload (multipart) |
| GET/DELETE | `/api/patients/[id]/documents/[docId]` | Download/delete |
| GET/POST/DELETE | `/api/patients/[id]/ai` | AI chat |
| POST | `/api/patients/[id]/ai/organize` | AI chart organize |
| GET/POST/DELETE | `/api/schedule` | Clinic schedule |
| GET/POST | `/api/knowledge-base` | KB documents |
| DELETE | `/api/knowledge-base/[id]` | Delete KB doc |
| GET/POST | `/api/lists` | Patient lists |
| PATCH/DELETE/POST | `/api/lists/[id]` | List management |
| DELETE | `/api/lists/[id]/patients/[patientId]` | Remove from list |
| GET | `/api/audit` | Audit log (admin only) |

## Roles

| Role | Read PHI | Write PHI | Delete PHI | Audit Log |
|------|----------|-----------|------------|-----------|
| ADMIN | ✅ | ✅ | ✅ | ✅ |
| CLINICIAN | ✅ | ✅ | ✅ | ❌ |
| STAFF | ✅ | ✅ | ❌ | ❌ |
| READONLY | ✅ | ❌ | ❌ | ❌ |

## Priority Implementation Tasks

### P0 — Before any real PHI

1. **Switch to PostgreSQL** — update `prisma/schema.prisma` datasource, run migrations
2. **Implement MFA** — add TOTP to login flow (`User.mfaEnabled` field exists)
3. **S3 document storage** — complete `src/lib/storage.ts`
4. **Deploy with BAA** — AWS/GCP/Azure HIPAA environment
5. **Rotate all secrets** — JWT_SECRET, ENCRYPTION_KEY, DB passwords
6. **Remove seed credentials** — disable `db:seed` in production

### P1 — Production hardening

1. Rate limiting on `/api/auth/login`
2. Password complexity policy
3. Account lockout after failed attempts
4. CSRF protection for mutations
5. Structured logging (no PHI) → CloudWatch/Datadog
6. Health checks + uptime monitoring
7. Automated encrypted backups with restore testing

### P2 — Feature parity enhancements

1. Patient name inline edit (rename with audit)
2. Notes merged into main chart view (like original)
3. Auto-copy on selection (optional, disabled by default for HIPAA UX)
4. AI "place in section" from chat responses
5. PWA / offline — **careful with PHI caching**
6. Data migration script from Firebase `people/` path

## Firebase Migration

Original data lived at Firebase RTDB path `people/`. Migration script should:

1. Export JSON from Firebase
2. Map `meta.name` → `Patient.name`
3. Map `noteDraft.content` → `Patient.noteDraft` (encrypt)
4. Map `sections.*` → individual patient fields
5. Map `categories.notes` → `Note` records
6. Preserve `schedule`, `knowledgeBase`, `lists`, `aiConversations`

Create `scripts/migrate-firebase.ts` — not included in v1.

## Environment Variables

See `.env.example` for full list. Required for production:

```
DATABASE_URL=postgresql://...
JWT_SECRET=<64+ char random>
ENCRYPTION_KEY=<32 byte base64>
OPENAI_API_KEY=<or use Azure OpenAI endpoint>
STORAGE_TYPE=s3
AWS_S3_BUCKET=...
AWS_REGION=...
SESSION_TIMEOUT_MINUTES=15
NODE_ENV=production
```

## Testing

```bash
npm run build    # Type check + build
npm run lint     # ESLint
# Add: vitest/playwright for E2E before production
```

## File Map

| File | Purpose |
|------|---------|
| `src/lib/auth.ts` | Sessions, JWT, RBAC helpers |
| `src/lib/audit.ts` | HIPAA audit logging |
| `src/lib/encryption.ts` | PHI field encryption |
| `src/lib/ai.ts` | OpenAI proxy (swap for Azure) |
| `src/lib/storage.ts` | Document storage abstraction |
| `src/components/app/patient-vault-app.tsx` | Main UI |
| `prisma/schema.prisma` | Data model |

## Questions?

Review `HIPAA_COMPLIANCE.md` for regulatory context. Code implements technical safeguards; legal/compliance team owns the rest.
