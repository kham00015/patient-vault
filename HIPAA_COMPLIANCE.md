# HIPAA Compliance Roadmap

> **Disclaimer:** This document describes technical safeguards implemented in Patient Vault. **HIPAA compliance is an organizational and legal process**, not something achieved by code alone. A covered entity must sign Business Associate Agreements (BAAs), conduct risk assessments, train staff, and maintain policies.

## What HIPAA Requires (Summary)

HIPAA Security Rule covers **Administrative**, **Physical**, and **Technical** safeguards for ePHI (electronic Protected Health Information).

## Implemented Technical Safeguards

### ✅ Access Control (§164.312(a)(1))
- Unique user identification (email + user ID)
- Role-based access: `ADMIN`, `CLINICIAN`, `STAFF`, `READONLY`
- Emergency access: admin role can view audit logs
- Automatic logoff: configurable session timeout (default 30 min, recommend 15 for production)

### ✅ Audit Controls (§164.312(b))
- Every PHI read/create/update/delete logged in `AuditLog` table
- AI queries logged separately (`AI_QUERY`)
- Login/logout/failed login tracked
- **No PHI stored in audit metadata** — only resource IDs and action types

### ✅ Integrity (§164.312(c)(1))
- Server-side validation with Zod
- Encrypted PHI fields at application layer (AES-256-GCM)

### ✅ Transmission Security (§164.312(e)(1))
- HTTPS required in production (HSTS header set)
- httpOnly, secure cookies for sessions
- API keys (OpenAI) never sent to browser

### ✅ Authentication (§164.312(d))
- bcrypt password hashing (12 rounds)
- Session tokens hashed in database
- MFA field scaffolded on User model — **implement before production**

### ✅ Encryption at Rest (addressable)
- Application-level field encryption for chart sections and notes
- **Production:** use database TDE + KMS-managed keys (AWS RDS encryption, etc.)

## NOT Yet Implemented (Developer TODO)

| Item | Priority | Notes |
|------|----------|-------|
| MFA (TOTP/WebAuthn) | **Critical** | Required for production |
| Signed BAA with cloud vendor | **Critical** | AWS/GCP/Azure HIPAA programs |
| PostgreSQL on encrypted volume | **Critical** | Replace SQLite |
| S3 + SSE-KMS for documents | **High** | `src/lib/storage.ts` has stub |
| Azure OpenAI / Bedrock with BAA | **High** | Replace direct OpenAI API |
| Backup & disaster recovery | **High** | Automated encrypted backups |
| Intrusion detection / SIEM | **High** | Ship audit logs to CloudWatch/Datadog |
| Penetration test | **High** | Before go-live |
| Privacy policy + BAAs with staff | **Critical** | Legal/compliance team |
| Minimum necessary access reviews | **Medium** | Quarterly |
| Breach notification procedure | **Critical** | 60-day rule |
| Device/endpoint controls | **Medium** | Clinic workstations |
| Data retention & destruction policy | **Medium** | |

## What Was Wrong With the Old App

| Issue | Old (Firebase HTML) | New (Patient Vault) |
|-------|---------------------|---------------------|
| API keys in browser | Firebase config exposed | Server-only secrets |
| OpenAI | Client-side Cloud Function URL | Server API route |
| Audit logging | None | Full audit trail |
| Encryption at rest | Firebase default only | App-level + DB encryption path |
| RBAC | Single login | Role-based permissions |
| Session security | Firebase auth only | httpOnly + DB sessions |
| PHI in logs | Console.log patient data | Structured audit, no PHI in logs |
| BAA | Consumer Firebase unclear | Documented BAA requirements |

## Recommended Production Architecture

```
[Clinic Browser] --HTTPS--> [WAF + Load Balancer]
                                |
                    [Next.js on AWS ECS / Vercel HIPAA*]
                                |
              +-----------------+------------------+
              |                 |                  |
        [RDS PostgreSQL]  [S3 SSE-KMS]    [Azure OpenAI + BAA]
         encrypted          documents         AI queries
```

*Vercel Enterprise may offer BAA — verify with vendor. AWS/GCP/Azure are common choices.

## Compliance Checklist Before Go-Live

- [ ] Risk assessment completed
- [ ] BAA signed with hosting provider
- [ ] BAA signed with AI provider (if used)
- [ ] MFA enabled for all users
- [ ] Strong passwords enforced
- [ ] Session timeout ≤ 15 minutes
- [ ] Encrypted backups tested
- [ ] Audit log retention policy (6+ years recommended)
- [ ] Incident response plan documented
- [ ] Staff HIPAA training completed
- [ ] Penetration test passed
- [ ] Legal review of privacy notice

## Contact for Compliance

Assign a **Privacy Officer** and **Security Officer** before production deployment. Developers implement controls; compliance officers own the process.
