# Patient Vault Legal and HIPAA Policy Review Packet

**Draft status:** Attorney review required before use  
**Prepared for:** Patient Vault / Modern Medicine  
**Prepared date:** July 15, 2026  
**Document purpose:** Provide a detailed policy draft and legal review checklist for counsel, compliance advisors, and business stakeholders.

> **Important legal disclaimer:** This document is a working draft for attorney review. It is not legal advice, is not a final HIPAA compliance program, and should not be published to patients, staff, vendors, or customers until reviewed and approved by qualified legal counsel. Counsel should confirm applicable federal, state, payer, medical board, telehealth, prescribing, privacy, security, retention, and breach notification requirements.

---

## 1. Executive Summary for Counsel

Patient Vault is a web-based electronic medical record and clinic operations application intended to support patient charting, notes, documents, scheduling, messaging, clinical forms, reminders, and future integrations such as AI assistance, faxing, transcription, and e-prescribing.

The application currently uses:

- HTTPS at `https://app.patientvault.care`
- AWS Lightsail for application hosting
- AWS RDS PostgreSQL for the production database
- AWS S3 for document storage
- Application-level encryption for sensitive chart content
- Role-based access controls
- MFA support
- Strong password policy
- Account lockout
- Audit logging
- 5-minute idle session timeout
- Daily encrypted RDS backups with 7-day retention
- Security headers and login rate limiting

The purpose of this packet is to give counsel a practical starting point for:

- HIPAA Privacy Rule and Security Rule policy review
- Business Associate Agreement review
- Patient-facing privacy notice requirements
- Workforce and user access policy review
- Incident response and breach notification policy review
- Vendor management review
- Data retention and destruction policy review
- AI, fax, transcription, and e-prescribing integration review

---

## 2. Key Legal Questions for Attorney Review

Counsel should answer or revise the following before production use with real patient data:

1. Is Patient Vault being operated by a covered entity, a business associate, or both?
2. Which legal entity owns and operates Patient Vault?
3. Which legal entity owns the clinical practice using Patient Vault?
4. Does the clinic need a BAA with Patient Vault if separate entities are involved?
5. Has the AWS Business Associate Addendum been accepted in AWS Artifact?
6. Are all AWS services used for PHI HIPAA-eligible under the AWS BAA?
7. What state medical record retention rules apply?
8. What state privacy, breach notification, or consumer health data laws apply?
9. What state telehealth rules apply, if any?
10. What consent is needed for AI-assisted documentation or automated note organization?
11. What consent is needed for text, email, fax, or patient communication features?
12. What prescribing, e-prescribing, EPCS, DEA, NPI, and state pharmacy rules apply before enabling prescription features?
13. What patient notice, privacy notice, or terms of use must be displayed in the application?
14. What staff training documentation is required?
15. What audit log retention period is required or recommended?
16. What breach response vendor, cyber insurance, or incident response counsel should be designated?

---

## 3. System and Data Overview

### 3.1 System Name

Patient Vault.

### 3.2 Intended Use

Patient Vault is intended to support clinic operations and electronic medical record workflows, including:

- Patient registration
- Patient chart review
- Clinical note creation
- Clinical form completion
- Document upload and retrieval
- Encounter management
- Clinic scheduling
- Internal messages
- Reminders
- Audit logging
- Administrative user management

Future planned integrations may include:

- OpenAI or another AI vendor under BAA
- Transcription API under BAA
- Fax API under BAA
- E-prescribing API under BAA and applicable pharmacy network rules

### 3.3 Data Categories

Patient Vault may store, process, or transmit:

- Patient names
- Demographics
- Contact information
- Medical record numbers
- Clinical notes
- Diagnoses and assessment data
- Medications
- Uploaded medical documents
- Clinical forms
- Appointment and scheduling data
- Internal user messages related to care
- Audit records
- User account records

These data elements may constitute Protected Health Information (PHI) or electronic PHI (ePHI) under HIPAA when associated with an identifiable patient.

