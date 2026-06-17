# Security Policy

## Reporting Vulnerabilities

Contact the security officer (assign before production). Do not disclose publicly until patched.

## Secrets Management

- Never commit `.env` files
- Rotate `JWT_SECRET` and `ENCRYPTION_KEY` on compromise
- Use a secrets manager in production (AWS Secrets Manager, etc.)

## PHI Handling Rules for Developers

1. **Never log PHI** — no patient names, chart content, or diagnoses in console/logs
2. **Never put PHI in URLs** — use IDs only
3. **Never cache PHI in localStorage** — sessions use httpOnly cookies only
4. **Audit every PHI access** — use `createAuditLog()` for new endpoints
5. **Validate all input** — use Zod schemas
6. **Principle of least privilege** — check roles on write/delete operations

## Dependency Updates

Run `npm audit` monthly. Critical vulnerabilities must be patched within 72 hours for production systems handling PHI.

## Session Security

- Sessions expire after `SESSION_TIMEOUT_MINUTES` of inactivity
- Tokens stored as SHA-256 hashes in database
- Logout invalidates server-side session

## Headers (middleware.ts)

- HSTS (production)
- CSP, X-Frame-Options, nosniff
- Review CSP if adding third-party scripts
