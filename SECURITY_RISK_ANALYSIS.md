# Security Risk Analysis (SRA)

**Organization:** Modern Medicine (clinic) / Patient Vault (application)  
**System assessed:** Patient Vault clinical application (`https://app.patientvault.care`)  
**Analysis date (current revision):** August 3, 2026  
**Prior draft:** July 26, 2026  
**Draft status:** Working draft for Security Officer, Privacy Officer, and legal counsel review — **not signed / not final**  
**Next review due:** August 3, 2027 (or sooner after material system/vendor/entity change, multi-clinic launch, or security incident)

> **Important:** This document is a practical security risk analysis draft based on the current Patient Vault architecture and known operational controls. It is **not** legal advice and is **not** final until reviewed and signed by the Security Officer and reviewed by legal counsel (Ayesha Mehdi / designated firm). Counsel should confirm completeness against HIPAA Security Rule risk analysis expectations and Nevada/state requirements.

---

## 0. Material changes since July 26, 2026 draft

| Change | Security / privacy implication |
|--------|--------------------------------|
| Amazon Transcribe Medical and Amazon Bedrock now used in production for clinical drafting aids (AI Listen, Ask AI / guidelines, visit recorder) | PHI may be processed by AWS AI services; BAA + eligible-service confirmation required; consent/notice gap for recording |
| Visit recorder (`/visit-recorder`) added — audio file + transcript + HPI; optional password-free **test mode** exists in code | Test mode must stay **off** in production for real clinic use; recording stores audio on chart when used |
| Private per-user personal notes and AI Listen text saves | Still PHI if clinical content is stored; isolation is per-user, not a substitute for minimum necessary |
| Production login outage caused by RDS Secrets Manager password rotation vs stale app `DATABASE_URL` | Availability / contingency risk; mitigations: managed master-password rotation disabled; health watchdog; deploy/sync health gates |
| Planned separate technology LLC to own software/IP; multi-clinic tenancy (clinic number + username + password) later; **go-live starts with one clinic** | Future BA posture and tenant isolation become material risks when multi-clinic launches |
| Outside counsel READONLY review account created | Appropriate least-privilege for review; still PHI access — audit applies |

---

## 1. Purpose and Scope

### 1.1 Purpose

This Security Risk Analysis identifies reasonably anticipated threats and vulnerabilities to electronic Protected Health Information (ePHI) created, received, maintained, or transmitted by Patient Vault, evaluates risks, documents current safeguards, and defines remediation actions.

### 1.2 Scope

In scope:

- Patient Vault web application (Next.js)
- AWS Lightsail application hosting (~2 GB RAM production instance; HTTPS via Caddy)
- AWS RDS PostgreSQL database (`patient-vault-db`, us-east-1)
- AWS S3 document storage path (when configured for production documents)
- User authentication, MFA, sessions, roles, audit logging
- Clinic workforce access via browser (desktop / phone)
- Fax feature (currently mock mode; live fax out of scope until vendor BAA)
- **AI features in use or available for PHI processing under AWS:** Amazon Transcribe Medical, Amazon Bedrock (Claude), AI Listen, visit recorder, Ask AI / chart assists
- Planned multi-clinic product model (documented as **future** risk; not yet implemented)

Out of scope for this draft (to be confirmed by counsel/operations):

- Personal mobile devices used without clinic policy controls
- Third-party email/SMS systems not currently used for PHI
- Physical clinic facility security beyond workstation guidance
- Formation documents for the planned technology LLC (corporate counsel / engagement item)

---

## 2. Roles and Governance

| Role | Designated person | Responsibility |
|------|-------------------|----------------|
| Security Officer | Firas Khamis, MD | Security Risk Analysis ownership, technical safeguards oversight, incident escalation |
| Privacy Officer | Clinic Administrator (to be formally named in signed policies) | Privacy workflows, NPP distribution, workforce privacy training records, patient privacy requests |
| Outside compliance counsel | Ayesha Mehdi, Esq. | Legal review of policies, NPP, BAAs, risk analysis adequacy, entity/BA posture for multi-clinic roadmap |