---

## 4. Governance Policy

### 4.1 Privacy Officer

The organization should designate a Privacy Officer responsible for:

- HIPAA Privacy Rule compliance
- Patient privacy rights workflows
- Review of uses and disclosures of PHI
- Workforce privacy training
- Privacy incident evaluation
- Privacy policy maintenance

**Designated Privacy Officer:** `[insert name/title]`

### 4.2 Security Officer

The organization should designate a Security Officer responsible for:

- HIPAA Security Rule compliance
- Security risk analysis and risk management
- Technical safeguards
- Access controls
- Security incident response
- Vendor security review
- Backup and disaster recovery oversight

**Designated Security Officer:** `[insert name/title]`

### 4.3 Policy Review Frequency

Policies should be reviewed:

- At least annually
- After a material security incident
- After a material system change
- Before adding a new vendor that handles PHI
- Before adding AI, transcription, fax, or e-prescribing features

---

## 5. HIPAA Privacy Policy Draft

### 5.1 Permitted Uses and Disclosures

Patient Vault may be used to create, receive, maintain, or transmit PHI for permitted healthcare operations, treatment, and payment activities, subject to applicable law and organizational policy.

Examples may include:

- Reviewing patient charts for treatment
- Creating clinical notes
- Uploading and reviewing records
- Scheduling care
- Communicating internally about care coordination
- Managing user access and audit logs
- Supporting administrative operations

### 5.2 Minimum Necessary Standard

Users must access, use, and disclose only the minimum PHI necessary to perform their assigned job duties, except where HIPAA permits broader access for treatment purposes.

Patient Vault supports this standard through:

- Unique user accounts
- Role-based permissions
- Audit logging
- User management controls
- Session timeouts
- MFA support

### 5.3 Patient Rights

Counsel should confirm and adapt workflows for patient rights, including:

- Right of access
- Right to request amendment
- Right to an accounting of disclosures
- Right to request restrictions
- Right to request confidential communications
- Right to receive a Notice of Privacy Practices
- Right to complain without retaliation

Patient Vault can support these workflows through chart exports, document retrieval, audit log review, and administrative records, but final legal procedures must be defined by the organization.

### 5.4 Patient Requests

Patient requests involving PHI should be documented and routed to the Privacy Officer or authorized designee. Requests should be tracked with:

- Date received
- Patient identity verification method
- Request type
- Responsible staff member
- Date fulfilled or denied
- Legal basis for denial, if applicable

### 5.5 Prohibited Uses

Users must not:

- Access charts without a job-related reason
- Share login credentials
- Export PHI to personal email, personal cloud storage, or personal devices unless approved
- Enter PHI into consumer AI tools without a BAA
- Use screenshots or copied chart data for non-treatment purposes unless authorized
- Disclose PHI to unauthorized third parties

---

## 6. HIPAA Security Policy Draft

### 6.1 Administrative Safeguards

The organization should maintain:

- Security risk analysis
- Risk management plan
- Assigned Security Officer
- Workforce security procedures
- Authorization and supervision procedures
- Access termination procedures
- Security awareness training
- Security incident procedures
- Contingency planning
- Vendor and BAA management

### 6.2 Physical Safeguards

The organization should maintain policies for:

- Workstation access
- Screen locking
- Device encryption
- Office access controls
- Secure disposal of printed PHI
- Secure disposal or wiping of devices
- Remote work rules

### 6.3 Technical Safeguards

Patient Vault currently supports:

- Unique user identification
- Password authentication
- MFA support
- Role-based access control
- 5-minute idle session timeout
- Server-side session invalidation
- Audit logging
- HTTPS encryption in transit
- Encrypted database and document storage path
- Application-level encryption for sensitive chart fields
- Secure cookies
- Rate limiting on login and MFA verification
- Security headers

Counsel and security advisors should confirm whether these controls satisfy the organization's risk profile and applicable obligations.

---

## 7. Access Control Policy

