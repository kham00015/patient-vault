# Security Risk Analysis (SRA)

**Organization:** Modern Medicine / Patient Vault  
**System assessed:** Patient Vault clinical application (`https://app.patientvault.care`)  
**Analysis date:** July 26, 2026  
**Draft status:** Working draft for Security Officer, Privacy Officer, and legal counsel review  
**Next review due:** July 26, 2027 (or sooner after material system/vendor change or security incident)

> **Important:** This document is a practical security risk analysis draft based on the current Patient Vault architecture and known operational controls. It is **not** legal advice and is **not** final until reviewed and signed by the Security Officer and reviewed by legal counsel (Ayesha Mehdi / designated firm). Counsel should confirm completeness against HIPAA Security Rule risk analysis expectations and Nevada/state requirements.

---

## 1. Purpose and Scope

### 1.1 Purpose

This Security Risk Analysis identifies reasonably anticipated threats and vulnerabilities to electronic Protected Health Information (ePHI) created, received, maintained, or transmitted by Patient Vault, evaluates risks, documents current safeguards, and defines remediation actions.

### 1.2 Scope

In scope:

- Patient Vault web application (Next.js)
- AWS Lightsail application hosting
- AWS RDS PostgreSQL database (`patient-vault-db`)
- AWS S3 document storage path (when configured)
- User authentication, MFA, sessions, roles, audit logging
- Clinic workforce access via browser workstations
- Fax feature (currently mock mode; live fax out of scope until BAA)
- AI features (intentionally disabled / not used for PHI)

Out of scope for this draft (to be confirmed by counsel/operations):

- Personal mobile devices used without clinic policy controls
- Third-party email/SMS systems not currently used for PHI
- Physical clinic facility security beyond workstation guidance

---

## 2. Roles and Governance

| Role | Designated person | Responsibility |
|------|-------------------|----------------|
| Security Officer | Firas Khamis, MD (owner/physician) | Security Risk Analysis ownership, technical safeguards oversight, incident escalation |
| Privacy Officer | Clinic Administrator | Privacy workflows, NPP distribution, workforce privacy training records, patient privacy requests |
| Outside compliance counsel | Ayesha Mehdi, Esq. (Zumpano Patricios / healthcare counsel) | Legal review of policies, NPP, BAAs, risk analysis adequacy |

Access to production admin functions is limited. As of July 26, 2026, nonessential demo users have been disabled; active workforce access is restricted to authorized accounts with MFA.

---

## 3. System and Data Inventory

### 3.1 Environment

| Component | Provider / location | PHI involved |
|-----------|---------------------|--------------|
| Application | AWS Lightsail (`app.patientvault.care`) | Yes (processing) |
| Database | AWS RDS PostgreSQL (`patient-vault-db`, us-east-1) | Yes (storage) |
| Documents | AWS S3 path (production storage configuration) | Yes (uploaded records) |
| TLS termination | Caddy on Lightsail | In transit |
| Auth sessions | App + DB session store | Indirect (access control) |
| Audit logs | Application database | Limited metadata (no PHI content by design) |

### 3.2 ePHI categories

- Patient demographics and identifiers (name, DOB, MRN, contact)
- Clinical notes and chart sections
- Diagnoses / assessment / plan content
- Medications / allergies / history
- Uploaded clinical documents
- Forms, encounters, scheduling data
- Internal care-related messaging / reminders (as used)

### 3.3 Users and access methods

- Unique user accounts (email)
- Roles: ADMIN, CLINICIAN, STAFF, READONLY
- Browser access over HTTPS
- MFA (TOTP) available and enabled for active accounts
- 5-minute idle session timeout
- Account lockout after repeated failed logins
- Strong password policy (12+ chars, complexity)

---

## 4. Current Safeguards (as of July 26, 2026)

### 4.1 Administrative

- AWS Business Associate Addendum accepted
- AI / OpenAI not used for PHI in production at this time
- Demo passwords changed; demo users disabled except authorized active account(s)
- MFA enabled for admin and active clinical user
- Legal policy packet in progress; attorney policies expected **8/4/2026**
- Staff HIPAA training planned by **8/10/2026**
- Privacy Officer / Security Officer designations planned as above

### 4.2 Physical (clinic / endpoint expectations)

- Workstations should be in controlled clinic areas
- Screens locked when unattended
- Printed PHI handled under clinic shredding / disposal policy (to be finalized with counsel)
- No PHI on unencrypted personal USB drives (policy pending counsel packet)

### 4.3 Technical

- HTTPS with HSTS in production
- Secure / httpOnly session cookies
- bcrypt password hashing
- MFA (TOTP) + backup codes
- Role-based access control
- Application audit logging of PHI access/create/update/delete
- Login rate limiting and account lockout
- Application-level encryption for sensitive chart fields
- RDS storage encryption enabled
- RDS automated backups: **7-day retention**, daily snapshots verified **PASSED** on July 26, 2026
- Security headers (CSP, X-Frame-Options, etc.)