**Entity roadmap (intent, not yet executed):** A separate technology LLC is intended to own Patient Vault software/IP. Modern Medicine (and later other clinics) would use the product under that structure. Until formed, treat the current AWS account / practice as the operative covered-entity environment for this SRA. Counsel to advise on BAAs between tech LLC and clinics when multi-clinic licensing begins.

Access to production admin functions is limited. Nonessential demo users should remain disabled; active workforce access restricted to authorized accounts with MFA. Counsel review account: READONLY role.

---

## 3. System and Data Inventory

### 3.1 Environment

| Component | Provider / location | PHI involved |
|-----------|---------------------|--------------|
| Application | AWS Lightsail (`app.patientvault.care`, ~2 GB RAM / 2 vCPU) | Yes (processing) |
| Database | AWS RDS PostgreSQL (`patient-vault-db`, us-east-1) | Yes (storage) |
| Documents / visit audio | App storage abstraction → local volume and/or AWS S3 (SSE) | Yes |
| TLS termination | Caddy on Lightsail | In transit |
| Speech-to-text | Amazon Transcribe Medical | Yes (transcripts) |
| Generative clinical drafting | Amazon Bedrock (Claude models) | Yes (prompts may include chart/transcript) |
| Auth sessions | App + DB session store | Indirect (access control) |
| Audit logs | Application database | Limited metadata (prefer no PHI content by design) |

### 3.2 ePHI categories

- Patient demographics and identifiers (name, DOB, MRN, contact, insurance fields as entered)
- Clinical notes and chart sections
- Diagnoses / assessment / plan content
- Medications / allergies / history
- Uploaded clinical documents and **visit recordings** (when visit recorder used)
- AI transcripts and HPI drafts (AI Listen / visit recorder saves)
- Forms, encounters, scheduling data
- Internal care-related messaging / reminders (as used)
- Private per-user personal notes / AI Listen saves (may contain PHI)

### 3.3 Users and access methods

- Unique user accounts (email)
- Roles: ADMIN, CLINICIAN, STAFF, READONLY
- Browser access over HTTPS
- MFA (TOTP) available; required for PHI workforce accounts
- Short idle session timeout in production (configured via `SESSION_TIMEOUT_MINUTES`, typically 5)
- Account lockout after repeated failed logins
- Strong password policy (12+ chars, complexity)
- **Future:** clinic number / clinic key at login with per-clinic patient isolation (not implemented yet)

---

## 4. Current Safeguards (as of August 3, 2026)

### 4.1 Administrative

- AWS Business Associate Addendum — **confirm accepted in AWS Artifact** for account used in production; retain evidence
- AI for PHI limited to **AWS HIPAA-eligible services** (Transcribe Medical, Bedrock) under that BAA posture — **not** consumer OpenAI for PHI
- OpenAI not used for PHI
- MFA for admin / active clinical users; unused demo accounts should remain disabled
- Legal policy packet and EMR overview provided to counsel; engagement scoping in progress
- Staff HIPAA training and formal NPP publication — still required (see remediation)
- Privacy Officer / Security Officer designations as above (formal naming in signed policies pending)

### 4.2 Physical (clinic / endpoint expectations)

- Workstations should be in controlled clinic areas
- Screens locked when unattended
- Printed PHI handled under clinic shredding / disposal policy (to be finalized with counsel)
- No PHI on unencrypted personal USB drives (policy pending counsel packet)
- Phone/laptop use of EMR / visit recorder subject to same access controls; device policy pending counsel

### 4.3 Technical

