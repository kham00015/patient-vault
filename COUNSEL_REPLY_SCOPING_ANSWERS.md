Subject: Re: Patient Vault scoping — answers + supporting evidence

Dear Ayesha,

Thank you again for reviewing the earlier materials and for your scoping questions. Below are my answers, and I am attaching supporting evidence so you can size the engagement accurately.

What I am sending with this email
1. Patient_Vault_Security_Risk_Analysis_Draft.docx
   Updated Security Risk Analysis draft (v0.2, August 3, 2026). This is still a draft for your review — not yet signed/final. It reflects current production use of Transcribe Medical / Bedrock, the visit recorder, and our planned multi-clinic roadmap.

2. AWS Business Associate Addendum.pdf
   Our accepted AWS BAA from AWS Artifact, for your file.

3. Screenshot in the email body (AWS Artifact)
   Shows the AWS Business Associate Addendum status as Active, accepted June 21, 2024, for this AWS account.

4. Patient_Vault_RDS_Restore_Test_Evidence.docx
   Evidence that we completed a full RDS restore test on August 3, 2026: restored an automated snapshot to a temporary database, verified the data was readable, then deleted the temporary instance. Production was not modified.

Still to follow separately (not attached yet)
- S3 public-access / encryption / versioning confirmation screenshots (complete 2026-08-05 — see `evidence/S3_CONSOLE_EVIDENCE.md`)
- Exact Lightsail plan/bundle name from the Lightsail console (if you still need that beyond the ~2 GB / 2 vCPU description below)

Answers to your questions

1) Sole use vs. licensing to other practices

Near term: Patient Vault will be implemented and operated first for a single clinic (Modern Medicine).

Intended direction: We plan to offer the product to other practices later. The design goal is multi-clinic tenancy with strict separation — each clinic identified by a clinic number / clinic key, with login requiring username, password, and clinic number, and with no sharing of patient records across clinics.

Please scope the engagement with that roadmap in mind (including whether the technology entity becomes a business associate to customer clinics), even though go-live will begin with one clinic only.

2) Software / IP ownership

I intend to form a separate technology entity (likely an LLC, if you recommend that form) to own the Patient Vault software and IP. Modern Medicine (and later other clinics) would use the product under that structure.

Please include guidance on entity formation / corporate structure as needed so ownership, BAAs, and licensing between the tech LLC and the clinic(s) are set up correctly from the start.

3) AWS BAA, Transcribe Medical, Bedrock, and Lightsail

AWS BAA status: Active as of June 21, 2024 (see Artifact screenshot + attached PDF).

Production stack today (PHI-relevant):
- Application host: AWS Lightsail serving https://app.patientvault.care (approximately 2 GB RAM / 2 vCPU; static IP 44.196.211.127; Ubuntu; Docker + Caddy HTTPS)
- Database: AWS RDS PostgreSQL (patient-vault-db), not a Lightsail managed database
- AI: Amazon Transcribe Medical and Amazon Bedrock (clinical drafting / HPI assists)
- Documents: AWS S3 path when configured for production document storage

Public AWS materials list Transcribe Medical, Bedrock, Lightsail, and RDS as HIPAA-eligible services when used under a BAA in a HIPAA-designated account, subject to correct configuration and the shared-responsibility model. Please independently confirm coverage against the attached BAA and AWS’s current eligible-services list.

Important nuance for fee scoping: having an AWS BAA does not by itself equal a complete HIPAA compliance program. Policies, workforce controls, AI recording consent/notice, tenancy isolation for future clinics, and finalization of the risk analysis still need your review.

4) Security risk analysis status

The attached SRA is a working draft (first prepared July 26, 2026; revised August 3, 2026). It has not been finalized or signed by me as Security Officer pending your review. Please treat completion / adequacy as part of the engagement.

Open items and who will complete them:
- Full RDS restore test — completed August 3, 2026 (evidence attached)
- AWS Artifact BAA evidence — attached (PDF + Active screenshot dated June 21, 2024)
- S3 public-access / encryption / versioning confirmation — complete 2026-08-05 (BPA On, Versioning Enabled, SSE-S3); screenshots in `Desktop/Patient_Vault_S3_Evidence/`
- Recording consent / notice for AI Listen and visit recorder — you advise what Nevada / HIPAA require; we will implement product + clinic workflow to match
- Final policies / NPP — your engagement (you draft/finalize; I review and adopt)
- Workforce HIPAA training and attestations — Privacy Officer / clinic administration after policies and NPP are in place (with your guidance on content as needed)

5) AI Listen / visit recorder — patient consent

No. The product does not currently collect or document patient consent before AI Listen or visit recording. Recording is clinician-initiated inside the authenticated app for a selected patient chart. There is no in-app consent capture, attestation, or consent form workflow yet.

We want your guidance on what consent (or notice) is required in Nevada / under HIPAA for this use case, and we can implement controls to match your recommendation before real-world patient use.

Happy to hop on a short call if any of this needs clarification before you send the engagement letter and fee estimate.

Kind regards,
Firas Khamis, MD
Modern Medicine / Patient Vault
https://app.patientvault.care