### 4.4 Verified backup status (July 26, 2026)

- Instance: `patient-vault-db` — available
- Backup retention: 7 days
- Storage encrypted: true
- Recent automated snapshots present (daily)

**Gap:** Full restore test (restore snapshot to temporary instance and verify readability) not yet documented.

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
| Current controls | 5-min idle timeout, secure cookies, HTTPS, staff policy (pending) |
| Residual risk | **Low–Medium** |
| Treatment | Mitigate |
| Actions | Train staff on screen lock and logout; enforce idle timeout remains ≤5 minutes |
| Owner | Privacy Officer (training) / Security Officer (config) |
| Due | **8/10/2026** |

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
| Due | Training **8/10/2026**; first audit sample **9/30/2026** |

### R4 — Cloud provider / hosting compromise

| | |
|--|--|
| Threat | AWS account compromise or provider incident |
| Likelihood | Low |
| Impact | High |
| Current controls | AWS BAA, encrypted RDS, restricted IAM CLI user, production secrets not in git |
| Residual risk | **Low–Medium** |
| Treatment | Mitigate / Transfer (BAA + insurance later) |
| Actions | Protect AWS root/MFA for AWS console; rotate keys if shared; review IAM least privilege |
| Owner | Security Officer |
| Due | AWS console MFA confirm **8/15/2026** |

### R5 — Database backup failure / inability to restore

| | |
|--|--|
| Threat | Data loss from corruption, ransomware, accidental delete |
| Likelihood | Low–Medium |
| Impact | High |
| Current controls | Automated encrypted backups, 7-day retention, backup verification PASSED |
| Residual risk | **Medium** until restore tested |
| Treatment | Mitigate |
| Actions | Perform documented restore test to temporary RDS instance; retain evidence |
| Owner | Security Officer |
| Due | **8/15/2026** |

### R6 — Document storage exposure (misconfigured S3)

| | |
|--|--|
| Threat | Public bucket / overly broad access |
| Likelihood | Low |
| Impact | High |
| Current controls | App storage abstraction; production intended private S3; block public access expected |
| Residual risk | **Low–Medium** |
| Treatment | Mitigate |
| Actions | Confirm S3: Block Public Access ON, encryption ON, versioning ON; document screenshot/evidence |
| Owner | Security Officer |
| Due | **8/15/2026** |

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

### R8 — AI vendor processing PHI without BAA / disclosure

| | |
|--|--|
| Threat | PHI sent to consumer AI |
| Likelihood | Low (feature not used) |
| Impact | High |
| Current controls | AI not enabled for PHI; policy will prohibit unapproved AI |
| Residual risk | **Low** while disabled |
| Treatment | Avoid |
| Actions | Keep AI off; no OpenAI key for PHI; revisit only with BAA + counsel |
| Owner | Security Officer + counsel |
| Due | Ongoing |

### R9 — Incomplete policies / NPP / training before real PHI volume

| | |
|--|--|
| Threat | Operational use without finalized legal program |
| Likelihood | Medium until 8/10 |
| Impact | High |
| Current controls | Technical safeguards strong; legal packet pending 8/4; training 8/10 |
| Residual risk | **Medium** until complete |
| Treatment | Mitigate |
| Actions | Finalize policies/NPP with counsel; train staff; obtain attestations |
| Owner | Privacy Officer + counsel |
| Due | Policies **8/4/2026**; training **8/10/2026** |

### R10 — Lost MFA device / lockout of sole admin

| | |
|--|--|
| Threat | Authenticator loss prevents access; recovery chaos |
| Likelihood | Medium |
| Impact | Medium |
| Current controls | MFA backup codes generated at setup |
| Residual risk | **Medium** if codes not stored securely |
| Treatment | Mitigate |
| Actions | Securely store backup codes offline (sealed envelope / password manager); document recovery procedure with counsel |
| Owner | Security Officer |
| Due | **8/5/2026** |

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
| Due | Training **8/10/2026** |

### R12 — Breach detection delay (no SIEM)

| | |
|--|--|
| Threat | Intrusion or mass export goes unnoticed |
| Likelihood | Medium |
| Impact | High |
| Current controls | Application audit logs; admin Audit Log UI |
| Residual risk | **Medium** |
| Treatment | Mitigate (phased) |
| Actions | Weekly manual audit review until SIEM/CloudWatch alerting added; define incident contacts from counsel packet |
| Owner | Security Officer |
| Due | Weekly reviews start **8/11/2026**; alerting roadmap Q4 2026 |