- HTTPS with HSTS in production
- Secure / httpOnly session cookies (`COOKIE_SECURE` in production)
- bcrypt password hashing
- MFA (TOTP) + backup codes
- Role-based access control
- Application audit logging of PHI access/create/update/delete and AI use (`AI_QUERY` / related)
- Login rate limiting and account lockout
- Application-level encryption for selected sensitive chart fields
- RDS storage encryption enabled
- RDS automated backups: **7-day retention** (verify ongoing)
- Security headers (CSP, X-Frame-Options, etc.)
- Production health endpoint (`/api/health`) checks DB connectivity
- Server health watchdog (minute cron) logging failures; external uptime monitor recommended (UptimeRobot / Healthchecks)
- Deploy / DB credential sync scripts fail closed if health is not `ok:true`
- RDS master password **not** Secrets Manager–managed (rotation disabled after outage) — password managed deliberately with app env sync procedures

### 4.4 Verified / operational notes

| Item | Status |
|------|--------|
| Production health | Monitor `https://app.patientvault.care/api/health` |
| RDS backups | Automated; **restore test PASSED 2026-08-03** |
| Fax | Mock until vendor BAA |
| Visit recorder test mode (`VISIT_RECORDER_TEST_MODE`) | Must remain **disabled** on production for real clinic use |
| Multi-clinic tenancy | Planned; not in production code path yet |

**Completed:** Full restore test on 2026-08-03 — restored automated snapshot to a temporary instance, verified readable data, deleted temp instance. Production DB untouched. Evidence: `RESTORE_TEST_EVIDENCE.md`.

---

## 5. Risk Assessment Methodology

For each risk:

- **Likelihood:** Low / Medium / High  
- **Impact:** Low / Medium / High  
- **Inherent risk:** combination before controls  
- **Residual risk:** after current controls  
- **Treatment:** Accept / Mitigate / Transfer / Avoid  
- **Owner / due date** for open mitigations

---

## 6. Identified Risks

### R1 — Unauthorized account access (stolen/weak password)

| | |
|--|--|
| Threat | Credential stuffing, password reuse, phishing |
| Likelihood | Medium |
| Impact | High |
| Current controls | Strong passwords, MFA, lockout, rate limiting, unique accounts |
| Residual risk | **Low–Medium** |
| Treatment | Mitigate |
| Actions | Keep MFA required for all PHI users; continue disabling unused accounts; quarterly access review |
| Owner | Security Officer |
| Due | Ongoing; access review first due **10/31/2026** |

### R2 — Session hijacking / unattended workstation

| | |
|--|--|
| Threat | Stolen session cookie; open chart left on screen |
| Likelihood | Medium |
| Impact | High |
| Current controls | Short idle timeout, secure cookies, HTTPS, staff policy (pending) |
| Residual risk | **Low–Medium** |
| Treatment | Mitigate |
| Actions | Train staff on screen lock and logout; keep production idle timeout short |
| Owner | Privacy Officer (training) / Security Officer (config) |
| Due | Training with counsel packet |

### R3 — Insider inappropriate access (curiosity browsing)

| | |
|--|--|
| Threat | Workforce member opens charts without need |
| Likelihood | Medium |
| Impact | Medium–High |
| Current controls | Unique IDs, RBAC, audit logs, minimum necessary policy (pending counsel) |
| Residual risk | **Medium** |
| Treatment | Mitigate |
| Actions | Quarterly audit log sampling; sanctions policy from counsel; training |
| Owner | Privacy Officer + Security Officer |
| Due | First audit sample **9/30/2026** |

### R4 — Cloud provider / hosting compromise

| | |
|--|--|
| Threat | AWS account compromise or provider incident |
| Likelihood | Low |
| Impact | High |
| Current controls | AWS BAA (confirm Artifact), encrypted RDS, restricted IAM CLI user, production secrets not in git |
| Residual risk | **Low–Medium** |
| Treatment | Mitigate / Transfer (BAA + insurance later) |
| Actions | Protect AWS root/MFA for AWS console; rotate keys if shared; review IAM least privilege |
| Owner | Security Officer |
| Due | AWS console MFA confirm ASAP |