### 7.1 Unique User Accounts

Each workforce member must have a unique user account. Shared accounts should be prohibited unless approved for a documented emergency workflow.

### 7.2 Roles

Current application roles include:

- `ADMIN`: Full application access, user management, audit log access
- `CLINICIAN`: Clinical access and charting privileges
- `STAFF`: Operational and limited clinical workflow access
- `READONLY`: View-only access where applicable

### 7.3 MFA

MFA should be required for:

- Administrators
- Clinicians
- Any user with access to PHI
- Any remote access workflow

### 7.4 Password Policy

Passwords should meet or exceed the application's current password policy:

- At least 12 characters
- Uppercase letter
- Lowercase letter
- Number
- Special character
- Forced password change after admin reset

### 7.5 Account Lockout

Accounts should lock after repeated failed login attempts. Administrative unlock or password reset should require identity verification.

### 7.6 Access Review

User access should be reviewed:

- At onboarding
- Upon role change
- Upon termination
- At least quarterly

### 7.7 Termination Procedure

When a user leaves the organization or no longer needs access:

1. Disable the account immediately.
2. Revoke active sessions.
3. Review recent audit logs if appropriate.
4. Remove or rotate any shared external credentials.
5. Document the termination access review.

---

## 8. Audit Logging Policy

### 8.1 Events to Log

Patient Vault should log:

- PHI access
- PHI creation
- PHI updates
- PHI deletion or archival
- Document upload
- Document download
- Note PDF export
- Login
- Logout
- Failed login
- MFA events
- User creation and updates
- Password resets
- Account unlocks

### 8.2 Audit Log Content

Audit logs should include:

- User ID where available
- Patient ID where applicable
- Action type
- Resource type
- Resource ID
- Timestamp
- IP address where available
- User agent where available
- Success or failure status

Audit logs should avoid storing raw PHI in metadata.

### 8.3 Audit Review

The Security Officer or designee should review audit logs:

- On suspected inappropriate access
- After a reported privacy incident
- During periodic access reviews
- Before responding to an accounting request, if applicable

### 8.4 Retention

Counsel should confirm the required audit log retention period. A conservative HIPAA-oriented retention target is at least 6 years for policies, procedures, and compliance records, but state medical record retention rules may differ.

---

## 9. Data Retention and Destruction Policy

### 9.1 Medical Record Retention

Medical records should be retained for the period required by applicable federal and state law, payer rules, professional board rules, and organizational policy.

**Attorney to specify retention period:** `[insert applicable state and retention schedule]`

### 9.2 Application Data

Patient Vault should retain:

- Patient records
- Notes
- Documents
- Forms
- Encounter records
- Scheduling records
- Audit logs
- User account records

Deletion should be limited, audited, and subject to legal retention requirements.

### 9.3 Archive Instead of Delete

Where legally appropriate, Patient Vault should prefer archival or deactivation over permanent deletion.

### 9.4 Destruction

When destruction is legally permitted and approved:

- Destruction must be authorized by the Privacy Officer or designee.
- Destruction must be logged.
- Backups must be handled according to backup retention limits.
- Physical media must be securely destroyed or wiped.

---

## 10. Backup and Disaster Recovery Policy

### 10.1 Current Backup Position

Current production backup controls include:

- AWS RDS automated backups
- 7-day backup retention
- Encrypted database storage
- S3 document storage with default encryption
- S3 bucket versioning enabled
- Public access blocked on S3 bucket

### 10.2 Backup Verification

Backup status should be verified:

- At least monthly
- After major infrastructure changes
- Before major production releases

### 10.3 Restore Testing

The organization should test restore procedures:

- At least annually
- After major database or infrastructure changes
- Before relying on the system for high-volume production workflows

### 10.4 Recovery Objectives

Counsel and operations leadership should confirm:

- Recovery Time Objective (RTO): `[insert target]`
- Recovery Point Objective (RPO): `[insert target]`

---

## 11. Incident Response and Breach Notification Policy

