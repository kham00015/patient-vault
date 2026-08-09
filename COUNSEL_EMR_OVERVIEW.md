# Patient Vault (Modern Medicine) — Overview for Legal Counsel

**To:** Ayesha Mehdi, Esq.  
**From:** Firas Khamis, MD / Modern Medicine  
**Re:** Product overview for HIPAA / healthcare counsel review  
**Production URL:** https://app.patientvault.care  
**Date:** August 3, 2026  

> This memorandum describes the electronic medical record (EMR) system for counsel review. It is not a legal opinion, not a final HIPAA determination, and not adopted policy. Please treat access credentials and any demo PHI as confidential.

---

## 1. What the product is

**Patient Vault** is a cloud-hosted clinical EMR used by **Modern Medicine** for ambulatory care. Clinicians and authorized staff use it in a web browser (desktop or phone) to:

- Maintain patient charts (demographics, history, diagnoses, medications, allergies, social history, and related clinical sections)
- Create, edit, sign, and revise encounter notes
- Schedule clinic visits and manage encounters
- Upload and store clinical documents
- Place and track clinical orders
- Send internal clinic messages and set patient-related reminders
- Use optional AI-assisted drafting tools (speech-to-text and HPI drafting) that run on AWS services intended for use under an AWS Business Associate Addendum (BAA)

The live application address is **https://app.patientvault.care**.

---

## 2. Who uses it and how access works

| Item | Current design |
|------|----------------|
| Access | Unique user accounts (email + password) over HTTPS |
| Roles | `ADMIN`, `CLINICIAN`, `STAFF`, `READONLY` |
| Session | Server-side sessions with idle timeout (short in production) |
| MFA | Time-based one-time passwords (TOTP) available / in use for workforce accounts |
| Audit | Application audit log for login, PHI access/create/update/delete, AI use, and config changes |
| Counsel account | Read-only role recommended for review (view, not edit clinical data) |

Your review account is configured as **READONLY** so you can inspect the product and workflows without changing charts.

---

## 3. What ePHI the system handles

Reasonably anticipated ePHI categories include:

- Patient identifiers and demographics (name, DOB, MRN, contact, insurance fields as entered)
- Clinical chart content and notes
- Diagnoses, medications, allergies, history
- Uploaded documents (e.g., reports, PDFs, visit recordings when used)
- Scheduling / encounter metadata
- Internal care messaging and reminders as used by the clinic

Personal “scratch” notes and certain AI Listen text saves are stored as **private per-user** content (not shared across users as part of the shared chart), but they may still contain PHI and should be treated as such.

---

## 4. Technical environment (high level)

| Component | Provider / notes |
|-----------|------------------|
| Application | Next.js web app on AWS Lightsail |
| Database | AWS RDS PostgreSQL (encrypted storage path; TLS to DB) |
| Documents | Local volume and/or AWS S3 (SSE), depending on production configuration |
| TLS | HTTPS via Caddy on the application host |
| AI transcription | Amazon Transcribe Medical |
| AI text drafting | Amazon Bedrock (Claude models), under clinic AWS account / BAA posture |
| Fax | Present in product; production fax vendor must be BAA-covered before live PHI faxing |

Application-layer field encryption is used for selected sensitive patient fields; note content encryption helpers exist in the codebase. Exact field coverage and key management should be confirmed against the Security Risk Analysis and current production configuration during your review.

---

## 5. Clinical / product features counsel may want to walk through

1. **Patient list & chart** — open a patient; left-rail clinical sections; notes panel  
2. **Notes** — draft, sign, revise; PDF export where available  
3. **Schedule** — clinic day schedule and visit association  
4. **Documents** — upload/view clinical files in the chart  
5. **Orders** — create/review orders tied to care  
6. **Messages / Reminders / Contacts** — clinic operations tools  
7. **Users & security** (admin) — roles, password reset, unlock, MFA settings  
8. **AI Listen / Visit recorder** — record visit audio → transcript + HPI draft (AWS Transcribe Medical + Bedrock); audio may be stored to the chart when using visit recorder  
9. **Ask AI / guidelines assists** — clinician-facing drafting aids (not a substitute for clinical judgment)

---

## 6. Documents already prepared for your review packet

Please also receive (or request) the following drafts already prepared for counsel:

- Security Risk Analysis draft (`SECURITY_RISK_ANALYSIS.md`)
- Legal / policy counsel review draft Word document on Desktop / generated via `scripts/generate-counsel-legal-draft.py`
- Production / deploy operational notes as needed for BAA and hosting questions

Counsel should confirm whether these drafts meet HIPAA Privacy/Security Rule expectations for this practice, Nevada/state requirements, notice of privacy practices, BAAs with AWS and any other vendors, and workforce/device policies.

---

## 7. How to sign in (your account)

**URL:** https://app.patientvault.care/login  

Credentials will be provided separately in the cover email (username/email + temporary password). On first login you may be required to set a new password. Please:

- Do not share the password
- Enable MFA if prompted / available for your account
- Use the account only for professional review
- Avoid entering real patient data unless this environment is confirmed appropriate for that purpose

If login fails, contact Dr. Khamis; production outages are usually infrastructure (database connectivity), not account policy.

---

## 8. Open items we specifically want counsel guidance on

1. Adequacy of current policies, NPP, and BAAs (especially AWS; fax/AI vendors if enabled for PHI)  
2. Whether READONLY counsel access and audit logging are appropriate for outside counsel review  
3. Retention, amendment, and patient-rights workflows as implemented vs. required  
4. Use of AI transcription/drafting under BAA and notice/consent expectations  
5. Password-free “test mode” visit recorder (if ever enabled) — must remain off for real clinic use  
6. Any Nevada-specific telehealth, privacy, or medical-board considerations for this EMR

---

## 9. Contact

**Practice / Security Officer:** Firas Khamis, MD  
**System:** Patient Vault / Modern Medicine  
**Production:** https://app.patientvault.care  

Thank you for reviewing this system.