### R5 — Database backup failure / inability to restore

| | |
|--|--|
| Threat | Data loss from corruption, ransomware, accidental delete |
| Likelihood | Low–Medium |
| Impact | High |
| Current controls | Automated encrypted backups, 7-day retention |
| Residual risk | **Low–Medium** (restore tested 2026-08-03) |
| Treatment | Mitigate |
| Actions | Keep 7-day retention; re-test restore annually or after major infra change |
| Owner | Security Officer |
| Due | Completed **2026-08-03**; next re-test **2027-08-03** or after material change |

### R6 — Document storage exposure (misconfigured S3)

| | |
|--|--|
| Threat | Public bucket / overly broad access |
| Likelihood | Low |
| Impact | High |
| Current controls | App storage abstraction; production intended private S3; block public access expected |
| Residual risk | **Low–Medium** |
| Treatment | Mitigate |
| Actions | Confirm S3: Block Public Access ON, encryption ON, versioning ON; document evidence |
| Owner | Security Officer |
| Due | **8/31/2026** |

### R7 — Vendor fax transmission of PHI without BAA

| | |
|--|--|
| Threat | Live fax to vendor without HIPAA BAA |
| Likelihood | Low (currently mock) |
| Impact | High |
| Current controls | `FAX_PROVIDER=mock` until configured; no live PHI fax intended |
| Residual risk | **Low** while mock remains |
| Treatment | Avoid until BAA; then Mitigate |
| Actions | Do not enable live fax until vendor BAA signed and filed |
| Owner | Security Officer + counsel |
| Due | Before any live fax go-live |

### R8 — AI processing of PHI (Transcribe Medical / Bedrock) — controls & consent

| | |
|--|--|
| Threat | PHI processed by AI without adequate BA coverage, configuration, workforce rules, or patient notice/consent for recording |
| Likelihood | Medium (features in production use path) |
| Impact | High |
| Current controls | AWS Transcribe Medical + Bedrock (HIPAA-eligible service list); intended use only under AWS BAA; no OpenAI for PHI; audit logging of AI queries; clinician review of drafts before chart use |
| Residual risk | **Medium** (consent/notice not implemented; BAA/Artifact evidence must be confirmed; prompts may include chart text) |
| Treatment | Mitigate |
| Actions | (1) Confirm AWS BAA + HIPAA account designation + eligible services in Artifact; (2) counsel guidance on recording consent/notice; (3) implement in-app consent/attestation before AI Listen / visit recorder; (4) update policies to prohibit unapproved AI; (5) keep visit-recorder test mode off in production |
| Owner | Security Officer + counsel |
| Due | Before routine real-patient recording; BAA evidence ASAP |

### R9 — Incomplete policies / NPP / training before real PHI volume

| | |
|--|--|
| Threat | Operational use without finalized legal program |
| Likelihood | Medium |
| Impact | High |
| Current controls | Technical safeguards in place; counsel engagement in progress; overview + policy drafts shared |
| Residual risk | **Medium** until complete |
| Treatment | Mitigate |
| Actions | Finalize policies/NPP with counsel; train staff; obtain attestations |
| Owner | Privacy Officer + counsel |
| Due | Per engagement letter schedule |

### R10 — Lost MFA device / lockout of sole admin

| | |
|--|--|
| Threat | Authenticator loss prevents access; recovery chaos |
| Likelihood | Medium |
| Impact | Medium |
| Current controls | MFA backup codes generated at setup |
| Residual risk | **Medium** if codes not stored securely |
| Treatment | Mitigate |
| Actions | Securely store backup codes offline; document recovery procedure with counsel |
| Owner | Security Officer |
| Due | ASAP |

### R11 — Malware / ransomware on clinic workstation