### 11.1 Security Incident Definition

A security incident may include:

- Unauthorized access to PHI
- Lost or stolen device containing PHI
- Malware or ransomware
- Suspicious login activity
- Misdirected fax, email, or document
- Improper disclosure
- Vendor security incident
- Compromised credentials

### 11.2 Immediate Response

Upon discovery:

1. Contain the incident.
2. Preserve relevant evidence.
3. Disable compromised accounts or keys.
4. Notify the Security Officer and Privacy Officer.
5. Review audit logs.
6. Determine whether PHI was involved.
7. Engage legal counsel if PHI may be affected.

### 11.3 Breach Risk Assessment

Counsel should review the HIPAA breach assessment process, including:

- Nature and extent of PHI involved
- Unauthorized person who used or received PHI
- Whether PHI was actually acquired or viewed
- Extent to which risk was mitigated

### 11.4 Notification

If a reportable breach occurs, counsel should advise on:

- Individual notification
- HHS notification
- Media notification where applicable
- State law notification
- Timing requirements
- Content of notices

HIPAA includes a general 60-day outer deadline for breach notification, but state laws may require faster notice.

---

## 12. Vendor and BAA Management Policy

### 12.1 Vendor Inventory

The organization should maintain a vendor inventory for all vendors that create, receive, maintain, or transmit PHI.

Current or planned vendors may include:

| Vendor | Purpose | BAA Needed | Status |
|---|---|---:|---|
| AWS | Hosting, database, S3 documents, backups | Yes | Attorney/client to confirm AWS Artifact acceptance |
| OpenAI or AI vendor | AI assistance, note organization, future features | Yes before PHI | Planned |
| Fax vendor | Fax transmission | Yes before PHI | Planned |
| Transcription vendor | Audio transcription | Yes before PHI | Planned |
| E-prescribing vendor | Prescriptions and pharmacy network integration | Yes | Planned |
| Domain/DNS/email providers | Infrastructure or communication | Counsel to evaluate | TBD |

### 12.2 BAA Requirement

Before PHI is sent to a vendor:

1. Confirm the vendor is willing to sign a BAA.
2. Review the BAA with counsel.
3. Confirm covered services and excluded services.
4. Configure the vendor account according to HIPAA requirements.
5. Document the approved use case.

### 12.3 Vendor Access

Vendors should receive the least access necessary. Vendor access should be:

- Approved
- Time-limited where possible
- Logged where possible
- Revoked when no longer needed

---

## 13. AI Use Policy Draft

### 13.1 General Rule

PHI must not be entered into consumer AI tools or any AI service without a signed BAA and approved configuration.

### 13.2 Approved AI Use

AI may be used only when:

- A BAA is signed with the AI vendor.
- The AI service is configured for healthcare/HIPAA-eligible use.
- Data retention and training settings are reviewed and approved.
- The Security Officer approves the integration.
- The Privacy Officer approves the intended workflow.
- Users are trained on appropriate use.

### 13.3 Human Review

AI output must be reviewed by a qualified human user before being relied upon for clinical decisions, charting, billing, prescribing, or patient communication.

### 13.4 Prohibited AI Use

Users must not:

- Paste patient charts into consumer ChatGPT or similar tools.
- Use AI output as a substitute for clinician judgment.
- Allow AI to autonomously diagnose, prescribe, or communicate with patients without approved workflow controls.
- Store unnecessary PHI in AI prompts or logs.

---

## 14. Fax, Transcription, and E-Prescribing Policy Draft

### 14.1 Fax

Before enabling fax:

- Sign a BAA with the fax vendor.
- Confirm fax transmission security and audit logging.
- Confirm cover sheet and recipient verification procedures.
- Define misdirected fax incident workflow.

### 14.2 Transcription

Before enabling transcription:

- Sign a BAA with the transcription vendor.
- Define whether audio is stored, deleted, or retained.
- Define consent requirements for recording or transcription.
- Confirm user review before transcription is saved to the chart.

