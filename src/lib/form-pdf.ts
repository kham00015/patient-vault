import { CLINIC_NAME } from "./branding";
import {
  buildFormSummary,
  FORM_META_KEYS,
  getClinicalFormTemplate,
  type ClinicalFormTemplate,
} from "./clinical-forms";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildFormPdfHtml({
  patientName,
  mrn,
  templateId,
  responses,
  score,
  interpretation,
  completedAt,
}: {
  patientName: string;
  mrn?: string | null;
  templateId: string;
  responses: Record<string, string>;
  score?: number | null;
  interpretation?: string | null;
  completedAt?: string | null;
}) {
  const template = getClinicalFormTemplate(templateId);
  if (!template) return "<html><body>Unknown form</body></html>";

  const questionBlocks = template.fields
    .map((field, index) => {
      const value = responses[field.id];
      if (!value) return "";
      const optionLabel = field.options?.find((o) => o.value === value)?.label ?? value;
      const answerHtml =
        field.type === "scale"
          ? `<strong>Score ${escapeHtml(value)}</strong> — ${escapeHtml(optionLabel)}`
          : field.type === "radio"
            ? escapeHtml(optionLabel)
            : `<pre style="margin:0;white-space:pre-wrap;font-family:inherit;">${escapeHtml(value)}</pre>`;
      return `
        <section class="block">
          <h3>${index + 1}. ${escapeHtml(field.label)}</h3>
          <div class="answer">${answerHtml}</div>
        </section>
      `;
    })
    .join("");

  const patientSignature = responses[FORM_META_KEYS.patientSignature];
  const patientSignerName = responses[FORM_META_KEYS.patientSignerName];
  const patientSignedAt = responses[FORM_META_KEYS.patientSignedAt];
  const providerSignature = responses[FORM_META_KEYS.providerSignature];
  const providerSignerName = responses[FORM_META_KEYS.providerSignerName];
  const providerSignedAt = responses[FORM_META_KEYS.providerSignedAt];

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(template.label)}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 720px; margin: 2rem auto; color: #111; line-height: 1.5; }
    h1 { font-size: 1.35rem; margin-bottom: 0.25rem; }
    .meta { color: #555; font-size: 0.9rem; margin-bottom: 1.5rem; }
    .score-box { background: #f0f9ff; border: 1px solid #7dd3fc; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
    .block { margin-bottom: 1.25rem; }
    .block h3 { font-size: 0.95rem; margin: 0 0 0.35rem; }
    .answer { margin: 0; font-size: 0.9rem; }
    .signature img { max-width: 280px; border-bottom: 1px solid #333; }
    @media print { body { margin: 0.5in; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(template.label)}</h1>
  <div class="meta">
    <div>${escapeHtml(CLINIC_NAME)}</div>
    <div>Patient: ${escapeHtml(patientName)}${mrn ? ` · MRN ${escapeHtml(mrn)}` : ""}</div>
    ${completedAt ? `<div>Completed: ${escapeHtml(new Date(completedAt).toLocaleString())}</div>` : ""}
  </div>
  ${score != null ? `<div class="score-box"><strong>Total score: ${score}</strong>${interpretation ? ` — ${escapeHtml(interpretation)}` : ""}</div>` : ""}
  ${questionBlocks}
  ${
    patientSignerName
      ? `<section class="signature block">
          <h3>Patient signature</h3>
          ${patientSignature ? `<img src="${patientSignature}" alt="Patient signature" />` : ""}
          <p>${escapeHtml(patientSignerName)}</p>
          ${patientSignedAt ? `<p class="meta">Signed ${escapeHtml(new Date(patientSignedAt).toLocaleString())}</p>` : ""}
        </section>`
      : ""
  }
  ${
    providerSignerName
      ? `<section class="signature block">
          <h3>Referring provider signature</h3>
          ${providerSignature ? `<img src="${providerSignature}" alt="Provider signature" />` : ""}
          <p>${escapeHtml(providerSignerName)}</p>
          ${providerSignedAt ? `<p class="meta">Signed ${escapeHtml(new Date(providerSignedAt).toLocaleString())}</p>` : ""}
        </section>`
      : ""
  }
  <pre style="white-space:pre-wrap;font-size:0.75rem;color:#666;margin-top:2rem;border-top:1px solid #ddd;padding-top:1rem;">${escapeHtml(buildFormSummary(templateId, responses))}</pre>
</body>
</html>`;
}