| | |
|--|--|
| Threat | Compromised PC steals credentials or screenshots PHI |
| Likelihood | Medium |
| Impact | High |
| Current controls | MFA reduces credential reuse impact; short sessions; endpoint controls pending policy |
| Residual risk | **Medium** |
| Treatment | Mitigate |
| Actions | Require updated OS/antivirus; no shared clinic logins; no personal USB for PHI; remote-work rules in counsel packet |
| Owner | Security Officer + Privacy Officer |
| Due | With workforce training |

### R12 — Breach detection delay (no SIEM)

| | |
|--|--|
| Threat | Intrusion or mass export goes unnoticed |
| Likelihood | Medium |
| Impact | High |
| Current controls | Application audit logs; admin Audit Log UI; production health watchdog; recommended external uptime alerts |
| Residual risk | **Medium** |
| Treatment | Mitigate (phased) |
| Actions | Weekly manual audit review; configure phone/email uptime alerts on `/api/health`; define incident contacts from counsel packet; CloudWatch/SIEM roadmap |
| Owner | Security Officer |
| Due | Uptime alerts ASAP; weekly audit ongoing |

### R13 — Inadequate audit log retention

| | |
|--|--|
| Threat | Logs unavailable when needed for investigation/accounting |
| Likelihood | Medium |
| Impact | Medium |
| Current controls | Logs in DB today; long-term retention policy pending counsel |
| Residual risk | **Medium** |
| Treatment | Mitigate |
| Actions | Adopt retention period per counsel; implement export/archive plan |
| Owner | Security Officer + counsel |
| Due | Policy with counsel packet; technical archive plan **9/30/2026** |

### R14 — Production unavailability from credential / config drift (RDS password)

| | |
|--|--|
| Threat | AWS-managed DB password rotation or stale `DATABASE_URL` breaks all login and chart access (clinic downtime) |
| Likelihood | Medium if managed rotation re-enabled; Low–Medium with current controls |
| Impact | High (operations / care continuity; not necessarily a confidentiality breach) |
| Current controls | Secrets Manager managed master password disabled; fix/sync scripts; health checks fail closed on deploy/sync; minute health watchdog; `assert-rds-password-stable.ps1` |
| Residual risk | **Low–Medium** |
| Treatment | Mitigate |
| Actions | Keep managed rotation off unless automated sync exists; maintain uptime alerts; monthly assert script; document emergency runbook (`CLINIC_RELIABILITY.md` / `fix-live-login.ps1`) |
| Owner | Security Officer |
| Due | Ongoing |

### R15 — Visit recorder password-free test mode left enabled

| | |
|--|--|
| Threat | Unauthenticated PHI access if `VISIT_RECORDER_TEST_MODE=1` on production |
| Likelihood | Low if ops discipline maintained; High if left on |
| Impact | High |
| Current controls | Explicit env flag; production env prep strips test-mode vars; status API gated |
| Residual risk | **Low–Medium** |
| Treatment | Mitigate / Avoid in production |
| Actions | Never enable test mode on production for real clinic use; prefer authenticated access or time-limited keyed access only in controlled tests; audit any test-mode use |
| Owner | Security Officer |
| Due | Ongoing |

### R16 — Cross-clinic data leakage when multi-tenant launches (future)

| | |
|--|--|
| Threat | Patient records visible across clinics if tenancy isolation is incomplete |
| Likelihood | N/A until multi-clinic ships (then High if buggy) |
| Impact | High |
| Current controls | Single-clinic deployment today |
| Residual risk | **Deferred — High priority at design time** |
| Treatment | Mitigate before multi-clinic go-live |
| Actions | Design clinic key / tenant ID on all PHI tables and queries; penetration-style tenant isolation tests; counsel review of BAAs between tech LLC and clinics; no shared patient indexes across tenants |
| Owner | Security Officer + engineering + counsel |
| Due | Before any second-clinic production data |

### R17 — Entity / BAA mismatch (tech LLC vs clinic)