### R13 — Inadequate audit log retention

| | |
|--|--|
| Threat | Logs unavailable when needed for investigation/accounting |
| Likelihood | Medium |
| Impact | Medium |
| Current controls | Logs in DB today; long-term retention policy pending counsel |
| Residual risk | **Medium** |
| Treatment | Mitigate |
| Actions | Adopt retention period per counsel (often multi-year); implement export/archive plan |
| Owner | Security Officer + counsel |
| Due | Policy **8/4/2026**; technical archive plan **9/30/2026** |

---

## 7. Risk Summary Matrix

| ID | Risk | Residual | Priority |
|----|------|----------|----------|
| R9 | Policies / NPP / training incomplete | Medium | **Critical (time-bound)** |
| R5 | Restore not tested | Medium | **High** |
| R3 | Insider curiosity access | Medium | High |
| R11 | Workstation malware | Medium | High |
| R12 | Delayed breach detection | Medium | High |
| R10 | MFA recovery | Medium | Medium |
| R13 | Audit retention | Medium | Medium |
| R1 | Unauthorized login | Low–Medium | Ongoing |
| R2 | Unattended session | Low–Medium | Ongoing |
| R4 | Cloud compromise | Low–Medium | Ongoing |
| R6 | S3 misconfig | Low–Medium | High verify |
| R7 | Fax without BAA | Low (mock) | Conditional |
| R8 | AI without BAA | Low (off) | Conditional |

---

## 8. Remediation Plan (action checklist)

| # | Action | Owner | Due | Status |
|---|--------|-------|-----|--------|
| 1 | Counsel delivers final policies + NPP | Ayesha Mehdi | 8/4/2026 | Planned |
| 2 | Formally name Privacy Officer (Clinic Administrator) and Security Officer (Firas Khamis) in signed policies | Officers + counsel | 8/4/2026 | Planned |
| 3 | Publish/distribute NPP (front desk + website) | Privacy Officer | 8/10/2026 | Planned |
| 4 | Complete workforce HIPAA training + signed attestations | Privacy Officer | 8/10/2026 | Planned |
| 5 | Document MFA backup-code storage / recovery procedure | Security Officer | 8/5/2026 | Open |
| 6 | RDS restore test to temp instance; document and delete | Security Officer | 8/15/2026 | Open |
| 7 | Confirm S3 Block Public Access + encryption + versioning | Security Officer | 8/15/2026 | Open |
| 8 | Confirm AWS console root/IAM MFA | Security Officer | 8/15/2026 | Open |
| 9 | Keep fax in mock mode until vendor BAA signed | Security Officer | Ongoing | Current |
| 10 | Keep AI disabled for PHI | Security Officer | Ongoing | Current |
| 11 | Weekly audit-log sampling (minimum necessary) | Security Officer | Start 8/11/2026 | Open |
| 12 | Quarterly user access review | Security Officer | First 10/31/2026 | Open |
| 13 | Cyber insurance review (optional but recommended) | Owner + counsel | 9/30/2026 | Open |
| 14 | Consider penetration test / vulnerability scan | Security Officer | Q4 2026 | Open |

---

## 9. Acceptance of Residual Risk

After completion of Critical/High items due by **8/15/2026**, remaining residual risks (insider misuse, endpoint malware, delayed detection without SIEM) are accepted as **reasonable for a small single-clinic EMR** provided:

1. MFA remains required for all PHI users  
2. Unused accounts remain disabled  
3. Fax/AI remain off until BAAs exist  
4. Weekly audit sampling continues  
5. Policies, NPP, and training are completed  

Final acceptance requires Security Officer signature below after counsel review.

---

## 10. Evidence Log (attach or reference)

| Evidence | Date | Notes |
|----------|------|-------|
| AWS BAA accepted | [insert date from Artifact] | Keep PDF/screenshot |
| RDS backup verification PASSED | 2026-07-26 | Script `scripts/verify-backups.ps1` |
| MFA enabled on active users | 2026-07-26 | Confirmed by operations |
| Demo users disabled | 2026-07-26 | Only authorized account(s) active |
| Admin password changed | 2026-07-26 | Demo password retired |
| Production health check | 2026-07-26 | `https://app.patientvault.care/api/health` OK |
| RDS restore test | Pending | Due 8/15/2026 |
| S3 public access confirmation | Pending | Due 8/15/2026 |
| Staff training attestations | Pending | Due 8/10/2026 |
| Final NPP published | Pending | Due 8/10/2026 |

---

## 11. Signature and Approval

This draft becomes the organization’s Security Risk Analysis when signed.

**Prepared (draft):** Patient Vault technical documentation assist — July 26, 2026  

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
| 0.1 Draft | 2026-07-26 | Technical draft | Initial SRA for officer/counsel review |