### 14.3 E-Prescribing

Before enabling e-prescribing:

- Select a certified e-prescribing vendor.
- Sign a BAA.
- Complete prescriber identity proofing.
- Confirm NPI, DEA, state license, and EPCS requirements.
- Confirm pharmacy network connectivity.
- Define refill, cancellation, and error correction workflows.
- Confirm audit logging and record retention requirements.

Patient Vault should not transmit real prescriptions to pharmacies without an approved e-prescribing vendor and applicable legal setup.

---

## 15. Workforce Training Policy

### 15.1 Required Training

Workforce members should receive training on:

- HIPAA Privacy Rule basics
- HIPAA Security Rule basics
- Patient Vault access rules
- Password and MFA requirements
- Minimum necessary access
- Incident reporting
- Phishing awareness
- Device security
- Proper document upload and download handling
- Prohibited AI use without BAA

### 15.2 Training Frequency

Training should occur:

- Before system access is granted
- Annually
- After material policy changes
- After a privacy or security incident where retraining is appropriate

### 15.3 Training Records

Training records should include:

- User name
- Training date
- Training content
- Attestation
- Trainer or system

---

## 16. Sanctions Policy

Violations of privacy or security policies may result in sanctions, including:

- Verbal warning
- Written warning
- Retraining
- Temporary access suspension
- Termination of access
- Employment discipline
- Termination
- Reporting to licensing boards or authorities where required

Sanctions should be documented and applied consistently.

---

## 17. Patient-Facing Notice and Terms Review

Counsel should prepare or approve patient-facing documents, including:

- Notice of Privacy Practices
- Patient consent forms where applicable
- Telehealth consent, if telehealth is offered
- Communication consent for text/email/fax where applicable
- Website privacy policy
- Website terms of use
- AI assistance disclosure if required or advisable
- Medical record request procedure

Patient Vault should not publish patient-facing legal language until counsel approves it.

---

## 18. Security Configuration Checklist

Current technical controls to confirm:

- [ ] AWS BAA accepted
- [ ] OpenAI or AI vendor BAA signed before PHI use
- [ ] Fax vendor BAA signed before PHI use
- [ ] Transcription vendor BAA signed before PHI use
- [ ] E-prescribing vendor BAA signed before PHI use
- [ ] MFA required for all real users
- [ ] Demo passwords changed or disabled
- [ ] Admin accounts limited to necessary users
- [ ] Strong passwords enforced
- [ ] 5-minute idle logout enabled
- [ ] HTTPS enforced
- [ ] Secure cookies enabled
- [ ] S3 bucket public access blocked
- [ ] S3 bucket versioning enabled
- [ ] S3 default encryption enabled
- [ ] RDS encrypted
- [ ] RDS backups enabled
- [ ] Backup restore tested
- [ ] Audit logs reviewed periodically
- [ ] Incident response contact list created
- [ ] Cyber insurance reviewed
- [ ] Staff training completed

---

## 19. Attorney Review Notes

Counsel should specifically revise:

1. Entity names and legal relationships
2. HIPAA covered entity/business associate status
3. State-specific medical record retention rules
4. State-specific breach notification deadlines
5. Patient notice language
6. AI disclosure or consent requirements
7. Telehealth rules, if applicable
8. E-prescribing and controlled substance requirements
9. Employee sanctions and HR language
10. Vendor contract and BAA terms
11. Insurance and indemnity provisions
12. Whether Patient Vault requires separate terms of service if offered to other clinics

---

## 20. Signature and Approval

This document should be finalized only after legal and compliance review.

**Reviewed by legal counsel:**  
Name: ______________________________  
Firm: ______________________________  
Date: ______________________________  

**Approved by Privacy Officer:**  
Name: ______________________________  
Date: ______________________________  

**Approved by Security Officer:**  
Name: ______________________________  
Date: ______________________________  

**Approved by Practice/Business Owner:**  
Name: ______________________________  
Date: ______________________________  