| | |
|--|--|
| Threat | Wrong party on AWS BAA / customer BAAs after LLC formation or multi-clinic licensing |
| Likelihood | Medium during transition |
| Impact | High |
| Current controls | Intent documented; counsel engagement requested |
| Residual risk | **Medium** until counsel structures entities and agreements |
| Treatment | Mitigate |
| Actions | Form entity per counsel; align AWS account/BAA and clinic BAAs; update this SRA after formation |
| Owner | Owner + counsel |
| Due | Per engagement |

---

## 7. Risk Summary Matrix

| ID | Risk | Residual | Priority |
|----|------|----------|----------|
| R9 | Policies / NPP / training incomplete | Medium | **Critical (time-bound)** |
| R8 | AI PHI use — BAA evidence + consent gap | Medium | **Critical** |
| R5 | Restore not tested | Medium | **High** |
| R16 | Future multi-clinic isolation | Deferred / High at launch | **Design gate** |
| R17 | Entity / BAA mismatch | Medium | High |
| R3 | Insider curiosity access | Medium | High |
| R11 | Workstation malware | Medium | High |
| R12 | Delayed breach detection | Medium | High |
| R14 | Credential drift downtime | Low–Medium | High (ops) |
| R15 | Visit recorder test mode | Low–Medium | High (ops) |
| R10 | MFA recovery | Medium | Medium |
| R13 | Audit retention | Medium | Medium |
| R1 | Unauthorized login | Low–Medium | Ongoing |
| R2 | Unattended session | Low–Medium | Ongoing |
| R4 | Cloud compromise | Low–Medium | Ongoing |
| R6 | S3 misconfig | Low–Medium | High verify |
| R7 | Fax without BAA | Low (mock) | Conditional |

---

## 8. Remediation Plan (action checklist)

| # | Action | Owner | Due | Status |
|---|--------|-------|-----|--------|
| 1 | Counsel engagement letter; final policies + NPP | Ayesha Mehdi | Per engagement | In progress |
| 2 | Formally name Privacy Officer and Security Officer in signed policies | Officers + counsel | With policies | Planned |
| 3 | Publish/distribute NPP | Privacy Officer | After counsel NPP | Planned |
| 4 | Workforce HIPAA training + attestations | Privacy Officer | After policies | Planned |
| 5 | Document MFA backup-code storage / recovery | Security Officer | ASAP | Open |
| 6 | RDS restore test to temp instance; document and delete | Security Officer | 8/31/2026 | **PASSED 2026-08-03** |
| 7 | Confirm S3 Block Public Access + encryption + versioning | Security Officer | 8/31/2026 | Done 2026-08-05 — see `evidence/S3_CONSOLE_EVIDENCE.md` |
| 8 | Confirm AWS console root/IAM MFA; retain BAA Artifact evidence | Security Officer | ASAP | Open |
| 9 | Keep fax in mock mode until vendor BAA signed | Security Officer | Ongoing | Current |
| 10 | Confirm Transcribe Medical + Bedrock under AWS BAA / HIPAA account; update policies for approved AI only | Security Officer + counsel | ASAP | Open |
| 11 | Implement patient consent/notice workflow for AI Listen / visit recorder per counsel | Engineering + counsel | Before routine recording | Open |
| 12 | Keep `VISIT_RECORDER_TEST_MODE` off in production | Security Officer | Ongoing | Current |
| 13 | External uptime alerts on `/api/health` (phone/email) | Security Officer | ASAP | Recommended |
| 14 | Weekly audit-log sampling | Security Officer | Ongoing | Open |
| 15 | Quarterly user access review | Security Officer | First 10/31/2026 | Open |
| 16 | Tech LLC formation + BAAs for multi-clinic roadmap | Owner + counsel | Per engagement | Planned |
| 17 | Multi-clinic tenant isolation design + tests before 2nd clinic | Engineering + Security Officer | Before multi-clinic | Planned |
| 18 | Cyber insurance review | Owner + counsel | 9/30/2026 | Open |
| 19 | Penetration test / vulnerability scan | Security Officer | Q4 2026 | Open |

---

## 9. Acceptance of Residual Risk

After completion of Critical/High items (policies/NPP/training, AI BAA evidence + recording consent per counsel, restore test, S3 confirmation), remaining residual risks (insider misuse, endpoint malware, delayed detection without SIEM, availability events) may be accepted as **reasonable for a small single-clinic EMR** provided:

1. MFA remains required for all PHI users  
2. Unused accounts remain disabled  
3. Fax remains off until vendor BAA exists  
4. AI limited to approved AWS services under BAA; recording consent/notice implemented per counsel  
5. Visit recorder test mode remains off in production  
6. Weekly audit sampling and health/uptime monitoring continue  
7. Multi-clinic tenancy is **not** enabled until isolation is designed, tested, and counsel BAAs are in place  

Final acceptance requires Security Officer signature below after counsel review.

---

## 10. Evidence Log (attach or reference)

| Evidence | Date | Notes |
|----------|------|-------|
| AWS BAA accepted | [insert date from Artifact] | Keep PDF/screenshot |
| RDS backup verification | 2026-07-26 | Script `scripts/verify-backups.ps1` — re-verify periodically |
| MFA enabled on active users | 2026-07-26 | Reconfirm after any new users |
| Demo users disabled | 2026-07-26 | Maintain |
| Production health check | 2026-08-03 | `https://app.patientvault.care/api/health` — monitor ongoing |
| RDS managed password rotation disabled | 2026-08-03 | After login outage; assert with `scripts/assert-rds-password-stable.ps1` |
| Production health watchdog installed | 2026-08-03 | Lightsail cron; optional Healthchecks ping |
| Counsel READONLY account | 2026-08-03 | Outside counsel review access |
| EMR overview + policy drafts to counsel | 2026-08-03 | Packet for engagement scoping |
| AI features in production (Transcribe Medical / Bedrock) | 2026-08-03 | Update from prior “AI off” draft |
| RDS restore test | 2026-08-03 | PASSED — restored snapshot `rds:patient-vault-db-2026-08-03-10-04` to temp instance; verified readable (8 users / 6 patients); temp instance deleted. Evidence: `RESTORE_TEST_EVIDENCE.md` |
| S3 public access / encryption / versioning | Done (2026-08-05) | BPA On; Versioning Enabled; Default encryption SSE-S3 + Bucket Key. Evidence: `evidence/S3_CONSOLE_EVIDENCE.md` and `Desktop/Patient_Vault_S3_Evidence/`. |
| Pre-go-live technical pass | 2026-08-04 | Health OK; RDS rotation off; watchdog OK; user access reviewed. See `Patient_Vault_Pre_GoLive_Progress.docx` |
| Recording consent workflow | Pending | Per counsel |
| Staff training attestations | Pending | After policies |
| Final NPP published | Pending | After counsel |
| Tech LLC formation | Pending | Per counsel |

---

## 11. Signature and Approval

This draft becomes the organization’s Security Risk Analysis when signed.

**Prepared / revised (draft):** Patient Vault technical documentation assist — July 26, 2026; revised August 3, 2026  

**Reviewed by legal counsel:**  
Name: Ayesha Mehdi, Esq.  
Firm: ________________________________  
Date: ________________________________  
Signature: ____________________________  

**Approved by Security Officer:**  
Name: Firas Khamis, MD  
Date: ________________________________  
Signature: ____________________________  

**Acknowledged by Privacy Officer:**  
Name: ________________________________ (Clinic Administrator)  
Date: ________________________________  
Signature: ____________________________  

---

## 12. Revision History

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 0.1 Draft | 2026-07-26 | Technical draft | Initial SRA for officer/counsel review (AI described as off) |
| 0.2 Draft | 2026-08-03 | Technical draft | AI Listen / Bedrock / Transcribe Medical / visit recorder in scope; consent gap; RDS credential outage + mitigations; planned tech LLC + multi-clinic isolation; counsel review account; updated remediation |
